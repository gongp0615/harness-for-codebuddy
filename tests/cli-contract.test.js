"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runCli } = require("../scripts/cli");

const HARNESS_AGENT_NAMES = ["planner", "executor", "verifier", "debugger"];

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
  assert.equal(fs.existsSync(path.join(root, ".harness-engineer", "spec.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".harness-engineer", "contract.md")), true);

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

test("CLI supports profile list, show, and doctor", () => {
  const root = tempProject();
  assert.equal(capture(() => runCli(["init", "--profile", "generic"], root)).code, 0);

  const list = capture(() => runCli(["profile", "list"], root));
  assert.equal(list.code, 0);
  assert.equal(JSON.parse(list.stdout).profiles.some((profile) => profile.name === "default"), true);

  const show = capture(() => runCli(["profile", "show", "default"], root));
  assert.equal(show.code, 0);
  assert.equal(JSON.parse(show.stdout).ready, false);

  const doctor = capture(() => runCli(["profile", "doctor", "default"], root));
  assert.equal(doctor.code, 1);
  assert.match(JSON.parse(doctor.stdout).reasons.join("\n"), /no executable verification steps/i);

  const doctorByFlag = capture(() => runCli(["profile", "doctor", "--profile", "default"], root));
  assert.equal(doctorByFlag.code, 1);
  assert.equal(JSON.parse(doctorByFlag.stdout).requested_name, "default");
});

test("status returns empty task state before initialization", () => {
  const root = tempProject();
  const result = capture(() => runCli(["status", "--json"], root));

  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).task, null);
});

test("init --ci github creates the GitHub Actions workflow from the template", () => {
  const root = tempProject();
  const result = capture(() => runCli(["init", "--profile", "node", "--ci", "github"], root));

  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).ci_workflow_path, ".github/workflows/harness.yml");
  assert.equal(fs.existsSync(path.join(root, ".github", "workflows", "harness.yml")), true);
});

test("init --ci generic creates a generic CI guide instead of a GitHub workflow", () => {
  const root = tempProject();
  const result = capture(() => runCli(["init", "--profile", "generic", "--ci", "generic"], root));

  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).ci_workflow_path, "harness/ci/harness-ci.md");
  assert.equal(fs.existsSync(path.join(root, "harness", "ci", "harness-ci.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".github", "workflows", "harness.yml")), false);
});

test("Harness plugin agents declare valid CodeBuddy frontmatter", () => {
  const root = path.join(__dirname, "..");
  for (const agent of HARNESS_AGENT_NAMES) {
    const text = fs.readFileSync(path.join(root, "agents", `${agent}.md`), "utf8");
    assert.match(text, /^---\r?\n/);
    const end = text.search(/\r?\n---\r?\n/);
    assert.notEqual(end, -1);
    const frontmatterStart = text.startsWith("---\r\n") ? 5 : 4;
    const marker = text.match(/\r?\n---\r?\n/);
    const frontmatter = text.slice(frontmatterStart, end);
    assert.match(frontmatter, new RegExp(`(^|\\r?\\n)name: ${agent}(\\r?\\n|$)`));
    assert.match(frontmatter, /(^|\r?\n)description: .+(\r?\n|$)/);
    assert.match(frontmatter, /(^|\r?\n)model: claude-sonnet-4\.6(\r?\n|$)/);
    assert.match(text.slice(end + marker[0].length).trimStart(), /^# /);
  }
});
