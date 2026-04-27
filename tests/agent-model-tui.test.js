"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

function readEnvFile(filePath) {
  const data = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export )?([A-Z0-9_]+)='((?:'\\''|[^'])*)'$/);
    assert.ok(match, `invalid env line: ${line}`);
    data[match[1]] = match[2].replace(/'\\''/g, "'");
  }
  return data;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function hasScriptCommand() {
  return spawnSync("script", ["--version"], { encoding: "utf8" }).status === 0;
}

function runTuiInPty(source, output, input) {
  const command = `stty cols 120 rows 40; node ${shellQuote(path.join(source, "scripts", "agent-model-tui.js"))} ${shellQuote(output)}`;
  const feed = Array.from(input).map((char) => `sleep 0.1; printf ${shellQuote(char)}`).join("; ");
  return spawnSync("bash", ["-lc", `{ sleep 0.5; ${feed}; sleep 0.2; } | script -qfec ${shellQuote(command)} /dev/null`], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
}

test("agent model TUI accepts role defaults through the confirm page", { skip: !hasScriptCommand() }, () => {
  const source = path.join(__dirname, "..");
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "harness-agent-models-")), "models.env");
  const input = "\r\r\r\r\r\r";
  const result = runTuiInPty(source, output, input);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readEnvFile(output), {
    HARNESS_AGENT_MODEL_MODE: "custom",
    HARNESS_AGENT_MODEL_PLANNER: "gpt-5.4",
    HARNESS_AGENT_MODEL_EXECUTOR: "claude-sonnet-4.6",
    HARNESS_AGENT_MODEL_VERIFIER: "gpt-5.3-codex",
    HARNESS_AGENT_MODEL_DEBUGGER: "gpt-5.4",
    HARNESS_AGENT_MODEL_REVIEWER: "gpt-5.4"
  });
});

test("agent model TUI renders agent tabs above model options", { skip: !hasScriptCommand() }, () => {
  const source = path.join(__dirname, "..");
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "harness-agent-models-")), "models.env");
  const result = runTuiInPty(source, output, "\u001b");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\x1b\[/);
  assert.match(result.stdout, /规划[\s\S]*执行[\s\S]*验证[\s\S]*调试[\s\S]*评审[\s\S]*确认/);
  assert.match(result.stdout, /为 Harness 规划 agent 选择模型/);
  assert.match(result.stdout, /GPT-5\.4\s+【gpt-5\.4】\s+\(x1\.65 credits\)（推荐）/);
  assert.match(result.stdout, /Claude-Sonnet-4\.6-1M\s+【claude-sonnet-4\.6-1m】\s+\(x2\.00 credits\)/);
  assert.match(result.stdout, /DeepSeek-V3\.2\s+【deepseek-v3-2-volc】\s+\(x0\.00 credits\)/);
  assert.match(result.stdout, /Hunyuan-2\.0-Instruct\s+【hunyuan-2\.0-instruct-ioa】/);
  assert.doesNotMatch(result.stdout, /GPT-5\.2\s+【gpt-5\.2】/);
  assert.doesNotMatch(result.stdout, /GPT-5\.2-Codex/);
  assert.doesNotMatch(result.stdout, /GPT-5\.1/);
  assert.doesNotMatch(result.stdout, /Kimi-K2-Thinking/);
  assert.doesNotMatch(result.stdout, /GLM-5\.0/);
  assert.doesNotMatch(result.stdout, /GLM-4\.7/);
  assert.doesNotMatch(result.stdout, /GLM-4\.6/);
  assert.doesNotMatch(result.stdout, /选择流程/);
  assert.match(result.stdout, /跳过模型配置/);
});

test("agent model TUI escape writes skip mode", { skip: !hasScriptCommand() }, () => {
  const source = path.join(__dirname, "..");
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "harness-agent-models-")), "models.env");
  const result = runTuiInPty(source, output, "\u001b");

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readEnvFile(output), {
    HARNESS_AGENT_MODEL_MODE: "skip"
  });
});
