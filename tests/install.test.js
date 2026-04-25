"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { installCodeBuddyPlugin } = require("../scripts/installer");

test("install copies plugin into a local CodeBuddy marketplace and enables it", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "codebuddy-home-"));
  const source = path.join(__dirname, "..");

  const result = installCodeBuddyPlugin({ sourceDir: source, homeDir: home, binDir: path.join(home, ".local", "bin") });

  assert.equal(result.marketplace_name, "harness-engineer-local");
  assert.ok(fs.existsSync(path.join(result.plugin_dir, ".codebuddy-plugin", "plugin.json")));
  assert.ok(fs.existsSync(path.join(result.marketplace_dir, ".codebuddy-plugin", "marketplace.json")));

  const settings = JSON.parse(fs.readFileSync(path.join(home, "settings.json"), "utf8"));
  assert.equal(settings.extraKnownMarketplaces["harness-engineer-local"].source.source, "directory");
  assert.equal(settings.extraKnownMarketplaces["harness-engineer-local"].source.path, result.marketplace_dir);
  assert.equal(settings.enabledPlugins["harness-engineer@harness-engineer-local"], true);
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
