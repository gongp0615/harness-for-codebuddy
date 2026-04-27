#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const color = require("picocolors").createColors(true);
const { KNOWN_AGENT_MODELS } = require("./installer");

const outputPath = process.argv[2];
if (!outputPath) {
  console.error("Usage: agent-model-tui.js <env-output-file>");
  process.exit(2);
}

const agents = [
  { key: "planner", label: "规划", fallback: "gpt-5.4" },
  { key: "executor", label: "执行", fallback: "claude-sonnet-4.6" },
  { key: "verifier", label: "验证", fallback: "gpt-5.3-codex" },
  { key: "debugger", label: "调试", fallback: "gpt-5.4" },
  { key: "reviewer", label: "评审", fallback: "gpt-5.4" }
];
const confirmTab = { key: "confirm", label: "确认" };
const tabs = [...agents, confirmTab];
const MODEL_METADATA = {
  "claude-sonnet-4.6": { name: "Claude-Sonnet-4.6", credits: "x2.04 credits" },
  "claude-sonnet-4.6-1m": { name: "Claude-Sonnet-4.6-1M", credits: "x2.00 credits" },
  "claude-4.5": { name: "Claude-Sonnet-4.5", credits: "x2.20 credits" },
  "claude-opus-4.6": { name: "Claude-Opus-4.6", credits: "x3.40 credits" },
  "claude-opus-4.6-1m": { name: "Claude-Opus-4.6-1M", credits: "x3.33 credits" },
  "claude-opus-4.5": { name: "Claude-Opus-4.5", credits: "x3.40 credits" },
  "claude-haiku-4.5": { name: "Claude-Haiku-4.5", credits: "x0.67 credits" },
  "gemini-3.1-pro": { name: "Gemini-3.1-Pro", credits: "x1.36 credits" },
  "gemini-3.0-flash": { name: "Gemini-3.0-Flash", credits: "x0.33 credits" },
  "gemini-2.5-pro": { name: "Gemini-2.5-Pro", credits: "x0.95 credits" },
  "gemini-3.1-flash-lite": { name: "Gemini-3.1-flash-lite", credits: "x0.17 credits" },
  "gpt-5.4": { name: "GPT-5.4", credits: "x1.65 credits" },
  "gpt-5.3-codex": { name: "GPT-5.3-Codex", credits: "x1.35 credits" },
  "kimi-k2.5": { name: "Kimi-K2.5", credits: "x0.00 credits" },
  "glm-5.1": { name: "GLM-5.1", credits: "x1.06 credits" },
  "minimax-m2.5": { name: "MiniMax-M2.5", credits: "x0.17 credits" },
  "deepseek-v3-2-volc": { name: "DeepSeek-V3.2", credits: "x0.00 credits" },
  "hunyuan-2.0-thinking-ioa": { name: "Hunyuan-2.0-Thinking", credits: "x0.00 credits" },
  "hunyuan-2.0-instruct-ioa": { name: "Hunyuan-2.0-Instruct", credits: "x0.00 credits" }
};

function optionsFor(agent) {
  const knownOptions = KNOWN_AGENT_MODELS.map((model) => ({
    value: model,
    label: model === agent.fallback ? `${modelLabel(model)}（推荐）` : modelLabel(model),
    hint: model === agent.fallback ? "按当前 agent 职责选择的默认模型" : modelHint(model)
  }));
  return [
    ...knownOptions,
    { value: "__custom__", label: "输入自定义模型", hint: "手动输入一个准确的 CodeBuddy model id" }
  ];
}

function modelLabel(model) {
  const metadata = MODEL_METADATA[model] || { name: model, credits: "credits unknown" };
  return `${metadata.name.padEnd(24)} 【${model}】 ${metadata.credits ? `(${metadata.credits})` : ""}`.trimEnd();
}

function modelHint(model) {
  if (model.startsWith("claude-sonnet")) return "Claude Sonnet，适合执行实现和通用工程任务";
  if (model.startsWith("claude-opus")) return "Claude Opus，适合复杂规划、评审和深度推理";
  if (model.startsWith("claude-haiku")) return "Claude Haiku，更快、更省预算";
  if (model.startsWith("gemini")) return "Gemini，适合通用推理、视觉和前端相关任务";
  if (model.startsWith("gpt-5.3-codex")) return "Codex 系列，适合代码执行和验证";
  if (model.startsWith("gpt-")) return "GPT 系列，适合规划、调试和评审";
  if (model.startsWith("kimi")) return "Kimi，偏深度思考和代码任务";
  if (model.startsWith("glm")) return "GLM，通用推理备选";
  if (model.startsWith("minimax")) return "MiniMax，通用模型备选";
  if (model.startsWith("deepseek")) return "DeepSeek，代码和推理备选";
  if (model.startsWith("hunyuan")) return "Hunyuan，推理和指令模型备选";
  return "可用于 Harness agent 的 CodeBuddy 模型";
}

const selections = Object.fromEntries(agents.map((agent) => [agent.key, agent.fallback]));
const selectedIndexes = Object.fromEntries(agents.map((agent) => [agent.key, Math.max(0, KNOWN_AGENT_MODELS.indexOf(agent.fallback))]));
let activeTab = 0;
let customPrompt = null;

function shellQuote(value) {
  return String(value).replace(/'/g, "'\\''");
}

function writeEnv(values) {
  const lines = Object.entries(values).map(([key, value]) => `export ${key}='${shellQuote(value)}'`);
  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
}

function finishSkipped() {
  writeEnv({ HARNESS_AGENT_MODEL_MODE: "skip" });
  cleanup();
  process.exit(0);
}

function finishWithSelections() {
  writeEnv({
    HARNESS_AGENT_MODEL_MODE: "custom",
    HARNESS_AGENT_MODEL_PLANNER: selections.planner,
    HARNESS_AGENT_MODEL_EXECUTOR: selections.executor,
    HARNESS_AGENT_MODEL_VERIFIER: selections.verifier,
    HARNESS_AGENT_MODEL_DEBUGGER: selections.debugger,
    HARNESS_AGENT_MODEL_REVIEWER: selections.reviewer
  });
  cleanup();
  process.exit(0);
}

function cleanup() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write("\x1b[?25h\x1b[0m\n");
}

function renderTabs() {
  return tabs.map((tab, index) => {
    const label = ` ${tab.label} `;
    return index === activeTab ? color.bgCyan(color.black(label)) : color.gray(label);
  }).join("  ");
}

function renderOption(option, selected, index) {
  const number = `${index + 1}.`;
  const label = selected ? color.magenta(option.label) : color.green(option.label);
  return [
    `│ ${color.gray(number)}  ${label}`,
    `│     ${color.gray(option.hint)}`
  ].join("\n");
}

function renderConfirm() {
  const rows = agents.map((agent) => `│ ${agent.label.padEnd(2)}  ${color.green(selections[agent.key])}`);
  return [
    `│ ${color.green("确认 Harness agent 模型")}`,
    "│",
    ...rows,
    "│",
    `│ ${color.green("enter")} 确认并继续    ${color.green("esc")} 跳过模型配置`
  ].join("\n");
}

function renderCustomPrompt() {
  return [
    `│ ${color.green(`为 Harness ${customPrompt.agent.label} agent 输入自定义模型`)}`,
    "│",
    `│ ${color.gray("model id")}  ${customPrompt.value}`,
    "│",
    `│ ${color.green("enter")} 确认    ${color.green("esc")} 跳过模型配置`
  ].join("\n");
}

function renderAgent(agent) {
  return [
    `│ ${color.green(`为 Harness ${agent.label} agent 选择模型`)}`,
    "│",
    ...optionsFor(agent).map((option, index) => renderOption(option, index === selectedIndexes[agent.key], index)),
    "│",
    `│ ${color.green("⇆")} tab   ${color.green("↑↓")} 选择   ${color.green("enter")} 确认   ${color.green("esc")} 跳过模型配置`
  ].join("\n");
}

function render() {
  process.stdout.write("\x1b[2J\x1b[H\x1b[?25l");
  process.stdout.write(`${color.cyan("▌")} ${renderTabs()}\n\n`);

  if (customPrompt) {
    process.stdout.write(renderCustomPrompt());
    return;
  }

  const tab = tabs[activeTab];
  if (tab.key === "confirm") {
    process.stdout.write(renderConfirm());
    return;
  }

  process.stdout.write(renderAgent(tab));
}

function nextTab() {
  activeTab = Math.min(activeTab + 1, tabs.length - 1);
}

function previousTab() {
  activeTab = Math.max(activeTab - 1, 0);
}

function confirmCurrent() {
  const tab = tabs[activeTab];
  if (tab.key === "confirm") {
    finishWithSelections();
    return;
  }

  const option = optionsFor(tab)[selectedIndexes[tab.key]];
  if (option.value === "__custom__") {
    customPrompt = { agent: tab, value: "" };
    return;
  }
  selections[tab.key] = option.value;
  nextTab();
}

function acceptCustom() {
  const model = customPrompt.value.trim() || customPrompt.agent.fallback;
  selections[customPrompt.agent.key] = model;
  customPrompt = null;
  nextTab();
}

function handleEscapeSequence(text) {
  const tab = tabs[activeTab];
  if (text === "\u001b[A" && tab.key !== "confirm") {
    selectedIndexes[tab.key] = Math.max(selectedIndexes[tab.key] - 1, 0);
    return true;
  }
  if (text === "\u001b[B" && tab.key !== "confirm") {
    selectedIndexes[tab.key] = Math.min(selectedIndexes[tab.key] + 1, optionsFor(tab).length - 1);
    return true;
  }
  if (text === "\u001b[C" || text === "\t") {
    nextTab();
    return true;
  }
  if (text === "\u001b[D") {
    previousTab();
    return true;
  }
  return false;
}

function handleInput(chunk) {
  const text = chunk.toString("utf8");
  if (text === "\u001b") finishSkipped();
  if (handleEscapeSequence(text)) {
    render();
    return;
  }

  for (const char of text) {
    if (char === "\u0003") {
      cleanup();
      process.exit(130);
    }
    if (char === "\u001b") finishSkipped();

    if (customPrompt) {
      if (char === "\r" || char === "\n") {
        acceptCustom();
      } else if (char === "\u007f" || char === "\b") {
        customPrompt.value = customPrompt.value.slice(0, -1);
      } else if (char >= " ") {
        customPrompt.value += char;
      }
    } else if (char === "\t") {
      nextTab();
    } else if (char === "\r" || char === "\n") {
      confirmCurrent();
    }
  }
  render();
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  writeEnv({ HARNESS_AGENT_MODEL_MODE: "skip" });
  process.exit(0);
}

process.on("exit", () => {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
});

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", handleInput);
render();
