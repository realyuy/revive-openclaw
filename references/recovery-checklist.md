# OpenClaw 恢复检查清单

## 先做版本对照

在任何真实恢复前，先确认三件事：

1. 备份是哪个 OpenClaw 版本产出的
2. 当前目标机器准备恢复到哪个 OpenClaw 版本
3. 对应 release / docs 是否有 breaking changes、迁移、restart 修复、cron 兼容变化

建议优先查：
- 目标版本的 GitHub release
- 本地 docs
- 备份目录中的 manifest / metadata / 时间戳

如果版本不一致，先生成迁移提醒，再决定是否继续执行完整恢复。

## 前置条件

- [ ] OpenClaw CLI 已安装 (`openclaw --version`)
- [ ] Node.js 版本 >= 18
- [ ] shell 可用，支持在 TUI / SSH 下执行脚本
- [ ] 目标目录可写
- [ ] 备份源可读
- [ ] 若要做完整验证，至少有一个可用 provider / model

## Dry-Run / Plan-Only 检查

Dry-run 不能只说“找到备份”。必须总结备份里实际存在什么：

- [ ] 配置类：`openclaw.json`、`mcporter.json`、`channels`
- [ ] 记忆类：`MEMORY.md`、`memory/`、`memory.db`、`.learnings`
- [ ] 自动化类：`cron/jobs.json`
- [ ] 扩展类：`skills/`、`plugins/`、`extensions/`
- [ ] 工作区类：`workspace/scripts/`、`workspace/tools/`、`workspace/config/`、`workspace/workflows/`
- [ ] 本地扩展类：Obsidian / 多代理 / 自我学习体系等
- [ ] Secrets 是否已存在于配置中，还是只恢复框架

Dry-run 输出至少应包含：
- 可恢复模块
- 缺失模块
- 版本风险
- 需要用户补全的 secrets
- 建议恢复模式（minimal / standard / full / selective）

## 通用 vs 本地定制

恢复时必须区分：

### 通用 OpenClaw 模块
- `openclaw.json`
- `config/mcporter.json`
- `cron/jobs.json`
- `workspace/MEMORY.md`
- `workspace/memory/`
- `skills/`
- `workspace/config/`

### 本地定制模块
- Obsidian 联动文件
- 多代理工作文档
- 自我学习 / 进化脚本
- 投资 / 微信等本地自动化目录

如果检测到本地定制模块，应提示：
- 这是当前机器特有扩展
- 其他用户可能没有这些目录
- 可以恢复，也可以跳过

## 恢复模式选择

| 模式 | 适用场景 | 恢复内容 |
|------|----------|----------|
| `minimal` | 先把系统拉起来 | 核心配置 + 启动必需项 |
| `standard` | 日常恢复 | 配置 + 记忆 + cron |
| `full` | 完整重装后恢复 | 所有标准模块 + 选中的本地扩展 |
| `selective` | 手工控制 | 用户勾选的模块 |

## Secrets / Channels 规则

- [ ] `openclaw.json` 中已有的 channel token / API key / provider config 可以直接恢复
- [ ] 备份中不存在的 secrets 不得假装恢复成功
- [ ] OAuth / session / device-bound auth 默认保守处理
- [ ] 报告里必须列出“需人工补全项”

## TUI / SSH 友好要求

- [ ] 提供纯命令行入口
- [ ] 支持 `--dry-run`
- [ ] 支持 `--plan-only`
- [ ] 支持 `--resume`
- [ ] 支持编号选择或文本确认
- [ ] 生成 Markdown 报告和 JSON/状态文件

## 恢复后验证

- [ ] `openclaw status`
- [ ] gateway 可启动
- [ ] `openclaw cron list`
- [ ] `mcporter list` / 关键 MCP 可读
- [ ] `workspace/MEMORY.md` 与 `workspace/memory/` 可读
- [ ] 关键 skills 存在
- [ ] 需要人工补齐的 secrets 已列清楚

## 紧急原则

- 先做 dry-run，再做真实恢复
- 版本不一致时，先看对应 release 文档
- 不能先承诺“完整可恢复”，再回头补兼容
