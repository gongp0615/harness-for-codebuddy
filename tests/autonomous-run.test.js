"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runCli } = require("../scripts/cli");
const { codeBuddyInvocation, findCodeBuddyExecutable, runAutonomous } = require("../scripts/harness-engine/orchestrator");
const { status, recover } = require("../scripts/harness-engine/state");

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "harness-autonomous-"));
}

function makeFakeCodeBuddy(root, options = {}) {
  const bin = path.join(root, process.platform === "win32" ? "codebuddy.cmd" : "codebuddy");
  const helper = path.join(root, "fake-codebuddy.js");
  const plannerOutput = JSON.stringify(options.plannerOutput || {
    ready_to_execute: true,
    missing_requirements: [],
    spec_markdown: "# Spec\n\nReady.",
    contract_markdown: "# Contract\n\nPass verification.",
    summary: "ready"
  });
  const verifierOutput = options.verifierOutput === undefined
    ? JSON.stringify({ pass: true, safe_to_continue: true, summary: "ok", fix_instructions: "" })
    : String(options.verifierOutput);
  fs.writeFileSync(helper, [
    '"use strict";',
    "const fs = require(\"node:fs\");",
    `const plannerOutput = ${JSON.stringify(plannerOutput)};`,
    `const verifierOutput = ${JSON.stringify(verifierOutput)};`,
    "const rawArgs = process.env.HARNESS_FAKE_ARGS || \"\";",
    "let agent = process.env.HARNESS_AGENT_NAME || \"unknown\";",
    "if (agent === \"unknown\" && rawArgs.includes(\"--agent planner\")) agent = \"planner\";",
    "if (agent === \"unknown\" && rawArgs.includes(\"--agent verifier\")) agent = \"verifier\";",
    "if (agent === \"unknown\" && rawArgs.includes(\"--agent executor\")) agent = \"executor\";",
    "if (agent === \"unknown\") {",
    "  for (let index = 2; index < process.argv.length; index += 1) {",
    "    if (process.argv[index] === \"--agent\") {",
    "      agent = process.argv[index + 1] || \"unknown\";",
    "      break;",
    "    }",
    "  }",
    "}",
    "fs.appendFileSync(\".fake-codebuddy-log\", `${agent}\\n`);",
    "if (agent === \"planner\") process.stdout.write(`${plannerOutput}\\n`);",
    "else if (agent === \"verifier\") process.stdout.write(`${verifierOutput}\\n`);",
    "else process.stdout.write(`${agent} output\\n`);"
  ].join("\n"));
  const script = process.platform === "win32"
    ? [
        "@echo off",
        "setlocal",
        "set \"HARNESS_FAKE_ARGS=%*\"",
        `node "${helper}"`
      ].join("\r\n")
    : [
        "#!/usr/bin/env sh",
        `exec node ${JSON.stringify(helper)} \"$@\"`
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
  writeProfile(root, "node -e \"process.exit(0)\"");

  assert.throws(
    () => runAutonomous(root, { task: "No executable", codebuddyBin: path.join(root, "missing-codebuddy") }),
    /CodeBuddy CLI not found/
  );
});

test("runAutonomous refuses empty verification profiles before invoking CodeBuddy", () => {
  const root = tempProject();
  const fake = makeFakeCodeBuddy(root);
  fs.mkdirSync(path.join(root, "harness", "profiles"), { recursive: true });
  fs.writeFileSync(path.join(root, "harness", "profiles", "default.yaml"), "name: default\nsteps: []\n");

  const result = runAutonomous(root, { task: "Do not run", codebuddyBin: fake, maxRounds: 1 });

  assert.equal(result.ok, false);
  assert.equal(result.profile.ready, false);
  assert.equal(fs.existsSync(path.join(root, ".fake-codebuddy-log")), false);
  assert.equal(fs.existsSync(path.join(root, ".harness-engineer", "run.json")), false);
});

test("runAutonomous dry-run reports readiness without writing run state", () => {
  const root = tempProject();
  const fake = makeFakeCodeBuddy(root);
  writeProfile(root, "node -e \"process.exit(0)\"");

  const result = runAutonomous(root, { task: "Preview run", codebuddyBin: fake, maxRounds: 2, dryRun: true });

  assert.equal(result.ok, true);
  assert.equal(result.ready, true);
  assert.equal(result.codebuddy_bin, fake);
  assert.equal(result.profile.required_step_count, 1);
  assert.equal(fs.existsSync(path.join(root, ".harness-engineer", "run.json")), false);
  assert.equal(fs.existsSync(path.join(root, ".fake-codebuddy-log")), false);
});

test("planner ready_to_execute=false stops before executor", () => {
  const root = tempProject();
  const fake = makeFakeCodeBuddy(root, {
    plannerOutput: {
      ready_to_execute: false,
      missing_requirements: ["target file"],
      spec_markdown: "# Spec\n\nNeed target file.",
      contract_markdown: "# Contract\n\nClarify first.",
      summary: "needs clarification"
    }
  });
  writeProfile(root, "node -e \"process.exit(0)\"");

  const result = runAutonomous(root, { task: "Fix it", codebuddyBin: fake, maxRounds: 1 });

  assert.equal(result.ok, false);
  assert.equal(result.run.status, "SPEC_NEEDS_CLARIFICATION");
  assert.equal(status(root).task.status, "SPEC_NEEDS_CLARIFICATION");
  assert.deepEqual(fs.readFileSync(path.join(root, ".fake-codebuddy-log"), "utf8").trim().split(/\r?\n/), ["planner"]);
});

test("invalid planner JSON stops before executor", () => {
  const root = tempProject();
  const fake = makeFakeCodeBuddy(root, { plannerOutput: "not json" });
  writeProfile(root, "node -e \"process.exit(0)\"");

  const result = runAutonomous(root, { task: "Invalid planner", codebuddyBin: fake, maxRounds: 1 });

  assert.equal(result.ok, false);
  assert.equal(result.run.exit_reason, "planner_invalid_json");
  assert.deepEqual(fs.readFileSync(path.join(root, ".fake-codebuddy-log"), "utf8").trim().split(/\r?\n/), ["planner"]);
});

test("invalid verifier JSON stops even when verification passes", () => {
  const root = tempProject();
  const fake = makeFakeCodeBuddy(root, { verifierOutput: "not json" });
  writeProfile(root, "node -e \"process.exit(0)\"");

  const result = runAutonomous(root, { task: "Invalid verifier", codebuddyBin: fake, maxRounds: 1 });

  assert.equal(result.ok, false);
  assert.equal(result.run.exit_reason, "verifier_invalid_json");
  assert.equal(result.run.status, "INTERRUPTED");
});

test("runAutonomous resumes from the next round without rerunning planner", () => {
  const root = tempProject();
  const fake = makeFakeCodeBuddy(root);
  writeProfile(root, "node -e \"process.exit(9)\"");
  const first = runAutonomous(root, { task: "Resume failing thing", codebuddyBin: fake, maxRounds: 1 });
  assert.equal(first.run.status, "MAX_ROUNDS_REACHED");

  const second = runAutonomous(root, { resume: true, codebuddyBin: fake, maxRounds: 2 });

  assert.equal(second.run.current_round, 2);
  assert.equal(second.run.rounds.length, 2);
  assert.equal(second.run.status, "MAX_ROUNDS_REACHED");
  assert.deepEqual(fs.readFileSync(path.join(root, ".fake-codebuddy-log"), "utf8").trim().split(/\r?\n/), [
    "planner",
    "executor",
    "verifier",
    "executor",
    "verifier"
  ]);
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

test("Windows cmd and bat CodeBuddy launch through cmd.exe", () => {
  const invocation = codeBuddyInvocation("C:\\Tools\\codebuddy.cmd", ["-p", "hello", "--agent", "planner"], "win32");

  assert.equal(invocation.command, process.env.ComSpec || "cmd.exe");
  assert.deepEqual(invocation.args, ["/d", "/c", "C:\\Tools\\codebuddy.cmd", "-p", "hello", "--agent", "planner"]);

  assert.equal(codeBuddyInvocation("C:\\Tools\\codebuddy.exe", [], "win32").command, "C:\\Tools\\codebuddy.exe");
});
