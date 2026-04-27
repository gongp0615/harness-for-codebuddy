# Harness for CodeBuddy

Harness for CodeBuddy 是一个 CodeBuddy Code CLI 插件，用来给编码会话加一层轻量工程控制面：规划、验证、恢复、profile 诊断、安全策略和有上限的自治执行。

它不是提示词包。这个仓库会安装 CodeBuddy 斜杠命令、skills、agents、hooks 和本地 `harness` CLI。业务项目的状态和证据写在 `.harness-engineer/`。

英文文档见 [README.md](README.md)。

## 提供什么

- init、plan、run、verify、status、recover、evidence、doctor、policy-check 等斜杠命令。
- planner、executor、verifier、debugger 四类 CodeBuddy agent。
- 基于 hook 的基础安全门禁，阻断明显破坏性的 shell 命令。
- `harness/profiles/*.yaml` 验证 profile。
- `.harness-engineer/` 项目状态：任务状态、计划、规格、契约、证据、评估、风险和 hook 日志。
- 有上限的自治循环：planner -> executor -> verifier -> fix。
- profile 诊断，避免空验证假通过。

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

从本地 checkout 安装：

```bash
bash install.sh
```

安装器会注册本地 CodeBuddy marketplace：

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/marketplaces/harness-engineer
```

并更新：

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/settings.json
```

安装或更新插件后，重启 CodeBuddy Code CLI。

卸载：

```bash
harness uninstall
```

卸载会移除本地 marketplace 条目，在 CodeBuddy settings 中禁用插件，删除已安装插件副本，并移除本地 `harness` launcher。它不会删除业务项目中的 `.harness-engineer/` 或 `harness/` 目录。

## 首次使用

检查插件安装：

```bash
harness doctor
```

初始化项目：

```bash
harness init --profile node
```

非 Node 项目：

```bash
harness init --profile generic
```

可选 CI 设置：

```bash
harness init --profile node --ci github
harness init --profile node --ci generic
```

记录一个受监督计划：

```bash
harness plan --task "给 checkout 失败重试补测试"
```

`harness plan` 会在 `.harness-engineer/` 下写入 `plan.md`、`spec.md` 和 `contract.md`，让监督式和自治式流程共享同一套任务语义。

## 验证 Profile

Profile 位于 `harness/profiles/*.yaml`。

Node 示例：

```yaml
name: default
steps:
  - name: test
    command: npm test
    required: true
```

C++ CMake 示例：

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

老项目渐进接入示例：

```yaml
name: default
steps:
  - name: smoke
    command: ./scripts/smoke-test.sh
    required: true
  - name: lint-known-clean-area
    command: ./scripts/lint.sh src/new-module
    required: false
```

用 `required: true` 表示 review 或自治完成前必须通过的命令。`required: false` 只适合提示性检查。

诊断 profile：

```bash
harness profile list
harness profile show default
harness profile doctor default
```

空 profile 和只有 optional step 的 profile 会失败关闭。`harness verify --profile <name>` 只有在至少存在一个可执行的 `required: true` step 时才可能成功，否则会写入 `NO_VERIFICATION_STEPS` evidence。

运行验证：

```bash
harness verify --profile default
```

输出 review 可用证据摘要：

```bash
harness evidence --summary
```

## 自治运行

只有当任务需求足够清楚、可以在无新增需求的情况下执行时，才使用自治模式。模糊任务应先 plan 或澄清。

先预检，不调用 CodeBuddy：

```bash
harness run --task "稳定 checkout retry 处理" --profile default --max-rounds 5 --dry-run
```

dry-run 不写 `.harness-engineer/run.json`。它会输出 task、profile 诊断、CodeBuddy 可执行文件、headless 权限参数、最大轮数、产物路径和 `ready`。如果 `ready=false`，退出码是 1。

启动有上限的自治 run：

```bash
harness run --task "稳定 checkout retry 处理" --profile default --max-rounds 5
```

Harness 会用 headless 方式调用 CodeBuddy：

```text
codebuddy -p ... -y --permission-mode bypassPermissions --subagent-permission-mode bypassPermissions --agent <planner|executor|verifier>
```

只在你接受这个权限级别的仓库中使用。

自治产物：

```text
.harness-engineer/spec.md
.harness-engineer/contract.md
.harness-engineer/run.json
.harness-engineer/evaluation.json
.harness-engineer/evidence.json
```

planner 必须输出严格 JSON：

```text
ready_to_execute, missing_requirements, spec_markdown, contract_markdown, summary
```

如果 `ready_to_execute=false`，run 会停在 `SPEC_NEEDS_CLARIFICATION`，不会调用 executor。

verifier 必须输出严格 JSON：

```text
pass, safe_to_continue, summary, fix_instructions
```

verifier JSON 无效时会以 `verifier_invalid_json` 停止。验证命令通过本身还不够；required verification 必须通过，并且 verifier 必须返回 `pass: true`。

停止条件：

- required verification 通过，且 verifier 返回 `pass: true`。
- planner 判断需求缺失。
- 达到 `--max-rounds`。
- 找不到 CodeBuddy，或 headless agent 调用失败。
- planner 或 verifier JSON 无效。
- verifier 返回 `safe_to_continue: false`。

从已停止 run 继续，不重跑 planner：

```bash
harness run --resume --max-rounds 8
```

resume 会读取 `.harness-engineer/run.json`、`evaluation.json` 和 `contract.md`，从下一轮 executor/verifier 继续。它不允许更换 task。`--max-rounds` 只能保持不变或调高。

查看状态和恢复建议：

```bash
harness status
harness recover
```

## 安全策略

插件注册 CodeBuddy hooks，用于会话生命周期和工具调用检查。Hook 事件写入：

```text
.harness-engineer/hook-events.jsonl
```

默认 shell policy 只阻断少量破坏性命令，包括 `git reset --hard`、`git clean -fdx` 和根目录级 `rm -rf /`。项目策略位于：

```text
harness/policies/
```

手动检查策略：

```bash
harness policy-check --command "git reset --hard"
```

## 真实 CodeBuddy Smoke

真实 CodeBuddy smoke 采用手动流程，避免自动测试依赖本机 CodeBuddy 安装。

1. 在一次性仓库中配置一个会通过的 `required: true` profile。
2. 运行 `harness run --task "做一个很小的无害修改" --dry-run`，确认 `ready: true`。
3. 运行 `harness run --task "做一个很小的无害修改" --max-rounds 1`。
4. 确认 `.harness-engineer/run.json`、`spec.md`、`contract.md`、`evaluation.json`、`evidence.json` 都存在。
5. 确认 `harness status` 和 `harness recover` 能显示停止原因和 resume 建议。

## 仓库结构

```text
.codebuddy-plugin/          CodeBuddy plugin 和 marketplace 声明
agents/                     planner、executor、verifier、debugger 提示词
bin/harness                 CLI wrapper
commands/                   CodeBuddy 斜杠命令
docs/                       用户和 AI engineering 文档
harness/profiles/           默认验证 profiles
harness/policies/           默认 shell、approval、file-scope 策略
hooks/                      CodeBuddy hook 注册和实现
scripts/cli.js              harness CLI 入口
scripts/harness-engine/     状态、profile、policy 和自治编排
skills/                     CodeBuddy workflow skills
tests/                      Node 测试套件
```

## 开发

```bash
npm test
node scripts/cli.js doctor
node scripts/cli.js verify
```

这个仓库是 CodeBuddy 专用插件包，不是跨平台插件包。
