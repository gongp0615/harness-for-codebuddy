---
description: Run the autonomous Harness planner/executor/verifier loop for a task.
allowed-tools: Bash
---

Run `harness run --task "<task>" --profile default --max-rounds 5 --json`.
Use the user's task text as `<task>`. Report the run id, final status, stop reason, current round, and the latest evaluator summary.
