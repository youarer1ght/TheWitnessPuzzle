/**
 * Validator module - Region detection and puzzle rule validation
 *
 * Rules (corrected per 《The Witness》设计研究笔记):
 *
 * 1. 路径规则：必须从起点开始，到终点结束，不可重复经过同一节点
 * 2. 六边形(Hexagon)：路径必须经过每一个六边形符号
 * 3. 圆角方块(Square)：划线将不同颜色的方块分隔到不同的连通区域中
 *    - 同一区域内不能出现不同颜色的方块
 *    - 棋盘边界也算作"墙"
 *    - 无偶数/数量限制（方块不需要成对，任意数量的同色方块都合法）
 *    - 黑、白方块与其它颜色一视同仁（黑白是不同颜色，同样必须隔开）
 * 4. 星形符号(Star/Sun)：区域内存在某色星形时，该色符号（星形+同色方块）总数恰好为2
 *    - 星形是配对的触发者；同色方块仅在与星形同区时才作配对对象
 *    - 区域内无某色星形时，该色方块不参与配对，仅遵循颜色分离规则
 * 5. 俄罗斯方块(Tetris)：所在分割区域的形状必须与块状符号外形匹配
 *    - 水平摆放（非倾斜）：形状和角度完全相同，不可旋转
 *    - 倾斜摆放：形状相同即可，可旋转但不能翻转/镜像
 *    - 空心蓝色块：减法，从黄色形状中减去对应格子
 *    - 特殊规则：区域内空心块数量==实心块数量时，区域形状不重要
 * 6. 三角形(Triangle)：该格子的边被路径经过的次数 = 三角形数量
 * 7. 消除标记(Elimination/倒Y)：消除所在区域内"一个条件未被满足的符号"（自身除外）
 *    - 逐符号消除：每个消除标记只消除一个违规符号，消除后区域必须恢复合法
 *    - 例：区域内 2黑+2白 → 消除1个仍剩黑+白混合 → 一个消除标记无法修复该区域
 *    - 区域无违规符号可消除时，消除标记本身报错
 */
class PuzzleValidator {
    constructor() {
        this.errors = [];
    }

    /**
     * Main validation entry point
     * @returns {{valid: boolean, errors: Array, regions: Array}}
     */
    validate(board, pathController) {
        this.errors = [];
        const path = pathController.getPathNodes();

        // Rule 0: Path must be complete
        if (!pathController.isComplete()) {
            this.errors.push({rule: 'path', message: '路径未完成，需要从起点到达终点'});
            return {valid: false, errors: this.errors, regions: []};
        }

        // Validate start: path must begin from ANY valid start point (node or edge)
        const startEdges = board.findAllEdgeSymbols('start');
        const startNodes = board.findAllNodeSymbols('start');

        if (startNodes.length > 0 || startEdges.length > 0) {
            if (path.length < 1) {
                this.errors.push({rule: 'path', message: '路径至少需要1个节点'});
                return {valid: false, errors: this.errors, regions: []};
            }
            const first = path[0];
            let validStart = false;

            for (const sn of startNodes) {
                if (first.r === sn.r && first.c === sn.c) {
                    validStart = true;
                    break;
                }
            }
            if (!validStart) {
                for (const se of startEdges) {
                    const [n1, n2] = board.getEdgeNodes(se.r, se.c, se.dir);
                    if ((first.r === n1.r && first.c === n1.c) ||
                        (first.r === n2.r && first.c === n2.c)) {
                        validStart = true;
                        break;
                    }
                }
            }

            if (!validStart) {
                this.errors.push({rule: 'path', message: '路径必须从有效的起点（节点或边缘中点）出发'});
                return {valid: false, errors: this.errors, regions: []};
            }
        }

        // Symmetry validation
        this.validateSymmetry(board, pathController);
        if (this.errors.length > 0) {
            return {valid: false, errors: this.errors, regions: []};
        }

        // Get regions defined by the path
        const regions = this.detectRegions(board, pathController);

        // Rule 1: Hexagons
        this.validateHexagons(board, pathController);

        // Rule 2: Squares — color separation
        this.validateSquares(board, regions);

        // Rule 3: Stars — color pairing
        this.validateStars(board, regions);

        // Rule 4: Tetris blocks — shape matching
        this.validateTetris(board, regions);

        // Rule 5: Triangles — edge count
        this.validateTriangles(board, pathController, regions);

        // Rule 6: Elimination — post-processing: cancel one error per elimination mark
        this.validateElimination(board, regions);

        return {
            valid: this.errors.length === 0,
            errors: this.errors,
            regions: regions
        };
    }

    // ==================== Region Detection ====================

    /**
     * 区域检测：路径的边 + 棋盘边界 = 分隔墙，将棋盘划分为若干连通区域
     * Cell (r,c) boundaries:
     *   top:    H edge at (r, c)     → nodes (r,c) to (r,c+1)
     *   bottom: H edge at (r+1, c)   → nodes (r+1,c) to (r+1,c+1)
     *   left:   V edge at (r, c)     → nodes (r,c) to (r+1,c)
     *   right:  V edge at (r, c+1)   → nodes (r,c+1) to (r+1,c+1)
     */
    detectRegions(board, pathController) {
        const {rows, cols} = board;
        const visited = Array.from({length: rows}, () => Array(cols).fill(false));
        const regions = [];

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!visited[r][c]) {
                    const region = [];
                    this.floodFill(board, pathController, r, c, visited, region);
                    regions.push(region);
                }
            }
        }

        return regions;
    }

    /**
     * Flood fill: 从单元格出发，不跨过路径边，填充整个连通区域
     */
    floodFill(board, pathController, r, c, visited, region) {
        const {rows, cols} = board;
        const stack = [{r, c}];

        while (stack.length > 0) {
            const {r, c} = stack.pop();
            if (r < 0 || r >= rows || c < 0 || c >= cols || visited[r][c]) continue;
            visited[r][c] = true;
            region.push({r, c});

            // Right: blocked if path uses V-edge at (r, c+1) → separates (r,c) from (r,c+1)
            // In symmetry mode, both main and mirror path edges act as boundaries
            if (c + 1 < cols && !pathController.isEdgeInAnyPath(r, c + 1, r + 1, c + 1)) {
                stack.push({r, c: c + 1});
            }
            // Left: blocked if path uses V-edge at (r, c) → separates (r,c-1) from (r,c)
            if (c > 0 && !pathController.isEdgeInAnyPath(r, c, r + 1, c)) {
                stack.push({r, c: c - 1});
            }
            // Down: blocked if path uses H-edge at (r+1, c) → separates (r,c) from (r+1,c)
            if (r + 1 < rows && !pathController.isEdgeInAnyPath(r + 1, c, r + 1, c + 1)) {
                stack.push({r: r + 1, c});
            }
            // Up: blocked if path uses H-edge at (r, c) → separates (r-1,c) from (r,c)
            if (r > 0 && !pathController.isEdgeInAnyPath(r, c, r, c + 1)) {
                stack.push({r: r - 1, c});
            }
        }
    }

    // ==================== Rule: Hexagons ====================
    // 规则：路径必须经过每一个六边形符号
    // - 节点六边形：路径必须穿过该节点
    // - 边缘中点六边形：路径必须走过该条边（类似起点/终点可位于边缘中点）

    validateHexagons(board, pathController) {
        // 节点（交叉点）六边形
        const hexagons = board.findAllNodeSymbols('hexagon');
        const pathNodes = new Set(pathController.getPathNodes().map(n => `${n.r},${n.c}`));

        for (const hex of hexagons) {
            if (!pathNodes.has(`${hex.r},${hex.c}`)) {
                this.errors.push({
                    rule: 'hexagon',
                    message: `六边形位于节点(${hex.r},${hex.c})未被路径经过`,
                    pos: {r: hex.r, c: hex.c}
                });
            }
        }

        // 边缘中点六边形：路径必须走过该条边
        const edgeHexagons = board.findAllEdgeSymbols('hexagon');
        for (const eh of edgeHexagons) {
            const [n1, n2] = board.getEdgeNodes(eh.r, eh.c, eh.dir);
            if (!pathController.isEdgeInAnyPath(n1.r, n1.c, n2.r, n2.c)) {
                this.errors.push({
                    rule: 'hexagon',
                    message: `六边形位于边缘中点(${eh.r},${eh.c}·${eh.dir === 'H' ? '水平' : '垂直'})未被路径经过`,
                    pos: {r: eh.r, c: eh.c}
                });
            }
        }
    }

    // ==================== Rule: Symmetry ====================
    // 规则：对称模式下，路径必须关于对称轴镜像对称
    // 委托给 Board.validateSymmetricPath() — 共享的权威实现

    validateSymmetry(board, pathController) {
        if (board.symmetry === 'none') return;
        const path = pathController.getPathNodes();
        if (path.length < 2) return;
        const result = board.validateSymmetricPath(path);
        if (!result.valid) {
            this.errors.push(...result.errors);
        }
    }

    // ==================== Rule: Squares (圆角方块) ====================
    // 规则：划线必须将不同颜色的圆角方块分隔到不同的连通区域中
    // 同一颜色的方块可分散在多个区域，只要每个区域内不混入异色方块即可

    validateSquares(board, regions) {
        const squares = board.findAllCellSymbols('square');

        for (let regionIdx = 0; regionIdx < regions.length; regionIdx++) {
            const region = regions[regionIdx];
            const colorCount = {};
            let total = 0;
            for (const cell of region) {
                for (const sq of squares) {
                    if (sq.r === cell.r && sq.c === cell.c) {
                        const color = sq.symbol.color;
                        colorCount[color] = (colorCount[color] || 0) + 1;
                        total++;
                    }
                }
            }
            if (Object.keys(colorCount).length > 1) {
                const maxColorCount = Math.max(...Object.values(colorCount));
                // 消除标记按符号逐个消除：要让区域只剩单一颜色，必须消除
                // 所有"非最多颜色"的方块（每消除一个方块即少一个违规符号）。
                // 例：2黑+2白 → 需消除2个（1个不够，消除后仍黑+白混合）。
                const waive = total - maxColorCount;
                const colors = Object.keys(colorCount).join('、');
                this.errors.push({
                    rule: 'square',
                    message: `同一区域内存在不同颜色的圆角方块: ${colors}（需分隔到不同区域）`,
                    region: region,
                    regionIndex: regionIdx,
                    waive: waive
                });
            }
        }
    }

    // ==================== Rule: Stars (星形符号) ====================
    // 规则：区域内存在某色星形时，该色"配对符号"（星形 + 同色圆角方块）总数必须恰好为2。
    // - 配对对象不限于星形——同色方块可作星形的配对对象，但仅当与星形同处一个区域
    // - 区域中没有某色星形时，该色方块不参与配对，仅遵循颜色分离规则
    //   （例：两个紫色星形同区 + 橙色方块同区 → 橙色方块无配对约束，只做颜色分离）
    // - 对所有颜色一视同仁：黑白方块与其它颜色方块规则相同（仅在与同色星形同区时参与配对）
    // - 圆角方块本身只要求颜色分离，无偶数配对限制（见 validateSquares）

    validateStars(board, regions) {
        const stars = board.findAllCellSymbols('star');
        const squares = board.findAllCellSymbols('square');

        for (let regionIdx = 0; regionIdx < regions.length; regionIdx++) {
            const region = regions[regionIdx];

            // 统计区域内每种颜色的星形符号数量（星形触发配对约束）
            const starCount = {};
            for (const cell of region) {
                for (const st of stars) {
                    if (st.r === cell.r && st.c === cell.c) {
                        const color = st.symbol.color || '#ff6348';
                        starCount[color] = (starCount[color] || 0) + 1;
                    }
                }
            }

            // 仅对"区域内存在星形"的颜色施加配对约束
            for (const [color, sc] of Object.entries(starCount)) {
                let total = sc;
                // 同色圆角方块在星形所在区域内可作为配对对象
                for (const cell of region) {
                    for (const sq of squares) {
                        if (sq.r === cell.r && sq.c === cell.c && sq.symbol.color === color) {
                            total++;
                        }
                    }
                }
                if (total !== 2) {
                    // 每个消除标记消除一个该色符号：
                    // - total > 2：消除 total-2 个 → 恰好剩2个成对
                    // - total == 1：消除唯一那颗星 → 该色无星，配对约束消失
                    const waive = total > 2 ? total - 2 : 1;
                    this.errors.push({
                        rule: 'star',
                        message: `区域中${color}色配对符号（星形+同色方块）共${total}个（需要恰好2个）`,
                        region: region,
                        regionIndex: regionIdx,
                        waive: waive
                    });
                }
            }
        }
    }

    // ==================== Rule: Tetris (俄罗斯方块/多联骨牌) ====================
    // 规则（修正）：
    // - 区域形状必须能恰好被该区域内的方块形状填满（可平移，不可重叠）
    // - 水平摆放（tilted=false）：不可旋转，必须保持原始朝向
    // - 倾斜摆放（tilted=true）：可旋转（但不能翻转/镜像）
    // - 空心蓝色块（hollow=true）：减法，从实心形状中减去
    // - 特殊：区域内空心块数量 == 实心块数量 → 区域形状无关（全抵消）

    validateTetris(board, regions) {
        const tetrisBlocks = board.findAllCellSymbols('tetris');
        if (tetrisBlocks.length === 0) return;

        for (let ri = 0; ri < regions.length; ri++) {
            const region = regions[ri];

            // Collect tetris blocks in this region
            const regionBlocks = [];
            for (const cell of region) {
                for (const tb of tetrisBlocks) {
                    if (tb.r === cell.r && tb.c === cell.c) {
                        regionBlocks.push({...tb.symbol, r: tb.r, c: tb.c});
                    }
                }
            }

            if (regionBlocks.length === 0) continue;

            // 全抵消（实心==空心）→ 区域形状无关，任何情况都合法
            const allSolid = regionBlocks.filter(t => !t.hollow);
            const allHollow = regionBlocks.filter(t => t.hollow);
            if (allHollow.length > 0) {
                const sc = allSolid.reduce((s, b) => s + TetrisUtils.countCells(b.shape), 0);
                const hc = allHollow.reduce((s, b) => s + TetrisUtils.countCells(b.shape), 0);
                if (sc === hc) continue;
            }

            // 消除标记按符号逐个消除：找出"能保持合法"的最大方块子集，
            // 需消除的方块数 = 总数 - 最大合法子集大小。
            const n = regionBlocks.length;
            let maxFit = 0;
            for (let mask = 0; mask < (1 << n); mask++) {
                let size = 0;
                for (let i = 0; i < n; i++) if (mask & (1 << i)) size++;
                if (size <= maxFit) continue; // 不可能超过当前最优
                const subset = [];
                for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(regionBlocks[i]);
                if (this._tetrisSubsetValid(subset, region, board.rows, board.cols)) {
                    maxFit = size;
                }
            }

            if (maxFit === n) continue; // 全量方块本身合法

            this.errors.push({
                rule: 'tetris',
                message: `俄罗斯方块无法拼成当前区域形状（需消除${n - maxFit}个方块）`,
                region: region,
                regionIndex: ri,
                waive: n - maxFit
            });
        }
    }

    /**
     * 判断一组俄罗斯方块（子集）能否恰好填满给定区域
     * 空子集（无方块）恒为合法——即无俄罗斯方块约束
     */
    _tetrisSubsetValid(subsetBlocks, region, rows, cols) {
        const solidBlocks = subsetBlocks.filter(t => !t.hollow);
        const hollowBlocks = subsetBlocks.filter(t => t.hollow);

        if (solidBlocks.length === 0) {
            // 无实心 → 只有空子集合法（空心不能单独存在）
            return hollowBlocks.length === 0;
        }
        if (hollowBlocks.length > 0) {
            const sc = solidBlocks.reduce((s, b) => s + TetrisUtils.countCells(b.shape), 0);
            const hc = hollowBlocks.reduce((s, b) => s + TetrisUtils.countCells(b.shape), 0);
            if (sc === hc) return true; // 全抵消 → 区域形状无关
        }

        const solidCount = solidBlocks.reduce((s, b) => s + TetrisUtils.countCells(b.shape), 0);
        const hollowCount = hollowBlocks.reduce((s, b) => s + TetrisUtils.countCells(b.shape), 0);
        const requiredArea = solidCount - hollowCount;
        if (region.length !== requiredArea) return false;
        if (requiredArea > 0) {
            return this.canFitTetrisPieces(region, solidBlocks, hollowBlocks, rows, cols);
        }
        return true;
    }


    /**
     * 检查俄罗斯方块是否能拼入区域
     * 委托给共享的 TetrisUtils 进行回溯搜索
     */
    canFitTetrisPieces(region, solidBlocks, hollowBlocks, rows, cols) {
        const solidItems = solidBlocks.map(b => ({
            shape: b.shape,
            tilted: b.tilted || false,
            anchorR: b.r,
            anchorC: b.c
        }));
        const hollowItems = hollowBlocks.map(b => ({
            shape: b.shape,
            tilted: b.tilted || false,
            isHollow: true,
            anchorR: b.r,
            anchorC: b.c
        }));
        if (hollowBlocks.length > 0) {
            return TetrisUtils.canFitRegionWithHollow(region, solidItems, hollowItems, rows, cols);
        }
        return TetrisUtils.canFitRegion(region, solidItems, rows, cols);
    }

    // ==================== Rule: Triangles (三角形) ====================
    // 规则：该格子周围被路径经过的边数 = 三角形数量
    // 三角形数量为1/2/3，分别表示1/2/3条边必须被经过

    validateTriangles(board, pathController, regions) {
        const triangles = board.findAllCellSymbols('triangle');

        for (const tri of triangles) {
            const {r, c, symbol} = tri;
            let edgesTouched = 0;

            // Top edge (main + symmetric path edges both count in symmetry mode)
            if (pathController.isEdgeInAnyPath(r, c, r, c + 1)) edgesTouched++;
            // Bottom edge
            if (pathController.isEdgeInAnyPath(r + 1, c, r + 1, c + 1)) edgesTouched++;
            // Left edge
            if (pathController.isEdgeInAnyPath(r, c, r + 1, c)) edgesTouched++;
            // Right edge
            if (pathController.isEdgeInAnyPath(r, c + 1, r + 1, c + 1)) edgesTouched++;

            if (edgesTouched !== symbol.count) {
                // Find which region this triangle cell belongs to (for elimination rule)
                let regionIndex;
                for (let i = 0; i < regions.length; i++) {
                    if (regions[i].some(cell => cell.r === r && cell.c === c)) {
                        regionIndex = i;
                        break;
                    }
                }
                this.errors.push({
                    rule: 'triangle',
                    message: `格子(${r},${c})的三角形要求${symbol.count}条边被经过，实际${edgesTouched}条`,
                    pos: {r, c},
                    regionIndex,
                    waive: 1
                });
            }
        }
    }

    // ==================== Rule: Elimination (消除标记/倒Y) ====================
    // Corrected rule: each elimination mark eliminates ONE unsatisfied symbol
    // in its region (excluding itself) — not a blanket region-level cancel.
    // This is a POST-PROCESSING step that runs after all other validations.
    //
    // - 消除标记消除所在区域内"一个条件未被满足的符号"（自身除外）
    // - 每条区域规则错误携带 waive 代价 = 需消除多少个符号才能修复
    // - 不可消除：另一个消除标记、路径错误、对称性错误
    // - 若区域内无违规符号可消除 → 消除标记本身报错

    /**
     * Post-processing: each elimination mark cancels ONE specifically-failing symbol
     * in its region. Each region-rule error carries a `waive` cost = minimum number
     * of symbols that must be eliminated to make that rule pass:
     *   - 方块: 总数 - 最大颜色数（消除部分方块后余下同色）
     *   - 星形: 总数>2 ? 总数-2 : 1（消除到只剩 2 个，或消除 1 个）
     *   - 三角形: 1（每条边数错误需消除该三角形）
     *   - 俄罗斯方块: n - 最大合法子集大小
     * Runs after ALL other validations have collected errors.
     */
    validateElimination(board, regions) {
        const eliminations = board.findAllCellSymbols('elimination');
        if (eliminations.length === 0) return;

        // Map each region index to number of elimination marks in it
        const elimPerRegion = new Map(); // regionIndex → count
        for (const elim of eliminations) {
            for (let i = 0; i < regions.length; i++) {
                if (regions[i].some(cell => cell.r === elim.r && cell.c === elim.c)) {
                    elimPerRegion.set(i, (elimPerRegion.get(i) || 0) + 1);
                    break;
                }
            }
        }

        const cancelledIndices = new Set();

        for (const [regionIdx, elimCount] of elimPerRegion) {
            // Collect cancellable errors in this region (each with a waive cost)
            const cancellable = [];
            for (let errIdx = 0; errIdx < this.errors.length; errIdx++) {
                const err = this.errors[errIdx];
                if (err.rule === 'elimination') continue;
                if (err.regionIndex === regionIdx && typeof err.waive === 'number' && err.waive >= 1) {
                    cancellable.push({errIdx, waive: err.waive});
                }
            }

            if (cancellable.length === 0) {
                // No cancellable violation → every mark here is unused → flags itself as error
                this._flagUnusedEliminations(eliminations, regions, regionIdx, elimCount, cancelledIndices);
                continue;
            }

            const totalCost = cancellable.reduce((s, e) => s + e.waive, 0);
            if (elimCount >= totalCost) {
                // Enough marks to fix every violation in this region
                for (const c of cancellable) cancelledIndices.add(c.errIdx);
                const leftover = elimCount - totalCost;
                if (leftover > 0) {
                    this._flagUnusedEliminations(eliminations, regions, regionIdx, leftover, cancelledIndices);
                }
            } else {
                // Not enough marks → absorb the cheapest violations greedily
                // (e.g. 2黑+2白 + 1消除 → 方块waive=2 > 1预算 → 无法修复 → 方块错误保留)
                cancellable.sort((a, b) => a.waive - b.waive);
                let budget = elimCount;
                for (const c of cancellable) {
                    if (budget >= c.waive) {
                        cancelledIndices.add(c.errIdx);
                        budget -= c.waive;
                    }
                }
            }
        }

        // Remove cancelled errors from the list
        this.errors = this.errors.filter((_, idx) => !cancelledIndices.has(idx));
    }

    /**
     * Flag `count` elimination marks in `regionIdx` as unused errors
     * (区域没有可取消的违规，或消除标记超出可取消违规的代价总和)
     */
    _flagUnusedEliminations(eliminations, regions, regionIdx, count, cancelledIndices) {
        let remaining = count;
        for (const elim of eliminations) {
            if (remaining <= 0) break;
            if (regions[regionIdx].some(cell => cell.r === elim.r && cell.c === elim.c)) {
                // Only flag if not already an error for this elimination mark
                const alreadyError = this.errors.some(e =>
                    e.rule === 'elimination' && e.pos &&
                    e.pos.r === elim.r && e.pos.c === elim.c
                );
                if (!alreadyError) {
                    this.errors.push({
                        rule: 'elimination',
                        message: `消除标记(${elim.r},${elim.c})所在区域没有可取消的违规`,
                        pos: {r: elim.r, c: elim.c},
                        regionIndex: regionIdx
                    });
                    remaining--;
                }
            }
        }
        void cancelledIndices;
    }
}
