# Harness for CodeBuddy

[English](#english) | [中文](#中文)

## English

Harness for CodeBuddy is a **CodeBuddy Code CLI plugin** that adds an engineering control plane for day-to-day coding tasks.

It is not a generic prompt pack. The plugin bundles CodeBuddy slash commands, skills, agents, hooks, and a small `harness` CLI so CodeBuddy can plan work, preserve task state, run verification, and block obviously dangerous shell actions before they reach your project.

### What It Adds

- **Slash commands** for common engineering checkpoints:
  `/harness-engineer:init`, `/harness-engineer:plan`, `/harness-engineer:verify`, `/harness-engineer:status`, `/harness-engineer:doctor`, `/harness-engineer:recover`, `/harness-engineer:evidence`, `/harness-engineer:policy-check`
- **Skills** that guide planning, execution, verification, status checks, recovery, and install diagnosis.
- **Role agents** for planner, executor, verifier, and debugger work.
- **Hooks** for CodeBuddy session lifecycle and tool-use gates.
- **Safety policy** that blocks high-risk shell commands such as `git reset --hard`, `git clean -fdx`, and root-level `rm -rf /`.
- **Task state** in `.harness-engineer/`: `task.json`, `plan.md`, `evidence.json`, `risks.md`, hook logs, and `verify-cache/`.
- **Verification profiles** in `harness/profiles/*.yaml`, with required and optional steps.
- **Configurable policies** in `harness/policies/` for shell commands, file scope, and approval gates.
- **Local marketplace installer** that registers the plugin in CodeBuddy settings.

### Typical Workflow

```text
/harness-engineer:plan add retry tests for failed checkout submissions
/harness-engineer:status
/harness-engineer:verify
/harness-engineer:recover
/harness-engineer:evidence
```

The intent is to keep a coding session honest:

1. Plan before edits when the task is non-trivial.
2. Execute in small, reversible steps.
3. Run the verification command that proves the change.
4. Report remaining risks instead of guessing.
5. Recover context after an interrupted session.

### Install

From GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/gongp0615/harness-for-codebuddy/refs/heads/main/install.sh | bash
```

From a local checkout:

```bash
bash install.sh
```

During interactive installation, the script asks which CI setup to create for the current directory:

- `none`: skip CI setup.
- `github`: create `.github/workflows/harness.yml`.
- `generic`: create `harness/ci/harness-ci.md` with the command to add to another CI system.

Non-interactive installs skip CI setup unless `HARNESS_INSTALL_CI=github` or `HARNESS_INSTALL_CI=generic` is set.

The installer writes a local CodeBuddy marketplace to:

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/marketplaces/harness-engineer
```

It also updates:

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/settings.json
```

After enabling or changing plugins, restart CodeBuddy Code CLI so it reloads plugin metadata.

### Uninstall

```bash
harness uninstall
```

This removes the local CodeBuddy marketplace entry, disables `harness-engineer@harness-engineer-local` in CodeBuddy settings, deletes the installed plugin copy, and removes the local `harness` launcher. It does not delete project-level `.harness-engineer/` or `harness/` directories because those contain task evidence and project configuration.

### Verify Installation

```bash
harness doctor
```

Expected result: every check reports `"ok": true`.

You can also inspect current project state:

```bash
harness status
```

Run discovered project verification commands:

```bash
harness verify
```

### Autonomous Runs

For long-running engineering tasks, use the explicit autonomous entrypoint:

```bash
harness run --task "add retry tests for failed checkout submissions"
```

`harness run` drives CodeBuddy headless through a bounded loop:

```text
planner -> executor -> verifier -> fix
```

The default profile is `default` and the default limit is 5 rounds:

```bash
harness run --task "stabilize checkout retry handling" --profile ci --max-rounds 3
```

The harness invokes CodeBuddy with full headless permissions:

```text
codebuddy -p ... -y --permission-mode bypassPermissions --subagent-permission-mode bypassPermissions --agent <planner|executor|verifier>
```

Use this only in a repository where that permission level is acceptable. The hard stops are: required verification passes, `--max-rounds` is reached, CodeBuddy is unavailable or fails, or the verifier marks the task unsafe to continue.

Autonomous artifacts are written under `.harness-engineer/`:

```text
spec.md          planner-generated task spec, non-goals, acceptance criteria
contract.md      round contract and evaluator fix instructions
run.json         run id, rounds, agent outputs, and stop reason
evaluation.json  verifier judgment against evidence and contract
evidence.json    verification profile evidence
```

`harness status` includes the current autonomous round, last evaluator result, and stop reason. `harness recover` points to the next action after interruption or `MAX_ROUNDS_REACHED`.

### Plugin Contents

```text
.codebuddy-plugin/plugin.json   CodeBuddy plugin manifest
.codebuddy-plugin/marketplace.json
commands/                       User-triggered slash commands
skills/                         AI-selected workflow skills
agents/                         Planner/executor/verifier/debugger prompts
hooks/hooks.json                CodeBuddy hook registration
hooks/*.js                      Hook implementations and safety policy
scripts/cli.js                  harness CLI entrypoint
scripts/installer.js            local CodeBuddy marketplace installer
bin/harness                     CLI wrapper
```

### Hook Behavior

The plugin registers these CodeBuddy hook events:

- `SessionStart`
- `PreToolUse`
- `PostToolUse`
- `Stop`
- `PreCompact`

Hook events are recorded under the current project:

```text
.harness-engineer/hook-events.jsonl
```

`PreToolUse` includes a small safety policy for shell commands. It blocks a narrow set of destructive commands and lets normal tool use continue.

### Current Scope

This is an alpha plugin focused on supervised engineering sessions and explicit bounded autonomous runs:

- Works best for bug fixes, small features, test additions, and review feedback.
- Verification profiles can be configured per project; legacy verification still discovers Node scripts from `package.json` when no profile is requested.
- Autonomous mode is started only by `harness run`; hooks do not start it automatically.
- UI/browser QA should be configured as verification profile steps, for example via Playwright in the target project.
- It does not replace CodeBuddy's built-in reasoning; it gives CodeBuddy stronger workflow structure and evidence gates.
- Live CodeBuddy UI behavior depends on CodeBuddy's plugin loader and hook implementation.

### Development

```bash
npm test
npm run harness -- doctor
node scripts/cli.js verify
```

This repository is a **CodeBuddy-specific plugin package**, not a cross-platform compatibility plugin bundle.

## 中文

Harness for CodeBuddy 是一个 **CodeBuddy Code CLI 插件**，用于给日常编码任务加上一层轻量工程控制面。

它不是单纯的提示词包。这个插件同时提供 CodeBuddy 斜杠命令、skills、agents、hooks 和本地 `harness` CLI，让 CodeBuddy 能围绕计划、状态、验证、恢复和基础安全门禁工作，而不是只靠一次性对话推进任务。

### 它提供什么

- **斜杠命令**：
  `/harness-engineer:init`、`/harness-engineer:plan`、`/harness-engineer:verify`、`/harness-engineer:status`、`/harness-engineer:doctor`、`/harness-engineer:recover`、`/harness-engineer:evidence`、`/harness-engineer:policy-check`
- **Skills**：规划、执行、验证、状态检查、恢复和安装诊断工作流。
- **Agents**：planner、executor、verifier、debugger 四类角色提示词。
- **Hooks**：接入 CodeBuddy 会话生命周期和工具调用门禁。
- **安全策略**：阻断少量明显高风险 shell 命令，例如 `git reset --hard`、`git clean -fdx`、根目录级 `rm -rf /`。
- **任务状态目录**：在业务项目中维护 `.harness-engineer/`，包含 `task.json`、`plan.md`、`evidence.json`、`risks.md`、Hook 日志和验证缓存。
- **验证 profiles**：通过 `harness/profiles/*.yaml` 固化项目、业务域或 CI 的验证命令。
- **可配置策略**：通过 `harness/policies/*.yaml` 管理 shell 命令、文件写入范围和审批门禁。
- **本地 marketplace 安装器**：自动把插件注册到 CodeBuddy settings。

### 典型工作流

```text
/harness-engineer:plan 给 checkout 失败重试补测试
/harness-engineer:status
/harness-engineer:verify
/harness-engineer:recover
/harness-engineer:evidence
```

目标是让编码过程更可控：

1. 非平凡任务先计划。
2. 小步、可回退地执行。
3. 用验证命令证明修改有效。
4. 如实报告剩余风险，而不是猜测完成。
5. 会话中断后能恢复上下文。

### 安装

从 GitHub 安装：

```bash
curl -fsSL https://raw.githubusercontent.com/gongp0615/harness-for-codebuddy/refs/heads/main/install.sh | bash
```

本地安装：

```bash
bash install.sh
```

交互式安装时，脚本会询问当前目录要使用哪种 CI 接入方式：

- `none`：跳过 CI 设置。
- `github`：创建 `.github/workflows/harness.yml`。
- `generic`：创建 `harness/ci/harness-ci.md`，里面给出可接入其他 CI 系统的命令。

非交互安装默认跳过 CI 设置；如果要自动启用，可以设置 `HARNESS_INSTALL_CI=github` 或 `HARNESS_INSTALL_CI=generic`。

安装器会写入本地 CodeBuddy marketplace：

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/marketplaces/harness-engineer
```

并更新：

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/settings.json
```

启用或更新插件后，重启 CodeBuddy Code CLI，让插件元数据重新加载。

### 卸载

```bash
harness uninstall
```

这个命令会移除本地 CodeBuddy marketplace 配置，禁用 `harness-engineer@harness-engineer-local`，删除已安装的插件副本，并移除本地 `harness` launcher。它不会删除业务项目里的 `.harness-engineer/` 或 `harness/` 目录，因为这些目录包含任务证据和项目配置。

### 验证安装

```bash
harness doctor
```

预期结果：所有检查都是 `"ok": true`。

查看当前项目状态：

```bash
harness status
```

初始化项目级 Harness 配置：

```bash
harness init --profile node
```

非 Node 项目可以使用：

```bash
harness init --profile generic
```

如果要同时生成 CI 接入文件：

```bash
harness init --profile node --ci github
harness init --profile node --ci generic
```

运行默认验证 profile：

```bash
harness verify --profile default
```

### 自治运行

对于较长的工程任务，可以显式启动自治入口：

```bash
harness run --task "给 checkout 失败重试补测试"
```

`harness run` 会用 CodeBuddy headless 跑有上限的 `planner -> executor -> verifier -> fix` 循环。默认 profile 是 `default`，默认最多 5 轮：

```bash
harness run --task "稳定 checkout retry 处理" --profile ci --max-rounds 3
```

运行时会使用完整 headless 权限：

```text
codebuddy -p ... -y --permission-mode bypassPermissions --subagent-permission-mode bypassPermissions --agent <planner|executor|verifier>
```

只在你接受这个权限级别的仓库中使用。硬停止条件包括 required verification 通过、达到 `--max-rounds`、CodeBuddy 不存在或调用失败、verifier 判断继续推进不安全。

自治产物会写入 `.harness-engineer/spec.md`、`contract.md`、`run.json`、`evaluation.json` 和 `evidence.json`。`harness status` 会显示当前轮次、最后 evaluator 结论和停止原因；`harness recover` 会在中断或 `MAX_ROUNDS_REACHED` 后提示下一步。

输出可用于 PR 的验证摘要：

```bash
harness evidence --summary
```

### 插件结构

```text
.codebuddy-plugin/plugin.json   CodeBuddy 插件声明
.codebuddy-plugin/marketplace.json
commands/                       用户主动触发的斜杠命令
skills/                         AI 自动选择的工作流能力
agents/                         planner/executor/verifier/debugger 提示词
hooks/hooks.json                CodeBuddy Hook 注册
hooks/*.js                      Hook 实现和安全策略
scripts/cli.js                  harness CLI 入口
scripts/harness-engine/         状态机、profile runner、策略引擎
scripts/installer.js            本地 CodeBuddy marketplace 安装器
harness/                        默认 profiles、policies 和模板
docs/ai-engineering/            团队工作流、验证、策略和 review 文档
bin/harness                     CLI wrapper
```

### Hook 行为

插件注册这些 CodeBuddy Hook 事件：

- `SessionStart`
- `PreToolUse`
- `PostToolUse`
- `Stop`
- `PreCompact`

Hook 事件会记录到当前项目：

```text
.harness-engineer/hook-events.jsonl
```

`PreToolUse` 带有一个小范围 shell 安全策略：只阻断少量破坏性命令，正常工具调用会继续执行。

### 当前范围

这是一个 alpha 阶段插件，重点是受监督工程会话和显式、有轮次上限的自治运行：

- 适合 bugfix、小功能、测试补齐和 review feedback 修复。
- 验证 profiles 可以按项目配置；未指定 profile 时仍兼容 Node 项目的 `package.json` scripts 自动发现。
- YAML 是项目级配置，不需要每次业务开发都编写。通常由团队在接入项目或新增长期业务域时维护，日常开发只选择已有 profile。
- 自治模式只会通过 `harness run` 启动；hooks 不会自动启动自治执行。
- UI/browser QA 应作为目标项目自己的 verification profile step 配置，例如使用 Playwright 或等价命令。
- 它不替代 CodeBuddy 自身推理能力，而是给 CodeBuddy 增加更强的工作流结构和证据门禁。
- 实际 UI 加载效果取决于 CodeBuddy 的插件加载器和 Hook 实现。

### 开发

```bash
npm test
npm run harness -- doctor
node scripts/cli.js verify
```

这个仓库是 **CodeBuddy 专用插件包**，不是跨平台兼容插件包。
