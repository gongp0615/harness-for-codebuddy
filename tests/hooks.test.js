"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
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
