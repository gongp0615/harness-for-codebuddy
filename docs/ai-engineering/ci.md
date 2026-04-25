# CI Integration

Use `harness verify --profile ci` in CI and upload `.harness-engineer/` as an artifact so review retains evidence.

For GitHub Actions, start from `docs/ai-engineering/github-actions-harness.yml` and copy it into `.github/workflows/` in a repository where the publishing token has workflow permissions.
