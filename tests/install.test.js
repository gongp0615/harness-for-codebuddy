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
