---
name: harness-verify
description: Use before reporting completion of a CodeBuddy engineering task.
---

# Harness Verify

Run `harness verify --profile default` when it applies. The command must write `.harness-engineer/evidence.json`.

If no verification steps exist, identify the manual evidence used instead and report that gap explicitly. If a required step fails, the task remains `FAILED_VERIFICATION`.
