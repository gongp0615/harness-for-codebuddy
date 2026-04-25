"use strict";

const fs = require("node:fs");
const path = require("node:path");

function readStdin() {
  if (process.env.HARNESS_HOOK_PAYLOAD) {
    return parsePayload(process.env.HARNESS_HOOK_PAYLOAD);
  }

  return new Promise((resolve) => {
    let input = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(parsePayload(input));
    };

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
    process.stdin.resume();

    setTimeout(finish, 100);
  });
}

function parsePayload(input) {
  const text = String(input || "").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function statePath(payload) {
  const cwd = payload.cwd || process.cwd();
  return path.join(cwd, ".harness-engineer", "hook-events.jsonl");
}

function recordHook(event, payload) {
  const filePath = statePath(payload);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify({
    event,
    at: new Date().toISOString(),
    tool_name: payload.tool_name || null,
    summary: summarizePayload(payload)
  })}\n`);
}

function summarizePayload(payload) {
  const input = payload.tool_input || {};
  const response = payload.tool_response || payload.result || {};
  return {
    command: input.command || null,
    file_path: input.file_path || input.path || null,
    decision: response.decision || null,
    reason: response.reason || null,
    exit_code: typeof response.exit_code === "number" ? response.exit_code : response.status ?? null,
    stdout: trim(String(response.stdout || "")),
    stderr: trim(String(response.stderr || response.error || ""))
  };
}

function trim(value, limit = 500) {
  return value.length > limit ? `${value.slice(0, limit)}...<truncated>` : value;
}

function allow(message) {
  process.stdout.write(`${JSON.stringify({ continue: true, suppressOutput: true, reason: message })}\n`);
}

function block(message) {
  process.stdout.write(`${JSON.stringify({ continue: false, reason: message })}\n`);
  process.exitCode = 2;
}

module.exports = {
  allow,
  block,
  readStdin,
  recordHook,
  summarizePayload
};
