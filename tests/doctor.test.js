"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { doctor, runCli } = require("../scripts/cli");

test("doctor validates the plugin root instead of the current project directory", () => {
  const root = path.join(__dirname, "..");
  const result = doctor(root);

  assert.equal(result.ok, true);
  assert.equal(result.root, root);
  assert.ok(result.checks.some((check) => check.path === ".codebuddy-plugin/plugin.json"));
  assert.ok(result.checks.some((check) => check.path === "hooks/hooks.json"));
});

test("doctor command succeeds from an arbitrary working directory", () => {
  const code = runCli(["doctor"], "/tmp");

  assert.equal(code, 0);
});
