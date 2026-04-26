# Harness Policy

Policy files live under `harness/policies/`.
These policies are guardrails for Harness/CodeBuddy workflows, not a sandbox and not a complete security boundary.

`shell-policy.yaml` controls allow, warn, approval, and block decisions for shell commands through pattern matching. It can intercept known risky command shapes and prompt for review, but it does not replace OS permissions, containers, VMs, or other system isolation.

`file-scope.yaml` blocks writes outside approved roots for supported write tools. Use it to reduce accidental edits; do not rely on it as the only protection for sensitive paths.

Use `harness policy-check --command "<cmd>"` to test shell policy locally.
