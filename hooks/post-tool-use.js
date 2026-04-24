#!/usr/bin/env node
"use strict";

const { allow, readStdin, recordHook } = require("./common");

(async () => {
  const payload = await readStdin();
  recordHook("PostToolUse", payload);
  allow("Harness Engineer post-tool hook recorded.");
})();
