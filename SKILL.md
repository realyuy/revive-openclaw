---
name: revive-openclaw
description: Recover an OpenClaw installation after restart failure, reinstall, or partial data loss by scanning backups, matching the backup to the target OpenClaw release docs, generating a dry-run restore plan, warning about local custom modules like Obsidian/multi-agent/self-evolution files, and guiding the user through step-by-step TUI-friendly recovery with verification and a final report.
---

# revive-openclaw Skill

> OpenClaw 系统恢复向导 - 交互式灾难恢复工具

## 概述

`revive-openclaw` 是一个交互式恢复向导，用于在 OpenClaw 无法重启或重装后，从备份恢复系统到可用状态。

## 功能特性

- **版本对照恢复**：先识别目标 OpenClaw 版本，再查对应 release / docs / breaking changes，避免拿旧备份硬套新版本
- **模块化恢复**：支持 minimal / standard / full / selective 四种恢复模式
- **交互式向导**：一步步引导用户完成恢复流程，适合 TUI / SSH 场景
- **Dry-Run / Plan-Only**：先扫描备份内实际存在的资料，生成恢复计划、风险和建议，再决定是否执行
- **Resume-Safe 设计**：Gateway 重启/中断后可继续恢复流程
- **恢复报告**：生成详细的恢复结果报告

## 恢复内容覆盖

### 核心配置 (P0)
- `openclaw.json` - 核心配置
- `mcporter.json` - MCP 服务器配置
- `channels` - 通道配置

### 记忆系统 (P1)
- `MEMORY.md` - 长期记忆
- `memory/*.md` - 每日记忆
- `.learnings` - 学习记录

### 定时任务 (P1)
- `cron/jobs.json` - 定时任务配置

### 技能与扩展 (P2)
- `skills/` - 自定义技能
- `extensions/` - 扩展配置

### 多代理配置 (P2)
- `agents/` - 代理配置目录
- `workspace/docs/multi-agent-framework.md` - 多代理架构

### 自我进化机制 (P3)
- `workspace/scripts/self-improving*.py`
- `workspace/scripts/skill-outcome-tracker.py`
- `workspace/scripts/pattern-detector.sh`

### 工作空间 (P2)
- `workspace/scripts/` - 自动化脚本
- `workspace/tools/` - 工具配置
- `workspace/config/` - 配置文件
- `workspace/workflows/` - 工作流

### 可选恢复项
- Obsidian 侧关键联动文件

## 前置条件

- 已安装 OpenClaw CLI，本机至少能运行 `openclaw --version`
- 目标机器已具备基础 OpenClaw 目录权限；完整恢复前最好已完成 OpenClaw 本体安装
- 若要执行完整验证，至少要有一个可用模型 / provider；若暂无可用模型，也应支持仅做 plan / dry-run
- 已准备备份源，或已拿到 OpenClaw 2026.3.8/2026.3.11 等版本产出的 backup 文件/目录
- 用户知道哪些 secrets 已经在 `openclaw.json` 里，哪些需要后补

## 通用化边界

`revive-openclaw` 必须区分两类恢复项：

- **通用 OpenClaw 模块**：`openclaw.json`、`mcporter.json`、`cron/jobs.json`、`skills/`、`memory/`、`workspace/config`
- **本地定制模块**：Obsidian 记忆体系、多代理工作文档、自我学习/进化脚本、投资/微信联动目录等

运行时应明确提示哪些模块是“标准 OpenClaw 能力”，哪些是“当前机器特有扩展”，不要把本地定制结构假装成通用要求。

## 使用方式

### 基本命令

```bash
# 启动交互式恢复向导（TUI/SSH 友好）
node scripts/revive.js

# 指定恢复模式
node scripts/revive.js --mode full
node scripts/revive.js --mode minimal
node scripts/revive.js --mode selective

# 预览模式（不执行）
node scripts/revive.js --dry-run
node scripts/revive.js --plan-only

# 指定备份目录
node scripts/revive.js --backup-dir /path/to/backups

# 跳过确认
node scripts/revive.js --force
```

### 恢复模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `minimal` | 只恢复核心配置和 Gateway 启动 | 系统初次崩溃，快速恢复 |
| `standard` | 恢复核心 + 记忆 + cron | 日常恢复，推荐使用 |
| `full` | 恢复所有内容 | 完全重装后恢复 |
| `selective` | 用户自定义选择恢复项 | 有特殊需求时 |

### 交互流程

```
1. 检测备份源
   ↓
2. 扫描可用备份
   ↓
3. 选择恢复模式
   ↓
4. 选择恢复模块（如 selective）
   ↓
5. 预览恢复计划 (dry-run)
   ↓
6. 用户确认（输入 "REVIVE"）
   ↓
7. 执行恢复
   ↓
8. 验证结果 + 生成报告
```

## 用户参与点

恢复过程中需要用户参与的步骤会被显式标注：

- ✅ **自动处理**：无需用户介入
- ⚠️ **需要确认**：等待用户输入
- 🔧 **手动处理**：提示用户后续手动操作

### Secrets / Channel 规则

- 如果 channel token、Brave Search key、provider key、MCP 凭证已经存在于 `openclaw.json` 或备份材料中，可以作为恢复对象直接恢复
- 如果备份里没有对应秘密值，只能恢复配置框架，并在报告里明确列出“待用户补全项”
- OAuth、session、设备绑定登录态默认保守处理，不应假装可稳定恢复

### 需要手动处理的项

1. **缺失的 API Keys / Tokens**：备份中不存在的 secrets 需要用户补齐
2. **外部服务配对**：Discord / Feishu / BlueBubbles 等外部通道可能需要重新配对
3. **Docker 容器**：部分容器需要手动启动
4. **SSH 密钥**：检查权限和可用性
5. **版本迁移决策**：当备份版本与目标 OpenClaw 版本不一致时，先确认 release 文档中的 breaking changes

## 状态文件

恢复进度保存在 `.revive-state.json`，支持中断后继续：

```json
{
  "backupSource": "/path/to/backup.tar.gz",
  "currentStep": 3,
  "completedModules": ["config", "memory"],
  "remainingModules": ["cron", "skills"],
  "dryRun": false,
  "timestamp": "2026-03-12T10:30:00Z"
}
```

## 输出报告

恢复完成后生成 `RECOVERY.md` 报告，包含：

- 恢复时间、备份源
- 每个模块的恢复状态
- 需要手动处理的事项
- 下一步建议

## 安全特性

1. **不做未经确认的删除/移动**：所有破坏性操作需要用户确认
2. **Dry-Run 预览**：先看效果再执行
3. **敏感信息排除**：默认不备份/恢复 API keys
4. **冲突检测**：检测与现有配置的冲突并提示

## 技术细节

- **主脚本**：`scripts/revive.js`
- **验证脚本**：`scripts/verify.js`
- **配置**：`scripts/config.json`
- **参考**：`references/recovery-checklist.md`

## 依赖

- Node.js 18+
- OpenClaw CLI (用于验证)
- tar/zip (用于解压备份)

## 测试与验收

至少按三层测试：

1. **Dry-Run / Plan-Only**：扫描备份内真实存在的资料，输出恢复建议、缺失项和风险
2. **临时目录验证**：把计划应用到临时目录，验证结构、JSON、关键路径是否完整
3. **真实机最小验收**：验证 `openclaw status`、gateway、cron、mcporter、memory、skills 是否可用

## 限制

- 本 skill 专注于**本地恢复**场景
- 不处理跨机器迁移
- 敏感凭证需要手动处理
- 恢复前应先对照目标 OpenClaw 版本的 release / docs；跨版本恢复不能跳过这一层
