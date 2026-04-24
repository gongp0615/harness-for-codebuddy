#!/usr/bin/env node
"use strict";

const { allow, readStdin, recordHook } = require("./common");

(async () => {
  const payload = await readStdin();
  recordHook("SessionStart", payload);
  allow("Harness Engineer session hook recorded.");
})();
