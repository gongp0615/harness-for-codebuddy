"use strict";

const fs = require("node:fs");

function loadYaml(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  const text = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".json")) {
    return JSON.parse(text);
  }
  return parseSimpleYaml(text);
}

function parseSimpleYaml(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
  const root = {};
  let currentKey = null;
  let currentItem = null;

  for (const rawLine of lines) {
    const indent = rawLine.match(/^\s*/)[0].length;
    const line = rawLine.trim();
    if (indent === 0) {
      const [key, value] = splitPair(line);
      currentKey = key;
      currentItem = null;
      if (value === "") {
        root[key] = [];
      } else {
        root[key] = parseValue(value);
      }
      continue;
    }

    if (!currentKey) continue;
    if (!Array.isArray(root[currentKey])) root[currentKey] = [];

    if (indent === 2 && line.startsWith("- ")) {
      const body = line.slice(2);
      if (!body.includes(":")) {
        currentItem = parseValue(body);
        root[currentKey].push(currentItem);
      } else {
        const [key, value] = splitPair(body);
        currentItem = {};
        currentItem[key] = parseValue(value);
        root[currentKey].push(currentItem);
      }
      continue;
    }

    if (indent >= 4 && currentItem && typeof currentItem === "object") {
      const [key, value] = splitPair(line);
      currentItem[key] = parseValue(value);
    }
  }

  return root;
}

function splitPair(line) {
  const index = line.indexOf(":");
  if (index === -1) return [line, ""];
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}

function parseValue(value) {
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^\d+$/.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1).split(",").map((item) => parseValue(item.trim())).filter((item) => item !== "");
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

module.exports = {
  loadYaml,
  parseSimpleYaml
};
