# Harness for CodeBuddy

[中文](#中文) | [English](#english)

## 中文

Harness for CodeBuddy 是一个 **CodeBuddy Code CLI 插件**，用于给日常编码任务加上一层轻量工程控制面。

它不是单纯的提示词包。这个插件同时提供 CodeBuddy 斜杠命令、skills、agents、hooks 和本地 `harness` CLI，让 CodeBuddy 能围绕计划、状态、验证、恢复和基础安全门禁工作，而不是只靠一次性对话推进任务。

### 它提供什么

- **斜杠命令**：
  `/harness-engineer:plan`、`/harness-engineer:verify`、`/harness-engineer:status`、`/harness-engineer:doctor`、`/harness-engineer:recover`
- **Skills**：规划、执行、验证、状态检查、恢复和安装诊断工作流。
- **Agents**：planner、executor、verifier、debugger 四类角色提示词。
- **Hooks**：接入 CodeBuddy 会话生命周期和工具调用门禁。
- **安全策略**：阻断少量明显高风险 shell 命令，例如 `git reset --hard`、`git clean -fdx`、根目录级 `rm -rf /`。
- **验证发现**：针对 Node 项目按顺序运行已有脚本：`typecheck`、`lint`、`test`、`build`。
- **本地 marketplace 安装器**：自动把插件注册到 CodeBuddy settings。

### 典型工作流

```text
/harness-engineer:plan 给 checkout 失败重试补测试
/harness-engineer:status
/harness-engineer:verify
/harness-engineer:recover
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

安装器会写入本地 CodeBuddy marketplace：

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/marketplaces/harness-engineer
```

并更新：

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/settings.json
```

启用或更新插件后，重启 CodeBuddy Code CLI，让插件元数据重新加载。

### 验证安装

```bash
harness doctor
```

预期结果：所有检查都是 `"ok": true`。

查看当前项目状态：

```bash
harness status
```

运行自动发现的项目验证命令：

```bash
harness verify
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
scripts/installer.js            本地 CodeBuddy marketplace 安装器
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

这是一个 alpha 阶段插件，重点是受监督工程会话：

- 适合 bugfix、小功能、测试补齐和 review feedback 修复。
- 验证发现当前主要覆盖 Node 项目的 `package.json` scripts。
- 它不替代 CodeBuddy 自身推理能力，而是给 CodeBuddy 增加更强的工作流结构和证据门禁。
- 实际 UI 加载效果取决于 CodeBuddy 的插件加载器和 Hook 实现。

### 开发

```bash
npm test
npm run harness -- doctor
node scripts/cli.js verify
```

这个仓库现在只面向 **CodeBuddy**，不维护 Codex 插件兼容。

## English

Harness for CodeBuddy is a **CodeBuddy Code CLI plugin** that adds a lightweight engineering control plane for day-to-day coding tasks.

It is not a generic prompt pack. The plugin bundles CodeBuddy slash commands, skills, agents, hooks, and a small `harness` CLI so CodeBuddy can plan work, preserve task state, run verification, and block obviously dangerous shell actions before they reach your project.

### What It Adds

- **Slash commands** for common engineering checkpoints:
  `/harness-engineer:plan`, `/harness-engineer:verify`, `/harness-engineer:status`, `/harness-engineer:doctor`, `/harness-engineer:recover`
- **Skills** that guide planning, execution, verification, status checks, recovery, and install diagnosis.
- **Role agents** for planner, executor, verifier, and debugger work.
- **Hooks** for CodeBuddy session lifecycle and tool-use gates.
- **Safety policy** that blocks high-risk shell commands such as `git reset --hard`, `git clean -fdx`, and root-level `rm -rf /`.
- **Verification discovery** for Node projects, running available scripts in this order: `typecheck`, `lint`, `test`, `build`.
- **Local marketplace installer** that registers the plugin in CodeBuddy settings.

### Typical Workflow

```text
/harness-engineer:plan add retry tests for failed checkout submissions
/harness-engineer:status
/harness-engineer:verify
/harness-engineer:recover
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

The installer writes a local CodeBuddy marketplace to:

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/marketplaces/harness-engineer
```

It also updates:

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/settings.json
```

After enabling or changing plugins, restart CodeBuddy Code CLI so it reloads plugin metadata.

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

This is an alpha plugin focused on supervised engineering sessions:

- Works best for bug fixes, small features, test additions, and review feedback.
- Verification discovery currently targets Node projects through `package.json` scripts.
- It does not replace CodeBuddy's built-in reasoning; it gives CodeBuddy stronger workflow structure and evidence gates.
- Live CodeBuddy UI behavior depends on CodeBuddy's plugin loader and hook implementation.

### Development

```bash
npm test
npm run harness -- doctor
node scripts/cli.js verify
```

This repository intentionally targets **CodeBuddy only**. Codex plugin compatibility is not maintained.
