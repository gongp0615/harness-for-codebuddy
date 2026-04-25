"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { recordHook } = require("../hooks/common");
const { evaluatePreToolUse } = require("../hooks/pre-tool-policy");

test("pre-tool hook blocks high-risk shell commands", () => {
  const result = evaluatePreToolUse({
    tool_name: "Bash",
    tool_input: { command: "git reset --hard" }
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason, /blocked/);
});

test("pre-tool hook allows normal commands", () => {
  const result = evaluatePreToolUse({
    tool_name: "Bash",
    tool_input: { command: "npm test" }
  });

  assert.equal(result.allowed, true);
});

test("recordHook writes payload summaries to the hook event log", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-hooks-"));
  recordHook("PostToolUse", {
    cwd: root,
    tool_name: "Bash",
    tool_input: { command: "npm test" },
    tool_response: { exit_code: 0, stdout: "ok" }
  });

  const line = fs.readFileSync(path.join(root, ".harness-engineer", "hook-events.jsonl"), "utf8").trim();
  const event = JSON.parse(line);
  assert.equal(event.event, "PostToolUse");
  assert.equal(event.tool_name, "Bash");
  assert.equal(event.summary.command, "npm test");
  assert.equal(event.summary.exit_code, 0);
});

test("recordHook includes policy decisions in event summaries", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-policy-log-"));
  recordHook("PolicyDecision", {
    cwd: root,
    tool_name: "Bash",
    tool_input: { command: "git reset --hard" },
    tool_response: { decision: "block", reason: "blocked" }
  });

  const event = JSON.parse(fs.readFileSync(path.join(root, ".harness-engineer", "hook-events.jsonl"), "utf8").trim());
  assert.equal(event.summary.decision, "block");
  assert.equal(event.summary.reason, "blocked");
});
