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
 * 4. 星形符号(Star/Sun)：同一分割区域内，与星形同色的符号恰好成对出现（2个）
 *    - 配对对象不限于星形，同色方块也可以配对
 * 5. 俄罗斯方块(Tetris)：所在分割区域的形状必须与块状符号外形匹配
 *    - 水平摆放（非倾斜）：形状和角度完全相同，不可旋转
 *    - 倾斜摆放：形状相同即可，可旋转但不能翻转/镜像
 *    - 空心蓝色块：减法，从黄色形状中减去对应格子
 *    - 特殊规则：区域内空心块数量==实心块数量时，区域形状不重要
 * 6. 三角形(Triangle)：该格子的边被路径经过的次数 = 三角形数量
 * 7. 消除标记(Elimination/倒Y)：后处理步骤——取消所在区域内的恰好一个规则违规
 *    - 可取消任意类型违规（方块颜色、星形配对、俄罗斯方块、三角形边数等）
 *    - 不可取消另一个消除标记、路径起点/终点错误、对称性错误
 *    - 若区域内无违规可取消，消除标记本身报错
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
    // 规则：路径必须经过（穿过节点）每一个六边形符号

    validateHexagons(board, pathController) {
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
            const squareColors = new Set();
            for (const cell of region) {
                for (const sq of squares) {
                    if (sq.r === cell.r && sq.c === cell.c) {
                        squareColors.add(sq.symbol.color);
                    }
                }
            }
            if (squareColors.size > 1) {
                const colors = [...squareColors].join('、');
                this.errors.push({
                    rule: 'square',
                    message: `同一区域内存在不同颜色的圆角方块: ${colors}（需分隔到不同区域）`,
                    region: region,
                    regionIndex: regionIdx
                });
            }
        }
    }

    // ==================== Rule: Stars (星形符号) ====================
    // 规则：同一分割区域内，与星形符号同色的其他符号有且只有1个（即恰好2个一组）
    // 配对对象不限于星形——同色的方块也可以配对
    // 每种颜色独立计数

    validateStars(board, regions) {
        const stars = board.findAllCellSymbols('star');
        const squares = board.findAllCellSymbols('square');

        for (let regionIdx = 0; regionIdx < regions.length; regionIdx++) {
            const region = regions[regionIdx];
            // 统计区域内每种颜色的"可配对符号"数量
            const colorCount = {};

            for (const cell of region) {
                // 星形符号 — 按颜色计数
                for (const st of stars) {
                    if (st.r === cell.r && st.c === cell.c) {
                        const color = st.symbol.color || '#ff6348';
                        colorCount[color] = (colorCount[color] || 0) + 1;
                    }
                }
                // 圆角方块也可参与星形配对 — 按颜色计数
                for (const sq of squares) {
                    if (sq.r === cell.r && sq.c === cell.c) {
                        const color = sq.symbol.color;
                        // NOTE: 黑白方块主要遵循颜色分离规则，不参与星形配对
                        if (color !== 'black' && color !== 'white') {
                            colorCount[color] = (colorCount[color] || 0) + 1;
                        }
                    }
                }
            }

            // 每种颜色的符号数量必须是0或2（恰好成对）
            for (const [color, count] of Object.entries(colorCount)) {
                if (count !== 0 && count !== 2) {
                    this.errors.push({
                        rule: 'star',
                        message: `区域中${color}色符号有${count}个（需要恰好2个成对，或0个）`,
                        region: region,
                        regionIndex: regionIdx
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

            const solidBlocks = regionBlocks.filter(t => !t.hollow);
            const hollowBlocks = regionBlocks.filter(t => t.hollow);

            const solidCount = solidBlocks.reduce((sum, b) => sum + TetrisUtils.countCells(b.shape), 0);
            const hollowCount = hollowBlocks.reduce((sum, b) => sum + TetrisUtils.countCells(b.shape), 0);

            // Hollow blocks cannot exist alone — must have solid blocks in same region
            if (solidBlocks.length === 0) {
                if (hollowBlocks.length > 0) {
                    this.errors.push({
                        rule: 'tetris',
                        message: '区域内只有空心方块，没有实心方块进行减法运算',
                        region: region,
                        regionIndex: ri
                    });
                }
                continue;
            }
            if (hollowBlocks.length > 0 && solidCount === hollowCount) {
                // Full cancellation — region shape irrelevant
                continue;
            }

            // Hollow blocks subtract from the required region size.
            // A 3-cell solid + 1-cell hollow → region needs only 2 cells (net).
            // The solid shape can extend beyond the region boundary;
            // hollow blocks cancel the extensions, changing the region outline.
            // Ref: "空心方块会直接改变区域轮廓"
            const requiredArea = solidCount - hollowCount;

            // Area check: without hollows, region must fit the solid shape exactly.
            // With hollows, region must fit the NET shape (solid minus hollow).
            if (region.length !== requiredArea) {
                if (hollowBlocks.length === 0) {
                    this.errors.push({
                        rule: 'tetris',
                        message: `区域面积(${region.length}格)与方块要求(${solidCount}格)不匹配`,
                        region: region,
                        regionIndex: ri
                    });
                } else {
                    this.errors.push({
                        rule: 'tetris',
                        message: `区域面积(${region.length}格)与净方块要求(${requiredArea}格)不匹配（实心${solidCount}格 - 空心${hollowCount}格）`,
                        region: region,
                        regionIndex: ri
                    });
                }
                continue;
            }

            // Shape fitting check
            if (solidBlocks.length > 0 && requiredArea > 0) {
                if (!this.canFitTetrisPieces(region, solidBlocks, hollowBlocks, board.rows, board.cols)) {
                    this.errors.push({
                        rule: 'tetris',
                        message: '俄罗斯方块无法拼成当前区域形状（可尝试旋转倾斜方块）',
                        region: region,
                        regionIndex: ri
                    });
                }
            }
        }
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
                    regionIndex
                });
            }
        }
    }

    // ==================== Rule: Elimination (消除标记/倒Y) ====================
    // Corrected rule: elimination mark cancels ONE rule violation in its region.
    // Not specific to tetris — cancels ANY region-level rule violation.
    // This is a POST-PROCESSING step that runs after all other validations.
    //
    // - 消除标记取消所在区域内的恰好一个规则违规（不限规则类型）
    // - 可取消：方块颜色冲突、星形配对错误、俄罗斯方块不匹配、三角形边数错误
    // - 不可取消：另一个消除标记、路径错误、对称性错误
    // - 若区域内无违规可取消 → 消除标记本身报错

    /**
     * Post-processing: each elimination mark cancels one error in its region.
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

        // For each region with elimination marks, cancel up to N errors
        const cancelledIndices = new Set();

        for (const [regionIdx, elimCount] of elimPerRegion) {
            let cancelled = 0;

            // Scan errors for cancellable region-level violations
            for (let errIdx = 0; errIdx < this.errors.length && cancelled < elimCount; errIdx++) {
                const err = this.errors[errIdx];
                // Cannot cancel another elimination mark
                if (err.rule === 'elimination') continue;
                // Only cancel errors associated with this specific region
                if (err.regionIndex === regionIdx) {
                    cancelledIndices.add(errIdx);
                    cancelled++;
                }
            }

            // If not enough errors were available to cancel, flag unused elimination marks
            if (cancelled < elimCount) {
                const unusedCount = elimCount - cancelled;
                let remaining = unusedCount;
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
            }
        }

        // Remove cancelled errors from the list
        this.errors = this.errors.filter((_, idx) => !cancelledIndices.has(idx));
    }
}
