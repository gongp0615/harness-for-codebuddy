"use strict";

function evaluatePreToolUse(payload) {
  const command = String(payload.tool_input && payload.tool_input.command ? payload.tool_input.command : "");
  const blocked = [
    /rm\s+-rf\s+\/(?:\s|$)/,
    /git\s+reset\s+--hard/,
    /git\s+clean\s+-fdx/,
    /mkfs\./,
    /dd\s+if=/
  ];

  if (payload.tool_name === "Bash" && blocked.some((pattern) => pattern.test(command))) {
    return { allowed: false, reason: "Harness Engineer blocked a high-risk shell command." };
  }

  return { allowed: true, reason: "Harness Engineer pre-tool gate passed." };
}

module.exports = {
  evaluatePreToolUse
};
