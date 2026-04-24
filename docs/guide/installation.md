# Installation

## Prerequisites

- `git`
- `node` 18 or newer
- `bash`

## Install From GitHub

```bash
curl -fsSL https://raw.githubusercontent.com/gongp0615/harness-engineer/refs/heads/main/install.sh | bash
```

## Install From A Local Checkout

```bash
bash install.sh
```

## Environment Variables

```bash
CODEBUDDY_HOME="$HOME/.codebuddy"
HARNESS_REPO="gongp0615/harness-engineer"
HARNESS_REF="main"
```

## Verify

```bash
harness doctor
```

Expected result: every check has `"ok": true`.
