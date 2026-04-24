#!/usr/bin/env node
"use strict";

const { allow, block, readStdin, recordHook } = require("./common");
const { evaluatePreToolUse } = require("./pre-tool-policy");

(async () => {
  const payload = await readStdin();
  recordHook("PreToolUse", payload);

  const result = evaluatePreToolUse(payload);

  if (result.allowed) {
    allow(result.reason);
  } else {
    block(result.reason);
  }
})();
