"use strict";

const path = require("node:path");
const { loadYaml } = require("./yaml");
const { DEFAULT_FILE_SCOPE, DEFAULT_SHELL_POLICY } = require("./config");

function evaluatePolicy(projectRoot, payload) {
  const toolName = payload.tool_name || "";
  const input = payload.tool_input || {};
  if (toolName === "Bash" || toolName === "Shell") {
    return evaluateShellPolicy(projectRoot, String(input.command || ""));
  }
  const filePath = input.file_path || input.path;
  if (filePath && isWriteTool(toolName)) {
    return evaluateFileScope(projectRoot, String(filePath));
  }
  return decision("allow", "Harness Engineer policy passed.");
}

function evaluateShellPolicy(projectRoot, command) {
  const policy = loadYaml(path.join(projectRoot, "harness", "policies", "shell-policy.yaml"), DEFAULT_SHELL_POLICY);
  for (const [key, value] of [
    ["block", policy.block || []],
    ["approval", policy.approval || []],
    ["warn", policy.warn || []]
  ]) {
    const match = findMatch(value, command);
    if (match) return decision(key, match.reason || `${key} policy matched.`, { command, pattern: match.pattern });
  }
  return decision("allow", "Harness Engineer shell policy passed.", { command });
}

function evaluateFileScope(projectRoot, filePath) {
  const policy = loadYaml(path.join(projectRoot, "harness", "policies", "file-scope.yaml"), DEFAULT_FILE_SCOPE);
  const absolute = path.resolve(projectRoot, filePath);
  const validation = validateFileScopePolicy(policy);
  if (!validation.ok) {
    return decision("block", validation.reason, { file_path: filePath });
  }
  for (const blocked of policy.blocked_roots || []) {
    const blockedRoot = resolvePolicyRoot(projectRoot, blocked);
    if (absolute === blockedRoot || absolute.startsWith(`${blockedRoot}${path.sep}`)) {
      return decision("block", `Write path is outside approved file scope: ${filePath}`, { file_path: filePath });
    }
  }
  const allowedRoots = policy.allowed_roots || ["."];
  const allowed = allowedRoots.some((root) => {
    const allowedRoot = resolvePolicyRoot(projectRoot, root);
    return absolute === allowedRoot || absolute.startsWith(`${allowedRoot}${path.sep}`);
  });
  return allowed
    ? decision("allow", "Harness Engineer file scope policy passed.", { file_path: filePath })
    : decision("block", `Write path is outside approved file scope: ${filePath}`, { file_path: filePath });
}

function validateFileScopePolicy(policy) {
  for (const key of ["allowed_roots", "blocked_roots"]) {
    const value = policy[key];
    if (value === undefined) continue;
    if (!Array.isArray(value)) return { ok: false, reason: `${key} must be an array of path strings.` };
    const invalid = value.find((item) => typeof item !== "string");
    if (invalid !== undefined) return { ok: false, reason: `${key} entries must be path strings.` };
  }
  return { ok: true };
}

function resolvePolicyRoot(projectRoot, root) {
  return path.isAbsolute(root) ? path.resolve(root) : path.resolve(projectRoot, root);
}

function findMatch(rules, command) {
  for (const rule of rules) {
    const pattern = typeof rule === "string" ? rule : rule.pattern;
    if (!pattern) continue;
    const regex = new RegExp(pattern, "i");
    if (regex.test(command)) {
      return typeof rule === "string" ? { pattern, reason: "Policy matched." } : rule;
    }
  }
  return null;
}

function isWriteTool(toolName) {
  return ["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(toolName);
}

function decision(kind, reason, extra = {}) {
  const finalReason = kind === "block" && !/block/i.test(reason) ? `blocked: ${reason}` : reason;
  return {
    allowed: kind !== "block",
    decision: kind,
    reason: finalReason,
    ...extra
  };
}

module.exports = {
  evaluatePolicy
};
