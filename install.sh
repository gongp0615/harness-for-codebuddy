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

default_agent_model="${HARNESS_AGENT_MODEL:-claude-sonnet-4.6}"
known_agent_models=(
  claude-sonnet-4.6 claude-sonnet-4.6-1m claude-4.5 claude-opus-4.6 claude-opus-4.6-1m claude-opus-4.5 claude-haiku-4.5
  gemini-3.1-pro gemini-3.0-flash gemini-2.5-pro gemini-3.1-flash-lite
  gpt-5.4 gpt-5.2 gpt-5.3-codex gpt-5.2-codex gpt-5.1 gpt-5.1-codex gpt-5.1-codex-max gpt-5.1-codex-mini
  kimi-k2.5 kimi-k2-thinking glm-5.1 glm-5.0 glm-5.0-turbo glm-5v-turbo glm-4.7 glm-4.6 glm-4.6v minimax-m2.5 deepseek-v3.2-volc hunyuan-2.0-thinking-ioa hunyuan-2.0-instruct-ioa
)

choose_agent_model() {
  local agent="$1"
  local fallback="$2"
  local answer
  echo "Select model for Harness $agent agent:" >&2
  local i=1
  for model in "${known_agent_models[@]}"; do
    printf "  %d) %s\n" "$i" "$model" >&2
    i=$((i + 1))
  done
  printf "Choose number or enter a custom model id [default %s]: " "$fallback" >&2
  read -r answer || answer=""
  if [ -z "$answer" ]; then
    printf "%s" "$fallback"
    return
  fi
  if [[ "$answer" =~ ^[0-9]+$ ]] && [ "$answer" -ge 1 ] && [ "$answer" -le "${#known_agent_models[@]}" ]; then
    printf "%s" "${known_agent_models[$((answer - 1))]}"
    return
  fi
  printf "%s" "$answer"
}

has_agent_model_env=0
for var_name in HARNESS_AGENT_MODEL HARNESS_AGENT_MODEL_MODE HARNESS_AGENT_MODEL_PLANNER HARNESS_AGENT_MODEL_EXECUTOR HARNESS_AGENT_MODEL_VERIFIER HARNESS_AGENT_MODEL_DEBUGGER; do
  if [ -n "${!var_name:-}" ]; then
    has_agent_model_env=1
  fi
done

if [ "$has_agent_model_env" = "0" ] && [ -t 0 ]; then
  echo "Configure Harness plugin agent models:"
  echo "  1) yes - use ${default_agent_model} for all Harness agents"
  echo "  2) customize each agent"
  echo "  3) skip model configuration"
  printf "Choose [1/2/3, default 1]: "
  read -r model_answer || model_answer=""
  case "$model_answer" in
    2|custom|customize|customize-each|customize\ each\ agent)
      export HARNESS_AGENT_MODEL_MODE="custom"
      export HARNESS_AGENT_MODEL_PLANNER="$(choose_agent_model planner "$default_agent_model")"
      echo
      export HARNESS_AGENT_MODEL_EXECUTOR="$(choose_agent_model executor "$default_agent_model")"
      echo
      export HARNESS_AGENT_MODEL_VERIFIER="$(choose_agent_model verifier "$default_agent_model")"
      echo
      export HARNESS_AGENT_MODEL_DEBUGGER="$(choose_agent_model debugger "$default_agent_model")"
      echo
      ;;
    3|skip|none|inherit)
      export HARNESS_AGENT_MODEL_MODE="skip"
      ;;
    *)
      export HARNESS_AGENT_MODEL="$default_agent_model"
      ;;
  esac
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
