"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { discoverVerificationCommands } = require("../scripts/cli");

test("discovers Node verification commands in stable order", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-project-"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      scripts: {
        build: "vite build",
        test: "node --test",
        lint: "eslint .",
        typecheck: "tsc --noEmit"
      }
    })
  );

  assert.deepEqual(discoverVerificationCommands(root), [
    "npm run typecheck",
    "npm run lint",
    "npm test",
    "npm run build"
  ]);
});

test("returns no commands for projects without package.json", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-empty-"));

  assert.deepEqual(discoverVerificationCommands(root), []);
});
