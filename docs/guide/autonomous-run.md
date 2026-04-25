# Autonomous Run Guide

Use `harness run` when a task is clear enough to execute but long enough to benefit from a bounded planner, executor, verifier, and fix loop.

```bash
harness run --task "add retry tests for failed checkout submissions"
```

Defaults:

- `--profile default`
- `--max-rounds 5`
- JSON output
- CodeBuddy headless full permission mode

Equivalent explicit form:

```bash
harness run --task "stabilize checkout retry handling" --profile ci --max-rounds 3 --json
```

The harness calls CodeBuddy as:

```text
codebuddy -p ... -y --permission-mode bypassPermissions --subagent-permission-mode bypassPermissions --agent <planner|executor|verifier>
```

Stop conditions:

- Required verification passes.
- `--max-rounds` is reached.
- `codebuddy` or `cbc` cannot be found.
- A headless CodeBuddy call fails.
- The verifier returns `safe_to_continue: false`.

Artifacts:

- `.harness-engineer/spec.md`
- `.harness-engineer/contract.md`
- `.harness-engineer/run.json`
- `.harness-engineer/evaluation.json`
- `.harness-engineer/evidence.json`

Recovery:

```bash
harness status
harness recover
```

`status` reports the active run, round, last evaluator conclusion, and stop reason. `recover` gives the next action after interruption or `MAX_ROUNDS_REACHED`.
