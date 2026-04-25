"use strict";

const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const { readJson, writeJson } = require("../paths");
const { runProfile } = require("./profile-runner");
const { initProject, statePaths, transitionTask } = require("./state");

const DEFAULT_MAX_ROUNDS = 5;
const HEADLESS_ARGS = ["-y", "--permission-mode", "bypassPermissions", "--subagent-permission-mode", "bypassPermissions"];

function runAutonomous(projectRoot, options = {}) {
  if (!options.task || !options.task.trim()) throw new Error("run requires --task <text>");
  const maxRounds = parseMaxRounds(options.maxRounds);
  const profile = options.profile || "default";
  const executable = findCodeBuddyExecutable(options);
  if (!executable) throw new Error("CodeBuddy CLI not found. Install `codebuddy` or `cbc`, or set CODEBUDDY_BIN.");

  initProject(projectRoot);
  const paths = statePaths(projectRoot);
  fs.mkdirSync(paths.root, { recursive: true });

  const run = createRun(options.task.trim(), profile, maxRounds, executable);
  writeRun(projectRoot, run);

  transitionTask(projectRoot, "SPEC_READY", "Autonomous run started; planner is preparing the spec.", {
    title: options.task.trim(),
    current_step: "Planner spec"
  });
  const planner = invokeCodeBuddy(executable, "planner", plannerPrompt(options.task.trim(), profile, maxRounds), projectRoot);
  run.planner = planner;
  run.agent_outputs.push(agentOutput("planner", 0, planner));
  if (agentFailed(planner)) {
    run.exit_reason = "planner_failed";
    run.finished_at = now();
    run.status = "INTERRUPTED";
    writeRun(projectRoot, run);
    transitionTask(projectRoot, "INTERRUPTED", "Planner headless CodeBuddy call failed.", { current_step: "Inspect planner output" });
    return result(projectRoot, run, null, null);
  }
  writeText(paths.spec, planner.stdout || fallbackSpec(options.task.trim(), profile));
  writeText(paths.contract, initialContract(options.task.trim(), profile, maxRounds, planner.stdout));
  writeRun(projectRoot, run);

  let lastEvaluation = null;
  for (let round = 1; round <= maxRounds; round += 1) {
    run.current_round = round;
    run.round = round;
    transitionTask(projectRoot, lastEvaluation && !lastEvaluation.pass ? "FIXING" : "BUILDING", `Autonomous round ${round} started.`, {
      current_step: `Autonomous round ${round}`
    });

    const executor = invokeCodeBuddy(executable, "executor", executorPrompt(projectRoot, options.task.trim(), profile, round, maxRounds, paths, lastEvaluation), projectRoot);
    run.agent_outputs.push(agentOutput("executor", round, executor));
    const roundRecord = { round, executor };
    writeRun(projectRoot, run);
    if (agentFailed(executor)) {
      run.exit_reason = "executor_failed";
      run.finished_at = now();
      run.status = "INTERRUPTED";
      run.rounds.push(roundRecord);
      writeRun(projectRoot, run);
      transitionTask(projectRoot, "INTERRUPTED", `Executor failed in autonomous round ${round}.`, { current_step: "Inspect executor output" });
      return result(projectRoot, run, lastEvaluation, null);
    }

    transitionTask(projectRoot, "EVALUATING", `Autonomous round ${round} is collecting verification evidence.`, {
      current_step: `Evaluate round ${round}`
    });
    const verification = runProfile(projectRoot, { profile });
    const verifier = invokeCodeBuddy(executable, "verifier", verifierPrompt(projectRoot, options.task.trim(), profile, round, paths, verification), projectRoot);
    run.agent_outputs.push(agentOutput("verifier", round, verifier));
    if (agentFailed(verifier)) {
      run.exit_reason = "verifier_failed";
      run.finished_at = now();
      run.status = "INTERRUPTED";
      roundRecord.verification = verification;
      roundRecord.verifier = verifier;
      run.rounds.push(roundRecord);
      writeRun(projectRoot, run);
      transitionTask(projectRoot, "INTERRUPTED", `Verifier failed in autonomous round ${round}.`, { current_step: "Inspect verifier output" });
      return result(projectRoot, run, lastEvaluation, verification);
    }

    const evaluation = buildEvaluation(round, profile, verification, verifier, lastEvaluation);
    lastEvaluation = evaluation;
    roundRecord.verification = verification;
    roundRecord.verifier = verifier;
    roundRecord.evaluation = evaluation;
    run.rounds.push(roundRecord);
    writeJson(paths.evaluation, evaluation);
    writeRun(projectRoot, run);

    if (evaluation.pass) {
      run.exit_reason = "required_verification_passed";
      run.finished_at = now();
      run.status = "AUTONOMOUS_DONE";
      writeRun(projectRoot, run);
      transitionTask(projectRoot, "AUTONOMOUS_DONE", "Autonomous run completed with passing required verification.", {
        current_step: "Done"
      });
      return result(projectRoot, run, evaluation, verification);
    }

    if (evaluation.safe_to_continue === false) {
      run.exit_reason = "verifier_unsafe_to_continue";
      run.finished_at = now();
      run.status = "INTERRUPTED";
      writeRun(projectRoot, run);
      transitionTask(projectRoot, "INTERRUPTED", "Verifier stopped the autonomous run as unsafe to continue.", {
        current_step: "Inspect evaluator guidance"
      });
      return result(projectRoot, run, evaluation, verification);
    }

    writeText(paths.contract, nextRoundContract(options.task.trim(), profile, round + 1, maxRounds, evaluation));
  }

  run.exit_reason = "max_rounds_reached";
  run.finished_at = now();
  run.status = "MAX_ROUNDS_REACHED";
  writeRun(projectRoot, run);
  transitionTask(projectRoot, "MAX_ROUNDS_REACHED", "Autonomous run reached the max round limit before verification passed.", {
    current_step: "Inspect evaluator guidance"
  });
  return result(projectRoot, run, lastEvaluation, null);
}

function findCodeBuddyExecutable(options = {}) {
  if (options.codebuddyBin) return isExecutable(options.codebuddyBin) ? options.codebuddyBin : null;
  if (process.env.CODEBUDDY_BIN) return isExecutable(process.env.CODEBUDDY_BIN) ? process.env.CODEBUDDY_BIN : null;
  const candidates = ["codebuddy", "cbc"];
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) || path.isAbsolute(candidate)) {
      if (isExecutable(candidate)) return candidate;
      continue;
    }
    const found = findOnPath(candidate);
    if (found) return found;
  }
  return null;
}

function findOnPath(command) {
  const extensions = process.platform === "win32" ? ["", ".cmd", ".exe", ".bat"] : [""];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const extension of extensions) {
      const candidate = path.join(dir, `${command}${extension}`);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function invokeCodeBuddy(executable, agent, prompt, cwd) {
  const startedAt = now();
  const args = ["-p", prompt, ...HEADLESS_ARGS, "--agent", agent];
  const completed = cp.spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30 * 60 * 1000
  });
  return {
    agent,
    command: `${path.basename(executable)} -p <prompt> ${HEADLESS_ARGS.join(" ")} --agent ${agent}`,
    started_at: startedAt,
    finished_at: now(),
    exit_code: completed.status ?? (completed.error ? 1 : 0),
    signal: completed.signal || null,
    stdout: trim(completed.stdout),
    stderr: trim(completed.stderr),
    error: completed.error ? completed.error.message : null
  };
}

function buildEvaluation(round, profile, verification, verifier, previousEvaluation) {
  const parsed = parseJsonObject(verifier.stdout);
  const requiredPassed = Boolean(verification && verification.ok);
  const verifierPass = typeof parsed.pass === "boolean" ? parsed.pass : undefined;
  const pass = verifierPass === undefined ? requiredPassed : verifierPass && requiredPassed;
  return {
    round,
    profile,
    pass,
    safe_to_continue: parsed.safe_to_continue !== false,
    required_verification_passed: requiredPassed,
    verifier_exit_code: verifier.exit_code,
    evidence_status: verification && verification.evidence ? verification.evidence.status : null,
    summary: parsed.summary || (pass ? "Required verification passed." : "Required verification failed."),
    fix_instructions: parsed.fix_instructions || parsed.next_steps || (pass ? "" : "Inspect failed verification evidence and fix the failing required steps."),
    previous_summary: previousEvaluation ? previousEvaluation.summary : null,
    raw_verifier_output: verifier.stdout
  };
}

function parseJsonObject(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

function createRun(task, profile, maxRounds, executable) {
  const at = now();
  return {
    run_id: `run-${at.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    task,
    profile,
    max_rounds: maxRounds,
    current_round: 0,
    round: 0,
    status: "RUNNING",
    codebuddy_bin: executable,
    started_at: at,
    finished_at: null,
    exit_reason: null,
    planner: null,
    rounds: [],
    agent_outputs: []
  };
}

function plannerPrompt(task, profile, maxRounds) {
  return [
    "You are the planner for harness-engineer autonomous mode.",
    "Do not call `harness run` or start nested autonomous harnesses.",
    `Task: ${task}`,
    `Verification profile: ${profile}`,
    `Max rounds: ${maxRounds}`,
    "",
    "Write a complete engineering spec with: task summary, non-goals, acceptance criteria, expected files, verification contract, and risks.",
    "Do not implement."
  ].join("\n");
}

function executorPrompt(projectRoot, task, profile, round, maxRounds, paths, lastEvaluation) {
  return [
    "You are the executor for harness-engineer autonomous mode.",
    "Do not call `harness run` or start nested autonomous harnesses.",
    `Task: ${task}`,
    `Round: ${round}/${maxRounds}`,
    `Verification profile: ${profile}`,
    `Read spec: ${path.relative(projectRoot, paths.spec)}`,
    `Read contract: ${path.relative(projectRoot, paths.contract)}`,
    lastEvaluation ? `Previous evaluator summary: ${lastEvaluation.summary}` : "Previous evaluator summary: none",
    lastEvaluation && lastEvaluation.fix_instructions ? `Fix instructions: ${lastEvaluation.fix_instructions}` : "",
    "",
    "Implement the smallest safe change that satisfies the contract. Preserve user edits. Write a concise round summary to stdout."
  ].filter(Boolean).join("\n");
}

function verifierPrompt(projectRoot, task, profile, round, paths, verification) {
  return [
    "You are the verifier for harness-engineer autonomous mode.",
    "Do not call `harness run` or start nested autonomous harnesses.",
    `Task: ${task}`,
    `Round: ${round}`,
    `Verification profile: ${profile}`,
    `Evidence status: ${verification && verification.evidence ? verification.evidence.status : "unknown"}`,
    `Evidence path: ${path.relative(projectRoot, paths.evidence)}`,
    `Contract path: ${path.relative(projectRoot, paths.contract)}`,
    "",
    "Judge the diff, contract, and evidence. Return JSON only with keys: pass, safe_to_continue, summary, fix_instructions.",
    "Only set pass=true when required verification passed and the contract is satisfied."
  ].join("\n");
}

function fallbackSpec(task, profile) {
  return [
    "# Autonomous Spec",
    "",
    `Task: ${task}`,
    "",
    "## Acceptance Criteria",
    "",
    `- Required verification passes with profile \`${profile}\`.`,
    "- Changes stay scoped to the task.",
    "",
    "## Non-goals",
    "",
    "- Nested autonomous harness runs."
  ].join("\n");
}

function initialContract(task, profile, maxRounds, plannerOutput) {
  return [
    "# Autonomous Contract",
    "",
    `Task: ${task}`,
    `Verification profile: ${profile}`,
    `Max rounds: ${maxRounds}`,
    "",
    "## Required Completion",
    "",
    "- Implement the planner spec.",
    "- Pass all required verification steps.",
    "- Stop when the verifier returns pass=true.",
    "",
    "## Planner Output",
    "",
    plannerOutput || "(No planner output captured.)"
  ].join("\n");
}

function nextRoundContract(task, profile, nextRound, maxRounds, evaluation) {
  return [
    "# Autonomous Contract",
    "",
    `Task: ${task}`,
    `Verification profile: ${profile}`,
    `Next round: ${nextRound}/${maxRounds}`,
    "",
    "## Required Fix",
    "",
    evaluation && evaluation.fix_instructions ? evaluation.fix_instructions : "Fix the failing required verification steps.",
    "",
    "## Last Evaluation",
    "",
    evaluation ? evaluation.summary : "No evaluator summary captured."
  ].join("\n");
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content.replace(/\s+$/g, "")}\n`);
}

function writeRun(projectRoot, run) {
  writeJson(statePaths(projectRoot).run, run);
}

function agentOutput(agent, round, output) {
  return {
    agent,
    round,
    exit_code: output.exit_code,
    started_at: output.started_at,
    finished_at: output.finished_at,
    stdout: output.stdout,
    stderr: output.stderr,
    error: output.error
  };
}

function agentFailed(output) {
  return output.exit_code !== 0 || Boolean(output.error);
}

function result(projectRoot, run, evaluation, verification) {
  return {
    ok: run.status === "AUTONOMOUS_DONE",
    project_root: projectRoot,
    run,
    evaluation,
    verification,
    summary: `${run.run_id}: ${run.status}${run.exit_reason ? ` (${run.exit_reason})` : ""}`
  };
}

function parseMaxRounds(value) {
  const parsed = Number(value || DEFAULT_MAX_ROUNDS);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error("--max-rounds must be a positive integer");
  return parsed;
}

function trim(value, limit = 12000) {
  const text = value || "";
  return text.length > limit ? `${text.slice(0, limit)}\n...<truncated>` : text;
}

function now() {
  return new Date().toISOString();
}

module.exports = {
  DEFAULT_MAX_ROUNDS,
  findCodeBuddyExecutable,
  runAutonomous
};
