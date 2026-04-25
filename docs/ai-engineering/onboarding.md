# Onboarding

1. Run `harness doctor` after installing the plugin.
2. Run `harness init --profile node` for Node projects or `harness init --profile generic` otherwise. Add `--ci github` for GitHub Actions or `--ci generic` for other CI systems.
3. Start work with `harness plan --task "<task>"`.
4. Run `harness verify --profile default` before review.
