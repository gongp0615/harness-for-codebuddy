# Harness Engineering Workflow

Use `harness init` once per project, then record non-trivial work with `harness plan --task "<task>"`.
During execution, keep changes scoped to the plan and update evidence with `harness verify --profile default`.
Before review, use `harness evidence --summary` to copy verification status, failed steps, artifacts, and residual risks into the handoff.
