"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { AGENT_NAMES, installCodeBuddyPlugin, uninstallCodeBuddyPlugin } = require("../scripts/installer");

function readFrontmatter(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  assert.match(text, /^---\r?\n/);
  const end = text.search(/\r?\n---\r?\n/);
  assert.notEqual(end, -1);
  const frontmatterStart = text.startsWith("---\r\n") ? 5 : 4;
  const marker = text.match(/\r?\n---\r?\n/);
  const data = {};
  for (const line of text.slice(frontmatterStart, end).split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index !== -1) data[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return { data, text, body: text.slice(end + marker[0].length) };
}

test("install copies plugin into a local CodeBuddy marketplace and enables it", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codebuddy-home-"));
  const source = path.join(__dirname, "..");

  const result = installCodeBuddyPlugin({ sourceDir: source, homeDir: home, binDir: path.join(home, ".local", "bin") });

  assert.equal(result.marketplace_name, "harness-engineer-local");
  assert.equal(result.launcher_path, path.join(home, ".local", "bin", "harness"));
  assert.ok(fs.existsSync(path.join(result.plugin_dir, ".codebuddy-plugin", "plugin.json")));
  assert.ok(fs.existsSync(result.launcher_path));
  assert.ok(fs.existsSync(path.join(result.marketplace_dir, ".codebuddy-plugin", "marketplace.json")));

  const settings = JSON.parse(fs.readFileSync(path.join(home, "settings.json"), "utf8"));
  assert.equal(settings.extraKnownMarketplaces["harness-engineer-local"].source.source, "directory");
  assert.equal(settings.extraKnownMarketplaces["harness-engineer-local"].source.path, result.marketplace_dir);
  assert.equal(settings.enabledPlugins["harness-engineer@harness-engineer-local"], true);
});

test("install applies the default model to all installed Harness agents", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codebuddy-home-"));
  const source = path.join(__dirname, "..");

  const result = installCodeBuddyPlugin({ sourceDir: source, homeDir: home, binDir: path.join(home, ".local", "bin") });

  for (const agent of AGENT_NAMES) {
    const { data } = readFrontmatter(path.join(result.plugin_dir, "agents", `${agent}.md`));
    assert.equal(data.name, agent);
    assert.equal(data.model, "claude-sonnet-4.6");
  }
});

test("install applies per-agent model overrides to installed agents", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codebuddy-home-"));
  const source = path.join(__dirname, "..");

  const result = installCodeBuddyPlugin({
    sourceDir: source,
    homeDir: home,
    binDir: path.join(home, ".local", "bin"),
    agentModel: "gpt-5.4",
    plannerAgentModel: "claude-opus-4.6",
    executorAgentModel: "gemini-3.1-pro",
    verifierAgentModel: "gpt-5.3-codex",
    debuggerAgentModel: "kimi-k2-thinking"
  });

  assert.equal(readFrontmatter(path.join(result.plugin_dir, "agents", "planner.md")).data.model, "claude-opus-4.6");
  assert.equal(readFrontmatter(path.join(result.plugin_dir, "agents", "executor.md")).data.model, "gemini-3.1-pro");
  assert.equal(readFrontmatter(path.join(result.plugin_dir, "agents", "verifier.md")).data.model, "gpt-5.3-codex");
  assert.equal(readFrontmatter(path.join(result.plugin_dir, "agents", "debugger.md")).data.model, "kimi-k2-thinking");
  assert.equal(readFrontmatter(path.join(source, "agents", "executor.md")).data.model, "claude-sonnet-4.6");
});

test("install skip mode leaves installed agent models inherited", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codebuddy-home-"));
  const source = path.join(__dirname, "..");

  const result = installCodeBuddyPlugin({
    sourceDir: source,
    homeDir: home,
    binDir: path.join(home, ".local", "bin"),
    agentModelMode: "skip"
  });

  for (const agent of AGENT_NAMES) {
    const { data } = readFrontmatter(path.join(result.plugin_dir, "agents", `${agent}.md`));
    assert.equal(data.name, agent);
    assert.equal(data.model, undefined);
  }
});

test("install updates existing frontmatter without duplicating it", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codebuddy-home-"));
  const source = path.join(__dirname, "..");

  const result = installCodeBuddyPlugin({
    sourceDir: source,
    homeDir: home,
    binDir: path.join(home, ".local", "bin"),
    agentModel: "gpt-5.4"
  });

  const planner = readFrontmatter(path.join(result.plugin_dir, "agents", "planner.md"));
  assert.equal(planner.data.model, "gpt-5.4");
  assert.equal((planner.text.match(/^---$/gm) || []).length, 2);
  assert.match(planner.text, /# Planner/);
});

test("install reads non-interactive agent model settings from environment", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codebuddy-home-"));
  const source = path.join(__dirname, "..");

  const result = installCodeBuddyPlugin({
    sourceDir: source,
    homeDir: home,
    binDir: path.join(home, ".local", "bin"),
    env: {
      HARNESS_AGENT_MODEL: "gpt-5.2",
      HARNESS_AGENT_MODEL_EXECUTOR: "claude-opus-4.6"
    }
  });

  assert.equal(readFrontmatter(path.join(result.plugin_dir, "agents", "planner.md")).data.model, "gpt-5.2");
  assert.equal(readFrontmatter(path.join(result.plugin_dir, "agents", "executor.md")).data.model, "claude-opus-4.6");
  assert.equal(readFrontmatter(path.join(result.plugin_dir, "agents", "verifier.md")).data.model, "gpt-5.2");
  assert.equal(readFrontmatter(path.join(result.plugin_dir, "agents", "debugger.md")).data.model, "gpt-5.2");
});

test("uninstall removes marketplace settings, plugin files, and launcher", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codebuddy-home-"));
  const source = path.join(__dirname, "..");
  const binDir = path.join(home, ".local", "bin");
  const installed = installCodeBuddyPlugin({ sourceDir: source, homeDir: home, binDir });

  const result = uninstallCodeBuddyPlugin({ homeDir: home, binDir });

  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(installed.marketplace_dir), false);
  assert.equal(fs.existsSync(path.join(binDir, "harness")), false);
  const settings = JSON.parse(fs.readFileSync(path.join(home, "settings.json"), "utf8"));
  assert.equal(settings.extraKnownMarketplaces["harness-engineer-local"], undefined);
  assert.equal(settings.enabledPlugins["harness-engineer@harness-engineer-local"], undefined);
});

test("install script skips CI setup in non-interactive mode", () => {
  const source = path.join(__dirname, "..");
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "harness-install-project-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "harness-install-home-"));
  const result = require("node:child_process").spawnSync("bash", [path.join(source, "install.sh")], {
    cwd: project,
    env: {
      ...process.env,
      CODEBUDDY_HOME: home,
      HARNESS_BIN_DIR: path.join(home, ".local", "bin")
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(project, ".github", "workflows", "harness.yml")), false);
  assert.match(result.stdout, /Skipped CI setup/);
});

test("install script respects non-interactive agent model environment variables", () => {
  const source = path.join(__dirname, "..");
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "harness-install-project-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "harness-install-home-"));
  const result = require("node:child_process").spawnSync("bash", [path.join(source, "install.sh")], {
    cwd: project,
    env: {
      ...process.env,
      CODEBUDDY_HOME: home,
      HARNESS_BIN_DIR: path.join(home, ".local", "bin"),
      HARNESS_AGENT_MODEL: "gpt-5.4",
      HARNESS_AGENT_MODEL_DEBUGGER: "claude-haiku-4.5"
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Configure Harness plugin agent models/);
  const pluginDir = path.join(home, "marketplaces", "harness-engineer", "plugins", "harness-engineer");
  assert.equal(readFrontmatter(path.join(pluginDir, "agents", "planner.md")).data.model, "gpt-5.4");
  assert.equal(readFrontmatter(path.join(pluginDir, "agents", "debugger.md")).data.model, "claude-haiku-4.5");
});

test("install script can create generic CI setup from environment choice", () => {
  const source = path.join(__dirname, "..");
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "harness-install-generic-ci-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "harness-install-home-"));
  const result = require("node:child_process").spawnSync("bash", [path.join(source, "install.sh")], {
    cwd: project,
    env: {
      ...process.env,
      CODEBUDDY_HOME: home,
      HARNESS_BIN_DIR: path.join(home, ".local", "bin"),
      HARNESS_INSTALL_CI: "generic"
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(project, "harness", "ci", "harness-ci.md")), true);
  assert.equal(fs.existsSync(path.join(project, ".github", "workflows", "harness.yml")), false);
  assert.match(result.stdout, /Created harness\/ci\/harness-ci\.md/);
});

test("legacy HARNESS_INSTALL_ENABLE_CI=1 still maps to GitHub Actions", () => {
  const source = path.join(__dirname, "..");
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "harness-install-legacy-ci-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "harness-install-home-"));
  const result = require("node:child_process").spawnSync("bash", [path.join(source, "install.sh")], {
    cwd: project,
    env: {
      ...process.env,
      CODEBUDDY_HOME: home,
      HARNESS_BIN_DIR: path.join(home, ".local", "bin"),
      HARNESS_INSTALL_ENABLE_CI: "1"
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(project, ".github", "workflows", "harness.yml")), true);
});
