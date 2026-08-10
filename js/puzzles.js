/**
 * Puzzles module - Preset puzzle library
 *
 * Puzzle format:
 * {
 *   name: string,
 *   description: string,
 *   rows: number,
 *   cols: number,
 *   starts: [{r, c}],       // node positions
 *   ends: [{r, c}],         // node positions
 *   edgeStarts: [{r, c, dir}], // edge-midpoint starts (dir: 'H' or 'V')
 *   edgeEnds: [{r, c, dir}],   // edge-midpoint ends
 *   hexagons: [{r, c, color?}],
 *   squares: [{r, c, color}],
 *   stars: [{r, c, color}],
 *   tetris: [{r, c, shape, tilted?, hollow?}],
 *   triangles: [{r, c, count}],
 *   eliminations: [{r, c}],
 *   blockedEdges: [{r, c, dir}], // blocked grid edges
 *   solution: [{r, c}, ...]      // optional known solution
 * }
 */

const PUZZLE_LIBRARY = [
    // Puzzle 1: Basic tutorial - just start to end
    {
        id: 'tutorial_1',
        name: '入门教程',
        description: '最简单的谜题：从绿色起点画线到红色终点。点击节点来画线。',
        rows: 3,
        cols: 3,
        starts: [{r: 0, c: 0}],
        ends: [{r: 3, c: 3}],
        solution: [
            {r: 0, c: 0}, {r: 0, c: 1}, {r: 0, c: 2}, {r: 0, c: 3},
            {r: 1, c: 3}, {r: 2, c: 3}, {r: 3, c: 3}
        ]
    },

    // Puzzle 2: Hexagon collection
    {
        id: 'hexagon_1',
        name: '六边形收集',
        description: '路径必须经过（穿过）每一个六边形符号所在的节点，才能到达终点。',
        rows: 4,
        cols: 4,
        starts: [{r: 0, c: 0}],
        ends: [{r: 4, c: 4}],
        hexagons: [
            {r: 0, c: 2},
            {r: 1, c: 4},
            {r: 3, c: 1},
            {r: 4, c: 2}
        ],
        solution: [
            {r: 0, c: 0}, {r: 0, c: 1}, {r: 0, c: 2}, {r: 1, c: 2}, {r: 1, c: 1},
            {r: 1, c: 0}, {r: 2, c: 0}, {r: 3, c: 0}, {r: 4, c: 0},
            {r: 4, c: 1}, {r: 3, c: 1}, {r: 2, c: 1}, {r: 2, c: 2},
            {r: 2, c: 3}, {r: 2, c: 4}, {r: 3, c: 4}, {r: 4, c: 4}
        ]
    },

    // Puzzle 3: Black and white squares
    {
        id: 'squares_1',
        name: '黑白方块分离',
        description: '路径必须将黑色和白色圆角方块分隔到不同的连通区域中。同一区域内不能同时存在黑色和白色方块。',
        rows: 4,
        cols: 4,
        starts: [{r: 0, c: 0}],
        ends: [{r: 2, c: 4}],
        squares: [
            {r: 0, c: 2, color: 'black'},
            {r: 0, c: 3, color: 'white'},
            {r: 1, c: 1, color: 'black'},
            {r: 2, c: 2, color: 'white'},
            {r: 3, c: 0, color: 'black'},
            {r: 3, c: 3, color: 'white'}
        ],
        solution: [
            {r: 0, c: 0}, {r: 1, c: 0}, {r: 2, c: 0}, {r: 3, c: 0},
            {r: 3, c: 1}, {r: 3, c: 2}, {r: 3, c: 3}, {r: 3, c: 4},
            {r: 2, c: 4}
        ]
    },

    // Puzzle 4: Combined hexagons + squares
    {
        id: 'combined_1',
        name: '综合挑战：六边形+方块',
        description: '路径需要经过所有六边形，同时分离黑白方块。两条规则必须同时满足！',
        rows: 5,
        cols: 5,
        starts: [{r: 0, c: 0}],
        ends: [{r: 5, c: 5}],
        hexagons: [
            {r: 1, c: 1},
            {r: 3, c: 3},
            {r: 2, c: 5},
            {r: 5, c: 2}
        ],
        squares: [
            {r: 0, c: 3, color: 'black'},
            {r: 1, c: 4, color: 'white'},
            {r: 3, c: 1, color: 'black'},
            {r: 4, c: 2, color: 'white'}
        ]
    },

    // Puzzle 5: Star pairing
    {
        id: 'stars_1',
        name: '星形配对',
        description: '每个区域中同色符号必须恰好2个成对出现。星形可以与同色方块配对，但不可落单。',
        rows: 4,
        cols: 4,
        starts: [{r: 0, c: 0}],
        ends: [{r: 4, c: 4}],
        stars: [
            {r: 0, c: 1, color: '#ff6348'},
            {r: 0, c: 3, color: '#ff6348'},
            {r: 3, c: 1, color: '#ff6348'},
            {r: 3, c: 3, color: '#ff6348'}
        ],
        solution: [
            {r: 0, c: 0}, {r: 1, c: 0}, {r: 2, c: 0},
            {r: 2, c: 1}, {r: 2, c: 2}, {r: 2, c: 3}, {r: 2, c: 4},
            {r: 3, c: 4}, {r: 4, c: 4}
        ]
    },

    // Puzzle 6: Simple U-shape
    {
        id: 'simple_u',
        name: 'U形路径',
        description: '路径必须经过三个六边形：左中(1,0)、右中(1,2)、左下(3,0)，然后到达右下终点。自然形成U形绕行。',
        rows: 3,
        cols: 3,
        starts: [{r: 0, c: 0}],
        ends: [{r: 3, c: 2}],
        hexagons: [
            {r: 1, c: 0},
            {r: 3, c: 0},
            {r: 1, c: 2}
        ],
        solution: [
            {r: 0, c: 0}, {r: 1, c: 0}, {r: 1, c: 1}, {r: 1, c: 2},
            {r: 2, c: 2}, {r: 2, c: 1}, {r: 2, c: 0}, {r: 3, c: 0},
            {r: 3, c: 1}, {r: 3, c: 2}
        ]
    },

    // Puzzle 7: L-shaped challenge
    {
        id: 'l_shape',
        name: 'L形绕行',
        description: '六边形分布在两端，需要找到连接它们的路径。',
        rows: 4,
        cols: 4,
        starts: [{r: 0, c: 0}],
        ends: [{r: 0, c: 4}],
        hexagons: [
            {r: 0, c: 2},
            {r: 2, c: 0},
            {r: 4, c: 2},
            {r: 2, c: 4}
        ]
    },

    // ===== 俄罗斯方块系列谜题 =====

    // Puzzle 8: Tetris - 基础教学（2格横条，不可旋转）
    {
        id: 'tetris_basic',
        name: '俄罗斯方块：基础 (2×1)',
        description: '水平摆放的黄色2×1方块不可旋转。路径需要在两侧各围出恰好2格的水平区域。',
        rows: 4,
        cols: 4,
        starts: [{r: 0, c: 2}],
        ends: [{r: 4, c: 2}],
        tetris: [
            {r: 1, c: 0, shape: [[1, 1]], tilted: false},  // 水平2格，不可旋转
            {r: 1, c: 2, shape: [[1, 1]], tilted: false}   // 水平2格，不可旋转
        ]
    },

    // Puzzle 9: Tetris - 倾斜L形（可旋转）
    {
        id: 'tetris_l_tilted',
        name: '俄罗斯方块：L形 (倾斜)',
        description: '倾斜L形可以旋转。左侧L形区域3格 + 右侧L形区域3格。路线需要巧妙分割。',
        rows: 4,
        cols: 5,
        starts: [{r: 0, c: 2}],
        ends: [{r: 4, c: 3}],
        tetris: [
            {r: 1, c: 1, shape: [[1, 0], [1, 1]], tilted: true},   // L形，可旋转
            {r: 2, c: 3, shape: [[1, 0], [1, 1]], tilted: true}    // L形，可旋转
        ]
    },

    // Puzzle 10: Tetris - T形（经典四格）— 此谜题无解，验证算法正确拒绝
    {
        id: 'tetris_t_shape',
        name: '俄罗斯方块：T形 (4格)',
        description: 'T形方块占据4格，倾斜可旋转。此谜题经算法验证无解。',
        rows: 4,
        cols: 4,
        starts: [{r: 0, c: 2}],
        ends: [{r: 4, c: 2}],
        tetris: [
            {r: 1, c: 0, shape: [[1, 1, 1], [0, 1, 0]], tilted: true},  // T形
            {r: 1, c: 3, shape: [[1, 1, 1], [0, 1, 0]], tilted: true}   // T形
        ]
    },

    // Puzzle 11: Tetris - 空心减法（抵消演示）
    {
        id: 'tetris_hollow',
        name: '俄罗斯方块：空心减法',
        description: '蓝色空心方块代表抵消！将1格实心(黄)和1格空心(蓝)围在同一区域即可完全抵消，区域形状任意。',
        rows: 4,
        cols: 2,
        starts: [{r: 0, c: 1}],
        ends: [{r: 4, c: 1}],
        tetris: [
            {r: 1, c: 0, shape: [[1]], tilted: false},              // 实心1格
            {r: 2, c: 0, shape: [[1]], tilted: false, hollow: true}  // 空心1格 = 抵消
        ],
        solution: [
            {r: 0, c: 1}, {r: 1, c: 1}, {r: 2, c: 1},
            {r: 3, c: 1}, {r: 4, c: 1}
        ]
    },

    // Puzzle 12: Tetris - 多种形状组合
    {
        id: 'tetris_combo',
        name: '俄罗斯方块：多形组合',
        description: '同一区域内可组合多种形状！2×1横条(2格) + L形(3格) 共需5格区域。',
        rows: 5,
        cols: 5,
        starts: [{r: 0, c: 2}],
        ends: [{r: 5, c: 3}],
        tetris: [
            {r: 2, c: 1, shape: [[1, 1]], tilted: true},            // 2格横条
            {r: 1, c: 3, shape: [[1, 0], [1, 1]], tilted: true},    // L形 (3格)
            {r: 3, c: 0, shape: [[1], [1]], tilted: false}           // 竖条 (2格)
        ]
    },

    // Puzzle 13: Tetris - O方块 + I条
    {
        id: 'tetris_oi',
        name: '俄罗斯方块：O+I 组合',
        description: '2×2方块(4格)不能旋转(O形旋转也不变)。I长条(4格)倾斜可旋转。需围出8格区域。',
        rows: 5,
        cols: 5,
        starts: [{r: 0, c: 2}],
        ends: [{r: 5, c: 3}],
        tetris: [
            {r: 1, c: 1, shape: [[1, 1], [1, 1]], tilted: false},    // O方块 (4格)
            {r: 2, c: 3, shape: [[1, 1, 1, 1]], tilted: true}         // I长条 (4格)
        ]
    }
];

/**
 * Load a puzzle onto a board
 */
function loadPuzzle(board, puzzle) {
    board.clearAllSymbols();
    board.blockedEdges.clear();

    // Set size
    if (puzzle.rows && puzzle.cols) {
        board.rows = puzzle.rows;
        board.cols = puzzle.cols;
        board.cellSymbols = Array.from({length: puzzle.rows}, () =>
            Array.from({length: puzzle.cols}, () => [])
        );
        board.nodeSymbols = Array.from({length: puzzle.rows + 1}, () =>
            Array.from({length: puzzle.cols + 1}, () => [])
        );
    }

    // Place starts
    if (puzzle.starts) {
        for (const s of puzzle.starts) {
            board.addNodeSymbol(s.r, s.c, {type: 'start'});
        }
    }

    // Place edge-midpoint starts
    if (puzzle.edgeStarts) {
        for (const es of puzzle.edgeStarts) {
            board.addEdgeSymbol(es.r, es.c, es.dir, {type: 'start'});
        }
    }

    // Place ends
    if (puzzle.ends) {
        for (const e of puzzle.ends) {
            board.addNodeSymbol(e.r, e.c, {type: 'end'});
        }
    }

    // Place edge-midpoint ends
    if (puzzle.edgeEnds) {
        for (const ee of puzzle.edgeEnds) {
            board.addEdgeSymbol(ee.r, ee.c, ee.dir, {type: 'end'});
        }
    }

    // Place hexagons
    if (puzzle.hexagons) {
        for (const h of puzzle.hexagons) {
            board.addNodeSymbol(h.r, h.c, {type: 'hexagon', color: h.color || 'black'});
        }
    }

    // Place squares
    if (puzzle.squares) {
        for (const sq of puzzle.squares) {
            board.addCellSymbol(sq.r, sq.c, {type: 'square', color: sq.color});
        }
    }

    // Place stars
    if (puzzle.stars) {
        for (const st of puzzle.stars) {
            board.addCellSymbol(st.r, st.c, {type: 'star', color: st.color});
        }
    }

    // Place tetris blocks
    if (puzzle.tetris) {
        for (const tb of puzzle.tetris) {
            board.addCellSymbol(tb.r, tb.c, {
                type: 'tetris',
                shape: tb.shape,
                tilted: tb.tilted || false,
                hollow: tb.hollow || false
            });
        }
    }

    // Place triangles
    if (puzzle.triangles) {
        for (const tr of puzzle.triangles) {
            board.addCellSymbol(tr.r, tr.c, {type: 'triangle', count: tr.count});
        }
    }

    // Place eliminations
    if (puzzle.eliminations) {
        for (const el of puzzle.eliminations) {
            board.addCellSymbol(el.r, el.c, {type: 'elimination'});
        }
    }

    // Set blocked edges
    if (puzzle.blockedEdges) {
        for (const be of puzzle.blockedEdges) {
            board.blockedEdges.add(board.getEdgeKey(be.r, be.c, be.dir));
        }
    }
}
