"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { initProject, planTask, recover, status, evidenceSummary } = require("../scripts/harness-engine/state");
const { inspectProfile, listProfiles, runProfile } = require("../scripts/harness-engine/profile-runner");
const { evaluatePolicy } = require("../scripts/harness-engine/policy");
const { parseSimpleYaml } = require("../scripts/harness-engine/yaml");

function tempProject(name = "harness-engine-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

test("initProject creates harness state and configuration templates", () => {
  const root = tempProject();
  const result = initProject(root, { profile: "generic" });

  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(root, ".harness-engineer", "task.json")), true);
  assert.equal(fs.existsSync(path.join(root, ".harness-engineer", "plan.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".harness-engineer", "evidence.json")), true);
  assert.equal(fs.existsSync(path.join(root, ".harness-engineer", "risks.md")), true);
  assert.equal(fs.existsSync(path.join(root, "harness", "profiles", "default.yaml")), true);
  assert.equal(fs.existsSync(path.join(root, "harness", "policies", "shell-policy.yaml")), true);

  const current = status(root);
  assert.equal(current.task.status, "NEW");
  assert.equal(current.state.active_task_id, current.task.task_id);
  assert.equal(fs.existsSync(path.join(root, ".github", "workflows", "harness.yml")), false);
});

test("initProject can explicitly enable GitHub Actions CI workflow", () => {
  const root = tempProject();
  const result = initProject(root, { profile: "node", ciProvider: "github" });
  const workflowPath = path.join(root, ".github", "workflows", "harness.yml");

  assert.equal(result.ci_workflow_path, ".github/workflows/harness.yml");
  assert.equal(fs.existsSync(workflowPath), true);
  assert.match(fs.readFileSync(workflowPath, "utf8"), /Harness Verification/);
});

test("initProject can create a generic CI integration guide", () => {
  const root = tempProject();
  const result = initProject(root, { profile: "generic", ciProvider: "generic" });
  const ciPath = path.join(root, "harness", "ci", "harness-ci.md");

  assert.equal(result.ci_workflow_path, "harness/ci/harness-ci.md");
  assert.equal(fs.existsSync(ciPath), true);
  assert.match(fs.readFileSync(ciPath, "utf8"), /harness verify --profile ci/);
});

test("planTask records task metadata and recover suggests verification", () => {
  const root = tempProject();
  initProject(root);

  const planned = planTask(root, { task: "Add checkout retry tests", id: "TASK-42" });
  assert.equal(planned.task.task_id, "TASK-42");
  assert.equal(planned.task.status, "PLANNED");
  assert.match(fs.readFileSync(path.join(root, ".harness-engineer", "plan.md"), "utf8"), /Add checkout retry tests/);

  const next = recover(root);
  assert.equal(next.task_id, "TASK-42");
  assert.match(next.next_step, /execute/i);
});

test("runProfile executes configured steps and writes evidence", () => {
  const root = tempProject();
  initProject(root);
  fs.writeFileSync(
    path.join(root, "harness", "profiles", "default.yaml"),
    [
      "name: default",
      "steps:",
      "  - name: pass",
      "    command: node -e \"process.stdout.write('ok')\"",
      "    required: true"
    ].join("\n")
  );

  const result = runProfile(root, { profile: "default" });
  assert.equal(result.ok, true);
  assert.equal(result.evidence.status, "VERIFIED");
  assert.equal(result.evidence.steps[0].name, "pass");
  assert.equal(result.evidence.steps[0].exit_code, 0);
  assert.equal(fs.existsSync(path.join(root, ".harness-engineer", "evidence.json")), true);
});

test("runProfile records failed required step and failed verification state", () => {
  const root = tempProject();
  initProject(root);
  fs.writeFileSync(
    path.join(root, "harness", "profiles", "default.yaml"),
    [
      "name: default",
      "steps:",
      "  - name: fail",
      "    command: node -e \"process.exit(7)\"",
      "    required: true"
    ].join("\n")
  );

  const result = runProfile(root, { profile: "default" });
  assert.equal(result.ok, false);
  assert.equal(result.evidence.status, "FAILED_VERIFICATION");
  assert.equal(status(root).task.status, "FAILED_VERIFICATION");
});

test("runProfile fails empty profiles without passing verification", () => {
  const root = tempProject();
  initProject(root);
  fs.writeFileSync(path.join(root, "harness", "profiles", "default.yaml"), "name: default\nsteps: []\n");

  const result = runProfile(root, { profile: "default" });

  assert.equal(result.ok, false);
  assert.equal(result.evidence.status, "NO_VERIFICATION_STEPS");
  assert.equal(status(root).task.status, "NO_VERIFICATION_STEPS");
  assert.match(result.evidence.risks.join("\n"), /no executable verification steps/i);
});

test("runProfile fails optional-only profiles", () => {
  const root = tempProject();
  initProject(root);
  fs.writeFileSync(
    path.join(root, "harness", "profiles", "default.yaml"),
    [
      "name: default",
      "steps:",
      "  - name: optional",
      "    command: node -e \"process.exit(0)\"",
      "    required: false"
    ].join("\n")
  );

  const result = runProfile(root, { profile: "default" });

  assert.equal(result.ok, false);
  assert.equal(result.evidence.status, "NO_VERIFICATION_STEPS");
  assert.equal(result.inspection.required_step_count, 0);
});

test("profile inspection reports configured profile readiness", () => {
  const root = tempProject();
  initProject(root);
  fs.writeFileSync(
    path.join(root, "harness", "profiles", "default.yaml"),
    [
      "name: default",
      "steps:",
      "  - name: required",
      "    command: node -e \"process.exit(0)\"",
      "    required: true"
    ].join("\n")
  );

  const inspection = inspectProfile(root, "default");
  assert.equal(inspection.ready, true);
  assert.equal(inspection.required_step_count, 1);
  assert.equal(listProfiles(root).profiles.some((profile) => profile.name === "default"), true);
});

test("evaluatePolicy reads policy files for block, warn, approval, and file scope", () => {
  const root = tempProject();
  initProject(root);

  assert.equal(evaluatePolicy(root, { tool_name: "Bash", tool_input: { command: "git reset --hard" } }).decision, "block");
  assert.equal(evaluatePolicy(root, { tool_name: "Bash", tool_input: { command: "npm publish" } }).decision, "approval");
  assert.equal(evaluatePolicy(root, { tool_name: "Bash", tool_input: { command: "git push origin main" } }).decision, "warn");
  assert.equal(
    evaluatePolicy(root, { tool_name: "Write", tool_input: { file_path: "/etc/passwd" } }).decision,
    "block"
  );
  assert.equal(evaluatePolicy(root, { tool_name: "Bash", tool_input: { command: "npm test" } }).decision, "allow");
});

test("file-scope policy handles Windows paths and invalid root schemas without crashing", () => {
  const root = tempProject();
  initProject(root);

  const defaultDecision = evaluatePolicy(root, { tool_name: "Write", tool_input: { file_path: "README.md" } });
  assert.equal(["allow", "block"].includes(defaultDecision.decision), true);

  const parsed = parseSimpleYaml([
    "allowed_roots:",
    "  - .",
    "blocked_roots:",
    "  - C:\\Windows",
    "  - \"D:\\\\Tools:Archive\""
  ].join("\n"));
  assert.deepEqual(parsed.blocked_roots, ["C:\\Windows", "D:\\Tools:Archive"]);

  fs.writeFileSync(
    path.join(root, "harness", "policies", "file-scope.yaml"),
    [
      "allowed_roots:",
      "  - .",
      "blocked_roots:",
      "  - build"
    ].join("\n")
  );
  assert.equal(
    evaluatePolicy(root, { tool_name: "Write", tool_input: { file_path: "build/out.txt" } }).decision,
    "block"
  );

  fs.writeFileSync(
    path.join(root, "harness", "policies", "file-scope.yaml"),
    [
      "allowed_roots:",
      "  - pattern: not-a-string",
      "blocked_roots:",
      "  - /tmp"
    ].join("\n")
  );
  const invalid = evaluatePolicy(root, { tool_name: "Write", tool_input: { file_path: "README.md" } });
  assert.equal(invalid.decision, "block");
  assert.match(invalid.reason, /allowed_roots entries must be path strings/i);
});

test("generic init uses discovered package scripts when available", () => {
  const root = tempProject();
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { lint: "eslint .", test: "node --test" } }));

  initProject(root, { profile: "generic" });
  const profile = fs.readFileSync(path.join(root, "harness", "profiles", "default.yaml"), "utf8");

  assert.match(profile, /command: npm run lint/);
  assert.match(profile, /command: npm test/);
});

test("evidenceSummary formats profile results for PR descriptions", () => {
  const root = tempProject();
  initProject(root);
  runProfile(root, { profile: "default" });

  const summary = evidenceSummary(root);
  assert.equal(summary.has_evidence, true);
  assert.match(summary.markdown, /Profile:/);
  assert.match(summary.markdown, /Status:/);
});
