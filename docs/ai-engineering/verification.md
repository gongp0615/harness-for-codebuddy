# Verification Profiles

Profiles live under `harness/profiles/*.yaml`.
Each profile contains ordered steps with `name`, `command`, `required`, optional `timeout`, optional `cwd`, and optional `artifacts`.
Required step failures move the task to `FAILED_VERIFICATION`; optional failures are recorded in evidence without blocking review.
