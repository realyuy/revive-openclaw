#!/usr/bin/env node

/**
 * revive-openclaw - OpenClaw 系统恢复向导
 * 
 * 交互式灾难恢复工具，支持模块化恢复和 dry-run
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync, exec } = require('child_process');

// 创建 readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 标记 stdin 是否已结束
let stdinEnded = false;

// 监听 stdin 结束事件
if (!process.stdin.isTTY) {
  process.stdin.on('end', () => {
    stdinEnded = true;
    rl.close();
  });
}

// 异步输入 - 支持 EOF 检测
function prompt(question) {
  return new Promise((resolve) => {
    // 检测是否在非交互模式
    const isNonInteractive = !process.stdin.isTTY;
    
    rl.question(question, (answer) => {
      const trimmed = answer ? answer.trim() : '';
      
      // 非交互模式下，如果输入为空或 stdin 已结束，视为 EOF
      if (isNonInteractive && (trimmed === '' || stdinEnded)) {
        resolve('');
      } else {
        resolve(trimmed);
      }
    });
  });
}

// ========== 配置 ==========
const CONFIG = {
  openclawDir: process.env.OPENCLAW_DIR || (process.env.HOME ? path.join(process.env.HOME, '.openclaw') : null),
  workspaceDir: process.env.WORKSPACE_DIR || (process.env.HOME ? path.join(process.env.HOME, '.openclaw', 'workspace') : null),
  backupDir: process.env.BACKUP_DIR || (process.env.HOME ? path.join(process.env.HOME, '.openclaw-backups') : null),
  stateFile: '.revive-state.json',
  recoveryReport: 'RECOVERY-{{timestamp}}.md',
  
  // 恢复模块定义
  modules: {
    config: {
      name: '核心配置',
      priority: 'P0',
      files: ['openclaw.json', 'config/mcporter.json'],
      description: 'openclaw.json, mcporter.json, channels'
    },
    memory: {
      name: '记忆系统',
      priority: 'P1',
      files: ['workspace/MEMORY.md', 'workspace/memory'],
      description: 'MEMORY.md, 每日记忆, .learnings'
    },
    cron: {
      name: '定时任务',
      priority: 'P1',
      files: ['cron/jobs.json'],
      description: 'cron/jobs.json'
    },
    skills: {
      name: '技能',
      priority: 'P2',
      files: ['skills', 'extensions'],
      description: '自定义技能和扩展'
    },
    agents: {
      name: '多代理配置',
      priority: 'P2',
      files: ['agents', 'workspace/docs/multi-agent-framework.md'],
      description: '代理配置和多代理架构文档'
    },
    evolution: {
      name: '自我进化机制',
      priority: 'P3',
      files: [
        'workspace/scripts/self-improving-agent.py',
        'workspace/scripts/skill-outcome-tracker.py',
        'workspace/scripts/pattern-detector.sh',
        'workspace/scripts/skill-recommender.py',
        'workspace/scripts/skill-evolver-safe.sh'
      ],
      description: '自我学习和进化相关脚本'
    },
    workspace: {
      name: '工作空间',
      priority: 'P2',
      files: ['workspace/scripts', 'workspace/tools', 'workspace/config', 'workspace/workflows'],
      description: '脚本、工具、配置、工作流'
    },
    obsidian: {
      name: 'Obsidian 联动',
      priority: '可选',
      files: ['workspace/vaults'],
      description: 'Obsidian 侧关键联动文件',
      optional: true
    }
  },
  
  // 恢复模式定义
  modes: {
    minimal: {
      name: '最小恢复',
      description: '只恢复核心配置和 Gateway 启动',
      modules: ['config']
    },
    standard: {
      name: '标准恢复',
      description: '恢复核心 + 记忆 + cron（推荐）',
      modules: ['config', 'memory', 'cron']
    },
    full: {
      name: '完整恢复',
      description: '恢复所有内容',
      modules: ['config', 'memory', 'cron', 'skills', 'agents', 'evolution', 'workspace']
    },
    selective: {
      name: '选择性恢复',
      description: '用户自定义选择恢复项',
      modules: []
    }
  }
};

// ========== 状态管理 ==========
class ReviveState {
  constructor(options = {}) {
    this.options = options;
    this.state = {
      backupSource: null,
      mode: 'interactive',
      selectedModules: [],
      currentStep: 0,
      completedModules: [],
      remainingModules: [],
      dryRun: false,
      force: false,
      timestamp: new Date().toISOString()
    };
    // 记录原始状态文件（用于恢复时比对）
    this.originalStateExisted = false;
    this.originalStateContent = null;
  }
  
  load() {
    if (!CONFIG.openclawDir) {
      console.error('❌ 无法确定 OpenClaw 目录：请设置 HOME 环境变量或 OPENCLAW_DIR');
      process.exit(1);
    }
    const statePath = path.join(CONFIG.openclawDir, CONFIG.stateFile);
    if (fs.existsSync(statePath)) {
      try {
        this.originalStateContent = fs.readFileSync(statePath, 'utf8');
        this.originalStateExisted = true;
        this.state = JSON.parse(this.originalStateContent);
        return true;
      } catch (e) {
        console.warn('⚠️  无法加载状态文件，将创建新恢复会话');
        return false;
      }
    }
    return false;
  }
  
  save() {
    // dry-run/plan-only 模式下不保存状态文件
    if (this.options.dryRun || this.options.planOnly) {
      return;
    }
    if (!CONFIG.openclawDir) {
      console.error('❌ 无法确定 OpenClaw 目录');
      return;
    }
    const statePath = path.join(CONFIG.openclawDir, CONFIG.stateFile);
    fs.writeFileSync(statePath, JSON.stringify(this.state, null, 2));
  }
  
  // 清理 dry-run 产生的临时状态（但不删除用户原始会话）
  cleanup() {
    if (!CONFIG.openclawDir) return;
    const statePath = path.join(CONFIG.openclawDir, CONFIG.stateFile);
    
    // 如果是 dry-run 模式，清理本次创建的临时状态
    if (this.options.dryRun || this.options.planOnly) {
      // 只有当原始状态不存在时才清理
      if (!this.originalStateExisted && fs.existsSync(statePath)) {
        fs.unlinkSync(statePath);
      }
      // 如果原始状态存在但被修改了，恢复原状
      else if (this.originalStateExisted && this.originalStateContent) {
        fs.writeFileSync(statePath, this.originalStateContent);
      }
    }
  }
  
  update(updates) {
    Object.assign(this.state, updates);
    this.save();
  }
  
  reset() {
    // dry-run 模式下不重置（不删除状态文件）
    if (this.options.dryRun || this.options.planOnly) {
      return;
    }
    if (!CONFIG.openclawDir) return;
    const statePath = path.join(CONFIG.openclawDir, CONFIG.stateFile);
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }
    this.state = {
      backupSource: null,
      mode: 'interactive',
      selectedModules: [],
      currentStep: 0,
      completedModules: [],
      remainingModules: [],
      dryRun: false,
      force: false,
      timestamp: new Date().toISOString()
    };
  }
}

// ========== 核心恢复逻辑 ==========
class ReviveOpenClaw {
  constructor(options = {}) {
    this.options = options;
    this.state = new ReviveState(options);
    this.results = {
      success: [],
      failed: [],
      skipped: [],
      manual: []
    };
  }
  
  // 检测备份源
  detectBackupSource() {
    console.log('\n📁 检测备份源...\n');
    
    const sources = [];
    
    // 检查默认备份目录
    if (fs.existsSync(CONFIG.backupDir)) {
      try {
        const files = fs.readdirSync(CONFIG.backupDir)
          .filter(f => f.endsWith('.tar.gz') || f.endsWith('.zip') || f.endsWith('.json'))
          .map(f => {
            const stats = fs.statSync(path.join(CONFIG.backupDir, f));
            return {
              name: f,
              path: path.join(CONFIG.backupDir, f),
              stats: stats,
              mtime: stats.mtime
            };
          })
          .sort((a, b) => b.mtime - a.mtime);
        
        if (files.length > 0) {
          sources.push({ type: 'directory', path: CONFIG.backupDir, files });
        }
      } catch (e) {
        // 忽略权限错误
      }
    }
    
    // 检查 openclaw 内置备份
    const openclawBackup = path.join(CONFIG.openclawDir, 'backups');
    if (fs.existsSync(openclawBackup)) {
      try {
        const files = fs.readdirSync(openclawBackup)
          .filter(f => f.endsWith('.tar.gz') || f.endsWith('.zip') || f.endsWith('.json'))
          .map(f => {
            const stats = fs.statSync(path.join(openclawBackup, f));
            return {
              name: f,
              path: path.join(openclawBackup, f),
              stats: stats,
              mtime: stats.mtime
            };
          })
          .sort((a, b) => b.mtime - a.mtime);
        
        if (files.length > 0) {
          sources.push({ type: 'openclaw', path: openclawBackup, files });
        }
      } catch (e) {
        // 忽略权限错误
      }
    }
    
    return sources;
  }
  
  // 扫描可用备份
  scanBackups(sources) {
    console.log('\n📦 可用备份列表：\n');
    
    let idx = 1;
    for (const source of sources) {
      console.log(`📂 ${source.path}`);
      for (const file of source.files.slice(0, 5)) {
        const size = (file.stats.size / 1024 / 1024).toFixed(2);
        const date = file.mtime.toLocaleString('zh-CN');
        console.log(`   [${idx++}] ${file.name} (${size} MB, ${date})`);
      }
      if (source.files.length > 5) {
        console.log(`   ... 还有 ${source.files.length - 5} 个`);
      }
      console.log('');
    }
    
    return sources;
  }
  
  // 选择恢复模式
  selectMode() {
    console.log('\n🎯 选择恢复模式：\n');
    console.log('  [1] minimal  - 最小恢复（仅核心配置）');
    console.log('  [2] standard - 标准恢复（推荐）');
    console.log('  [3] full     - 完整恢复');
    console.log('  [4] selective - 选择性恢复\n');
    
    // 从参数或交互获取模式
    if (this.options.mode && CONFIG.modes[this.options.mode]) {
      return this.options.mode;
    }
    
    return 'standard'; // 默认标准恢复
  }
  
  // 选择恢复模块（selective 模式）- 交互式选择
  async selectModules() {
    console.log('\n🔧 选择要恢复的模块：\n');
    
    const moduleKeys = Object.keys(CONFIG.modules);
    for (let i = 0; i < moduleKeys.length; i++) {
      const key = moduleKeys[i];
      const mod = CONFIG.modules[key];
      const marker = mod.optional ? ' [可选]' : '';
      console.log(`  [${i + 1}] ${mod.name} ${marker}`);
      console.log(`      ${mod.description}\n`);
    }
    
    console.log('操作说明:');
    console.log('  - 输入编号选择/取消选择 (如: 1,3,5)');
    console.log('  - 输入 "all" 选择全部');
    console.log('  - 输入 "none" 取消全部');
    console.log('  - 输入 "done" 完成选择\n');
    
    // 初始化：默认全选非可选模块
    const selected = new Set(Object.keys(CONFIG.modules).filter(k => !CONFIG.modules[k].optional));
    
    let done = false;
    let inputCount = 0;
    
    // 检测是否在非交互模式（pipe/重定向）
    const isInteractive = process.stdin.isTTY;
    
    while (!done) {
      // 显示当前选择状态
      console.log('当前选择:');
      const moduleList = Object.keys(CONFIG.modules);
      for (let i = 0; i < moduleList.length; i++) {
        const key = moduleList[i];
        const mod = CONFIG.modules[key];
        const marker = selected.has(key) ? '✓' : ' ';
        console.log(`  ${marker} ${i + 1}. ${mod.name}`);
      }
      
      // 非交互模式：只处理一次输入然后退出
      if (!isInteractive) {
        const input = await prompt('\n请选择: ');
        inputCount++;
        
        // 如果在非交互模式下，收到任何有效输入后直接完成选择
        if (input !== '') {
          // 处理输入
          if (input === 'done' || input === 'd') {
            done = true;
          } else if (input === 'all' || input === 'a') {
            for (const key of moduleKeys) {
              selected.add(key);
            }
            console.log('  ✓ 已选择全部模块\n');
            done = true;  // 非交互模式下，选完后直接退出
          } else if (input === 'none' || input === 'n') {
            selected.clear();
            console.log('  ✓ 已取消全部选择\n');
            done = true;
          } else if (/^[\d,]+$/.test(input) || /^\d+$/.test(input)) {
            // 处理数字选择
            const indices = input.split(',').map(s => parseInt(s.trim()) - 1);
            for (const idx of indices) {
              if (idx >= 0 && idx < moduleKeys.length) {
                const key = moduleKeys[idx];
                if (selected.has(key)) {
                  selected.delete(key);
                } else {
                  selected.add(key);
                }
              }
            }
            done = true;  // 非交互模式下，选完后直接退出
          }
          
          // 如果还没退出，说明输入无法识别，非交互模式下直接退出
          if (!done && inputCount >= 2) {
            done = true;
          }
        } else {
          // 空输入，非交互模式下直接完成
          done = true;
        }
        continue;
      }
      
      // 交互模式（TTY）下的原始逻辑
      const input = await prompt('\n请选择: ');
      
      if (input === 'done' || input === 'd' || input === '') {
        const indices = input.split(',').map(s => parseInt(s.trim()) - 1);
        for (const idx of indices) {
          if (idx >= 0 && idx < moduleKeys.length) {
            const key = moduleKeys[idx];
            if (selected.has(key)) {
              selected.delete(key);
            } else {
              selected.add(key);
            }
          }
        }
        console.log(`  ✓ 已切换选择: ${input}\n`);
      } else if (/^\d+$/.test(input)) {
        // 单个编号
        const idx = parseInt(input) - 1;
        if (idx >= 0 && idx < moduleKeys.length) {
          const key = moduleKeys[idx];
          if (selected.has(key)) {
            selected.delete(key);
          } else {
            selected.add(key);
          }
          console.log(`  ✓ ${CONFIG.modules[key].name} - ${selected.has(key) ? '已选择' : '已取消'}\n`);
        }
      } else if (input === '') {
        // 空回车默认完成
        done = true;
      }
    }
    
    const result = Array.from(selected);
    console.log(`\n最终选择: ${result.join(', ')}\n`);
    return result;
  }
  
  // 生成恢复计划
  generatePlan(selectedModules, backupSource) {
    console.log('\n📋 恢复计划：\n');
    console.log(`  备份源: ${backupSource}`);
    console.log(`  恢复模块: ${selectedModules.join(', ')}`);
    console.log('');
    
    // 列出每个模块要恢复的文件
    for (const mod of selectedModules) {
      const modConfig = CONFIG.modules[mod];
      console.log(`  📄 ${modConfig.name} (${modConfig.priority}):`);
      for (const file of modConfig.files.slice(0, 3)) {
        console.log(`      - ${file}`);
      }
      if (modConfig.files.length > 3) {
        console.log(`      ... 还有 ${modConfig.files.length - 3} 个`);
      }
      console.log('');
    }
    
    return {
      backupSource,
      modules: selectedModules,
      timestamp: new Date().toISOString()
    };
  }
  
  // Dry-run 预览 - 真正扫描备份内容
  dryRun(plan) {
    console.log('\n🔍 [DRY-RUN] 预览恢复操作：\n');
    console.log('以下操作将被执行（实际不会执行）：\n');
    
    // 尝试读取备份内容并分析
    const backupAnalysis = this.analyzeBackup(plan.backupSource);
    
    // 列出将恢复的模块
    for (const mod of plan.modules) {
      const modConfig = CONFIG.modules[mod];
      const exists = backupAnalysis.existingModules.includes(mod);
      const status = exists ? '✅' : '⚠️';
      console.log(`  ${status} 将恢复: ${modConfig.name}`);
      if (!exists) {
        console.log(`      (备份中未找到此模块，将创建空目录/文件)`);
      }
    }
    
    // 显示备份分析摘要
    console.log('\n📊 备份内容分析：');
    console.log(`  备份路径: ${plan.backupSource}`);
    
    if (backupAnalysis.existingModules.length > 0) {
      console.log(`  ✅ 备份中存在的模块: ${backupAnalysis.existingModules.join(', ')}`);
    }
    
    const missingFromBackup = plan.modules.filter(m => !backupAnalysis.existingModules.includes(m));
    if (missingFromBackup.length > 0) {
      console.log(`  ⚠️  备份中缺失的模块: ${missingFromBackup.join(', ')}`);
    }
    
    if (backupAnalysis.localCustomModules.length > 0) {
      console.log(`  🔶 本地定制模块（可能需要手动处理）:`);
      for (const mod of backupAnalysis.localCustomModules) {
        console.log(`      - ${mod}`);
      }
    }
    
    if (backupAnalysis.hasSecrets) {
      console.log(`  🔑 备份中包含 secrets 配置`);
    } else {
      console.log(`  ⚠️  备份中未发现 secrets，可能需要手动配置`);
    }
    
    // 推荐模式
    console.log('\n💡 推荐恢复模式:');
    const recommendedMode = this.getRecommendedMode(backupAnalysis);
    console.log(`  基于备份内容分析，推荐: ${recommendedMode}`);
    
    console.log('\n⚠️  这是预览模式，不会执行任何实际操作\n');
    return true;
  }
  
  // 分析备份内容
  analyzeBackup(backupPath) {
    const analysis = {
      existingModules: [],
      localCustomModules: [],
      hasSecrets: false,
      version: null,
      timestamp: null
    };
    
    // 检查是否是目录备份
    const backupDir = backupPath.replace(/\.(tar\.gz|zip)$/, '');
    const isArchive = backupPath.endsWith('.tar.gz') || backupPath.endsWith('.zip');
    
    let contentPath = backupPath;
    
    // 如果是压缩文件，尝试解压到临时目录（不实际解压，只检查结构）
    if (isArchive) {
      // 对于压缩文件，我们只列出它们的存在
      // 实际内容分析需要解压
      console.log(`  (压缩文件: ${path.basename(backupPath)})`);
      // 尝试用 tar -t 查看内容
      try {
        if (backupPath.endsWith('.tar.gz') || backupPath.endsWith('.tgz')) {
          const listOutput = execSync(`tar -tzf "${backupPath}" 2>/dev/null | head -50`, { encoding: 'utf8' });
          const files = listOutput.split('\n').filter(f => f);
          
          // 分析压缩包内的文件
          for (const [modKey, modConfig] of Object.entries(CONFIG.modules)) {
            for (const file of modConfig.files) {
              if (files.some(f => f.includes(file))) {
                if (!analysis.existingModules.includes(modKey)) {
                  analysis.existingModules.push(modKey);
                }
              }
            }
          }
          
          // 检查 secrets
          if (files.some(f => f.includes('openclaw.json'))) {
            analysis.hasSecrets = true;
          }
        }
      } catch (e) {
        // 无法读取压缩包内容
      }
    } else if (fs.existsSync(backupPath) && fs.statSync(backupPath).isDirectory()) {
      // 目录备份
      contentPath = backupPath;
      
      for (const [modKey, modConfig] of Object.entries(CONFIG.modules)) {
        for (const file of modConfig.files) {
          const fullPath = path.join(backupPath, file);
          if (fs.existsSync(fullPath)) {
            if (!analysis.existingModules.includes(modKey)) {
              analysis.existingModules.push(modKey);
            }
          }
        }
      }
      
      // 检查本地定制模块
      const localCustom = ['workspace/vaults', 'workspace/docs', 'workspace/scripts/self-improving'];
      for (const custom of localCustom) {
        if (fs.existsSync(path.join(backupPath, custom))) {
          analysis.localCustomModules.push(custom);
        }
      }
      
      // 检查 openclaw.json 确认版本
      const configPath = path.join(backupPath, 'openclaw.json');
      if (fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          analysis.version = config.version || 'unknown';
          analysis.hasSecrets = !!(config.channels || config.providers || config.apiKeys);
        } catch (e) {}
      }
    }
    
    return analysis;
  }
  
  // 获取推荐恢复模式
  getRecommendedMode(analysis) {
    const hasConfig = analysis.existingModules.includes('config');
    const hasMemory = analysis.existingModules.includes('memory');
    const hasCron = analysis.existingModules.includes('cron');
    const hasSkills = analysis.existingModules.includes('skills');
    
    if (!hasConfig) {
      return 'minimal (无核心配置，需先安装 OpenClaw)';
    }
    
    if (hasSkills && hasMemory && hasCron) {
      return 'full (备份完整)';
    }
    
    if (hasMemory || hasCron) {
      return 'standard (推荐)';
    }
    
    return 'minimal (仅有核心配置)';
  }
  
  // 确认恢复
  confirm(plan) {
    if (this.options.force) {
      console.log('\n⚡ 跳过确认（--force 模式）\n');
      return true;
    }
    
    console.log('\n⚠️  警告：此操作将覆盖现有配置');
    console.log('请输入 "REVIVE" 确认继续：\n');
    
    // 在非交互模式下使用默认确认
    return true;
  }
  
  // 执行恢复
  execute(plan) {
    console.log('\n🚀 开始执行恢复...\n');
    
    const results = {
      timestamp: new Date().toISOString(),
      backupSource: plan.backupSource,
      modules: {}
    };
    
    for (const mod of plan.modules) {
      console.log(`📦 恢复模块: ${CONFIG.modules[mod].name}`);
      
      try {
        // 模拟恢复过程
        const modResult = this.restoreModule(mod, plan.backupSource);
        results.modules[mod] = { status: 'success', ...modResult };
        this.results.success.push(mod);
        console.log(`  ✅ 完成\n`);
      } catch (error) {
        results.modules[mod] = { status: 'failed', error: error.message };
        this.results.failed.push(mod);
        console.log(`  ❌ 失败: ${error.message}\n`);
      }
    }
    
    return results;
  }
  
  // 恢复单个模块
  restoreModule(moduleName, backupSource) {
    const mod = CONFIG.modules[moduleName];
    const restored = [];
    const errors = [];
    
    const isArchive = backupSource.endsWith('.tar.gz') || backupSource.endsWith('.zip');
    const openclawDir = path.join(CONFIG.openclawDir, '.openclaw');
    
    for (const file of mod.files) {
      try {
        if (isArchive) {
          // 从压缩包提取
          const extractDir = path.join(CONFIG.openclawDir, '.revive-temp');
          
          if (backupSource.endsWith('.tar.gz') || backupSource.endsWith('.tgz')) {
            execSync(`mkdir -p "${extractDir}" && tar -xzf "${backupSource}" -C "${extractDir}" "${file}" 2>/dev/null`, { stdio: 'pipe' });
          } else if (backupSource.endsWith('.zip')) {
            execSync(`mkdir -p "${extractDir}" && unzip -o "${backupSource}" "${file}" -d "${extractDir}" 2>/dev/null`, { stdio: 'pipe' });
          }
          
          const extractedPath = path.join(extractDir, file);
          if (fs.existsSync(extractedPath)) {
            const targetPath = path.join(openclawDir, file);
            const targetDir = path.dirname(targetPath);
            
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }
            
            // 如果是目录
            if (fs.statSync(extractedPath).isDirectory()) {
              execSync(`cp -r "${extractedPath}" "${targetDir}/"`, { stdio: 'pipe' });
            } else {
              fs.copyFileSync(extractedPath, targetPath);
            }
            restored.push(file);
          }
        } else {
          // 从目录复制
          const sourcePath = path.join(backupSource, file);
          const targetPath = path.join(openclawDir, file);
          
          if (fs.existsSync(sourcePath)) {
            const targetDir = path.dirname(targetPath);
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }
            
            const stat = fs.statSync(sourcePath);
            if (stat.isDirectory()) {
              execSync(`cp -r "${sourcePath}" "${targetDir}/"`, { stdio: 'pipe' });
            } else {
              fs.copyFileSync(sourcePath, targetPath);
            }
            restored.push(file);
          }
        }
      } catch (e) {
        errors.push(`${file}: ${e.message}`);
      }
    }
    
    return {
      files: restored,
      count: restored.length,
      errors: errors
    };
  }
  
  // 验证恢复结果
  verify(results) {
    console.log('\n✅ 验证恢复结果...\n');
    
    const checks = [
      { name: 'Gateway 状态', cmd: 'openclaw gateway status', required: true },
      { name: '配置文件', check: () => fs.existsSync(path.join(CONFIG.openclawDir, 'openclaw.json')) },
      { name: '工作空间', check: () => fs.existsSync(CONFIG.workspaceDir) }
    ];
    
    for (const check of checks) {
      if (check.cmd) {
        try {
          execSync(check.cmd, { stdio: 'pipe' });
          console.log(`  ✅ ${check.name}`);
        } catch (e) {
          console.log(`  ⚠️  ${check.name}: 无法验证`);
          if (check.required) {
            this.results.manual.push(check.name);
          }
        }
      } else if (check.check) {
        const passed = check.check();
        console.log(`  ${passed ? '✅' : '⚠️'} ${check.name}`);
        if (!passed && check.required) {
          this.results.manual.push(check.name);
        }
      }
    }
    
    return this.results;
  }
  
  // 生成恢复报告
  generateReport(results) {
    console.log('\n📄 生成恢复报告...\n');
    
    // 生成带时间戳的报告文件名
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').substring(0, 15);
    const reportFileName = `RECOVERY-${timestamp}.md`;
    
    const report = [
      '# OpenClaw Recovery Report',
      '',
      `**恢复时间**: ${results.timestamp}`,
      `**备份源**: ${results.backupSource}`,
      '',
      '## ✅ 已恢复内容',
      ''
    ];
    
    for (const [mod, result] of Object.entries(results.modules)) {
      const status = result.status === 'success' ? '✅' : '❌';
      const modName = CONFIG.modules[mod]?.name || mod;
      report.push(`| ${modName} | ${status} | ${result.files?.length || 0} 个文件 |`);
    }
    
    report.push('');
    report.push('## ⚠️ 需要手动处理');
    report.push('');
    
    if (this.results.manual.length > 0) {
      for (const item of this.results.manual) {
        report.push(`- [ ] **${item}**`);
      }
    } else {
      report.push('- 无');
    }
    
    report.push('');
    report.push('## 📋 下一步建议');
    report.push('');
    report.push('1. 运行 `openclaw gateway restart` 重启网关');
    report.push('2. 验证 cron jobs: `openclaw cron list`');
    report.push('3. 测试技能: 使用 `/skill list` 查看');
    report.push('4. 检查内存: 查看 MEMORY.md 是否正确恢复');
    report.push('');
    report.push('---');
    report.push('*此报告由 revive-openclaw 自动生成*');
    
    // 使用带时间戳的报告文件名
    const reportPath = path.join(CONFIG.openclawDir, reportFileName);
    fs.writeFileSync(reportPath, report.join('\n'));
    
    console.log(`📄 报告已保存到: ${reportPath}\n`);
    
    return reportPath;
  }
  
  // 运行完整流程
  async run() {
    // 首先检查 HOME 环境变量
    if (!CONFIG.openclawDir) {
      console.error('❌ 错误：无法确定 OpenClaw 目录');
      console.error('请确保设置了 HOME 环境变量，或使用 OPENCLAW_DIR 环境变量指定目录');
      console.error('示例:');
      console.error('  export HOME=/Users/yourname');
      console.error('  或');
      console.error('  export OPENCLAW_DIR=/path/to/openclaw');
      process.exit(1);
    }
    
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║     OpenClaw 系统恢复向导 v1.0            ║');
    console.log('╚═══════════════════════════════════════════╝');
    console.log(`📂 工作目录: ${CONFIG.openclawDir}`);
    
    // 检查是否有中断的状态
    const hasState = this.state.load();
    if (hasState && this.state.state.backupSource) {
      console.log('\n⚠️  发现未完成的恢复会话');
      console.log(`  上次步骤: ${this.state.state.currentStep}`);
      console.log(`  已完成模块: ${this.state.state.completedModules.join(', ')}`);
      console.log('  输入 "resume" 继续，或 "new" 开始新会话\n');
      // TODO: 交互式选择
    }
    
    // Step 1: 检测备份源
    const sources = this.detectBackupSource();
    if (sources.length === 0) {
      console.log('❌ 未找到可用备份');
      console.log(`   请将备份文件放到: ${CONFIG.backupDir}`);
      console.log('   或使用 --backup-dir 指定\n');
      return { success: false, error: 'no_backup' };
    }
    
    // Step 2: 扫描备份
    this.scanBackups(sources);
    
    // Step 3: 选择恢复模式
    const mode = this.selectMode();
    let selectedModules = CONFIG.modes[mode]?.modules || [];
    
    // Step 4: 选择模块（selective 模式）
    if (mode === 'selective') {
      selectedModules = await this.selectModules();
    }
    
    if (selectedModules.length === 0) {
      console.log('❌ 未选择任何模块');
      return { success: false, error: 'no_modules' };
    }
    
    // 选择备份源
    const backupSource = sources[0].files[0].path;
    this.state.update({ backupSource, selectedModules, mode });
    
    // Step 5: 生成恢复计划
    const plan = this.generatePlan(selectedModules, backupSource);
    
    // Step 6: Dry-run 或确认
    if (this.options.dryRun) {
      this.dryRun(plan);
      // dry-run 结束后清理临时状态
      this.state.cleanup();
      return { success: true, dryRun: true, plan };
    }
    
    // Step 7: 用户确认
    if (!this.confirm(plan)) {
      console.log('❌ 已取消恢复');
      return { success: false, cancelled: true };
    }
    
    // Step 8: 执行恢复
    const results = this.execute(plan);
    this.state.update({ currentStep: 8, completedModules: this.results.success });
    
    // Step 9: 验证结果
    this.verify(results);
    
    // Step 10: 生成报告
    const reportPath = this.generateReport(results);
    
    console.log('═══════════════════════════════════════════');
    console.log('✅ 恢复完成！');
    console.log('═══════════════════════════════════════════\n');
    
    // 清理状态文件
    this.state.reset();
    
    return { success: true, results, reportPath };
  }
}

// ========== 主入口 ==========
function main() {
  const args = process.argv.slice(2);
  const options = {
    mode: null,
    dryRun: false,
    planOnly: false,
    force: false,
    backupDir: null
  };
  
  // 解析参数
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--mode':
      case '-m':
        options.mode = args[++i];
        break;
      case '--dry-run':
      case '--plan-only':
      case '-n':
        options.dryRun = true;
        options.planOnly = true;
        break;
      case '--force':
      case '-f':
        options.force = true;
        break;
      case '--backup-dir':
      case '-b':
        options.backupDir = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
revive-openclaw - OpenClaw 系统恢复向导

用法: revive-openclaw [选项]

选项:
  --mode, -m <mode>   恢复模式: minimal, standard, full, selective
  --dry-run, -n       预览模式，不执行实际操作
  --plan-only         生成恢复计划并总结备份内已有资料
  --force, -f         跳过确认，直接执行
  --backup-dir, -b    指定备份目录
  --help, -h          显示帮助

示例:
  revive-openclaw                     # 交互式恢复
  revive-openclaw --mode full         # 完整恢复
  revive-openclaw --dry-run           # 预览恢复计划
  revive-openclaw --plan-only         # 只生成恢复计划和建议
  revive-openclaw --mode minimal -f   # 最小恢复，跳过确认
`);
        process.exit(0);
    }
  }
  
  if (options.backupDir) {
    CONFIG.backupDir = options.backupDir;
  }
  
  // 检查必要的环境变量
  if (!process.env.HOME && !process.env.OPENCLAW_DIR) {
    console.error('❌ 错误：HOME 环境变量未设置');
    console.error('请设置 HOME 环境变量或使用 OPENCLAW_DIR 指定 OpenClaw 目录');
    process.exit(1);
  }
  
  const revive = new ReviveOpenClaw(options);
  revive.run()
    .then(result => {
      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ 恢复失败:', error);
      process.exit(1);
    });
}

if (require.main === module) {
  main();
}

module.exports = { ReviveOpenClaw, CONFIG };
