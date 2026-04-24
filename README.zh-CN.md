# Harness Engineer for CodeBuddy

面向 CodeBuddy Code CLI 的工程控制插件。

它提供：

- `.codebuddy-plugin/plugin.json` 插件声明
- `commands/` 下的斜杠命令
- `skills/` 下的可复用工作流
- `agents/` 下的角色提示词
- `hooks/hooks.json` 下的 CodeBuddy Hook 配置
- `harness` 本地 CLI，用于安装、自检、状态和验证

## 安装

本地安装：

```bash
bash install.sh
```

从 GitHub 安装：

```bash
curl -fsSL https://raw.githubusercontent.com/gongp0615/harness-engineer/refs/heads/main/install.sh | bash
```

安装器会写入本地 CodeBuddy marketplace：

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/marketplaces/harness-engineer
```

并更新：

```text
${CODEBUDDY_HOME:-$HOME/.codebuddy}/settings.json
```

## 验证

```bash
harness doctor
harness status
harness verify
```
