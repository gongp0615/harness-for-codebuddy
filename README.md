# Harness Engineer for CodeBuddy

CodeBuddy Code CLI plugin for supervised software engineering workflows.

Harness Engineer provides:

- CodeBuddy plugin metadata in `.codebuddy-plugin/plugin.json`
- slash commands under `commands/`
- reusable skills under `skills/`
- role prompts under `agents/`
- CodeBuddy hooks under `hooks/hooks.json`
- a local `harness` CLI for install, doctor, status, and verification checks

## Install

From a local checkout:

```bash
bash install.sh
```

From GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/gongp0615/harness-engineer/refs/heads/main/install.sh | bash
```

The installer writes a local CodeBuddy marketplace to:

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/marketplaces/harness-engineer
```

It also updates:

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/settings.json
```

## Commands

```bash
harness install
harness doctor
harness status
harness verify
harness explain
```

## CodeBuddy Commands

After the plugin is enabled, use:

```text
/harness-engineer:doctor
/harness-engineer:status
/harness-engineer:verify
/harness-engineer:plan <task>
/harness-engineer:recover
```

## Development

```bash
npm test
npm run harness -- doctor
```
