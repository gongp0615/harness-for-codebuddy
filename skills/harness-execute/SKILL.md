---
name: harness-execute
description: Use when executing an approved Harness Engineer plan in CodeBuddy.
---

# Harness Execute

Execute the active plan incrementally. Keep diffs small, preserve user changes, and update Harness state as work moves from planned to verified.

Before reporting completion, run `harness verify --profile default` or the profile named in the plan. If verification fails, stay in the debug/execute loop and do not claim readiness.
