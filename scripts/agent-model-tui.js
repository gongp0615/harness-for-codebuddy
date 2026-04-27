#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const color = require("picocolors").createColors(true);

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

function optionsFor(agent) {
  return [
    { value: agent.fallback, label: `${agent.fallback}（推荐）`, hint: "按当前 agent 职责选择的默认模型" },
    { value: "gpt-5.4", label: "gpt-5.4", hint: "适合规划、调试和评审等高强度推理任务" },
    { value: "gpt-5.3-codex", label: "gpt-5.3-codex", hint: "偏代码执行和验证的 Codex 模型" },
    { value: "claude-sonnet-4.6", label: "claude-sonnet-4.6", hint: "均衡的 Claude 工程模型，适合执行实现" },
    { value: "claude-haiku-4.5", label: "claude-haiku-4.5", hint: "更快、更省预算的 Claude 模型" },
    { value: "gemini-3.1-pro", label: "gemini-3.1-pro", hint: "适合混合任务的通用推理备选" },
    { value: "kimi-k2-thinking", label: "kimi-k2-thinking", hint: "偏深度思考的 Kimi 模型" },
    { value: "__custom__", label: "输入自定义模型", hint: "手动输入一个准确的 CodeBuddy model id" }
  ];
}

const selections = Object.fromEntries(agents.map((agent) => [agent.key, agent.fallback]));
const selectedIndexes = Object.fromEntries(agents.map((agent) => [agent.key, 0]));
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
