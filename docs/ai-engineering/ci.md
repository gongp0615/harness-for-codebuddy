# CI Integration

Use `harness verify --profile ci` in CI and upload `.harness-engineer/` as an artifact so review retains evidence.

Interactive `install.sh` asks which CI setup to create for the current directory:

- `none`: skip CI setup.
- `github`: create `.github/workflows/harness.yml`.
- `generic`: create `harness/ci/harness-ci.md` with a portable CI integration command.

Project owners can also run:

```bash
harness init --profile node --ci github
harness init --profile node --ci generic
```

The GitHub provider copies `docs/ai-engineering/github-actions-harness.yml` into `.github/workflows/harness.yml`. Pushing that workflow file to GitHub requires an account or token with `workflow` permission.
