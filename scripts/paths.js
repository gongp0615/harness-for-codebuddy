"use strict";

const fs = require("node:fs");
const path = require("node:path");

function pluginRoot() {
  return path.resolve(__dirname, "..");
}

function homeDir() {
  return process.env.CODEBUDDY_HOME || path.join(process.env.HOME || "", ".codebuddy");
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function copyDirectory(sourceDir, targetDir) {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter(source) {
      const relative = path.relative(sourceDir, source).replace(/\\/g, "/");
      if (relative === "") return true;
      return !(
        relative === ".git" ||
        relative.startsWith(".git/") ||
        relative === ".gitdir" ||
        relative.startsWith(".gitdir/") ||
        relative === ".codex" ||
        relative === ".harness" ||
        relative.startsWith(".harness/") ||
        relative === ".harness-engineer" ||
        relative.startsWith(".harness-engineer/") ||
        relative === "node_modules" ||
        relative.startsWith("node_modules/")
      );
    }
  });
}

module.exports = {
  copyDirectory,
  homeDir,
  pluginRoot,
  readJson,
  writeJson
};
