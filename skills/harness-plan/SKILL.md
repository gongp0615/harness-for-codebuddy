---
name: harness-plan
description: Use when a CodeBuddy user asks to plan a software engineering task before implementation.
---

# Harness Plan

Write a short, testable plan before editing code. The plan should identify the files likely to change, verification commands, and the smallest reversible implementation steps.

Persist the plan with `harness plan --task "<task>"`. The command must update `.harness-engineer/task.json` and `.harness-engineer/plan.md`; prompt-only planning is not enough for non-trivial work.
