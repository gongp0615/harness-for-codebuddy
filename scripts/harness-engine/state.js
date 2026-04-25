"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("../paths");
const { ensureHarnessConfig } = require("./config");

const STATE_DIR = ".harness-engineer";
const VALID_STATUSES = new Set([
  "NEW",
  "PLANNED",
  "EXECUTING",
  "VERIFYING",
  "VERIFIED",
  "READY_FOR_REVIEW",
  "DONE",
  "BLOCKED_BY_POLICY",
  "FAILED_VERIFICATION",
  "INTERRUPTED",
  "RECOVERING"
]);

function harnessDir(projectRoot) {
  return path.join(projectRoot, STATE_DIR);
}

function statePaths(projectRoot) {
  const root = harnessDir(projectRoot);
  return {
    root,
    task: path.join(root, "task.json"),
    legacyState: path.join(root, "state.json"),
    plan: path.join(root, "plan.md"),
    evidence: path.join(root, "evidence.json"),
    risks: path.join(root, "risks.md"),
    hooks: path.join(root, "hook-events.jsonl"),
    verifyCache: path.join(root, "verify-cache")
  };
}

function now() {
  return new Date().toISOString();
}

function createTask(projectRoot, overrides = {}) {
  const paths = statePaths(projectRoot);
  const at = now();
  const taskId = overrides.task_id || overrides.id || `task-${at.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  return {
    task_id: taskId,
    status: overrides.status || "NEW",
    title: overrides.title || "Unplanned task",
    created_at: overrides.created_at || at,
    updated_at: at,
    plan_path: path.relative(projectRoot, paths.plan),
    evidence_path: path.relative(projectRoot, paths.evidence),
    risks_path: path.relative(projectRoot, paths.risks),
    current_step: overrides.current_step || null,
    history: overrides.history || [{ at, status: overrides.status || "NEW", note: "Task initialized." }]
  };
}

function validateTask(task) {
  const required = ["task_id", "status", "title", "created_at", "updated_at", "plan_path", "evidence_path", "risks_path", "history"];
  for (const key of required) {
    if (!(key in task)) throw new Error(`task.json missing required field: ${key}`);
  }
  if (!VALID_STATUSES.has(task.status)) throw new Error(`Invalid task status: ${task.status}`);
  if (!Array.isArray(task.history)) throw new Error("task.json history must be an array");
}

function readTask(projectRoot) {
  const task = readJson(statePaths(projectRoot).task, null);
  if (!task) return null;
  validateTask(task);
  return task;
}

function writeTask(projectRoot, task, note) {
  validateTask(task);
  task.updated_at = now();
  if (note) task.history.push({ at: task.updated_at, status: task.status, note });
  writeJson(statePaths(projectRoot).task, task);
  writeLegacyState(projectRoot, task);
  return task;
}

function writeLegacyState(projectRoot, task) {
  writeJson(statePaths(projectRoot).legacyState, {
    active_task_id: task ? task.task_id : null,
    tasks: task ? [{ task_id: task.task_id, status: task.status, title: task.title }] : [],
    updated_at: now()
  });
}

function initProject(projectRoot, options = {}) {
  const paths = statePaths(projectRoot);
  fs.mkdirSync(paths.root, { recursive: true });
  fs.mkdirSync(paths.verifyCache, { recursive: true });
  const config = ensureHarnessConfig(projectRoot, options);

  const existing = readTask(projectRoot);
  const task = existing || createTask(projectRoot, { title: "Initialized Harness task" });
  writeTask(projectRoot, task, existing ? "Harness state refreshed." : "Harness state initialized.");
  writeIfMissing(paths.plan, "# Plan\n\nNo plan recorded yet.\n");
  writeIfMissing(paths.risks, "# Risks\n\n- None recorded.\n");
  if (!fs.existsSync(paths.evidence)) {
    writeJson(paths.evidence, emptyEvidence(task.task_id));
  }
  writeIfMissing(paths.hooks, "");
  return {
    ok: true,
    project_root: projectRoot,
    harness_dir: paths.root,
    task,
    ci_provider: config.ci_provider,
    ci_workflow_path: config.ci_workflow_path
  };
}

function emptyEvidence(taskId = null) {
  return {
    task_id: taskId,
    status: "NO_EVIDENCE",
    profile: null,
    started_at: null,
    finished_at: null,
    steps: [],
    artifacts: [],
    changed_files: [],
    risks: []
  };
}

function writeIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function ensureProject(projectRoot) {
  if (!fs.existsSync(statePaths(projectRoot).task)) {
    initProject(projectRoot);
  }
  return readTask(projectRoot);
}

function planTask(projectRoot, options = {}) {
  if (!options.task) throw new Error("plan requires --task <text>");
  initProject(projectRoot);
  const existing = readTask(projectRoot);
  const task = {
    ...existing,
    task_id: options.id || existing.task_id,
    status: "PLANNED",
    title: options.task,
    current_step: "Execute plan"
  };
  const plan = [
    "# Plan",
    "",
    `Task: ${options.task}`,
    "",
    "## Steps",
    "",
    "1. Inspect the affected files and existing tests.",
    "2. Make the smallest scoped implementation change.",
    "3. Run the configured verification profile.",
    "",
    "## Verification",
    "",
    "- `harness verify --profile default`"
  ].join("\n");
  fs.writeFileSync(statePaths(projectRoot).plan, `${plan}\n`);
  return { ok: true, task: writeTask(projectRoot, task, "Plan recorded."), plan_path: statePaths(projectRoot).plan };
}

function status(projectRoot) {
  const paths = statePaths(projectRoot);
  const task = fs.existsSync(paths.task) ? readTask(projectRoot) : null;
  const evidence = readJson(paths.evidence, null);
  const risks = fs.existsSync(paths.risks) ? fs.readFileSync(paths.risks, "utf8") : null;
  const legacy = readJson(paths.legacyState, {
    active_task_id: task ? task.task_id : null,
    tasks: task ? [{ task_id: task.task_id, status: task.status, title: task.title }] : [],
    updated_at: task ? task.updated_at : null
  });
  return {
    ok: true,
    project_root: projectRoot,
    harness_dir: paths.root,
    state: legacy,
    task,
    evidence,
    risks,
    summary: task ? `${task.task_id}: ${task.status} - ${task.title}` : "No Harness task initialized."
  };
}

function transitionTask(projectRoot, status, note, updates = {}) {
  const task = ensureProject(projectRoot);
  task.status = status;
  Object.assign(task, updates);
  return writeTask(projectRoot, task, note);
}

function writeEvidence(projectRoot, evidence) {
  const task = ensureProject(projectRoot);
  const next = {
    ...emptyEvidence(task.task_id),
    ...evidence,
    task_id: evidence.task_id || task.task_id
  };
  writeJson(statePaths(projectRoot).evidence, next);
  return next;
}

function recover(projectRoot) {
  const current = status(projectRoot);
  if (!current.task) {
    return { ok: true, task_id: null, status: "NO_TASK", next_step: "Run `harness init`, then `harness plan --task \"...\"`." };
  }
  const next = nextStep(current.task, current.evidence);
  return {
    ok: true,
    task_id: current.task.task_id,
    status: current.task.status,
    current_step: current.task.current_step,
    next_step: next,
    evidence_status: current.evidence ? current.evidence.status : "NO_EVIDENCE"
  };
}

function nextStep(task, evidence) {
  if (task.status === "NEW") return "Run `harness plan --task \"...\"` to record the task plan.";
  if (task.status === "PLANNED" || task.status === "EXECUTING") return "Execute the plan, then run `harness verify --profile default`.";
  if (task.status === "FAILED_VERIFICATION") return "Inspect failed evidence, fix the cause, and rerun `harness verify`.";
  if (task.status === "VERIFIED") return "Prepare review notes with `harness evidence --summary`.";
  if (!evidence || evidence.status === "NO_EVIDENCE") return "Run `harness verify --profile default` to collect evidence.";
  return "Inspect `harness status` and continue from the current step.";
}

function evidenceSummary(projectRoot) {
  const evidence = readJson(statePaths(projectRoot).evidence, null);
  if (!evidence || evidence.status === "NO_EVIDENCE") {
    return {
      ok: true,
      has_evidence: false,
      markdown: "No verification evidence recorded. Run `harness verify --profile default` before review."
    };
  }
  const lines = [
    "## Verification Evidence",
    "",
    `- Profile: ${evidence.profile || "unknown"}`,
    `- Status: ${evidence.status}`,
    `- Started: ${evidence.started_at || "unknown"}`,
    `- Finished: ${evidence.finished_at || "unknown"}`,
    `- Steps: ${evidence.steps.filter((step) => step.exit_code === 0).length}/${evidence.steps.length} passed`
  ];
  for (const step of evidence.steps) {
    lines.push(`- ${step.required ? "Required" : "Optional"} ${step.name}: exit ${step.exit_code}`);
  }
  return { ok: true, has_evidence: true, evidence, markdown: lines.join("\n") };
}

module.exports = {
  VALID_STATUSES,
  createTask,
  emptyEvidence,
  evidenceSummary,
  harnessDir,
  initProject,
  planTask,
  readTask,
  recover,
  statePaths,
  status,
  transitionTask,
  writeEvidence,
  writeTask
};
