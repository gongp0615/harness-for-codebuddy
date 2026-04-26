# CI Integration

Use `harness verify --profile ci` in CI and upload `.harness-engineer/` as an artifact so review retains evidence. The current `ci` profile runs both the fast local test suite and a Docker Compose-backed integration test pass.

Interactive `install.sh` asks which CI setup to create for the current directory:

- `none`: skip CI setup.
- `github`: create `.github/workflows/harness.yml`.
- `generic`: create `harness/ci/harness-ci.md` with a portable CI integration command.

Project owners can also run:

```bash
harness init --profile node --ci github
harness init --profile node --ci generic
```

The GitHub provider copies `docs/ai-engineering/github-actions-harness.yml` into `.github/workflows/harness.yml`. That workflow now prints `docker --version` and `docker compose version` before running `harness verify --profile ci`, so missing container tooling fails fast. Pushing that workflow file to GitHub requires an account or token with `workflow` permission.

The integration layer assumes the CI runner has Docker and Docker Compose available. Integration logs are written under `.harness-engineer/integration-logs/` so they can be uploaded with the rest of the Harness evidence.
