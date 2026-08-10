/**
 * The Witness Puzzle Helper — Local Debug Tool
 *
 * Usage:
 *   node debug_tool.js <path-to-debug.json>
 *   node debug_tool.js witness_debug_4x4_2026-08-09.json
 *
 * Reads a debug export file produced by the web app ("📋 导出调试信息" button)
 * and prints a detailed validation report to the terminal.
 *
 * All analysis logic is delegated to PuzzleAnalyzer (js/analysis.js),
 * shared between browser and Node.js.
 */

const fs = require('fs');
const path = require('path');
const { PuzzleAnalyzer } = require('./js/analysis.js');

// ==================== Main ====================

function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
The Witness 谜题助手 — 本地调试工具
=====================================

用法:
  node debug_tool.js <debug文件.json>
  node debug_tool.js --batch <目录>    批量分析目录下所有 .json 文件

说明:
  此工具读取网页端通过"📋 导出调试信息"按钮导出的 JSON 文件，
  对其中包含的谜题状态、玩家路径和求解器结果进行离线验证。

示例:
  node debug_tool.js witness_debug_3x3_diagonal_2026-08-09.json
  node debug_tool.js --batch ./debug_exports/
        `);
        process.exit(args.length === 0 ? 1 : 0);
    }

    if (args.includes('--batch')) {
        const idx = args.indexOf('--batch');
        const dir = args[idx + 1] || '.';
        batchAnalyze(dir);
    } else {
        analyzeFile(args[0]);
    }
}

// ==================== Single File Analysis ====================

function analyzeFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ 文件不存在: ${filePath}`);
        process.exit(1);
    }

    let data;
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        data = JSON.parse(raw);
    } catch (e) {
        console.error(`❌ JSON 解析失败: ${e.message}`);
        process.exit(1);
    }

    const report = PuzzleAnalyzer.reportText(data);
    console.log(report);
}

// ==================== Batch Analysis ====================

function batchAnalyze(dir) {
    if (!fs.existsSync(dir)) {
        console.error(`❌ 目录不存在: ${dir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => path.join(dir, f))
        .sort();

    if (files.length === 0) {
        console.log('未找到 .json 文件');
        process.exit(0);
    }

    console.log(`找到 ${files.length} 个文件\n`);

    let totalOk = 0;
    let totalFail = 0;

    for (const f of files) {
        try {
            const raw = fs.readFileSync(f, 'utf-8');
            const data = JSON.parse(raw);
            const result = PuzzleAnalyzer.analyze(data);
            const ok = result.checks.filter(c => c.pass === false).length === 0;

            if (ok) {
                console.log(`  ✅ ${path.basename(f)} — ${result.summary}`);
                totalOk++;
            } else {
                console.log(`  ❌ ${path.basename(f)} — ${result.summary}`);
                totalFail++;
            }
        } catch (e) {
            console.log(`  💥 ${path.basename(f)} — 解析失败: ${e.message}`);
            totalFail++;
        }
    }

    console.log(`\n---`);
    console.log(`总计: ${totalOk} 通过, ${totalFail} 失败, ${files.length} 总数`);
}

// ==================== Run ====================

main();
