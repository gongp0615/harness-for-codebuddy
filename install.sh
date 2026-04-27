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

harness_has_tty() {
  [ -r /dev/tty ] && [ -w /dev/tty ] && { : </dev/tty >/dev/tty; } 2>/dev/null
}

harness_read() {
  local __var_name="$1"
  if harness_has_tty; then
    IFS= read -r "$__var_name" </dev/tty || return 1
    return 0
  fi
  IFS= read -r "$__var_name" || return 1
}

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

default_agent_model="${HARNESS_AGENT_MODEL:-claude-sonnet-4.6}"
agent_model_preset=""

print_question_header() {
  local title="$1"
  local question="$2"
  echo
  echo "$title"
  echo "$question"
  echo
}

print_model_summary() {
  echo "Harness agent 模型配置:"
  echo "  planner : ${HARNESS_AGENT_MODEL_PLANNER:-${HARNESS_AGENT_MODEL:-$default_agent_model}}"
  echo "  executor: ${HARNESS_AGENT_MODEL_EXECUTOR:-${HARNESS_AGENT_MODEL:-$default_agent_model}}"
  echo "  verifier: ${HARNESS_AGENT_MODEL_VERIFIER:-${HARNESS_AGENT_MODEL:-$default_agent_model}}"
  echo "  debugger: ${HARNESS_AGENT_MODEL_DEBUGGER:-${HARNESS_AGENT_MODEL:-$default_agent_model}}"
  echo "  reviewer: ${HARNESS_AGENT_MODEL_REVIEWER:-${HARNESS_AGENT_MODEL:-$default_agent_model}}"
}

ensure_tui_dependencies() {
  if [ -d "$source_dir/node_modules/picocolors" ]; then
    return 0
  fi
  need npm
  echo "Installing Harness installer TUI dependencies..."
  (cd "$source_dir" && npm install --omit=dev --no-audit --no-fund)
}

configure_agent_models_interactive() {
  local env_file
  env_file="$(mktemp)"
  ensure_tui_dependencies
  node "$source_dir/scripts/agent-model-tui.js" "$env_file" </dev/tty >/dev/tty
  # shellcheck disable=SC1090
  . "$env_file"
  rm -f "$env_file"
  if [ "${HARNESS_AGENT_MODEL_MODE:-}" = "skip" ]; then
    agent_model_preset="skip"
  else
    agent_model_preset="custom"
  fi
}

has_agent_model_env=0
for var_name in HARNESS_AGENT_MODEL HARNESS_AGENT_MODEL_MODE HARNESS_AGENT_MODEL_PLANNER HARNESS_AGENT_MODEL_EXECUTOR HARNESS_AGENT_MODEL_VERIFIER HARNESS_AGENT_MODEL_DEBUGGER HARNESS_AGENT_MODEL_REVIEWER; do
  if [ -n "${!var_name:-}" ]; then
    has_agent_model_env=1
  fi
done

if [ "$has_agent_model_env" = "0" ] && harness_has_tty; then
  configure_agent_models_interactive
  if [ "$agent_model_preset" = "skip" ]; then
    echo "Harness agent 模型配置: 继承 CodeBuddy 默认值"
  else
    echo
    echo "已选择模型配置: ${agent_model_preset:-default}"
    print_model_summary
  fi
fi

node "$source_dir/scripts/cli.js" install --source "$source_dir" --home "$CODEBUDDY_HOME"

if command -v harness >/dev/null 2>&1; then
  harness doctor
else
  fallback_harness="${HARNESS_BIN_DIR:-$HOME/.local/bin}/harness"
  "$fallback_harness" doctor
  echo "Add $(dirname "$fallback_harness") to PATH to use the 'harness' command directly."
fi

ci_provider="${HARNESS_INSTALL_CI:-}"
if [ -z "$ci_provider" ] && [ "${HARNESS_INSTALL_ENABLE_CI:-}" = "1" ]; then
  ci_provider="github"
fi
if [ -z "$ci_provider" ] && harness_has_tty; then
  print_question_header \
    "Question 1/1 (1 unanswered)" \
    "Should Harness add CI verification files to the current project?"
  echo "  1. None (Recommended)"
  echo "     Skip CI setup now; you can run harness init --ci later."
  echo "  2. GitHub Actions"
  echo "     Create .github/workflows/harness.yml."
  echo "  3. Generic"
  echo "     Create harness/ci/harness-ci.md with integration guidance."
  echo
  printf "Enter choice [1-3, default 1]: "
  harness_read answer || answer=""
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
