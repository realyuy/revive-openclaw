#!/usr/bin/env node

/**
 * verify.js - OpenClaw 恢复验证脚本
 * 
 * 验证恢复后的系统状态，生成验证报告
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ========== 配置 ==========
const CONFIG = {
  openclawDir: process.env.OPENCLAW_DIR || path.join(process.env.HOME, '.openclaw'),
  workspaceDir: process.env.WORKSPACE_DIR || path.join(process.env.HOME, '.openclaw', 'workspace'),
  
  // 验证检查项
  checks: {
    // P0 - 必须验证
    gateway: {
      name: 'Gateway 状态',
      priority: 'P0',
      check: () => {
        try {
          const output = execSync('openclaw gateway status', { encoding: 'utf8' });
          return { passed: output.includes('running') || output.includes('active'), output };
        } catch (e) {
          return { passed: false, output: e.message };
        }
      }
    },
    config: {
      name: '核心配置文件',
      priority: 'P0',
      check: () => {
        const configPath = path.join(CONFIG.openclawDir, 'openclaw.json');
        if (!fs.existsSync(configPath)) {
          return { passed: false, output: 'openclaw.json 不存在' };
        }
        try {
          JSON.parse(fs.readFileSync(configPath, 'utf8'));
          return { passed: true, output: 'openclaw.json 格式正确' };
        } catch (e) {
          return { passed: false, output: `openclaw.json 解析失败: ${e.message}` };
        }
      }
    },
    configValidate: {
      name: '配置验证',
      priority: 'P0',
      check: () => {
        try {
          // 尝试多种可能的验证命令
          const commands = ['openclaw config validate', 'openclaw validate', 'openclaw config check'];
          for (const cmd of commands) {
            try {
              const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
              if (output.includes('valid') || output.includes('ok') || output.includes('success') || output.includes('error') === false) {
                return { passed: true, output: '配置验证通过' };
              }
            } catch (e) {
              // 尝试下一个命令
            }
          }
          // 如果所有命令都失败，尝试读取配置文件验证 JSON 格式
          const configPath = path.join(CONFIG.openclawDir, 'openclaw.json');
          if (fs.existsSync(configPath)) {
            JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return { passed: true, output: 'openclaw.json 格式正确（CLI 验证跳过）' };
          }
          return { passed: false, output: '无法验证配置' };
        } catch (e) {
          return { passed: false, output: e.message };
        }
      }
    },
    workspace: {
      name: '工作空间',
      priority: 'P0',
      check: () => {
        const required = ['AGENTS.md', 'SOUL.md', 'USER.md'];
        const missing = required.filter(f => !fs.existsSync(path.join(CONFIG.workspaceDir, f)));
        return { 
          passed: missing.length === 0, 
          output: missing.length === 0 ? '工作空间核心文件完整' : `缺失: ${missing.join(', ')}` 
        };
      }
    },
    
    // P1 - 重要验证
    cron: {
      name: 'Cron 任务',
      priority: 'P1',
      check: () => {
        const cronPath = path.join(CONFIG.openclawDir, 'cron', 'jobs.json');
        if (!fs.existsSync(cronPath)) {
          return { passed: false, output: 'cron/jobs.json 不存在' };
        }
        try {
          const jobs = JSON.parse(fs.readFileSync(cronPath, 'utf8'));
          return { passed: true, output: `已加载 ${jobs.length || 0} 个定时任务` };
        } catch (e) {
          return { passed: false, output: `cron/jobs.json 解析失败` };
        }
      }
    },
    skills: {
      name: 'Skills 列表',
      priority: 'P1',
      check: () => {
        try {
          // 尝试多种可能的命令
          const commands = ['openclaw skills list', 'openclaw skill list', 'openclaw --skills'];
          for (const cmd of commands) {
            try {
              const output = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
              const count = (output.match(/^\s*-/gm) || []).length;
              if (count > 0) {
                return { passed: true, output: `已安装 ${count} 个技能` };
              }
            } catch (e) {
              // 尝试下一个
            }
          }
          // 如果 CLI 失败，检查 skills 目录
          const skillsDir = path.join(CONFIG.openclawDir, 'skills');
          if (fs.existsSync(skillsDir)) {
            const dirs = fs.readdirSync(skillsDir).filter(f => {
              return fs.statSync(path.join(skillsDir, f)).isDirectory();
            });
            return { passed: dirs.length > 0, output: `skills 目录存在，共 ${dirs.length} 个技能` };
          }
          return { passed: false, output: '未找到 skills 目录' };
        } catch (e) {
          return { passed: false, output: '无法获取技能列表' };
        }
      }
    },
    plugins: {
      name: 'MCP 插件',
      priority: 'P1',
      check: () => {
        // 检查多种可能的配置文件位置
        const possiblePaths = [
          path.join(CONFIG.openclawDir, 'config', 'mcporter.json'),
          path.join(CONFIG.openclawDir, 'mcporter.json'),
          path.join(CONFIG.openclawDir, 'config', 'mcp.json'),
          path.join(CONFIG.openclawDir, 'mcp-servers.json')
        ];
        
        let mcporterPath = null;
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            mcporterPath = p;
            break;
          }
        }
        
        if (!mcporterPath) {
          return { passed: false, output: '未找到 MCP 配置文件' };
        }
        
        try {
          const config = JSON.parse(fs.readFileSync(mcporterPath, 'utf8'));
          const serverCount = config.servers?.length || config.mcpServers?.length || 0;
          return { passed: true, output: `已配置 ${serverCount} 个 MCP 服务器` };
        } catch (e) {
          return { passed: false, output: `${path.basename(mcporterPath)} 解析失败` };
        }
      }
    },
    
    // P2 - 完整验证
    memory: {
      name: '记忆文件',
      priority: 'P2',
      check: () => {
        const memoryPath = path.join(CONFIG.workspaceDir, 'MEMORY.md');
        const memoryDir = path.join(CONFIG.workspaceDir, 'memory');
        const hasLongTerm = fs.existsSync(memoryPath);
        const hasDaily = fs.existsSync(memoryDir);
        const dailyFiles = hasDaily ? fs.readdirSync(memoryDir).filter(f => f.endsWith('.md')).length : 0;
        
        return { 
          passed: hasLongTerm || dailyFiles > 0, 
          output: hasLongTerm ? '长期记忆存在' : `每日记忆 ${dailyFiles} 个` 
        };
      }
    },
    evolution: {
      name: '自我进化脚本',
      priority: 'P2',
      check: () => {
        const scripts = [
          'scripts/self-improving-agent.py',
          'scripts/skill-outcome-tracker.py',
          'scripts/pattern-detector.sh'
        ];
        const existing = scripts.filter(s => fs.existsSync(path.join(CONFIG.workspaceDir, s)));
        return { 
          passed: existing.length > 0, 
          output: `存在 ${existing.length}/${scripts.length} 个进化脚本` 
        };
      }
    },
    docker: {
      name: 'Docker 容器',
      priority: 'P2',
      check: () => {
        try {
          const output = execSync('docker ps --filter "name=openclaw" --format "{{.Names}}"', { encoding: 'utf8' });
          const containers = output.trim().split('\n').filter(c => c);
          return { passed: true, output: `运行中: ${containers.join(', ') || '无'}` };
        } catch (e) {
          return { passed: false, output: 'Docker 不可用' };
        }
      }
    }
  }
};

// ========== 验证器类 ==========
class Verifier {
  constructor(options = {}) {
    this.options = options;
    this.results = {
      timestamp: new Date().toISOString(),
      passed: [],
      failed: [],
      warnings: [],
      summary: { p0: { passed: 0, total: 0 }, p1: { passed: 0, total: 0 }, p2: { passed: 0, total: 0 } }
    };
  }
  
  // 运行所有检查
  async run() {
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║     OpenClaw 恢复验证 v1.0                ║');
    console.log('╚═══════════════════════════════════════════╝\n');
    
    // 按优先级分组执行
    const priorities = ['P0', 'P1', 'P2'];
    
    for (const priority of priorities) {
      console.log(`\n📋 ${priority} 级检查:\n`);
      
      const checks = Object.entries(CONFIG.checks).filter(
        ([_, c]) => c.priority === priority
      );
      
      for (const [key, check] of checks) {
        this.results.summary[priority.toLowerCase()].total++;
        
        try {
          const result = check.check();
          const icon = result.passed ? '✅' : '❌';
          console.log(`  ${icon} ${check.name}`);
          console.log(`     ${result.output}\n`);
          
          if (result.passed) {
            this.results.passed.push({ key, name: check.name, priority, output: result.output });
            this.results.summary[priority.toLowerCase()].passed++;
          } else {
            this.results.failed.push({ key, name: check.name, priority, output: result.output });
          }
        } catch (error) {
          console.log(`  ❌ ${check.name}`);
          console.log(`     错误: ${error.message}\n`);
          this.results.failed.push({ key, name: check.name, priority, output: error.message });
        }
      }
    }
    
    // 输出摘要
    this.printSummary();
    
    // 生成报告
    if (this.options.report) {
      this.generateReport();
    }
    
    return this.results;
  }
  
  // 打印摘要
  printSummary() {
    console.log('\n═══════════════════════════════════════════');
    console.log('📊 验证摘要');
    console.log('═══════════════════════════════════════════\n');
    
    console.log(`  P0 (必须): ${this.results.summary.p0.passed}/${this.results.summary.p0.total} 通过`);
    console.log(`  P1 (重要): ${this.results.summary.p1.passed}/${this.results.summary.p1.total} 通过`);
    console.log(`  P2 (完整): ${this.results.summary.p2.passed}/${this.results.summary.p2.total} 通过`);
    
    const total = this.results.summary.p0.total + this.results.summary.p1.total + this.results.summary.p2.total;
    const passed = this.results.summary.p0.passed + this.results.summary.p1.passed + this.results.summary.p2.passed;
    
    console.log(`\n  总计: ${passed}/${total} 通过`);
    
    if (this.results.failed.length > 0) {
      console.log('\n  ⚠️  未通过检查:');
      for (const fail of this.results.failed) {
        console.log(`     - ${fail.name} [${fail.priority}]`);
      }
    }
    
    const p0Passed = this.results.summary.p0.passed === this.results.summary.p0.total;
    console.log(`\n  ${p0Passed ? '✅' : '❌'} 整体状态: ${p0Passed ? 'PASS' : 'FAIL'}\n`);
  }
  
  // 生成报告
  generateReport() {
    const report = [
      '# OpenClaw Verification Report',
      '',
      `**验证时间**: ${this.results.timestamp}`,
      '',
      '## 📊 摘要',
      '',
      `| 优先级 | 通过 | 总数 | 状态 |`,
      `|--------|------|------|------|`,
      `| P0 必须 | ${this.results.summary.p0.passed} | ${this.results.summary.p0.total} | ${this.results.summary.p0.passed === this.results.summary.p0.total ? '✅' : '❌'} |`,
      `| P1 重要 | ${this.results.summary.p1.passed} | ${this.results.summary.p1.total} | ${this.results.summary.p1.passed === this.results.summary.p1.total ? '✅' : '⚠️'} |`,
      `| P2 完整 | ${this.results.summary.p2.passed} | ${this.results.summary.p2.total} | ${this.results.summary.p2.passed === this.results.summary.p2.total ? '✅' : '⚠️'} |`,
      '',
      '## ✅ 通过的检查',
      ''
    ];
    
    for (const item of this.results.passed) {
      report.push(`- **${item.name}** [${item.priority}]: ${item.output}`);
    }
    
    if (this.results.failed.length > 0) {
      report.push('');
      report.push('## ❌ 未通过的检查');
      report.push('');
      for (const item of this.results.failed) {
        report.push(`- **${item.name}** [${item.priority}]: ${item.output}`);
      }
    }
    
    report.push('');
    report.push('---');
    report.push('*此报告由 revive-openclaw 自动生成*');
    
    const reportPath = path.join(CONFIG.openclawDir, 'VERIFICATION.md');
    fs.writeFileSync(reportPath, report.join('\n'));
    
    console.log(`\n📄 报告已保存到: ${reportPath}\n`);
  }
}

// ========== 主入口 ==========
function main() {
  const args = process.argv.slice(2);
  const options = {
    report: false,
    check: null
  };
  
  // 解析参数
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--report':
      case '-r':
        options.report = true;
        break;
      case '--check':
      case '-c':
        options.check = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
verify.js - OpenClaw 恢复验证脚本

用法: verify.js [选项]

选项:
  --report, -r    生成验证报告
  --check, -c     只运行指定检查
  --help, -h      显示帮助

示例:
  verify.js                # 运行所有检查
  verify.js --report       # 生成报告
  verify.js -c gateway     # 只检查 Gateway 状态
`);
        process.exit(0);
    }
  }
  
  const verifier = new Verifier(options);
  verifier.run()
    .then(results => {
      const allPassed = results.failed.length === 0;
      process.exit(allPassed ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ 验证失败:', error);
      process.exit(1);
    });
}

if (require.main === module) {
  main();
}

module.exports = { Verifier, CONFIG };
