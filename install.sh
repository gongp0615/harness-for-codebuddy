#!/usr/bin/env bash
set -euo pipefail

HARNESS_REPO="${HARNESS_REPO:-gongp0615/harness-for-codebuddy}"
HARNESS_REF="${HARNESS_REF:-main}"
CODEBUDDY_HOME="${CODEBUDDY_HOME:-$HOME/.codebuddy}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need git
need node

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]:-$0}")" >/dev/null 2>&1 && pwd || true)"
if [ -n "$script_dir" ] && [ -f "$script_dir/.codebuddy-plugin/plugin.json" ]; then
  source_dir="$script_dir"
  cleanup() { :; }
else
  tmp="$(mktemp -d)"
  cleanup() { rm -rf "$tmp"; }
  trap cleanup EXIT
  echo "Installing harness-engineer from https://github.com/${HARNESS_REPO} (${HARNESS_REF})"
  git clone --depth 1 --branch "$HARNESS_REF" "https://github.com/${HARNESS_REPO}.git" "$tmp/harness-for-codebuddy"
  source_dir="$tmp/harness-for-codebuddy"
fi

node "$source_dir/scripts/cli.js" install --source "$source_dir" --home "$CODEBUDDY_HOME"

if command -v harness >/dev/null 2>&1; then
  harness doctor
else
  "$HOME/.local/bin/harness" doctor
  echo "Add \$HOME/.local/bin to PATH to use the 'harness' command directly."
fi

ci_provider="${HARNESS_INSTALL_CI:-}"
if [ -z "$ci_provider" ] && [ "${HARNESS_INSTALL_ENABLE_CI:-}" = "1" ]; then
  ci_provider="github"
fi
if [ -z "$ci_provider" ] && [ -t 0 ]; then
  echo "Select Harness CI setup for the current directory:"
  echo "  1) none - skip CI setup"
  echo "  2) github - create .github/workflows/harness.yml"
  echo "  3) generic - create harness/ci/harness-ci.md integration guide"
  printf "Choose [1/2/3, default 1]: "
  read -r answer || answer=""
  case "$answer" in
    2|github|GitHub|github-actions) ci_provider="github" ;;
    3|generic|other|manual) ci_provider="generic" ;;
    *) ci_provider="none" ;;
  esac
fi

case "$ci_provider" in
  1|none|skip|false|0|"")
    echo "Skipped CI setup. Run 'harness init --profile node --ci github' or '--ci generic' later to enable it."
    ;;
  2|github|GitHub|github-actions)
    node "$source_dir/scripts/cli.js" init --profile "${HARNESS_INIT_PROFILE:-node}" --ci github
    echo "Created .github/workflows/harness.yml in the current directory."
    ;;
  3|generic|other|manual)
    node "$source_dir/scripts/cli.js" init --profile "${HARNESS_INIT_PROFILE:-node}" --ci generic
    echo "Created harness/ci/harness-ci.md in the current directory."
    ;;
  *)
    echo "Unsupported HARNESS_INSTALL_CI value: $ci_provider" >&2
    echo "Use one of: none, github, generic." >&2
    exit 1
    ;;
esac
