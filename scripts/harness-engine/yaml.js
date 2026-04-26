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
      const [key, value, hasPair] = splitPair(body);
      if (!hasPair) {
        currentItem = parseValue(body);
        root[currentKey].push(currentItem);
      } else {
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
  const index = findMappingColon(line);
  if (index === -1) return [line, "", false];
  return [line.slice(0, index).trim(), line.slice(index + 1).trim(), true];
}

function findMappingColon(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === "\\" && quote === '"') {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ":" && (index === line.length - 1 || /\s/.test(line[index + 1]))) {
      return index;
    }
  }
  return -1;
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
