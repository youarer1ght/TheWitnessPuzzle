/**
 * Tetris Shapes Library — 俄罗斯方块 / 多联骨牌形状库
 *
 * 规则（依据《The Witness》设计研究笔记）：
 * - 形状由黄色小方块组成的矩阵表示（1=有方块, 0=空）
 * - 水平摆放（tilted=false）：形状和角度必须完全相同，不可旋转
 * - 倾斜摆放（tilted=true）：可旋转（4个正交方向），不能翻转/镜像
 * - 空心蓝色块（hollow=true）：减法，从黄色形状中减去对应格子
 * - 多个方块可在同一区域内组合拼接，不可重叠
 * - 特殊：区域内空心块数==实心块数 → 区域形状无关（全抵消）
 */

const TETRIS_SHAPES = {
    // ===== 1格：单方块 =====
    '1×1': {
        name: '1×1 单格',
        shape: [[1]],
        category: 'basic'
    },

    // ===== 2格：多米诺 =====
    '2×1横': {
        name: '2×1 横条',
        shape: [[1, 1]],
        category: 'domino'
    },
    '1×2竖': {
        name: '1×2 竖条',
        shape: [[1], [1]],
        category: 'domino'
    },

    // ===== 3格：Tromino =====
    '3×1横': {
        name: '3×1 横条',
        shape: [[1, 1, 1]],
        category: 'tromino'
    },
    '1×3竖': {
        name: '1×3 竖条',
        shape: [[1], [1], [1]],
        category: 'tromino'
    },
    'L3': {
        name: 'L 形 (3格)',
        shape: [[1, 0], [1, 1]],
        category: 'tromino'
    },

    // ===== 4格：Tetromino（经典俄罗斯方块）=====
    'I4': {
        name: 'I 长条 (4格)',
        shape: [[1, 1, 1, 1]],
        category: 'tetromino'
    },
    'O4': {
        name: 'O 方块 (2×2)',
        shape: [[1, 1], [1, 1]],
        category: 'tetromino'
    },
    'T4': {
        name: 'T 形',
        shape: [[1, 1, 1], [0, 1, 0]],
        category: 'tetromino'
    },
    'L4': {
        name: 'L 形 (4格)',
        shape: [[1, 0, 0], [1, 1, 1]],
        category: 'tetromino'
    },
    'J4': {
        name: 'J 形 (反L)',
        shape: [[0, 0, 1], [1, 1, 1]],
        category: 'tetromino'
    },
    'S4': {
        name: 'S 形',
        shape: [[0, 1, 1], [1, 1, 0]],
        category: 'tetromino'
    },
    'Z4': {
        name: 'Z 形',
        shape: [[1, 1, 0], [0, 1, 1]],
        category: 'tetromino'
    },

    // ===== 特殊形状 =====
    'plus': {
        name: '十字形 (5格)',
        shape: [[0, 1, 0], [1, 1, 1], [0, 1, 0]],
        category: 'special'
    },
    'U4': {
        name: 'U 形',
        shape: [[1, 0, 1], [1, 1, 1]],
        category: 'special'
    },
    'corner3': {
        name: '大L (5格)',
        shape: [[1, 0, 0], [1, 0, 0], [1, 1, 1]],
        category: 'special'
    },
};

// 按分类组织的形状列表，方便 UI 选择
const TETRIS_CATEGORIES = {
    'basic': '基础 (1格)',
    'domino': '多米诺 (2格)',
    'tromino': '三格骨牌 (3格)',
    'tetromino': '四格骨牌 (4格)',
    'special': '特殊形状'
};

/**
 * Tetris 形状工具函数
 */
const TetrisUtils = {
    /**
     * 计算形状中的方块数量
     */
    countCells(shape) {
        let count = 0;
        for (const row of shape) {
            for (const cell of row) {
                if (cell) count++;
            }
        }
        return count;
    },

    /**
     * 旋转形状 90° 顺时针（不翻转）
     */
    rotate(shape) {
        const rows = shape.length;
        const cols = shape[0].length;
        const rotated = Array.from({length: cols}, () => Array(rows).fill(0));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                rotated[c][rows - 1 - r] = shape[r][c];
            }
        }
        return rotated;
    },

    /**
     * 获取所有唯一的旋转（去重，不含翻转）
     * 对倾斜方块最多返回4个方向
     */
    getAllRotations(shape) {
        const rotations = [];
        let current = shape;
        for (let i = 0; i < 4; i++) {
            let isNew = true;
            for (const rot of rotations) {
                if (TetrisUtils.shapesEqual(current, rot)) {
                    isNew = false;
                    break;
                }
            }
            if (isNew) rotations.push(current.map(r => [...r]));
            current = TetrisUtils.rotate(current);
        }
        return rotations;
    },

    /**
     * 比较两个形状是否相同
     */
    shapesEqual(a, b) {
        if (a.length !== b.length || a[0].length !== b[0].length) return false;
        for (let r = 0; r < a.length; r++) {
            for (let c = 0; c < a[0].length; c++) {
                if (a[r][c] !== b[r][c]) return false;
            }
        }
        return true;
    },

    /**
     * 判断形状能否放在 bitmap 的指定位置
     */
    canPlace(bitmap, shape, row, col) {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[0].length; c++) {
                if (shape[r][c]) {
                    const br = row + r;
                    const bc = col + c;
                    if (br < 0 || br >= bitmap.length || bc < 0 || bc >= bitmap[0].length) return false;
                    if (bitmap[br][bc] !== 1) return false;
                }
            }
        }
        return true;
    },

    /**
     * 在 bitmap 上放置形状（将对应格子设为 value）
     */
    placeShape(bitmap, shape, row, col, value = 0) {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[0].length; c++) {
                if (shape[r][c]) {
                    bitmap[row + r][col + c] = value;
                }
            }
        }
    },

    /**
     * 尝试用给定的实心方块列表拼满 region
     * @param region - 区域格子数组 [{r, c}, ...]
     * @param solidBlocks - 实心方块 [{shape, tilted}, ...]
     * @param rows, cols - 棋盘尺寸
     * @returns {boolean} 是否可拼满
     */
    canFitRegion(region, solidBlocks, rows, cols) {
        // 创建区域 bitmap（仅 region 内的格子为 1）
        const bitmap = Array.from({length: rows}, () => Array(cols).fill(0));
        for (const {r, c} of region) {
            bitmap[r][c] = 1;
        }

        // 计算需要的总格数
        const totalNeeded = solidBlocks.reduce((sum, b) => sum + TetrisUtils.countCells(b.shape), 0);
        if (region.length !== totalNeeded) return false;

        // 回溯尝试放置所有方块
        const remaining = bitmap.map(row => [...row]);
        return TetrisUtils.tryPlaceAll(remaining, solidBlocks, 0);
    },

    /**
     * 回溯尝试放置所有方块（按顺序）
     */
    tryPlaceAll(bitmap, blocks, index) {
        if (index >= blocks.length) {
            // 所有方块已放置，检查是否还有未覆盖的格子
            for (let r = 0; r < bitmap.length; r++) {
                for (let c = 0; c < bitmap[0].length; c++) {
                    if (bitmap[r][c] === 1) return false;
                }
            }
            return true;
        }

        const block = blocks[index];
        const rotations = block.tilted
            ? TetrisUtils.getAllRotations(block.shape)
            : [block.shape];

        for (const rot of rotations) {
            for (let r = 0; r <= bitmap.length - rot.length; r++) {
                for (let c = 0; c <= bitmap[0].length - rot[0].length; c++) {
                    // Anchor constraint: shape must cover the cell where its symbol sits
                    if (block.anchorR !== undefined && block.anchorC !== undefined) {
                        const anSR = block.anchorR - r;
                        const anSC = block.anchorC - c;
                        if (anSR < 0 || anSR >= rot.length || anSC < 0 || anSC >= rot[0].length || !rot[anSR][anSC]) {
                            continue;
                        }
                    }
                    if (TetrisUtils.canPlace(bitmap, rot, r, c)) {
                        // 放置
                        TetrisUtils.placeShape(bitmap, rot, r, c, 2); // 2 = 已占用
                        if (TetrisUtils.tryPlaceAll(bitmap, blocks, index + 1)) {
                            return true;
                        }
                        // 回溯：恢复
                        TetrisUtils.placeShape(bitmap, rot, r, c, 1); // 1 = 恢复为区域格子
                    }
                }
            }
        }

        return false;
    },

    /**
     * Try to fit solid + hollow blocks into a region, allowing conceptual overlaps
     * that are resolved by subtracting hollow blocks.
     *
     * Algorithm:
     * 1. Place all solid blocks with additive occupancy (value += 1, allows overlaps)
     * 2. Place all hollow blocks with subtractive occupancy (value -= 1)
     * 3. Final check: every region cell must have occupancy === 1, outside cells === 0
     *
     * @param region - Array of {r, c} cells
     * @param solidBlocks - [{shape, tilted}, ...]
     * @param hollowBlocks - [{shape, tilted}, ...]
     * @param rows, cols - Board dimensions
     * @returns {boolean}
     */
    canFitRegionWithHollow(region, solidBlocks, hollowBlocks, rows, cols) {
        // Create region bitmap
        const bitmap = Array.from({length: rows}, () => Array(cols).fill(0));
        for (const {r, c} of region) {
            bitmap[r][c] = 1;
        }

        // Occupancy map: tracks how many blocks cover each cell
        const occupancy = Array.from({length: rows}, () => Array(cols).fill(0));

        // Claimed map: tracks whether any shape (solid OR hollow) covers each cell.
        // This distinguishes canceled cells (solid+hollow overlap, occ=0) from
        // truly empty cells (no shape covers them, also occ=0).
        const claimed = Array.from({length: rows}, () => Array(cols).fill(0));

        // Build combined list: solids first, then hollows (with negative flag)
        const solidItems = solidBlocks.map(b => ({
            shape: b.shape,
            tilted: b.tilted || false,
            isHollow: false,
            anchorR: b.anchorR,
            anchorC: b.anchorC
        }));
        const hollowItems = hollowBlocks.map(b => ({
            shape: b.shape,
            tilted: b.tilted || false,
            isHollow: true,
            anchorR: b.anchorR,
            anchorC: b.anchorC
        }));
        const allItems = [...solidItems, ...hollowItems];

        return TetrisUtils._tryPlaceWithOverlaps(bitmap, occupancy, claimed, allItems, 0, rows, cols, region);
    },

    /**
     * Recursive backtracking for placement with overlap support.
     * Solids add +1 to occupancy, hollows subtract -1.
     * Placement bounds check: shape must fit within bitmap dimensions.
     * @private
     */
    _tryPlaceWithOverlaps(bitmap, occupancy, claimed, items, index, rows, cols, region) {
        if (index >= items.length) {
            // All placed — verify occupancy
            // Region cells: must be claimed by at least one shape, occupancy in [0, 1]
            //   - occ=1: filled by solid (normal case)
            //   - occ=0: solid+hollow overlap (canceled cell — valid)
            // Non-region cells: occupancy must be exactly 0
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (bitmap[r][c] === 1) {
                        // Region cell: must be claimed and have valid occupancy
                        if (claimed[r][c] === 0) return false;  // empty region cell
                        if (occupancy[r][c] < 0 || occupancy[r][c] > 1) return false;
                    } else {
                        // Non-region cell: must have 0 occupancy
                        if (occupancy[r][c] !== 0) return false;
                    }
                }
            }
            return true;
        }

        const item = items[index];
        const rotations = item.tilted
            ? TetrisUtils.getAllRotations(item.shape)
            : [item.shape];
        const delta = item.isHollow ? -1 : 1;

        for (const rot of rotations) {
            for (let r = 0; r <= rows - rot.length; r++) {
                for (let c = 0; c <= cols - rot[0].length; c++) {
                    // Check shape fits within bounds
                    let fitsInBounds = true;
                    for (let sr = 0; sr < rot.length && fitsInBounds; sr++) {
                        for (let sc = 0; sc < rot[0].length && fitsInBounds; sc++) {
                            if (rot[sr][sc]) {
                                const br = r + sr, bc = c + sc;
                                if (br < 0 || br >= rows || bc < 0 || bc >= cols) {
                                    fitsInBounds = false;
                                }
                            }
                        }
                    }
                    if (!fitsInBounds) continue;

                    // Anchor constraint (solids only): shape must cover the cell where its symbol sits.
                    // Hollow blocks are exempt — they subtract from wherever the solid shape extends,
                    // so their shape placement is not tied to the symbol's cell position.
                    if (!item.isHollow && item.anchorR !== undefined && item.anchorC !== undefined) {
                        const anSR = item.anchorR - r;
                        const anSC = item.anchorC - c;
                        if (anSR < 0 || anSR >= rot.length || anSC < 0 || anSC >= rot[0].length || !rot[anSR][anSC]) {
                            continue;
                        }
                    }

                    // Apply shape delta to occupancy: add for solids, subtract for hollows
                    // Mark cells as claimed so we can distinguish canceled cells
                    // (solid+hollow overlap → occ=0, claimed=2) from empty cells
                    // (no shape → occ=0, claimed=0).
                    for (let sr = 0; sr < rot.length; sr++) {
                        for (let sc = 0; sc < rot[0].length; sc++) {
                            if (rot[sr][sc]) {
                                occupancy[r + sr][c + sc] += delta;
                                claimed[r + sr][c + sc] += 1;
                            }
                        }
                    }

                    // Pruning: occupancy should not go below 0 or above 3
                    let valid = true;
                    for (let sr = 0; sr < rot.length && valid; sr++) {
                        for (let sc = 0; sc < rot[0].length && valid; sc++) {
                            if (rot[sr][sc]) {
                                const v = occupancy[r + sr][c + sc];
                                if (v < 0 || v > 3) valid = false;
                            }
                        }
                    }

                    if (valid) {
                        if (TetrisUtils._tryPlaceWithOverlaps(bitmap, occupancy, claimed, items, index + 1, rows, cols, region)) {
                            return true;
                        }
                    }

                    // Backtrack: remove shape delta and un-claim cells
                    for (let sr = 0; sr < rot.length; sr++) {
                        for (let sc = 0; sc < rot[0].length; sc++) {
                            if (rot[sr][sc]) {
                                occupancy[r + sr][c + sc] -= delta;
                                claimed[r + sr][c + sc] -= 1;
                            }
                        }
                    }
                }
            }
        }

        return false;
    }
};
