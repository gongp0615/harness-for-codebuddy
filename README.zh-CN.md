# Harness for CodeBuddy

Harness for CodeBuddy 是一个 **CodeBuddy Code CLI 插件**，用于给日常编码任务加上一层工程控制面。

它不是单纯的提示词包。这个插件同时提供 CodeBuddy 斜杠命令、skills、agents、hooks 和本地 `harness` CLI，让 CodeBuddy 能围绕计划、状态、验证、恢复和基础安全门禁工作，而不是只靠一次性对话推进任务。

## 它提供什么

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

## 典型工作流

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

## 安装

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

非交互安装默认跳过 CI 设置；如果要自动启用，可以设置：

```bash
HARNESS_INSTALL_CI=github bash install.sh
HARNESS_INSTALL_CI=generic bash install.sh
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

## 验证安装

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
harness verify --profile default
```

首次接入业务项目时初始化项目配置：

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

输出可用于 PR 的验证摘要：

```bash
harness evidence --summary
```

## 插件结构

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

## Hook 行为

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

## 当前范围

这是一个 alpha 阶段插件，重点是受监督工程会话：

- 适合 bugfix、小功能、测试补齐和 review feedback 修复。
- 验证 profiles 可以按项目配置；未指定 profile 时仍兼容 Node 项目的 `package.json` scripts 自动发现。
- YAML 是项目级配置，不需要每次业务开发都编写。通常由团队在接入项目或新增长期业务域时维护，日常开发只选择已有 profile。
- 它不替代 CodeBuddy 自身推理能力，而是给 CodeBuddy 增加更强的工作流结构和证据门禁。
- 实际 UI 加载效果取决于 CodeBuddy 的插件加载器和 Hook 实现。

## 开发

```bash
npm test
npm run harness -- doctor
node scripts/cli.js verify
```

这个仓库是 **CodeBuddy 专用插件包**，不是跨平台兼容插件包。
