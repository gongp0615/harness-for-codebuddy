"use strict";

const { evaluatePolicy } = require("../scripts/harness-engine/policy");

function evaluatePreToolUse(payload) {
  const projectRoot = payload.cwd || process.cwd();
  return evaluatePolicy(projectRoot, payload);
}

module.exports = {
  evaluatePreToolUse
};
