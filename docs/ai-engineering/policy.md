# Harness Policy

Policy files live under `harness/policies/`.
`shell-policy.yaml` controls allow, warn, approval, and block decisions for shell commands.
`file-scope.yaml` blocks writes outside approved roots.
Use `harness policy-check --command "<cmd>"` to test shell policy locally.
