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
  [ -r /dev/tty ] && [ -w /dev/tty ]
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
  echo "Harness agent model configuration:"
  echo "  planner : ${HARNESS_AGENT_MODEL_PLANNER:-${HARNESS_AGENT_MODEL:-$default_agent_model}}"
  echo "  executor: ${HARNESS_AGENT_MODEL_EXECUTOR:-${HARNESS_AGENT_MODEL:-$default_agent_model}}"
  echo "  verifier: ${HARNESS_AGENT_MODEL_VERIFIER:-${HARNESS_AGENT_MODEL:-$default_agent_model}}"
  echo "  debugger: ${HARNESS_AGENT_MODEL_DEBUGGER:-${HARNESS_AGENT_MODEL:-$default_agent_model}}"
}

select_model_option() {
  local agent="$1"
  local fallback="$2"
  local answer
  echo >&2
  echo "Question: Harness ${agent} model" >&2
  echo "Which model should the ${agent} agent use?" >&2
  echo >&2
  echo "  1. ${fallback} (Recommended)  Default for this role." >&2
  echo "  2. gpt-5.4                 Strong planning/review/debugging." >&2
  echo "  3. gpt-5.3-codex           Coding-focused executor/verifier model." >&2
  echo "  4. claude-sonnet-4.6        Balanced Claude model." >&2
  echo "  5. claude-haiku-4.5         Fast/budget Claude model." >&2
  echo "  6. gemini-3.1-pro           Broad reasoning/visual fallback." >&2
  echo "  7. Custom model id          Type an exact CodeBuddy model id next." >&2
  echo >&2
  printf "Enter choice [1-7, default 1]: " >&2
  harness_read answer || answer=""
  case "$answer" in
    ""|1) printf "%s" "$fallback" ;;
    2) printf "gpt-5.4" ;;
    3) printf "gpt-5.3-codex" ;;
    4) printf "claude-sonnet-4.6" ;;
    5) printf "claude-haiku-4.5" ;;
    6) printf "gemini-3.1-pro" ;;
    7|custom)
      printf "Enter custom model id for %s [default %s]: " "$agent" "$fallback" >&2
      harness_read answer || answer=""
      if [ -z "$answer" ]; then
        printf "%s" "$fallback"
      else
        printf "%s" "$answer"
      fi
      ;;
    *)
      printf "%s" "$answer"
      ;;
  esac
}

configure_agent_models_interactive() {
  local answer
  print_question_header \
    "Question 1/1 (1 unanswered)" \
    "How should Harness configure models for its CodeBuddy agents?"
  echo "  1. Recommended balanced (Recommended)"
  echo "     Best default: GPT for planning/review, Claude for execution, Codex for verification."
  echo "  2. Claude-only"
  echo "     Use claude-sonnet-4.6 for every Harness agent."
  echo "  3. OpenAI-only"
  echo "     Use gpt-5.4 for planning/debugging and gpt-5.3-codex for execution/verification."
  echo "  4. Fast/budget"
  echo "     Use claude-haiku-4.5 for every Harness agent."
  echo "  5. Customize each agent"
  echo "     Pick planner, executor, verifier, and debugger models one by one."
  echo "  6. Skip model configuration"
  echo "     Leave model unset so CodeBuddy inherits its defaults."
  echo
  printf "Enter choice [1-6, default 1]: "
  harness_read answer || answer=""
  case "$answer" in
    ""|1|recommended|balanced)
      export HARNESS_AGENT_MODEL_MODE="custom"
      export HARNESS_AGENT_MODEL_PLANNER="gpt-5.4"
      export HARNESS_AGENT_MODEL_EXECUTOR="claude-sonnet-4.6"
      export HARNESS_AGENT_MODEL_VERIFIER="gpt-5.3-codex"
      export HARNESS_AGENT_MODEL_DEBUGGER="gpt-5.4"
      agent_model_preset="recommended balanced"
      ;;
    2|claude|claude-only)
      export HARNESS_AGENT_MODEL="claude-sonnet-4.6"
      agent_model_preset="Claude-only"
      ;;
    3|openai|openai-only)
      export HARNESS_AGENT_MODEL_MODE="custom"
      export HARNESS_AGENT_MODEL_PLANNER="gpt-5.4"
      export HARNESS_AGENT_MODEL_EXECUTOR="gpt-5.3-codex"
      export HARNESS_AGENT_MODEL_VERIFIER="gpt-5.3-codex"
      export HARNESS_AGENT_MODEL_DEBUGGER="gpt-5.4"
      agent_model_preset="OpenAI-only"
      ;;
    4|fast|budget)
      export HARNESS_AGENT_MODEL="claude-haiku-4.5"
      agent_model_preset="fast/budget"
      ;;
    5|custom|customize)
      export HARNESS_AGENT_MODEL_MODE="custom"
      export HARNESS_AGENT_MODEL_PLANNER="$(select_model_option planner gpt-5.4)"
      export HARNESS_AGENT_MODEL_EXECUTOR="$(select_model_option executor claude-sonnet-4.6)"
      export HARNESS_AGENT_MODEL_VERIFIER="$(select_model_option verifier gpt-5.3-codex)"
      export HARNESS_AGENT_MODEL_DEBUGGER="$(select_model_option debugger gpt-5.4)"
      agent_model_preset="custom"
      ;;
    6|skip|none|inherit)
      export HARNESS_AGENT_MODEL_MODE="skip"
      agent_model_preset="skip"
      ;;
    *)
      export HARNESS_AGENT_MODEL="$answer"
      agent_model_preset="single custom model"
      ;;
  esac
}

has_agent_model_env=0
for var_name in HARNESS_AGENT_MODEL HARNESS_AGENT_MODEL_MODE HARNESS_AGENT_MODEL_PLANNER HARNESS_AGENT_MODEL_EXECUTOR HARNESS_AGENT_MODEL_VERIFIER HARNESS_AGENT_MODEL_DEBUGGER; do
  if [ -n "${!var_name:-}" ]; then
    has_agent_model_env=1
  fi
done

if [ "$has_agent_model_env" = "0" ] && harness_has_tty; then
  configure_agent_models_interactive
  if [ "$agent_model_preset" = "skip" ]; then
    echo "Harness agent model configuration: inherit CodeBuddy defaults"
  else
    echo
    echo "Selected preset: ${agent_model_preset:-default}"
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
