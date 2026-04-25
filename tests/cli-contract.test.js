"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runCli } = require("../scripts/cli");

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "harness-cli-"));
}

function capture(fn) {
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  let stdout = "";
  let stderr = "";
  process.stdout.write = (chunk) => {
    stdout += chunk;
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += chunk;
    return true;
  };
  try {
    const code = fn();
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
}

test("CLI supports init, plan, status, recover, evidence, and policy-check", () => {
  const root = tempProject();

  assert.equal(capture(() => runCli(["init", "--profile", "generic"], root)).code, 0);
  assert.equal(capture(() => runCli(["plan", "--task", "Ship CLI contract", "--id", "cli-contract"], root)).code, 0);

  const status = capture(() => runCli(["status", "--json"], root));
  assert.equal(status.code, 0);
  assert.equal(JSON.parse(status.stdout).task.task_id, "cli-contract");

  const recover = capture(() => runCli(["recover", "--json"], root));
  assert.equal(recover.code, 0);
  assert.equal(JSON.parse(recover.stdout).task_id, "cli-contract");

  const evidence = capture(() => runCli(["evidence", "--summary"], root));
  assert.equal(evidence.code, 0);
  assert.match(JSON.parse(evidence.stdout).markdown, /No verification evidence/);

  const policy = capture(() => runCli(["policy-check", "--command", "git reset --hard"], root));
  assert.equal(policy.code, 2);
  assert.equal(JSON.parse(policy.stdout).decision, "block");
});

test("status returns empty task state before initialization", () => {
  const root = tempProject();
  const result = capture(() => runCli(["status", "--json"], root));

  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).task, null);
});
