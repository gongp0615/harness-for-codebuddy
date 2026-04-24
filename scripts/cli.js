#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const { installCodeBuddyPlugin } = require("./installer");
const { pluginRoot, readJson } = require("./paths");

function runCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  const command = argv[0] || "status";
  try {
    if (command === "doctor") {
      printJson(doctor(parseRoot(argv) || pluginRoot()));
      return 0;
    }
    if (command === "install") {
      const result = installCodeBuddyPlugin(parseInstallArgs(argv.slice(1)));
      process.stdout.write(`harness-engineer installed for CodeBuddy\nPlugin: ${result.plugin_dir}\nMarketplace: ${result.marketplace_dir}\nSettings: ${result.settings_path}\n`);
      return 0;
    }
    if (command === "status") {
      printJson(status(cwd));
      return 0;
    }
    if (command === "verify") {
      const result = verify(cwd);
      printJson(result);
      return result.ok ? 0 : 1;
    }
    if (command === "explain") {
      printJson({
        plugin_root: pluginRoot(),
        project_root: cwd,
        commands: ["doctor", "install", "status", "verify"],
        state_file: path.join(cwd, ".harness-engineer", "state.json")
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
  const index = argv.indexOf("--root");
  if (index === -1) return undefined;
  if (!argv[index + 1]) throw new Error("--root requires a path");
  return path.resolve(argv[index + 1]);
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
    check(root, "commands/doctor.md", "doctor slash command"),
    check(root, "skills/harness-plan/SKILL.md", "harness-plan skill"),
    check(root, "agents/planner.md", "planner agent")
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

function status(projectRoot) {
  const statePath = path.join(projectRoot, ".harness-engineer", "state.json");
  return {
    plugin_root: pluginRoot(),
    project_root: projectRoot,
    codebuddy_home: process.env.CODEBUDDY_HOME || path.join(process.env.HOME || "", ".codebuddy"),
    state: readJson(statePath, { active_task_id: null, tasks: [], updated_at: null })
  };
}

function verify(projectRoot) {
  const commands = discoverVerificationCommands(projectRoot);
  const results = commands.map((command) => runCommand(command, projectRoot));
  return {
    ok: results.every((result) => result.exit_code === 0),
    project_root: projectRoot,
    commands,
    results
  };
}

function discoverVerificationCommands(projectRoot) {
  const packagePath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(packagePath)) return [];
  const pkg = readJson(packagePath, {});
  const scripts = pkg.scripts || {};
  const commands = [];
  for (const name of ["typecheck", "lint", "test", "build"]) {
    if (scripts[name]) {
      commands.push(name === "test" ? "npm test" : `npm run ${name}`);
    }
  }
  return commands;
}

function runCommand(command, cwd) {
  const result = cp.spawnSync(command, {
    cwd,
    shell: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    command,
    exit_code: result.status ?? 1,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr)
  };
}

function trimOutput(value) {
  const text = value || "";
  return text.length > 8000 ? `${text.slice(0, 8000)}\n...<truncated>` : text;
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
