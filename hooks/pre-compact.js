#!/usr/bin/env node
"use strict";

const { allow, readStdin, recordHook } = require("./common");

(async () => {
  const payload = await readStdin();
  recordHook("PreCompact", payload);
  allow("Harness Engineer compact hook recorded.");
})();
