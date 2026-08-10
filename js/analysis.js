/**
 * PuzzleAnalyzer — Shared puzzle analysis logic
 *
 * Used by both browser (DebugExporter) and Node.js (debug_tool.js).
 * All methods are static and operate on serialized debug data.
 *
 * Checks:
 *   1. Data format validity
 *   2. Symbol counts (start, end, hexagon, square, star, tetris, etc.)
 *   3. Player path correctness (adjacency, blocked edges, bounds, start/end)
 *   4. Solver solution correctness (same checks as player path)
 *   5. Symmetry validation (if applicable)
 *   6. Edge and node non-interference (for symmetry mode)
 */
(function(global) {

const SYMBOL_LABELS = {
    start: '起点',
    end: '终点',
    hexagon: '六边形',
    square: '圆角方块',
    star: '星形',
    tetris: '俄罗斯方块',
    triangle: '三角形',
    elimination: '消除标记'
};

class PuzzleAnalyzer {

    // ==================== Symbol Counting ====================

    static countSymbols(data) {
        const counts = {};
        const inc = (type) => { counts[type] = (counts[type] || 0) + 1; };

        const board = data.board;
        if (!board) return counts;

        // Node symbols
        if (board.nodeSymbols) {
            for (const row of board.nodeSymbols) {
                for (const cell of row) {
                    for (const sym of cell) {
                        if (!sym) continue;
                        inc(typeof sym === 'string' ? sym : sym.type);
                    }
                }
            }
        }

        // Cell symbols
        if (board.cellSymbols) {
            for (const row of board.cellSymbols) {
                for (const cell of row) {
                    for (const sym of cell) {
                        if (typeof sym === 'string') {
                            inc(sym.split(':')[0]);
                        } else if (sym && sym.type) {
                            inc(sym.type);
                        }
                    }
                }
            }
        }

        // Edge symbols
        if (board.edgeSymbols) {
            for (const [, symbols] of Object.entries(board.edgeSymbols)) {
                for (const sym of symbols) {
                    if (!sym) continue;
                    inc(typeof sym === 'string' ? sym : sym.type);
                }
            }
        }

        return counts;
    }

    // ==================== Start/End Node Collection ====================

    static collectStartEndNodes(data) {
        const board = data.board;
        const startNodes = new Set();
        const endNodes = new Set();

        // Node-level starts/ends
        if (board.nodeSymbols) {
            for (let r = 0; r < board.nodeSymbols.length; r++) {
                const row = board.nodeSymbols[r];
                for (let c = 0; c < row.length; c++) {
                    for (const sym of row[c]) {
                        if (!sym) continue;
                        const type = typeof sym === 'string' ? sym : sym.type;
                        if (type === 'start') startNodes.add(`${r},${c}`);
                        if (type === 'end') endNodes.add(`${r},${c}`);
                    }
                }
            }
        }

        // Edge-midpoint starts/ends → add both adjacent nodes
        if (board.edgeSymbols) {
            for (const [key, symbols] of Object.entries(board.edgeSymbols)) {
                const [, coords] = key.split(':');
                const [r, c] = coords.split(',').map(Number);
                const dir = key[0];
                const n1 = {r, c};
                const n2 = dir === 'H' ? {r, c: c + 1} : {r: r + 1, c};
                for (const sym of symbols) {
                    if (!sym) continue;
                    const type = typeof sym === 'string' ? sym : sym.type;
                    if (type === 'start') {
                        startNodes.add(`${n1.r},${n1.c}`);
                        startNodes.add(`${n2.r},${n2.c}`);
                    }
                    if (type === 'end') {
                        endNodes.add(`${n1.r},${n1.c}`);
                        endNodes.add(`${n2.r},${n2.c}`);
                    }
                }
            }
        }

        return {startNodes, endNodes};
    }

    // ==================== Basic Path Validation ====================

    /**
     * Basic path validation (offline, without full validator).
     * Checks: adjacency, no self-intersection, starts/ends at valid positions,
     * doesn't cross blocked edges.
     */
    static validatePath(data, path) {
        const errors = [];
        const board = data.board;
        if (!path || path.length < 2) {
            return {valid: false, errors: ['路径长度不足 (需要至少2个节点)']};
        }

        const blockedSet = new Set(board.blockedEdges || []);
        const edgeKey = (r1, c1, r2, c2) => {
            if (r1 === r2) return `H:${r1},${Math.min(c1, c2)}`;
            else return `V:${Math.min(r1, r2)},${c1}`;
        };

        // No self-intersection
        const visited = new Set();
        for (let i = 0; i < path.length; i++) {
            const key = `${path[i].r},${path[i].c}`;
            if (visited.has(key)) {
                errors.push(`节点重复: (${path[i].r},${path[i].c}) 在第 ${i} 步重复访问`);
            }
            visited.add(key);
        }

        // Adjacency and blocked edges
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i], b = path[i + 1];
            const dr = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
            if (dr !== 1) {
                errors.push(`第 ${i} 步: (${a.r},${a.c}) → (${b.r},${b.c}) 不相邻`);
            } else {
                const ek = edgeKey(a.r, a.c, b.r, b.c);
                if (blockedSet.has(ek)) {
                    errors.push(`第 ${i} 步跨越了隔断边: ${ek}`);
                }
            }
        }

        // Bounds check
        for (let i = 0; i < path.length; i++) {
            const n = path[i];
            if (n.r < 0 || n.r > board.rows || n.c < 0 || n.c > board.cols) {
                errors.push(`节点 (${n.r},${n.c}) 超出棋盘范围 (${board.rows}×${board.cols} 节点网格)`);
            }
        }

        // Start/end check
        const {startNodes, endNodes} = PuzzleAnalyzer.collectStartEndNodes(data);

        if (startNodes.size > 0) {
            const firstKey = `${path[0].r},${path[0].c}`;
            if (!startNodes.has(firstKey)) {
                errors.push(`路径起点 (${path[0].r},${path[0].c}) 不是有效的起点`);
            }
        }

        if (endNodes.size > 0) {
            const lastKey = `${path[path.length - 1].r},${path[path.length - 1].c}`;
            if (!endNodes.has(lastKey)) {
                errors.push(`路径终点 (${path[path.length - 1].r},${path[path.length - 1].c}) 不是有效的终点`);
            }
        }

        return {valid: errors.length === 0, errors};
    }

    // ==================== Symmetry Validation (Offline) ====================

    static checkSymmetry(data, path) {
        const errors = [];
        const board = data.board;
        const sym = board.symmetry;
        const rows = board.rows;
        const cols = board.cols;

        if (!sym || sym === 'none') return {valid: true, errors: []};

        const mirror = (r, c) => {
            switch (sym) {
                case 'horizontal': return {r, c: cols - c};
                case 'vertical':   return {r: rows - r, c};
                case 'diagonal':   return {r: c, c: r};
                default:           return {r, c};
            }
        };

        const isOnAxis = (r, c) => {
            switch (sym) {
                case 'horizontal': return c * 2 === cols;
                case 'vertical':   return r * 2 === rows;
                case 'diagonal':   return r === c;
                default:           return false;
            }
        };

        const mirrorPath = path.map(n => mirror(n.r, n.c));

        // Bounds
        for (let i = 0; i < mirrorPath.length; i++) {
            const m = mirrorPath[i];
            if (m.r < 0 || m.r > rows || m.c < 0 || m.c > cols) {
                errors.push(`镜像路径节点 ${i}: (${m.r},${m.c}) 超出棋盘`);
            }
        }

        // No duplicate nodes in mirror path
        const seen = new Set();
        for (let i = 0; i < mirrorPath.length; i++) {
            const key = `${mirrorPath[i].r},${mirrorPath[i].c}`;
            if (seen.has(key)) {
                errors.push(`镜像路径有重复节点: (${mirrorPath[i].r},${mirrorPath[i].c})`);
            }
            seen.add(key);
        }

        const blockedSet = new Set(board.blockedEdges || []);
        const edgeKey = (r1, c1, r2, c2) => {
            if (r1 === r2) return `H:${r1},${Math.min(c1, c2)}`;
            else return `V:${Math.min(r1, r2)},${c1}`;
        };

        // Mirror edges not blocked
        for (let i = 0; i < mirrorPath.length - 1; i++) {
            const a = mirrorPath[i], b = mirrorPath[i + 1];
            const dr = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
            if (dr === 1) {
                const ek = edgeKey(a.r, a.c, b.r, b.c);
                if (blockedSet.has(ek)) {
                    errors.push(`镜像路径第 ${i} 步跨越隔断边: ${ek}`);
                }
            }
        }

        // Edge non-interference
        const mainEdges = new Set();
        for (let i = 0; i < path.length - 1; i++) {
            const a = path[i], b = path[i + 1];
            const dr = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
            if (dr === 1) mainEdges.add(edgeKey(a.r, a.c, b.r, b.c));
        }
        for (let i = 0; i < mirrorPath.length - 1; i++) {
            const a = mirrorPath[i], b = mirrorPath[i + 1];
            const dr = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
            if (dr === 1) {
                const ek = edgeKey(a.r, a.c, b.r, b.c);
                if (mainEdges.has(ek)) {
                    errors.push(`边冲突: 主路径和镜像路径共用边 ${ek}`);
                }
            }
        }

        // Node non-interference
        const mainNonAxis = new Set();
        for (const n of path) {
            if (!isOnAxis(n.r, n.c)) mainNonAxis.add(`${n.r},${n.c}`);
        }
        for (const n of mirrorPath) {
            if (!isOnAxis(n.r, n.c)) {
                if (mainNonAxis.has(`${n.r},${n.c}`)) {
                    errors.push(`节点冲突: 主路径和镜像路径在非对称轴上共用节点 (${n.r},${n.c})`);
                }
            }
        }

        return {valid: errors.length === 0, errors};
    }

    // ==================== Main Analysis ====================

    static analyze(data) {
        const checks = [];
        const details = {};

        // 1. Format check
        if (!data.version) {
            checks.push({pass: false, cat: 'format', msg: '缺少 version 字段'});
            return {summary: '格式错误', checks, details};
        }
        if (!data.board) {
            checks.push({pass: false, cat: 'format', msg: '缺少 board 数据'});
            return {summary: '格式错误', checks, details};
        }

        const board = data.board;
        details.boardSize = `${board.rows}×${board.cols}`;
        details.symmetry = board.symmetry || 'none';

        // 2. Symbol counts
        const symbolCounts = PuzzleAnalyzer.countSymbols(data);
        details.symbolCounts = symbolCounts;

        // 3. Start/End presence
        const hasStart = (symbolCounts.start || 0) > 0;
        const hasEnd = (symbolCounts.end || 0) > 0;
        checks.push({
            pass: hasStart, cat: 'symbols',
            msg: hasStart ? `起点: ${symbolCounts.start} 个` : '⚠ 没有放置起点'
        });
        checks.push({
            pass: hasEnd, cat: 'symbols',
            msg: hasEnd ? `终点: ${symbolCounts.end} 个` : '⚠ 没有放置终点'
        });

        // 4. Player path validation
        if (data.playerValidation) {
            const pv = data.playerValidation;
            checks.push({
                pass: pv.valid, cat: 'validation',
                msg: pv.valid ? '玩家路径验证通过 ✓' :
                    `玩家路径验证失败: ${pv.errors.length} 个错误`
            });
            if (!pv.valid && pv.errors.length > 0) {
                details.playerErrors = pv.errors;
            }
        } else if (data.playerPath && data.playerPath.length > 0) {
            checks.push({
                pass: null, cat: 'validation',
                msg: `玩家路径有 ${data.playerPath.length} 个节点，尚未完成（未到达终点）`
            });
            // Still run basic checks
            const pc = PuzzleAnalyzer.validatePath(data, data.playerPath);
            if (!pc.valid) {
                details.playerBasicErrors = pc.errors;
                checks.push({pass: false, cat: 'validation', msg: `基本路径检查发现 ${pc.errors.length} 个问题`});
            }
        }

        // 5. Solver solutions
        if (data.solutions && data.solutions.length > 0) {
            checks.push({
                pass: true, cat: 'solver',
                msg: `求解器找到 ${data.solutions.length} 个解 (方法: ${(data.solverInfo && data.solverInfo.method) || 'unknown'})`
            });

            const pathChecks = [];
            for (let i = 0; i < data.solutions.length; i++) {
                const pc = PuzzleAnalyzer.validatePath(data, data.solutions[i]);
                pathChecks.push({index: i, length: data.solutions[i].length, valid: pc.valid, errors: pc.errors});
            }
            details.solutionChecks = pathChecks;

            const validCount = pathChecks.filter(p => p.valid).length;
            checks.push({
                pass: validCount === data.solutions.length,
                cat: 'solver',
                msg: `解的基本检查: ${validCount}/${data.solutions.length} 通过`
            });

            // If solutions exist, check against player validation
            if (pathChecks.every(p => p.valid) && data.playerValidation && !data.playerValidation.valid) {
                checks.push({
                    pass: null, cat: 'solver',
                    msg: '注意: 求解器找到了有效解，但玩家路径验证失败（可能是玩家路径画法不同）'
                });
            }
        } else {
            checks.push({
                pass: data.solutions !== undefined && data.solutions !== null ? null : undefined,
                cat: 'solver',
                msg: data.solutions !== undefined && data.solutions !== null
                    ? '求解器返回 0 个解（谜题可能无解或求解器未覆盖此规则组合）'
                    : '未包含求解器结果（导出时未求解或求解失败）'
            });
        }

        // 6. Symmetry checks
        if (board.symmetry && board.symmetry !== 'none' && data.solutions && data.solutions.length > 0) {
            const symChecks = [];
            for (let i = 0; i < data.solutions.length; i++) {
                const sv = PuzzleAnalyzer.checkSymmetry(data, data.solutions[i]);
                symChecks.push({index: i, symmetryValid: sv.valid, errors: sv.errors});
            }
            details.symmetryChecks = symChecks;
            const symOk = symChecks.filter(s => s.symmetryValid).length;
            checks.push({
                pass: symOk === data.solutions.length,
                cat: 'symmetry',
                msg: `对称性检查: ${symOk}/${data.solutions.length} 个解通过`
            });
        }

        // Determine summary
        const failures = checks.filter(c => c.pass === false).length;
        const warnings = checks.filter(c => c.pass === null).length;
        let summary;
        if (failures === 0 && warnings === 0) {
            summary = '✅ 全部检查通过';
        } else if (failures === 0) {
            summary = `⚠ 全部通过但有 ${warnings} 项需注意`;
        } else {
            summary = `❌ ${failures} 项检查失败, ${warnings} 项需注意`;
        }

        return {summary, checks, details};
    }

    // ==================== Report Generation ====================

    static reportText(data) {
        const result = PuzzleAnalyzer.analyze(data);
        const lines = [];

        lines.push('='.repeat(60));
        lines.push('  The Witness 谜题调试报告');
        lines.push('='.repeat(60));
        lines.push('');
        lines.push(`导出时间: ${data.timestamp || '未知'}`);
        lines.push(`棋盘尺寸: ${result.details.boardSize || '未知'}`);
        lines.push(`对称设置: ${result.details.symmetry || 'none'}`);

        // Source info
        if (data.solverInfo) {
            lines.push(`求解方法: ${data.solverInfo.method || '?'} (共 ${data.solverInfo.totalFound || 0} 个解)`);
        }
        lines.push('');

        // Symbol counts
        if (result.details.symbolCounts) {
            const sc = result.details.symbolCounts;
            const entries = Object.entries(sc).filter(([, v]) => v > 0);
            if (entries.length > 0) {
                lines.push('── 符号统计 ──');
                for (const [type, count] of entries) {
                    const label = SYMBOL_LABELS[type] || type;
                    lines.push(`  ${label}: ${count}`);
                }
                lines.push('');
            }
        }

        // Checks
        lines.push('── 检查结果 ──');
        for (const c of result.checks) {
            const icon = c.pass === true ? '✓' : c.pass === false ? '✗' : '?';
            lines.push(`  ${icon} [${c.cat}] ${c.msg}`);
        }
        lines.push('');

        // Player errors
        if (result.details.playerErrors) {
            lines.push('── 玩家路径错误 ──');
            for (const e of result.details.playerErrors) {
                lines.push(`  ✗ [${e.rule}] ${e.message}`);
            }
            lines.push('');
        }

        if (result.details.playerBasicErrors) {
            lines.push('── 玩家路径基本问题 ──');
            for (const e of result.details.playerBasicErrors) {
                lines.push(`  ⚠ ${e}`);
            }
            lines.push('');
        }

        // Solution path details
        if (result.details.solutionChecks) {
            lines.push('── 求解器路径详情 ──');
            for (const sc of result.details.solutionChecks) {
                const icon = sc.valid ? '✓' : '✗';
                lines.push(`  ${icon} 解 #${sc.index + 1}: ${sc.length} 个节点, 基础检查=${sc.valid ? '通过' : '失败'}`);
                if (sc.errors.length > 0) {
                    for (const e of sc.errors) {
                        lines.push(`      ⚠ ${e}`);
                    }
                }
                // Print the path
                const path = data.solutions[sc.index];
                const pathStr = path.map(n => `(${n.r},${n.c})`).join(' → ');
                lines.push(`      路径: ${pathStr}`);
            }
            lines.push('');
        }

        // Symmetry details
        if (result.details.symmetryChecks) {
            lines.push('── 对称性检查详情 ──');
            for (const sc of result.details.symmetryChecks) {
                const icon = sc.symmetryValid ? '✓' : '✗';
                lines.push(`  ${icon} 解 #${sc.index + 1}: ${sc.symmetryValid ? '对称有效' : '对称检查失败'}`);
                for (const e of sc.errors) {
                    lines.push(`      ⚠ ${e}`);
                }
            }
            lines.push('');
        }

        lines.push('='.repeat(60));
        lines.push(`  结论: ${result.summary}`);
        lines.push('='.repeat(60));

        return lines.join('\n');
    }
}

// UMD: browser (window) and Node.js (module.exports)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PuzzleAnalyzer };
} else {
    global.PuzzleAnalyzer = PuzzleAnalyzer;
}

})(typeof window !== 'undefined' ? window : global);
