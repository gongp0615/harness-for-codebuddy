#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { installCodeBuddyPlugin, uninstallCodeBuddyPlugin } = require("./installer");
const { pluginRoot } = require("./paths");
const { discoverVerificationCommands } = require("./harness-engine/verification-discovery");
const { evidenceSummary, initProject, planTask, recover, status } = require("./harness-engine/state");
const { runAutonomous } = require("./harness-engine/orchestrator");
const { evaluatePolicy } = require("./harness-engine/policy");
const { inspectProfile, legacyVerify, listProfiles, runProfile } = require("./harness-engine/profile-runner");

function runCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  const command = argv[0] || "status";
  try {
    if (command === "doctor") {
      printJson(doctor(parseRoot(argv) || pluginRoot()));
      return 0;
    }
    if (command === "install") {
      const result = installCodeBuddyPlugin(parseInstallArgs(argv.slice(1)));
      process.stdout.write(`harness-engineer installed for CodeBuddy\nPlugin: ${result.plugin_dir}\nMarketplace: ${result.marketplace_dir}\nSettings: ${result.settings_path}\nLauncher: ${result.launcher_path}\n`);
      return 0;
    }
    if (command === "uninstall") {
      const result = uninstallCodeBuddyPlugin(parseInstallArgs(argv.slice(1)));
      process.stdout.write(`harness-engineer uninstalled from CodeBuddy\nMarketplace removed: ${result.marketplace_dir}\nSettings: ${result.settings_path}\nProject state removed: ${result.removed_project_state}\n`);
      return 0;
    }
    if (command === "init") {
      printJson(initProject(cwd, {
        profile: parseOption(argv, "--profile") || "generic",
        ciProvider: parseCiProvider(argv)
      }));
      return 0;
    }
    if (command === "plan") {
      printJson(planTask(cwd, {
        task: parseOption(argv, "--task") || positionalText(argv.slice(1)),
        id: parseOption(argv, "--id")
      }));
      return 0;
    }
    if (command === "run") {
      const result = runAutonomous(cwd, {
        task: parseOption(argv, "--task") || positionalText(argv.slice(1)),
        profile: parseOption(argv, "--profile") || "default",
        maxRounds: parseOption(argv, "--max-rounds") || "5",
        dryRun: hasFlag(argv, "--dry-run"),
        resume: hasFlag(argv, "--resume")
      });
      printJson(result);
      return result.ok ? 0 : 1;
    }
    if (command === "profile") {
      const subcommand = argv[1] || "list";
      if (subcommand === "list") {
        printJson(listProfiles(cwd));
        return 0;
      }
      if (subcommand === "show" || subcommand === "doctor") {
        const positionalName = argv.slice(2).find((arg, index, args) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"));
        const name = positionalName || parseOption(argv, "--profile") || "default";
        const result = inspectProfile(cwd, name);
        printJson(result);
        return subcommand === "doctor" && !result.ready ? 1 : 0;
      }
      process.stderr.write(`Unknown harness profile command: ${subcommand}\n`);
      return 2;
    }
    if (command === "status") {
      printJson(status(cwd));
      return 0;
    }
    if (command === "verify") {
      const profile = parseOption(argv, "--profile");
      const result = profile ? runProfile(cwd, { profile }) : verify(cwd);
      printJson(result);
      return result.ok ? 0 : 1;
    }
    if (command === "recover") {
      printJson(recover(cwd));
      return 0;
    }
    if (command === "evidence") {
      printJson(evidenceSummary(cwd));
      return 0;
    }
    if (command === "policy-check") {
      const result = evaluatePolicy(cwd, { tool_name: "Bash", tool_input: { command: parseOption(argv, "--command") || "" } });
      printJson(result);
      return result.decision === "block" ? 2 : 0;
    }
    if (command === "explain") {
      printJson({
        plugin_root: pluginRoot(),
        project_root: cwd,
        commands: ["doctor", "install", "uninstall", "init", "plan", "run", "profile", "status", "verify", "recover", "evidence", "policy-check"],
        state_file: path.join(cwd, ".harness-engineer", "task.json")
      });
      return 0;
    }
    process.stderr.write(`Unknown harness command: ${command}\n`);
    return 2;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function parseRoot(argv) {
  return parsePathOption(argv, "--root");
}

function parsePathOption(argv, name) {
  const value = parseOption(argv, name);
  return value ? path.resolve(value) : undefined;
}

function parseOption(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  if (!argv[index + 1]) throw new Error(`${name} requires a value`);
  return argv[index + 1];
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function parseCiProvider(argv) {
  if (hasFlag(argv, "--with-ci")) return "github";
  const value = parseOption(argv, "--ci");
  if (!value) return "none";
  return value;
}

function positionalText(args) {
  return args.filter((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--")).join(" ");
}

function parseInstallArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--source") {
      if (!args[index + 1]) throw new Error("--source requires a path");
      options.sourceDir = path.resolve(args[index + 1]);
      index += 1;
    } else if (arg === "--home") {
      if (!args[index + 1]) throw new Error("--home requires a path");
      options.homeDir = path.resolve(args[index + 1]);
      index += 1;
    } else if (arg === "--bin-dir") {
      if (!args[index + 1]) throw new Error("--bin-dir requires a path");
      options.binDir = path.resolve(args[index + 1]);
      index += 1;
    } else if (arg === "--agent-model") {
      if (!args[index + 1]) throw new Error("--agent-model requires a value");
      options.agentModel = args[index + 1];
      index += 1;
    } else if (arg === "--agent-model-mode") {
      if (!args[index + 1]) throw new Error("--agent-model-mode requires a value");
      options.agentModelMode = args[index + 1];
      index += 1;
    } else if (arg.startsWith("--agent-model-")) {
      if (!args[index + 1]) throw new Error(`${arg} requires a value`);
      const agent = arg.slice("--agent-model-".length).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[`${agent}AgentModel`] = args[index + 1];
      index += 1;
    }
  }
  return options;
}

function doctor(root) {
  const checks = [
    check(root, ".codebuddy-plugin/plugin.json", "CodeBuddy plugin manifest"),
    check(root, ".codebuddy-plugin/marketplace.json", "CodeBuddy marketplace manifest"),
    check(root, "hooks/hooks.json", "CodeBuddy hook registry"),
    check(root, "bin/harness", "CodeBuddy bin launcher"),
    check(root, "scripts/cli.js", "CLI entrypoint"),
    check(root, "scripts/harness-engine/state.js", "Harness state engine"),
    check(root, "scripts/harness-engine/profile-runner.js", "Harness profile runner"),
    check(root, "scripts/harness-engine/orchestrator.js", "Harness autonomous orchestrator"),
    check(root, "scripts/harness-engine/policy.js", "Harness policy engine"),
    check(root, "commands/doctor.md", "doctor slash command"),
    check(root, "commands/init.md", "init slash command"),
    check(root, "commands/evidence.md", "evidence slash command"),
    check(root, "commands/run.md", "run slash command"),
    check(root, "skills/harness-plan/SKILL.md", "harness-plan skill"),
    check(root, "agents/planner.md", "planner agent"),
    check(root, "docs/ai-engineering/workflow.md", "team workflow documentation")
  ];
  return { ok: checks.every((item) => item.ok), root, checks };
}

function check(root, relativePath, name) {
  return {
    name,
    ok: fs.existsSync(path.join(root, relativePath)),
    path: relativePath
  };
}

function verify(projectRoot) {
  return legacyVerify(projectRoot);
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  discoverVerificationCommands,
  doctor,
  runCli,
  status,
  verify
};
