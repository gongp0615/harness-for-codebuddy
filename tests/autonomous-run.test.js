"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runCli } = require("../scripts/cli");
const { findCodeBuddyExecutable, runAutonomous } = require("../scripts/harness-engine/orchestrator");
const { status, recover } = require("../scripts/harness-engine/state");

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "harness-autonomous-"));
}

function makeFakeCodeBuddy(root) {
  const bin = path.join(root, process.platform === "win32" ? "codebuddy.cmd" : "codebuddy");
  const script = process.platform === "win32"
    ? [
        "@echo off",
        "set agent=unknown",
        ":loop",
        "if \"%1\"==\"--agent\" set agent=%2",
        "if \"%1\"==\"\" goto done",
        "shift",
        "goto loop",
        ":done",
        "if \"%agent%\"==\"verifier\" (echo {\"pass\":true,\"safe_to_continue\":true,\"summary\":\"ok\",\"fix_instructions\":\"\"}) else (echo %agent% output)"
      ].join("\r\n")
    : [
        "#!/usr/bin/env node",
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "const args = process.argv.slice(2);",
        "const agent = args[args.indexOf('--agent') + 1] || 'unknown';",
        "fs.appendFileSync(path.join(process.cwd(), '.fake-codebuddy-log'), `${agent}\\n`);",
        "if (agent === 'verifier') console.log(JSON.stringify({ pass: true, safe_to_continue: true, summary: 'ok', fix_instructions: '' }));",
        "else console.log(`${agent} output`);"
      ].join("\n");
  fs.writeFileSync(bin, script);
  fs.chmodSync(bin, 0o755);
  return bin;
}

function writeProfile(root, command) {
  fs.mkdirSync(path.join(root, "harness", "profiles"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "harness", "profiles", "default.yaml"),
    [
      "name: default",
      "steps:",
      "  - name: required",
      `    command: ${command}`,
      "    required: true"
    ].join("\n")
  );
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

test("runAutonomous completes planner, executor, verifier and writes artifacts", () => {
  const root = tempProject();
  const fake = makeFakeCodeBuddy(root);
  writeProfile(root, "node -e \"process.exit(0)\"");

  const result = runAutonomous(root, { task: "Ship autonomous mode", codebuddyBin: fake, maxRounds: 3 });

  assert.equal(result.ok, true);
  assert.equal(result.run.status, "AUTONOMOUS_DONE");
  assert.equal(result.run.current_round, 1);
  assert.equal(fs.existsSync(path.join(root, ".harness-engineer", "spec.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".harness-engineer", "contract.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".harness-engineer", "run.json")), true);
  assert.equal(fs.existsSync(path.join(root, ".harness-engineer", "evaluation.json")), true);
  assert.deepEqual(fs.readFileSync(path.join(root, ".fake-codebuddy-log"), "utf8").trim().split(/\r?\n/), ["planner", "executor", "verifier"]);
  assert.equal(status(root).task.status, "AUTONOMOUS_DONE");
  assert.equal(status(root).evaluation.pass, true);
});

test("runAutonomous advances rounds until max rounds when verification keeps failing", () => {
  const root = tempProject();
  const fake = makeFakeCodeBuddy(root);
  writeProfile(root, "node -e \"process.exit(9)\"");

  const result = runAutonomous(root, { task: "Fix failing thing", codebuddyBin: fake, maxRounds: 2 });

  assert.equal(result.ok, false);
  assert.equal(result.run.status, "MAX_ROUNDS_REACHED");
  assert.equal(result.run.current_round, 2);
  assert.equal(result.run.rounds.length, 2);
  assert.equal(status(root).task.status, "MAX_ROUNDS_REACHED");
  assert.equal(status(root).evaluation.pass, false);
  assert.match(recover(root).next_step, /max-rounds/i);
});

test("runAutonomous reports missing CodeBuddy CLI clearly", () => {
  const root = tempProject();

  assert.throws(
    () => runAutonomous(root, { task: "No executable", codebuddyBin: path.join(root, "missing-codebuddy") }),
    /CodeBuddy CLI not found/
  );
});

test("CLI run validates task and supports JSON output", () => {
  const root = tempProject();
  const fake = makeFakeCodeBuddy(root);
  writeProfile(root, "node -e \"process.exit(0)\"");

  const missing = capture(() => runCli(["run"], root));
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /run requires --task/);

  const previousBin = process.env.CODEBUDDY_BIN;
  process.env.CODEBUDDY_BIN = fake;
  try {
    const result = capture(() => runCli(["run", "--task", "CLI autonomous", "--profile", "default", "--max-rounds", "2", "--json"], root));
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).run.status, "AUTONOMOUS_DONE");
  } finally {
    if (previousBin === undefined) delete process.env.CODEBUDDY_BIN;
    else process.env.CODEBUDDY_BIN = previousBin;
  }
});

test("findCodeBuddyExecutable locates cbc on PATH", () => {
  const root = tempProject();
  const fake = path.join(root, process.platform === "win32" ? "cbc.cmd" : "cbc");
  fs.writeFileSync(fake, process.platform === "win32" ? "@echo off\r\n" : "#!/usr/bin/env sh\n");
  fs.chmodSync(fake, 0o755);
  const oldPath = process.env.PATH;
  process.env.PATH = root;
  try {
    assert.equal(findCodeBuddyExecutable({}), fake);
  } finally {
    process.env.PATH = oldPath;
  }
});
