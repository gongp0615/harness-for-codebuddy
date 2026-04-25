"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { copyDirectory, homeDir, readJson, writeJson } = require("./paths");

const PLUGIN_NAME = "harness-engineer";
const MARKETPLACE_NAME = "harness-engineer-local";

function installCodeBuddyPlugin(options = {}) {
  const sourceDir = path.resolve(options.sourceDir || process.cwd());
  const home = path.resolve(options.homeDir || homeDir());
  const marketplaceDir = path.join(home, "marketplaces", PLUGIN_NAME);
  const pluginDir = path.join(marketplaceDir, "plugins", PLUGIN_NAME);

  copyDirectory(sourceDir, pluginDir);
  writeMarketplace(marketplaceDir);
  writeSettings(home, marketplaceDir, options.binDir);

  return {
    home_dir: home,
    plugin_dir: pluginDir,
    marketplace_dir: marketplaceDir,
    settings_path: path.join(home, "settings.json"),
    marketplace_name: MARKETPLACE_NAME,
    plugin_name: PLUGIN_NAME
  };
}

function uninstallCodeBuddyPlugin(options = {}) {
  const home = path.resolve(options.homeDir || homeDir());
  const marketplaceDir = path.join(home, "marketplaces", PLUGIN_NAME);
  const settingsPath = path.join(home, "settings.json");
  const settings = readJson(settingsPath, {});

  if (settings.extraKnownMarketplaces) {
    delete settings.extraKnownMarketplaces[MARKETPLACE_NAME];
  }
  if (settings.enabledPlugins) {
    delete settings.enabledPlugins[`${PLUGIN_NAME}@${MARKETPLACE_NAME}`];
  }
  writeJson(settingsPath, settings);

  fs.rmSync(marketplaceDir, { recursive: true, force: true });
  const binDir = path.resolve(options.binDir || process.env.HARNESS_BIN_DIR || path.join(process.env.HOME || home, ".local", "bin"));
  const launcher = path.join(binDir, "harness");
  fs.rmSync(launcher, { force: true });

  return {
    ok: true,
    home_dir: home,
    marketplace_dir: marketplaceDir,
    settings_path: settingsPath,
    launcher_path: launcher,
    removed_project_state: false
  };
}

function writeMarketplace(marketplaceDir) {
  writeJson(path.join(marketplaceDir, ".codebuddy-plugin", "marketplace.json"), {
    name: MARKETPLACE_NAME,
    displayName: "Harness Engineer",
    description: "Local marketplace for the Harness Engineer CodeBuddy plugin.",
    plugins: [
      {
        name: PLUGIN_NAME,
        version: "0.1.0-alpha.0",
        description: "CodeBuddy Code CLI plugin for planning, verification, recovery, and safe engineering workflows.",
        source: `./plugins/${PLUGIN_NAME}`
      }
    ]
  });
}

function writeSettings(home, marketplaceDir, binDirOverride) {
  const settingsPath = path.join(home, "settings.json");
  const settings = readJson(settingsPath, {});
  settings.extraKnownMarketplaces = settings.extraKnownMarketplaces || {};
  settings.extraKnownMarketplaces[MARKETPLACE_NAME] = {
    source: {
      source: "directory",
      path: marketplaceDir
    }
  };
  settings.enabledPlugins = settings.enabledPlugins || {};
  settings.enabledPlugins[`${PLUGIN_NAME}@${MARKETPLACE_NAME}`] = true;
  writeJson(settingsPath, settings);

  const binDir = path.resolve(binDirOverride || process.env.HARNESS_BIN_DIR || path.join(process.env.HOME || home, ".local", "bin"));
  fs.mkdirSync(binDir, { recursive: true });
  const launcher = path.join(binDir, "harness");
  fs.writeFileSync(
    launcher,
    `#!/usr/bin/env bash\nexport CODEBUDDY_HOME="${home}"\nexec node "${path.join(pluginDirFromMarketplace(marketplaceDir), "scripts", "cli.js")}" "$@"\n`
  );
  fs.chmodSync(launcher, 0o755);
}

function pluginDirFromMarketplace(marketplaceDir) {
  return path.join(marketplaceDir, "plugins", PLUGIN_NAME);
}

module.exports = {
  installCodeBuddyPlugin,
  uninstallCodeBuddyPlugin
};
