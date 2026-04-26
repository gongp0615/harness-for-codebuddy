#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const integrationRoot = path.join(projectRoot, "tests", "integration");
const composeFile = path.join(integrationRoot, "docker-compose.yml");
const logsDir = path.join(projectRoot, ".harness-engineer", "integration-logs");
const baseUrl = process.env.HARNESS_INTEGRATION_BASE_URL || "http://127.0.0.1:18080";

async function main() {
  ensureDocker();
  ensureComposeFile();

  let exitCode = 0;
  try {
    runDockerCompose(["up", "-d", "--remove-orphans"], "start integration services");
    await waitForHttp(baseUrl);
    runIntegrationTests();
  } catch (error) {
    exitCode = 1;
    process.stderr.write(`${formatError(error)}\n`);
  } finally {
    captureComposeDiagnostics();
    try {
      runDockerCompose(["down", "-v", "--remove-orphans"], "stop integration services");
    } catch (error) {
      exitCode = 1;
      process.stderr.write(`${formatError(error)}\n`);
    }
  }

  process.exitCode = exitCode;
}

function ensureDocker() {
  runCommand("docker", ["version", "--format", "{{.Server.Version}}"], "check Docker availability");
  runCommand("docker", ["compose", "version"], "check Docker Compose availability");
}

function ensureComposeFile() {
  if (!fs.existsSync(composeFile)) {
    throw new Error(`Missing integration compose file: ${composeFile}`);
  }
}

function runDockerCompose(args, description) {
  return runCommand("docker", ["compose", "-f", composeFile, ...args], description, { cwd: projectRoot });
}

function runIntegrationTests() {
  const testFiles = fs.readdirSync(integrationRoot)
    .filter((entry) => entry.endsWith(".test.js"))
    .sort()
    .map((entry) => path.join(integrationRoot, entry));

  if (testFiles.length === 0) {
    throw new Error(`No integration test files found under ${integrationRoot}`);
  }

  runCommand(process.execPath, ["--test", ...testFiles], "run integration tests", {
    cwd: projectRoot,
    env: { ...process.env, HARNESS_INTEGRATION_BASE_URL: baseUrl },
    pipeOutput: true
  });
}

async function waitForHttp(url, timeoutMs = 60000, intervalMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`Service at ${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }

  throw new Error(`Timed out waiting for integration service at ${url}: ${formatError(lastError)}`);
}

function captureComposeDiagnostics() {
  fs.mkdirSync(logsDir, { recursive: true });
  captureToFile("docker-compose-ps.txt", ["compose", "-f", composeFile, "ps"]);
  captureToFile("docker-compose-logs.txt", ["compose", "-f", composeFile, "logs", "--no-color"]);
}

function captureToFile(fileName, args) {
  const result = cp.spawnSync("docker", args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output = [result.stdout || "", result.stderr || ""].filter(Boolean).join("\n").trim();
  fs.writeFileSync(path.join(logsDir, fileName), `${output}\n`);
}

function runCommand(command, args, description, options = {}) {
  const result = cp.spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    env: options.env || process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (options.pipeOutput) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    throw new Error(`${description} failed: ${formatSpawnFailure(command, args, result)}`);
  }

  return result;
}

function formatSpawnFailure(command, args, result) {
  const parts = [`${command} ${args.join(" ")}`];
  if (result.error) parts.push(result.error.message);
  if (result.stderr) parts.push(result.stderr.trim());
  return parts.join("\n");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  process.stderr.write(`${formatError(error)}\n`);
  process.exitCode = 1;
});
