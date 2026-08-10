/**
 * Puzzles module - Preset puzzle library
 *
 * Puzzle format:
 * {
 *   id: string,
 *   name: string,
 *   description: string,
 *   category: string,          // theme group for optgroup display
 *   rows: number,
 *   cols: number,
 *   symmetry: string,          // 'none' | 'horizontal' | 'vertical' | 'diagonal'
 *   starts: [{r, c}],
 *   ends: [{r, c}],
 *   edgeStarts: [{r, c, dir}],
 *   edgeEnds: [{r, c, dir}],
 *   hexagons: [{r, c, color?}],
 *   squares: [{r, c, color}],
 *   stars: [{r, c, color}],
 *   tetris: [{r, c, shape, tilted?, hollow?}],
 *   triangles: [{r, c, count}],
 *   eliminations: [{r, c}],
 *   blockedEdges: [{r, c, dir}],
 *   solution: [{r, c}, ...]    // optional known solution
 * }
 */

const PUZZLE_LIBRARY = [

    // ═══════════════════════════════════════════════════════════════
    // 入门基础 — 从零开始，理解画线机制
    // ═══════════════════════════════════════════════════════════════
    {
        id: 'tutorial_1',
        name: '最短路径',
        description: '从绿色起点画一条线到红色终点。点击第一个节点开始，沿网格边绘制路径。',
        category: '入门基础',
        rows: 3,
        cols: 3,
        starts: [{r: 0, c: 0}],
        ends: [{r: 3, c: 3}],
        solution: [
            {r: 0, c: 0}, {r: 0, c: 1}, {r: 0, c: 2}, {r: 0, c: 3},
            {r: 1, c: 3}, {r: 2, c: 3}, {r: 3, c: 3}
        ]
    },
    {
        id: 'straight_line',
        name: '直行通达',
        description: '最简单的情形——起点和终点在同一列，画一条直线即可到达。',
        category: '入门基础',
        rows: 3,
        cols: 3,
        starts: [{r: 0, c: 1}],
        ends: [{r: 3, c: 1}],
        solution: [
            {r: 0, c: 1}, {r: 1, c: 1}, {r: 2, c: 1}, {r: 3, c: 1}
        ]
    },
    {
        id: 'simple_u',
        name: 'U形路径',
        description: '三个六边形分别位于左侧和右侧，迫使路径走出U形弯。路径必须穿过每个六边形。',
        category: '入门基础',
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
    {
        id: 'zigzag',
        name: 'Z形折返',
        description: '两端的六边形迫使路径来回穿梭，形成Z字形。锻炼对路径走向的规划能力。',
        category: '入门基础',
        rows: 4,
        cols: 4,
        starts: [{r: 0, c: 0}],
        ends: [{r: 4, c: 0}],
        hexagons: [
            {r: 0, c: 3},
            {r: 2, c: 0},
            {r: 4, c: 3}
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // 六边形收集 — 路径必须穿过每一个六边形节点
    // ═══════════════════════════════════════════════════════════════
    {
        id: 'hexagon_1',
        name: '四枚收集',
        description: '4个六边形分布在不同位置，路径需要依次穿过它们。尝试找到经过所有六边形的最短路径。',
        category: '六边形收集',
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
    {
        id: 'l_shape',
        name: 'L形绕行',
        description: '六边形分布在棋盘四边，需要一条环绕路径经过所有点。',
        category: '六边形收集',
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
    {
        id: 'hexagon_dense',
        name: '密集阵型',
        description: '3×3小棋盘上挤了5个六边形，需要仔细规划路径顺序。',
        category: '六边形收集',
        rows: 3,
        cols: 3,
        starts: [{r: 0, c: 0}],
        ends: [{r: 3, c: 3}],
        hexagons: [
            {r: 0, c: 3},
            {r: 1, c: 1},
            {r: 2, c: 0},
            {r: 2, c: 2},
            {r: 3, c: 0}
        ]
    },
    {
        id: 'hexagon_cross',
        name: '十字星阵',
        description: '5×5棋盘，5个六边形排成十字形。路径需要覆盖中心及四个方向。',
        category: '六边形收集',
        rows: 5,
        cols: 5,
        starts: [{r: 0, c: 0}],
        ends: [{r: 5, c: 5}],
        hexagons: [
            {r: 0, c: 5},
            {r: 2, c: 2},
            {r: 3, c: 3},
            {r: 5, c: 0},
            {r: 5, c: 5}
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // 黑白方块分离 — 不同颜色的方块必须在不同区域
    // ═══════════════════════════════════════════════════════════════
    {
        id: 'squares_1',
        name: '三黑三白',
        description: '黑色和白色方块混在一起，路径需要像一道墙一样将它们隔离到不同区域。',
        category: '黑白方块',
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
    {
        id: 'squares_corridor',
        name: '黑白走廊',
        description: '所有黑方块在左，白方块在右。路径只需从中间穿过即可完美隔离。',
        category: '黑白方块',
        rows: 4,
        cols: 4,
        starts: [{r: 0, c: 2}],
        ends: [{r: 4, c: 2}],
        squares: [
            {r: 0, c: 0, color: 'black'},
            {r: 0, c: 3, color: 'white'},
            {r: 1, c: 1, color: 'black'},
            {r: 1, c: 3, color: 'white'},
            {r: 2, c: 0, color: 'black'},
            {r: 2, c: 3, color: 'white'},
            {r: 3, c: 1, color: 'black'},
            {r: 3, c: 2, color: 'white'},
            {r: 4, c: 0, color: 'black'},
            {r: 4, c: 3, color: 'white'}
        ],
        solution: [
            {r: 0, c: 2}, {r: 1, c: 2}, {r: 2, c: 2},
            {r: 3, c: 2}, {r: 4, c: 2}
        ]
    },
    {
        id: 'squares_checker',
        name: '棋盘残局',
        description: '黑白方块以棋盘格排列，5×5网格。需要巧妙的路径来分隔所有冲突。',
        category: '黑白方块',
        rows: 5,
        cols: 5,
        starts: [{r: 0, c: 2}],
        ends: [{r: 5, c: 3}],
        squares: [
            {r: 0, c: 0, color: 'black'}, {r: 0, c: 2, color: 'white'},
            {r: 0, c: 4, color: 'black'},
            {r: 1, c: 1, color: 'white'}, {r: 1, c: 3, color: 'black'},
            {r: 2, c: 0, color: 'white'}, {r: 2, c: 2, color: 'black'},
            {r: 2, c: 4, color: 'white'},
            {r: 3, c: 1, color: 'black'}, {r: 3, c: 3, color: 'white'},
            {r: 4, c: 0, color: 'black'}, {r: 4, c: 2, color: 'white'},
            {r: 4, c: 4, color: 'black'}
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // 星形配对 — 每个区域中同色符号恰好成对（2个）
    // ═══════════════════════════════════════════════════════════════
    {
        id: 'stars_1',
        name: '双子星',
        description: '4个橙色星形。路径需要将它们两两分组到不同区域中，每组恰好2个。',
        category: '星形配对',
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
    {
        id: 'stars_trio',
        name: '三星连珠',
        description: '3对（6个）红色星形散布在5×5棋盘上。路径必须创建恰好3个区域，每个区域各含一对。',
        category: '星形配对',
        rows: 5,
        cols: 5,
        starts: [{r: 0, c: 2}],
        ends: [{r: 5, c: 3}],
        stars: [
            {r: 0, c: 0, color: '#ff6348'},
            {r: 0, c: 4, color: '#ff6348'},
            {r: 1, c: 2, color: '#ff6348'},
            {r: 3, c: 2, color: '#ff6348'},
            {r: 5, c: 0, color: '#ff6348'},
            {r: 5, c: 4, color: '#ff6348'}
        ]
    },
    {
        id: 'stars_mixed',
        name: '星方共舞',
        description: '星形可以与同色的圆角方块配对！两种不同颜色的符号需要分别配对。',
        category: '星形配对',
        rows: 4,
        cols: 4,
        starts: [{r: 0, c: 2}],
        ends: [{r: 4, c: 2}],
        stars: [
            {r: 0, c: 0, color: '#ff6348'},
            {r: 0, c: 3, color: '#42a5f5'},
            {r: 3, c: 1, color: '#ff6348'},
            {r: 3, c: 3, color: '#42a5f5'}
        ],
        squares: [
            {r: 1, c: 1, color: '#ff6348'},
            {r: 2, c: 3, color: '#42a5f5'}
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // 俄罗斯方块 — 区域形状必须与方块造型匹配
    // ═══════════════════════════════════════════════════════════════
    {
        id: 'tetris_basic',
        name: '水平横条 (2×1)',
        description: '两个水平2×1横条不可旋转。路径需在两侧各围出恰好2格的水平区域。',
        category: '俄罗斯方块',
        rows: 4,
        cols: 4,
        starts: [{r: 0, c: 2}],
        ends: [{r: 4, c: 2}],
        tetris: [
            {r: 1, c: 0, shape: [[1, 1]], tilted: false},
            {r: 1, c: 2, shape: [[1, 1]], tilted: false}
        ]
    },
    {
        id: 'tetris_l_tilted',
        name: 'L形旋转',
        description: '倾斜L形可以旋转。两个L形各占3格，路径需围出两个3格区域。',
        category: '俄罗斯方块',
        rows: 4,
        cols: 5,
        starts: [{r: 0, c: 2}],
        ends: [{r: 4, c: 3}],
        tetris: [
            {r: 1, c: 1, shape: [[1, 0], [1, 1]], tilted: true},
            {r: 2, c: 3, shape: [[1, 0], [1, 1]], tilted: true}
        ]
    },
    {
        id: 'tetris_t_shape',
        name: 'T形挑战 (4格)',
        description: 'T形方块占据4格。此谜题经算法验证无解——并非所有配置都有答案。',
        category: '俄罗斯方块',
        rows: 4,
        cols: 4,
        starts: [{r: 0, c: 2}],
        ends: [{r: 4, c: 2}],
        tetris: [
            {r: 1, c: 0, shape: [[1, 1, 1], [0, 1, 0]], tilted: true},
            {r: 1, c: 3, shape: [[1, 1, 1], [0, 1, 0]], tilted: true}
        ]
    },
    {
        id: 'tetris_hollow',
        name: '空心减法',
        description: '蓝色空心方块代表抵消！1格实心(黄)+1格空心(蓝)在同一区域即可完全抵消，区域形状任意。',
        category: '俄罗斯方块',
        rows: 4,
        cols: 2,
        starts: [{r: 0, c: 1}],
        ends: [{r: 4, c: 1}],
        tetris: [
            {r: 1, c: 0, shape: [[1]], tilted: false},
            {r: 2, c: 0, shape: [[1]], tilted: false, hollow: true}
        ],
        solution: [
            {r: 0, c: 1}, {r: 1, c: 1}, {r: 2, c: 1},
            {r: 3, c: 1}, {r: 4, c: 1}
        ]
    },
    {
        id: 'tetris_combo',
        name: '多形组合',
        description: '同一区域可组合多种形状！2格横条+L形(3格)共需5格区域。竖条(2格)另需2格区域。',
        category: '俄罗斯方块',
        rows: 5,
        cols: 5,
        starts: [{r: 0, c: 2}],
        ends: [{r: 5, c: 3}],
        tetris: [
            {r: 2, c: 1, shape: [[1, 1]], tilted: true},
            {r: 1, c: 3, shape: [[1, 0], [1, 1]], tilted: true},
            {r: 3, c: 0, shape: [[1], [1]], tilted: false}
        ]
    },
    {
        id: 'tetris_oi',
        name: 'O+I 组合',
        description: '2×2方块(4格)+I长条(4格)，倾斜可旋转。需围出8格区域——考验空间规划！',
        category: '俄罗斯方块',
        rows: 5,
        cols: 5,
        starts: [{r: 0, c: 2}],
        ends: [{r: 5, c: 3}],
        tetris: [
            {r: 1, c: 1, shape: [[1, 1], [1, 1]], tilted: false},
            {r: 2, c: 3, shape: [[1, 1, 1, 1]], tilted: true}
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // 三角形边数 — 格子周围被路径经过的边数 = 三角形数量
    // ═══════════════════════════════════════════════════════════════
    {
        id: 'triangle_single',
        name: '单线约束',
        description: '格子(1,1)有1个三角形，意味着路径必须恰好经过该格子的1条边。',
        category: '三角形边数',
        rows: 3,
        cols: 3,
        starts: [{r: 0, c: 1}],
        ends: [{r: 3, c: 2}],
        triangles: [
            {r: 1, c: 1, count: 1}
        ],
        solution: [
            {r: 0, c: 1}, {r: 0, c: 0}, {r: 1, c: 0}, {r: 2, c: 0},
            {r: 3, c: 0}, {r: 3, c: 1}, {r: 3, c: 2}
        ]
    },
    {
        id: 'triangle_multi',
        name: '边数阶梯',
        description: '三个三角形分别要求1、2、3条边被路径经过。注意——3条边意味着路径需要环绕该格子三面！',
        category: '三角形边数',
        rows: 4,
        cols: 4,
        starts: [{r: 0, c: 0}],
        ends: [{r: 4, c: 4}],
        triangles: [
            {r: 0, c: 2, count: 1},
            {r: 2, c: 0, count: 2},
            {r: 1, c: 3, count: 3}
        ]
    },
    {
        id: 'triangle_forest',
        name: '三角森林',
        description: '多个三角形分布在棋盘各处，每个都对路径走向施加约束。你需要一条同时满足所有边数要求的路径。',
        category: '三角形边数',
        rows: 5,
        cols: 5,
        starts: [{r: 0, c: 0}],
        ends: [{r: 5, c: 5}],
        triangles: [
            {r: 0, c: 3, count: 1},
            {r: 1, c: 1, count: 1},
            {r: 2, c: 4, count: 2},
            {r: 3, c: 2, count: 3},
            {r: 4, c: 0, count: 1}
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // 消除标记 — 取消所在区域内的一个规则违规
    // ═══════════════════════════════════════════════════════════════
    {
        id: 'elim_square',
        name: '容错之间',
        description: '黑方块和白方块在同一个区域内会产生冲突——但消除标记(倒Y)可以取消这个违规！在这类谜题中，需要故意"违规"再"消除"。',
        category: '消除标记',
        rows: 4,
        cols: 4,
        starts: [{r: 0, c: 2}],
        ends: [{r: 4, c: 2}],
        squares: [
            {r: 0, c: 0, color: 'black'},
            {r: 0, c: 3, color: 'white'},
            {r: 3, c: 0, color: 'black'},
            {r: 3, c: 3, color: 'white'}
        ],
        eliminations: [
            {r: 2, c: 0}
        ]
    },
    {
        id: 'elim_tetris',
        name: '消解悖论',
        description: '俄罗斯方块的区域面积要求5格，但实际只有4格——消除标记可以"赦免"这个面积不足的违规。',
        category: '消除标记',
        rows: 5,
        cols: 5,
        starts: [{r: 0, c: 2}],
        ends: [{r: 5, c: 3}],
        tetris: [
            {r: 1, c: 1, shape: [[1, 1, 1, 1, 1]], tilted: true}  // I长条5格
        ],
        eliminations: [
            {r: 2, c: 1}
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // 对称谜题 — 路径必须关于对称轴镜像对称
    // ═══════════════════════════════════════════════════════════════
    {
        id: 'sym_horizontal',
        name: '水平镜面',
        description: '水平对称模式下，棋盘左侧的每一步都会在右侧自动生成镜像。路径必须关于中轴线左右对称。',
        category: '对称谜题',
        rows: 4,
        cols: 4,
        symmetry: 'horizontal',
        starts: [{r: 0, c: 0}],
        ends: [{r: 4, c: 0}],
        hexagons: [
            {r: 1, c: 1},
            {r: 3, c: 1}
        ]
    },
    {
        id: 'sym_vertical',
        name: '垂直镜像',
        description: '垂直对称模式下，上下互为镜像。路径需要关于水平中轴线对称。',
        category: '对称谜题',
        rows: 4,
        cols: 4,
        symmetry: 'vertical',
        starts: [{r: 0, c: 0}],
        ends: [{r: 0, c: 4}],
        hexagons: [
            {r: 1, c: 1},
            {r: 1, c: 3}
        ]
    },
    {
        id: 'sym_diagonal',
        name: '对角倒影',
        description: '对角线对称——左上到右下的对角线为轴。路径在下三角区域绘制，上三角自动镜像。方块必须对称分离。',
        category: '对称谜题',
        rows: 4,
        cols: 4,
        symmetry: 'diagonal',
        starts: [{r: 0, c: 0}],
        ends: [{r: 4, c: 4}],
        squares: [
            {r: 1, c: 3, color: 'black'},
            {r: 3, c: 1, color: 'white'}
        ]
    },
    {
        id: 'sym_combined',
        name: '对称+六边形',
        description: '水平对称模式下收集六边形。每一步的镜像使得路径规划更加复杂——镜像路径也不能与主路径冲突！',
        category: '对称谜题',
        rows: 4,
        cols: 4,
        symmetry: 'horizontal',
        starts: [{r: 0, c: 1}],
        ends: [{r: 4, c: 1}],
        hexagons: [
            {r: 1, c: 0},
            {r: 1, c: 2},
            {r: 3, c: 4}
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // 综合挑战 — 多种规则同时生效
    // ═══════════════════════════════════════════════════════════════
    {
        id: 'combined_1',
        name: '六边+方块',
        description: '路径需要经过所有六边形，同时分离黑白方块。两条规则必须同时满足！',
        category: '综合挑战',
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
    {
        id: 'combined_grand',
        name: '三角+方块+六边',
        description: '六边形收集、方块颜色分离、三角形边数——三重规则叠加。需要兼顾所有约束。',
        category: '综合挑战',
        rows: 5,
        cols: 5,
        starts: [{r: 0, c: 0}],
        ends: [{r: 5, c: 5}],
        hexagons: [
            {r: 1, c: 2},
            {r: 3, c: 4},
            {r: 4, c: 1}
        ],
        squares: [
            {r: 1, c: 0, color: 'black'},
            {r: 2, c: 4, color: 'white'},
            {r: 3, c: 2, color: 'black'},
            {r: 4, c: 3, color: 'white'}
        ],
        triangles: [
            {r: 0, c: 4, count: 1},
            {r: 2, c: 1, count: 2}
        ]
    },
    {
        id: 'combined_ultimate',
        name: '全规则盛宴',
        description: '终极挑战——六边形、方块、星形、俄罗斯方块、三角形同时在场。这是检验你对所有规则理解的最终考验。',
        category: '综合挑战',
        rows: 6,
        cols: 6,
        starts: [{r: 0, c: 0}],
        ends: [{r: 6, c: 6}],
        hexagons: [
            {r: 0, c: 6},
            {r: 3, c: 0},
            {r: 6, c: 3}
        ],
        squares: [
            {r: 1, c: 2, color: 'black'},
            {r: 1, c: 4, color: 'white'},
            {r: 4, c: 1, color: 'black'},
            {r: 4, c: 5, color: 'white'}
        ],
        stars: [
            {r: 2, c: 0, color: '#ff6348'},
            {r: 2, c: 6, color: '#ff6348'}
        ],
        tetris: [
            {r: 3, c: 3, shape: [[1, 1, 1]], tilted: true}
        ],
        triangles: [
            {r: 2, c: 3, count: 2},
            {r: 5, c: 1, count: 1}
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // 边缘起点/终点 — 路径可以从边的中点出发或到达
    // ═══════════════════════════════════════════════════════════════
    {
        id: 'edge_start_end',
        name: '边缘起止',
        description: '起点和终点不一定在网格的角上——它们可以在任何一条边的中点！此谜题的起点和终点都在边缘中间。',
        category: '入门基础',
        rows: 4,
        cols: 4,
        edgeStarts: [{r: 0, c: 2, dir: 'H'}],
        edgeEnds: [{r: 4, c: 2, dir: 'H'}],
        hexagons: [
            {r: 1, c: 1},
            {r: 2, c: 3},
            {r: 3, c: 0}
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // 隔断边 — 网格中的"断头路"
    // ═══════════════════════════════════════════════════════════════
    {
        id: 'blocked_edges',
        name: '隔断迷局',
        description: '灰色短线段代表"隔断"——这些边不可通行。路径必须绕开隔断边，找到可行的路线。',
        category: '入门基础',
        rows: 4,
        cols: 4,
        starts: [{r: 0, c: 0}],
        ends: [{r: 4, c: 4}],
        hexagons: [
            {r: 2, c: 1},
            {r: 2, c: 3}
        ],
        blockedEdges: [
            {r: 1, c: 2, dir: 'V'},
            {r: 3, c: 1, dir: 'H'},
            {r: 2, c: 3, dir: 'V'}
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

    // Set symmetry
    board.symmetry = puzzle.symmetry || 'none';

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
