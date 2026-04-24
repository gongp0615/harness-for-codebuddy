#!/usr/bin/env node
"use strict";

const { allow, readStdin, recordHook } = require("./common");

(async () => {
  const payload = await readStdin();
  recordHook("Stop", payload);
  allow("Harness Engineer stop hook recorded.");
})();
