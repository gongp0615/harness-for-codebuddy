# Harness for CodeBuddy

English version: [jump below](#english).

Harness for CodeBuddy 是一个 CodeBuddy Code CLI 插件。它把计划、验证、恢复和基础安全检查做成固定命令，避免每次都靠临时对话记住流程。

它会安装：

- CodeBuddy slash commands
- workflow skills
- planner / executor / verifier / debugger agents
- hooks
- 本地 `harness` CLI

项目里的运行状态写在 `.harness-engineer/`，验证命令写在 `harness/profiles/`。

## 安装

从 GitHub 安装：

```bash
curl -fsSL https://raw.githubusercontent.com/gongp0615/harness-for-codebuddy/refs/heads/main/install.sh | bash
```

在交互式终端中运行时，安装器会询问 Harness agent 模型配置。默认是推荐均衡预设，也可以选择 Claude-only、OpenAI-only、fast/budget、逐 agent 自定义，或跳过模型配置。CI 或无 TTY 环境会跳过交互；可用环境变量指定：

```bash
HARNESS_AGENT_MODEL_MODE=custom \
HARNESS_AGENT_MODEL_PLANNER=gpt-5.4 \
HARNESS_AGENT_MODEL_EXECUTOR=claude-sonnet-4.6 \
HARNESS_AGENT_MODEL_VERIFIER=gpt-5.3-codex \
HARNESS_AGENT_MODEL_DEBUGGER=gemini-3.1-pro \
curl -fsSL https://raw.githubusercontent.com/gongp0615/harness-for-codebuddy/refs/heads/main/install.sh | bash
```

从本地仓库安装：

```bash
bash install.sh
```

安装后重启 CodeBuddy Code CLI。

卸载：

```bash
harness uninstall
```

卸载只移除本机安装的插件和 launcher，不删除业务项目里的 `.harness-engineer/` 和 `harness/`。

## 常用命令

检查安装：

```bash
harness doctor
```

初始化项目：

```bash
harness init --profile node
```

非 Node 项目可以先用空 profile：

```bash
harness init --profile generic
```

记录任务：

```bash
harness plan --task "给 checkout 失败重试补测试"
```

运行验证：

```bash
harness verify --profile default
```

查看状态和恢复建议：

```bash
harness status
harness recover
```

输出 review 可用的验证摘要：

```bash
harness evidence --summary
```

## 验证 Profile

Profile 放在 `harness/profiles/*.yaml`。

Node 项目：

```yaml
name: default
steps:
  - name: test
    command: npm test
    required: true
```

CMake 项目：

```yaml
name: default
steps:
  - name: configure
    command: cmake -S . -B build
    required: true
  - name: test
    command: cmake --build build && ctest --test-dir build --output-on-failure
    required: true
```

老项目可以先接一个 smoke test，再逐步补全：

```yaml
name: default
steps:
  - name: smoke
    command: ./scripts/smoke-test.sh
    required: true
  - name: lint-new-module
    command: ./scripts/lint.sh src/new-module
    required: false
```

规则很简单：

- `required: true`：必须通过，否则验证失败。
- `required: false`：只记录结果，不决定是否通过。
- 没有 required step 的 profile 不能通过验证。

诊断 profile：

```bash
harness profile list
harness profile show default
harness profile doctor default
```

如果 profile 是空的，或者只有 optional step，`harness verify --profile <name>` 会写入 `NO_VERIFICATION_STEPS`，并返回失败。这样可以避免“什么都没跑，但显示通过”。

## 自动执行

`harness run` 会让 CodeBuddy 依次跑 planner、executor、verifier。它适合边界清楚的小任务。需求不清楚时，先写计划，不要直接 run。

先 dry-run：

```bash
harness run --task "稳定 checkout retry 处理" --profile default --max-rounds 5 --dry-run
```

dry-run 不调用 CodeBuddy，也不写 `run.json`。它会告诉你：

- task
- profile 是否可用
- CodeBuddy 可执行文件路径
- headless 参数
- max rounds
- 将写入哪些产物
- 是否 ready

开始执行：

```bash
harness run --task "稳定 checkout retry 处理" --profile default --max-rounds 5
```

实际调用形式：

```text
codebuddy -p ... -y --permission-mode bypassPermissions --subagent-permission-mode bypassPermissions --agent <planner|executor|verifier>
```

只在你能接受这个权限级别的仓库里使用。

运行产物：

```text
.harness-engineer/spec.md
.harness-engineer/contract.md
.harness-engineer/run.json
.harness-engineer/evaluation.json
.harness-engineer/evidence.json
```

planner 必须输出 JSON：

```text
ready_to_execute, missing_requirements, spec_markdown, contract_markdown, summary
```

如果 `ready_to_execute=false`，执行会停在 `SPEC_NEEDS_CLARIFICATION`，不会进入 executor。

verifier 必须输出 JSON：

```text
pass, safe_to_continue, summary, fix_instructions
```

验证命令通过还不够，verifier 也必须返回 `pass: true`。verifier 输出不是合法 JSON 时，run 会以 `verifier_invalid_json` 停止。

继续上一次 run：

```bash
harness run --resume --max-rounds 8
```

resume 会读取 `.harness-engineer/run.json`、`evaluation.json` 和 `contract.md`，从下一轮 executor/verifier 继续。它不允许换 task，`--max-rounds` 只能不变或调高。

## 安全检查

Hook 会记录到：

```text
.harness-engineer/hook-events.jsonl
```

默认 shell policy 会拦截少量危险命令，例如：

- `git reset --hard`
- `git clean -fdx`
- 根目录级 `rm -rf /`

项目策略在：

```text
harness/policies/
```

手动检查一条命令：

```bash
harness policy-check --command "git reset --hard"
```

## 手动 Smoke

真实 CodeBuddy smoke 不放进自动测试，因为本机和 CI 不一定安装 CodeBuddy。

1. 找一个一次性测试仓库。
2. 配一个会通过的 `required: true` profile。
3. 跑 `harness run --task "做一个很小的无害修改" --dry-run`，确认 `ready: true`。
4. 跑 `harness run --task "做一个很小的无害修改" --max-rounds 1`。
5. 检查 `.harness-engineer/` 里的 run、spec、contract、evaluation、evidence。
6. 跑 `harness status` 和 `harness recover`，确认能看到停止原因和恢复建议。

## 目录

```text
.codebuddy-plugin/          CodeBuddy plugin 和 marketplace 声明
agents/                     planner、executor、verifier、debugger 提示词
bin/harness                 CLI wrapper
commands/                   CodeBuddy 斜杠命令
docs/                       文档
harness/profiles/           默认验证 profiles
harness/policies/           默认 shell、approval、file-scope 策略
hooks/                      CodeBuddy hook 注册和实现
scripts/cli.js              harness CLI 入口
scripts/harness-engine/     状态、profile、policy、run 编排
skills/                     CodeBuddy workflow skills
tests/                      Node 测试
```

## 开发

```bash
npm test
node scripts/cli.js doctor
node scripts/cli.js verify
```

这个仓库是 CodeBuddy 插件包，不是通用插件框架。

---

<a id="english"></a>

# Harness for CodeBuddy

Harness for CodeBuddy is a CodeBuddy Code CLI plugin. It turns planning, verification, recovery, and basic safety checks into repeatable commands instead of ad hoc chat instructions.

It installs:

- CodeBuddy slash commands
- workflow skills
- planner / executor / verifier / debugger agents
- hooks
- a local `harness` CLI

Project state is written to `.harness-engineer/`. Verification commands live in `harness/profiles/`.

## Install

Install from GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/gongp0615/harness-for-codebuddy/refs/heads/main/install.sh | bash
```

In an interactive terminal, the installer asks how to configure Harness agent models. The default is a recommended balanced preset; you can also choose Claude-only, OpenAI-only, fast/budget, per-agent customization, or skipped model configuration. CI and non-TTY environments skip prompts; use environment variables for unattended installs:

```bash
HARNESS_AGENT_MODEL_MODE=custom \
HARNESS_AGENT_MODEL_PLANNER=gpt-5.4 \
HARNESS_AGENT_MODEL_EXECUTOR=claude-sonnet-4.6 \
HARNESS_AGENT_MODEL_VERIFIER=gpt-5.3-codex \
HARNESS_AGENT_MODEL_DEBUGGER=gemini-3.1-pro \
curl -fsSL https://raw.githubusercontent.com/gongp0615/harness-for-codebuddy/refs/heads/main/install.sh | bash
```

Install from a local checkout:

```bash
bash install.sh
```

Restart CodeBuddy Code CLI after installation.

Uninstall:

```bash
harness uninstall
```

Uninstall removes the local plugin install and launcher. It does not delete `.harness-engineer/` or `harness/` from your project.

## Common Commands

Check the install:

```bash
harness doctor
```

Initialize a project:

```bash
harness init --profile node
```

For non-Node projects, start with an empty profile:

```bash
harness init --profile generic
```

Record a task:

```bash
harness plan --task "add retry tests for failed checkout submissions"
```

Run verification:

```bash
harness verify --profile default
```

Check status and recovery guidance:

```bash
harness status
harness recover
```

Print evidence for review:

```bash
harness evidence --summary
```

## Verification Profiles

Profiles are stored in `harness/profiles/*.yaml`.

Node project:

```yaml
name: default
steps:
  - name: test
    command: npm test
    required: true
```

CMake project:

```yaml
name: default
steps:
  - name: configure
    command: cmake -S . -B build
    required: true
  - name: test
    command: cmake --build build && ctest --test-dir build --output-on-failure
    required: true
```

Legacy project:

```yaml
name: default
steps:
  - name: smoke
    command: ./scripts/smoke-test.sh
    required: true
  - name: lint-new-module
    command: ./scripts/lint.sh src/new-module
    required: false
```

Rules:

- `required: true`: must pass.
- `required: false`: recorded, but does not decide success.
- A profile with no required step cannot pass verification.

Inspect profiles:

```bash
harness profile list
harness profile show default
harness profile doctor default
```

Empty profiles and optional-only profiles fail with `NO_VERIFICATION_STEPS`. This prevents a run from passing when nothing meaningful ran.

## Automated Run

`harness run` calls CodeBuddy planner, executor, and verifier in sequence. Use it for small tasks with clear boundaries. If the task is vague, write a plan first.

Dry-run first:

```bash
harness run --task "stabilize checkout retry handling" --profile default --max-rounds 5 --dry-run
```

Dry-run does not call CodeBuddy and does not write `run.json`. It prints the task, profile readiness, CodeBuddy path, headless args, max rounds, artifact paths, and whether the run is ready.

Start a run:

```bash
harness run --task "stabilize checkout retry handling" --profile default --max-rounds 5
```

The command uses:

```text
codebuddy -p ... -y --permission-mode bypassPermissions --subagent-permission-mode bypassPermissions --agent <planner|executor|verifier>
```

Use it only in repositories where that permission mode is acceptable.

Run artifacts:

```text
.harness-engineer/spec.md
.harness-engineer/contract.md
.harness-engineer/run.json
.harness-engineer/evaluation.json
.harness-engineer/evidence.json
```

Planner JSON:

```text
ready_to_execute, missing_requirements, spec_markdown, contract_markdown, summary
```

If `ready_to_execute=false`, the run stops at `SPEC_NEEDS_CLARIFICATION` before executor.

Verifier JSON:

```text
pass, safe_to_continue, summary, fix_instructions
```

Passing shell commands are not enough. Required verification must pass, and verifier must return `pass: true`. Invalid verifier JSON stops with `verifier_invalid_json`.

Resume a run:

```bash
harness run --resume --max-rounds 8
```

Resume reads `.harness-engineer/run.json`, `evaluation.json`, and `contract.md`, then continues from the next executor/verifier round. It cannot change the task. `--max-rounds` can only stay the same or increase.

## Safety Checks

Hook events are written to:

```text
.harness-engineer/hook-events.jsonl
```

The default shell policy blocks a small set of dangerous commands, including:

- `git reset --hard`
- `git clean -fdx`
- root-level `rm -rf /`

Project policies live in:

```text
harness/policies/
```

Check a command manually:

```bash
harness policy-check --command "git reset --hard"
```

## Manual Smoke

Real CodeBuddy smoke is manual because local and CI environments may not have CodeBuddy installed.

1. Use a disposable repository.
2. Configure a passing `required: true` profile.
3. Run `harness run --task "make a tiny harmless change" --dry-run` and confirm `ready: true`.
4. Run `harness run --task "make a tiny harmless change" --max-rounds 1`.
5. Check `.harness-engineer/` for run, spec, contract, evaluation, and evidence files.
6. Run `harness status` and `harness recover`.

## Layout

```text
.codebuddy-plugin/          CodeBuddy plugin and marketplace manifests
agents/                     planner, executor, verifier, debugger prompts
bin/harness                 CLI wrapper
commands/                   CodeBuddy slash commands
docs/                       docs
harness/profiles/           default verification profiles
harness/policies/           default shell, approval, and file-scope policies
hooks/                      CodeBuddy hook registry and implementations
scripts/cli.js              harness CLI entrypoint
scripts/harness-engine/     state, profile, policy, run orchestration
skills/                     CodeBuddy workflow skills
tests/                      Node tests
```

## Development

```bash
npm test
node scripts/cli.js doctor
node scripts/cli.js verify
```

This repository is a CodeBuddy plugin package, not a general plugin framework.
