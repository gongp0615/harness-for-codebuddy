"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { copyDirectory, homeDir, readJson, writeJson } = require("./paths");

const PLUGIN_NAME = "harness-engineer";
const MARKETPLACE_NAME = "harness-engineer-local";
const DEFAULT_AGENT_MODEL = "claude-sonnet-4.6";
const AGENT_NAMES = ["planner", "executor", "verifier", "debugger"];
const AGENT_DESCRIPTIONS = {
  planner: "Turns a clear engineering request into a small, testable Harness plan.",
  executor: "Implements approved Harness plans within assigned scope.",
  verifier: "Validates completion claims against Harness plans and evidence.",
  debugger: "Diagnoses failing behavior from Harness evidence and logs."
};
const KNOWN_AGENT_MODELS = [
  "claude-sonnet-4.6",
  "claude-sonnet-4.6-1m",
  "claude-4.5",
  "claude-opus-4.6",
  "claude-opus-4.6-1m",
  "claude-opus-4.5",
  "claude-haiku-4.5",
  "gemini-3.1-pro",
  "gemini-3.0-flash",
  "gemini-2.5-pro",
  "gemini-3.1-flash-lite",
  "gpt-5.4",
  "gpt-5.2",
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "kimi-k2.5",
  "kimi-k2-thinking",
  "glm-5.1",
  "glm-5.0",
  "glm-5.0-turbo",
  "glm-5v-turbo",
  "glm-4.7",
  "glm-4.6",
  "glm-4.6v",
  "minimax-m2.5",
  "deepseek-v3.2-volc",
  "hunyuan-2.0-thinking-ioa",
  "hunyuan-2.0-instruct-ioa"
];

function installCodeBuddyPlugin(options = {}) {
  const sourceDir = path.resolve(options.sourceDir || process.cwd());
  const home = path.resolve(options.homeDir || homeDir());
  const marketplaceDir = path.join(home, "marketplaces", PLUGIN_NAME);
  const pluginDir = path.join(marketplaceDir, "plugins", PLUGIN_NAME);

  copyDirectory(sourceDir, pluginDir);
  configureInstalledAgentModels(pluginDir, options);
  writeMarketplace(marketplaceDir);
  const launcherPath = writeSettings(home, marketplaceDir, options.binDir);

  return {
    home_dir: home,
    plugin_dir: pluginDir,
    marketplace_dir: marketplaceDir,
    settings_path: path.join(home, "settings.json"),
    launcher_path: launcherPath,
    marketplace_name: MARKETPLACE_NAME,
    plugin_name: PLUGIN_NAME,
    agent_models: resolveAgentModelConfig(options)
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
  return launcher;
}

function pluginDirFromMarketplace(marketplaceDir) {
  return path.join(marketplaceDir, "plugins", PLUGIN_NAME);
}

function configureInstalledAgentModels(pluginDir, options = {}) {
  const config = resolveAgentModelConfig(options);
  const agentsDir = path.join(pluginDir, "agents");

  for (const agent of AGENT_NAMES) {
    const filePath = path.join(agentsDir, `${agent}.md`);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    const parsed = parseMarkdownFrontmatter(text);
    const data = {
      ...parsed.data,
      name: agent,
      description: AGENT_DESCRIPTIONS[agent] || parsed.data.description || agent
    };
    if (config.mode === "skip") {
      delete data.model;
    } else {
      data.model = config.agents[agent] || DEFAULT_AGENT_MODEL;
    }
    fs.writeFileSync(filePath, renderMarkdownFrontmatter(data, parsed.body));
  }
}

function resolveAgentModelConfig(options = {}) {
  const env = options.env || process.env;
  const mode = normalizeModelMode(options.agentModelMode || env.HARNESS_AGENT_MODEL_MODE);
  const baseModel = normalizeModelId(options.agentModel || env.HARNESS_AGENT_MODEL || DEFAULT_AGENT_MODEL);
  const agents = {};

  for (const agent of AGENT_NAMES) {
    const optionKey = `${agent}AgentModel`;
    const envKey = `HARNESS_AGENT_MODEL_${agent.toUpperCase()}`;
    agents[agent] = normalizeModelId(options[optionKey] || env[envKey] || baseModel);
  }

  return { mode, default_model: baseModel, agents };
}

function normalizeModelMode(value) {
  if (!value) return "default";
  const normalized = String(value).trim().toLowerCase();
  if (["skip", "none", "false", "0", "inherit"].includes(normalized)) return "skip";
  if (["custom", "customize", "per-agent", "per_agent"].includes(normalized)) return "custom";
  return "default";
}

function normalizeModelId(value) {
  const normalized = String(value || "").trim();
  return normalized || DEFAULT_AGENT_MODEL;
}

function parseMarkdownFrontmatter(text) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { data: {}, body: text.replace(/^\s*/, "") };
  }
  const newline = text.startsWith("---\r\n") ? "\r\n" : "\n";
  const markerLength = 3 + newline.length;
  const endMarker = `${newline}---${newline}`;
  const end = text.indexOf(endMarker, markerLength);
  if (end === -1) {
    return { data: {}, body: text };
  }
  const frontmatter = text.slice(markerLength, end);
  const body = text.slice(end + endMarker.length);
  return { data: parseFrontmatterYaml(frontmatter), body };
}

function parseFrontmatterYaml(text) {
  const data = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf(":");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    data[key] = unquoteYamlScalar(line.slice(index + 1).trim());
  }
  return data;
}

function unquoteYamlScalar(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

function renderMarkdownFrontmatter(data, body) {
  const orderedKeys = ["name", "description", "model"];
  const seen = new Set();
  const lines = [];
  for (const key of orderedKeys) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      lines.push(`${key}: ${quoteYamlScalar(data[key])}`);
      seen.add(key);
    }
  }
  for (const key of Object.keys(data)) {
    if (!seen.has(key)) lines.push(`${key}: ${quoteYamlScalar(data[key])}`);
  }
  return `---\n${lines.join("\n")}\n---\n\n${body.replace(/^\s*/, "")}`;
}

function quoteYamlScalar(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_.-]+$/.test(text)) return text;
  return JSON.stringify(text);
}

module.exports = {
  AGENT_NAMES,
  DEFAULT_AGENT_MODEL,
  KNOWN_AGENT_MODELS,
  configureInstalledAgentModels,
  installCodeBuddyPlugin,
  resolveAgentModelConfig,
  uninstallCodeBuddyPlugin
};
