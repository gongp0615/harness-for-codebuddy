"use strict";

const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const { readJson, writeJson } = require("../paths");
const { inspectProfile, runProfile } = require("./profile-runner");
const { initProject, statePaths, transitionTask } = require("./state");

const DEFAULT_MAX_ROUNDS = 5;
const HEADLESS_ARGS = ["-y", "--permission-mode", "bypassPermissions", "--subagent-permission-mode", "bypassPermissions"];

function runAutonomous(projectRoot, options = {}) {
  if (options.resume) return resumeAutonomousRun(projectRoot, options);
  if (!options.task || !options.task.trim()) throw new Error("run requires --task <text>");
  const prepared = prepareAutonomousRun(projectRoot, options);
  if (options.dryRun) return dryRunAutonomous(projectRoot, prepared);
  if (!prepared.profile.ready) return notReadyResult(projectRoot, prepared);
  if (!prepared.executable) throw new Error("CodeBuddy CLI not found. Install `codebuddy` or `cbc`, or set CODEBUDDY_BIN.");

  initProject(projectRoot);
  const paths = statePaths(projectRoot);
  fs.mkdirSync(paths.root, { recursive: true });

  const run = createRun(prepared.task, prepared.profile.name, prepared.maxRounds, prepared.executable);
  writeRun(projectRoot, run);

  transitionTask(projectRoot, "SPEC_READY", "Autonomous run started; planner is preparing the spec.", {
    title: prepared.task,
    current_step: "Planner spec"
  });
  const planner = invokeCodeBuddy(prepared.executable, "planner", plannerPrompt(prepared.task, prepared.profile.name, prepared.maxRounds), projectRoot);
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

  let plannerContract;
  try {
    plannerContract = parseJsonObjectStrict(planner.stdout, "planner");
    validatePlannerContract(plannerContract);
  } catch {
    run.exit_reason = "planner_invalid_json";
    run.finished_at = now();
    run.status = "INTERRUPTED";
    writeRun(projectRoot, run);
    transitionTask(projectRoot, "INTERRUPTED", "Planner returned invalid JSON.", { current_step: "Inspect planner output" });
    return result(projectRoot, run, null, null);
  }

  writeText(paths.spec, plannerContract.spec_markdown || fallbackSpec(prepared.task, prepared.profile.name));
  writeText(paths.contract, plannerContract.contract_markdown || initialContract(prepared.task, prepared.profile.name, prepared.maxRounds, planner.stdout));
  run.planner_contract = plannerContract;
  if (plannerContract.ready_to_execute !== true) {
    run.exit_reason = "spec_needs_clarification";
    run.finished_at = now();
    run.status = "SPEC_NEEDS_CLARIFICATION";
    writeRun(projectRoot, run);
    transitionTask(projectRoot, "SPEC_NEEDS_CLARIFICATION", "Planner reported missing requirements; autonomous execution did not start.", {
      current_step: "Clarify requirements"
    });
    return result(projectRoot, run, null, null);
  }
  writeRun(projectRoot, run);
  return executeRounds(projectRoot, run, paths, prepared.task, prepared.profile.name, prepared.maxRounds, 1, null);
}

function prepareAutonomousRun(projectRoot, options = {}) {
  const maxRounds = parseMaxRounds(options.maxRounds);
  const profileName = options.profile || "default";
  return {
    task: options.task ? options.task.trim() : "",
    maxRounds,
    profile: inspectProfile(projectRoot, profileName),
    executable: findCodeBuddyExecutable(options),
    headless_args: HEADLESS_ARGS,
    artifacts: statePaths(projectRoot)
  };
}

function dryRunAutonomous(projectRoot, prepared) {
  const ready = Boolean(prepared.task) && prepared.profile.ready && Boolean(prepared.executable);
  return {
    ok: ready,
    ready,
    project_root: projectRoot,
    task: prepared.task,
    profile: prepared.profile,
    codebuddy_bin: prepared.executable,
    headless_args: HEADLESS_ARGS,
    max_rounds: prepared.maxRounds,
    artifacts: {
      root: prepared.artifacts.root,
      run: prepared.artifacts.run,
      spec: prepared.artifacts.spec,
      contract: prepared.artifacts.contract,
      evidence: prepared.artifacts.evidence,
      evaluation: prepared.artifacts.evaluation
    },
    reasons: [
      ...(!prepared.task ? ["Task is required."] : []),
      ...prepared.profile.reasons,
      ...(!prepared.executable ? ["CodeBuddy CLI not found. Install `codebuddy` or `cbc`, or set CODEBUDDY_BIN."] : [])
    ]
  };
}

function notReadyResult(projectRoot, prepared) {
  return {
    ok: false,
    ready: false,
    project_root: projectRoot,
    task: prepared.task,
    profile: prepared.profile,
    summary: `Profile ${prepared.profile.name} is not ready for autonomous execution.`
  };
}

function resumeAutonomousRun(projectRoot, options = {}) {
  const paths = statePaths(projectRoot);
  const run = readJson(paths.run, null);
  if (!run) throw new Error("run --resume requires .harness-engineer/run.json");
  if (options.task && options.task.trim() && options.task.trim() !== run.task) throw new Error("run --resume cannot change task");
  const maxRounds = options.maxRounds ? parseMaxRounds(options.maxRounds) : run.max_rounds;
  if (maxRounds < run.max_rounds) throw new Error("run --resume cannot lower --max-rounds");
  const profile = inspectProfile(projectRoot, run.profile || options.profile || "default");
  if (!profile.ready) return notReadyResult(projectRoot, { task: run.task, profile, maxRounds });
  const executable = findCodeBuddyExecutable({ ...options, codebuddyBin: options.codebuddyBin || run.codebuddy_bin });
  if (!executable) throw new Error("CodeBuddy CLI not found. Install `codebuddy` or `cbc`, or set CODEBUDDY_BIN.");
  if (!fs.existsSync(paths.contract)) throw new Error("run --resume requires .harness-engineer/contract.md");
  run.max_rounds = maxRounds;
  run.codebuddy_bin = executable;
  run.status = "RUNNING";
  run.finished_at = null;
  run.exit_reason = null;
  const lastEvaluation = readJson(paths.evaluation, null);
  const nextRound = Math.max(1, run.rounds.length + 1);
  if (nextRound > maxRounds) {
    run.exit_reason = "max_rounds_reached";
    run.finished_at = now();
    run.status = "MAX_ROUNDS_REACHED";
    writeRun(projectRoot, run);
    return result(projectRoot, run, lastEvaluation, null);
  }
  writeRun(projectRoot, run);
  return executeRounds(projectRoot, run, paths, run.task, run.profile, maxRounds, nextRound, lastEvaluation);
}

function executeRounds(projectRoot, run, paths, task, profile, maxRounds, startRound, initialEvaluation) {
  let lastEvaluation = initialEvaluation;
  for (let round = startRound; round <= maxRounds; round += 1) {
    run.current_round = round;
    run.round = round;
    transitionTask(projectRoot, lastEvaluation && !lastEvaluation.pass ? "FIXING" : "BUILDING", `Autonomous round ${round} started.`, {
      current_step: `Autonomous round ${round}`
    });

    const executor = invokeCodeBuddy(run.codebuddy_bin, "executor", executorPrompt(projectRoot, task, profile, round, maxRounds, paths, lastEvaluation), projectRoot);
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
    const verifier = invokeCodeBuddy(run.codebuddy_bin, "verifier", verifierPrompt(projectRoot, task, profile, round, paths, verification), projectRoot);
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

    let evaluation;
    try {
      evaluation = buildEvaluation(round, profile, verification, verifier, lastEvaluation);
    } catch {
      run.exit_reason = "verifier_invalid_json";
      run.finished_at = now();
      run.status = "INTERRUPTED";
      roundRecord.verification = verification;
      roundRecord.verifier = verifier;
      run.rounds.push(roundRecord);
      writeRun(projectRoot, run);
      transitionTask(projectRoot, "INTERRUPTED", `Verifier returned invalid JSON in autonomous round ${round}.`, {
        current_step: "Inspect verifier output"
      });
      return result(projectRoot, run, lastEvaluation, verification);
    }
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

    writeText(paths.contract, nextRoundContract(task, profile, round + 1, maxRounds, evaluation));
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
  const invocation = codeBuddyInvocation(executable, args);
  const completed = cp.spawnSync(invocation.command, invocation.args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HARNESS_AGENT_NAME: agent },
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

function codeBuddyInvocation(executable, args, platform = process.platform) {
  const extension = path.extname(executable).toLowerCase();
  if (platform === "win32" && [".cmd", ".bat"].includes(extension)) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/c", executable, ...args]
    };
  }
  return { command: executable, args };
}

function buildEvaluation(round, profile, verification, verifier, previousEvaluation) {
  const parsed = parseJsonObjectStrict(verifier.stdout, "verifier");
  const requiredPassed = Boolean(verification && verification.ok);
  if (typeof parsed.pass !== "boolean") throw new Error("verifier JSON missing boolean pass");
  if (typeof parsed.safe_to_continue !== "boolean") throw new Error("verifier JSON missing boolean safe_to_continue");
  const pass = parsed.pass && requiredPassed;
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

function validatePlannerContract(parsed) {
  if (typeof parsed.ready_to_execute !== "boolean") throw new Error("planner JSON missing boolean ready_to_execute");
  if (!Array.isArray(parsed.missing_requirements)) throw new Error("planner JSON missing missing_requirements array");
  if (typeof parsed.spec_markdown !== "string") throw new Error("planner JSON missing spec_markdown string");
  if (typeof parsed.contract_markdown !== "string") throw new Error("planner JSON missing contract_markdown string");
  if (typeof parsed.summary !== "string") throw new Error("planner JSON missing summary string");
}

function parseJsonObjectStrict(text, agent) {
  if (!text) throw new Error(`${agent} returned empty output`);
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${agent} JSON must be an object`);
    return parsed;
  } catch (error) {
    throw new Error(`${agent} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
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
    "Return JSON only with keys: ready_to_execute, missing_requirements, spec_markdown, contract_markdown, summary.",
    "Set ready_to_execute=false when the task is ambiguous, unsafe, or missing material requirements.",
    "spec_markdown must include task summary, non-goals, acceptance criteria, expected files, verification contract, and risks.",
    "contract_markdown must be the executor/verifier contract. Do not implement."
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
    "Judge the diff, contract, and evidence. Return strict JSON only with keys: pass, safe_to_continue, summary, fix_instructions.",
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
  codeBuddyInvocation,
  findCodeBuddyExecutable,
  invokeCodeBuddy,
  runAutonomous
};
