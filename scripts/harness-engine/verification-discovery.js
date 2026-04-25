"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readJson } = require("../paths");

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

module.exports = {
  discoverVerificationCommands
};
