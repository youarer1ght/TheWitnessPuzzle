/**
 * Symbols module - Symbol definitions and Canvas rendering
 *
 * Symbol types:
 * - start: green circle at a node
 * - end: red semi-circle at a node
 * - hexagon: hexagon shape on a node
 * - square: rounded square in a cell
 * - star: star shape in a cell
 * - tetris: tetris block in a cell
 * - triangle: triangle(s) in a cell
 * - elimination: inverted-Y in a cell
 */

const SymbolRenderer = {
    // Color definitions
    colors: {
        start: '#00ff88',
        startGlow: 'rgba(0, 255, 136, 0.3)',
        end: '#ff4757',
        endGlow: 'rgba(255, 71, 87, 0.3)',
        hexagon: '#ffa502',
        hexagonBlue: '#3498ff',
        hexagonYellow: '#ffd32a',
        squareBlack: '#1e1e1e',
        squareWhite: '#f0f0f0',
        squareBorder: '#888',
        star: '#ff6348',
        tetris: '#ffd32a',
        tetrisHollow: '#3498ff',
        triangle: '#ff6b35',
        elimination: '#a855f7',
        path: '#00e5ff',
        pathGlow: 'rgba(0, 229, 255, 0.4)',
        gridLine: '#3a3a5c',
        gridBg: '#1a1a2e',
        cellHighlight: 'rgba(255, 215, 0, 0.15)',
        cellHover: 'rgba(255, 255, 255, 0.05)',
        successGlow: 'rgba(0, 255, 136, 0.2)',
        errorGlow: 'rgba(255, 71, 87, 0.2)',
    },

    /**
     * Draw the full board (grid lines, blocked edges, background)
     */
    drawBoard(board, ctx, hoverCell, selectedCell, pathNodes) {
        const {rows, cols, cellSize, padding} = board;
        const w = padding * 2 + cols * cellSize;
        const h = padding * 2 + rows * cellSize;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = this.colors.gridBg;
        ctx.fillRect(0, 0, w, h);

        // Draw cells
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = padding + c * cellSize;
                const y = padding + r * cellSize;

                // Cell background
                ctx.fillStyle = this.colors.gridBg;
                if (hoverCell && hoverCell.r === r && hoverCell.c === c) {
                    ctx.fillStyle = this.colors.cellHover;
                }
                if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
                    ctx.fillStyle = this.colors.cellHighlight;
                }
                ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
            }
        }

        // Draw grid lines (edges)
        ctx.strokeStyle = this.colors.gridLine;
        ctx.lineWidth = 1.5;
        for (let r = 0; r <= rows; r++) {
            for (let c = 0; c <= cols; c++) {
                const {x: nx, y: ny} = board.nodeToPixel(r, c);

                // Horizontal edge to the right
                if (c < cols && !board.isEdgeBlocked(r, c, 'H')) {
                    const nx2 = padding + (c + 1) * cellSize;
                    ctx.beginPath();
                    ctx.moveTo(nx + 3, ny);
                    ctx.lineTo(nx2 - 3, ny);
                    ctx.stroke();
                }

                // Vertical edge downward
                if (r < rows && !board.isEdgeBlocked(r, c, 'V')) {
                    const ny2 = padding + (r + 1) * cellSize;
                    ctx.beginPath();
                    ctx.moveTo(nx, ny + 3);
                    ctx.lineTo(nx, ny2 - 3);
                    ctx.stroke();
                }
            }
        }

        // Draw blocked edges (gaps)
        ctx.strokeStyle = '#ff4757';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        for (const key of board.blockedEdges) {
            const [dir, coords] = key.split(':');
            const [r, c] = coords.split(',').map(Number);
            const {x, y} = board.nodeToPixel(r, c);
            if (dir === 'H') {
                const x2 = padding + (c + 1) * cellSize;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x2, y);
                ctx.stroke();
            } else {
                const y2 = padding + (r + 1) * cellSize;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x, y2);
                ctx.stroke();
            }
        }
        ctx.setLineDash([]);

        // Draw nodes (small dots at intersections)
        for (let r = 0; r <= rows; r++) {
            for (let c = 0; c <= cols; c++) {
                const {x, y} = board.nodeToPixel(r, c);
                ctx.fillStyle = '#5a5a7a';
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    },

    /**
     * Draw all cell-level symbols
     */
    drawCellSymbols(board, ctx) {
        const {rows, cols, cellSize, padding} = board;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const symbols = board.cellSymbols[r][c];
                if (symbols.length === 0) continue;

                const cx = padding + (c + 0.5) * cellSize;
                const cy = padding + (r + 0.5) * cellSize;
                const maxSize = cellSize * 0.7;

                // Arrange multiple symbols in the cell
                symbols.forEach((sym, i) => {
                    let sx = cx, sy = cy;
                    if (symbols.length === 2) {
                        const offset = cellSize * 0.18;
                        sx = cx + (i === 0 ? -offset : offset);
                    } else if (symbols.length > 2) {
                        const angle = (i / symbols.length) * Math.PI * 2 - Math.PI / 2;
                        const radius = cellSize * 0.2;
                        sx = cx + Math.cos(angle) * radius;
                        sy = cy + Math.sin(angle) * radius;
                    }
                    this.drawSymbol(ctx, sym, sx, sy, maxSize / (symbols.length > 1 ? 1.6 : 1));
                });
            }
        }
    },

    /**
     * Draw all node-level symbols
     */
    drawNodeSymbols(board, ctx) {
        const {rows, cols, cellSize} = board;
        for (let r = 0; r <= rows; r++) {
            for (let c = 0; c <= cols; c++) {
                const symbols = board.nodeSymbols[r][c];
                if (symbols.length === 0) continue;

                const {x, y} = board.nodeToPixel(r, c);
                const maxSize = cellSize * 0.55;

                symbols.forEach((sym, i) => {
                    let sx = x, sy = y;
                    if (symbols.length === 2) {
                        // Offset hexagons from start/end
                        const offset = cellSize * 0.2;
                        sx = x + (i === 0 ? -offset : offset);
                    }
                    // Don't offset start/end (they ARE the node)
                    if (sym.type === 'start' || sym.type === 'end') {
                        sx = x; sy = y;
                    }
                    this.drawSymbol(ctx, sym, sx, sy, maxSize);
                });
            }
        }
    },

    /**
     * Draw all edge-midpoint symbols (start/end on edge centers)
     */
    drawEdgeSymbols(board, ctx) {
        for (const [key, symbols] of board.edgeSymbols) {
            const [dir, coords] = key.split(':');
            const [r, c] = coords.split(',').map(Number);
            const mp = board.edgeMidpointToPixel(r, c, dir);

            for (const sym of symbols) {
                const maxSize = board.cellSize * 0.55;
                this.drawSymbol(ctx, sym, mp.x, mp.y, maxSize);
            }
        }
    },

    /**
     * Draw a single symbol at the given position
     */
    drawSymbol(ctx, symbol, x, y, size) {
        switch (symbol.type) {
            case 'start':
                this.drawStart(ctx, x, y, size);
                break;
            case 'end':
                this.drawEnd(ctx, x, y, size);
                break;
            case 'hexagon':
                this.drawHexagon(ctx, x, y, size, symbol.color || 'black');
                break;
            case 'square':
                this.drawSquare(ctx, x, y, size, symbol.color || 'black');
                break;
            case 'star':
                this.drawStar(ctx, x, y, size, symbol.color || '#ff6348');
                break;
            case 'tetris':
                this.drawTetris(ctx, x, y, size, symbol);
                break;
            case 'triangle':
                this.drawTriangle(ctx, x, y, size, symbol.count || 1);
                break;
            case 'elimination':
                this.drawElimination(ctx, x, y, size);
                break;
        }
    },

    drawStart(ctx, x, y, size) {
        const r = size * 0.55;
        // Glow
        const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 1.8);
        glow.addColorStop(0, this.colors.startGlow);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Circle
        ctx.fillStyle = this.colors.start;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    },

    drawEnd(ctx, x, y, size) {
        const r = size * 0.55;
        // Glow
        const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 1.8);
        glow.addColorStop(0, this.colors.endGlow);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Semi-circle (rounded end like the game)
        ctx.fillStyle = this.colors.end;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        // Inner cut to make it look like a half-circle tunnel
        ctx.fillStyle = this.colors.gridBg;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
    },

    drawHexagon(ctx, x, y, size, color) {
        const r = size * 0.45;
        const sides = 6;
        const fillColor = color === 'blue' ? this.colors.hexagonBlue :
                          color === 'yellow' ? this.colors.hexagonYellow :
                          this.colors.hexagon;

        ctx.fillStyle = fillColor;
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
            const hx = x + r * Math.cos(angle);
            const hy = y + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    },

    drawSquare(ctx, x, y, size, color) {
        const half = size * 0.4;
        const radius = size * 0.12;
        const fillColor = color === 'white' ? this.colors.squareWhite :
                          color === 'black' ? this.colors.squareBlack :
                          color;

        // Rounded rect
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.moveTo(x - half + radius, y - half);
        ctx.lineTo(x + half - radius, y - half);
        ctx.quadraticCurveTo(x + half, y - half, x + half, y - half + radius);
        ctx.lineTo(x + half, y + half - radius);
        ctx.quadraticCurveTo(x + half, y + half, x + half - radius, y + half);
        ctx.lineTo(x - half + radius, y + half);
        ctx.quadraticCurveTo(x - half, y + half, x - half, y + half - radius);
        ctx.lineTo(x - half, y - half + radius);
        ctx.quadraticCurveTo(x - half, y - half, x - half + radius, y - half);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = this.colors.squareBorder;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // For colored squares (not black/white), add a small fill
        if (color !== 'black' && color !== 'white') {
            ctx.fillStyle = color;
            ctx.fill();
        }
    },

    drawStar(ctx, x, y, size, color) {
        const outerR = size * 0.44;
        const innerR = size * 0.12; // Sharp 8-pointed star
        const spikes = 8; // 八芒星 (eight-pointed star, as in The Witness)
        const fillColor = color || this.colors.star;

        ctx.fillStyle = fillColor;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
            const sx = x + r * Math.cos(angle);
            const sy = y + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
    },

    /**
     * 绘制俄罗斯方块（多联骨牌）符号
     * - 缩小版的方块网格，黄色填充（或蓝色空心轮廓）
     * - 每个 mini-cell 之间有小间隙
     * - 倾斜方块有旋转标记
     * - 空心方块使用蓝色描边 + 半透明填充
     */
    drawTetris(ctx, x, y, size, symbol) {
        const shape = symbol.shape || [[1]];
        const hollow = symbol.hollow || false;
        const tilted = symbol.tilted || false;

        const blockRows = shape.length;
        const blockCols = shape[0].length;
        const maxDim = Math.max(blockRows, blockCols);

        // 每个小方块的尺寸（确保整体不超出格子范围）
        const gap = 2; // 方块间隙
        const totalSize = size * 0.65; // 整体占用空间
        const cellSize = Math.min(
            (totalSize - gap * (blockCols - 1)) / blockCols,
            (totalSize - gap * (blockRows - 1)) / blockRows,
            size * 0.35 // 每个小方块最大尺寸
        );

        // 计算起始位置（居中）
        const totalW = blockCols * cellSize + gap * (blockCols - 1);
        const totalH = blockRows * cellSize + gap * (blockRows - 1);
        const startX = x - totalW / 2;
        const startY = y - totalH / 2;

        // 绘制半透明背景
        const bgPadding = 4;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        const bgRx = 3;
        this.roundRect(ctx,
            startX - bgPadding, startY - bgPadding,
            totalW + bgPadding * 2, totalH + bgPadding * 2, bgRx);
        ctx.fill();
        ctx.stroke();

        // 绘制小方块
        const fillColor = hollow ? this.colors.tetrisHollow : this.colors.tetris;
        const borderColor = hollow ? this.colors.tetrisHollow : '#c8960e';
        const highlightColor = hollow
            ? 'rgba(52, 152, 255, 0.4)'
            : 'rgba(255, 255, 255, 0.3)';

        for (let br = 0; br < blockRows; br++) {
            for (let bc = 0; bc < blockCols; bc++) {
                const bx = startX + bc * (cellSize + gap);
                const by = startY + br * (cellSize + gap);

                if (shape[br][bc]) {
                    // 填充方块
                    const r = cellSize * 0.15; // 圆角

                    if (hollow) {
                        // 空心：蓝色描边 + 半透明填充
                        ctx.fillStyle = 'rgba(52, 152, 255, 0.2)';
                        this.roundRect(ctx, bx, by, cellSize, cellSize, r);
                        ctx.fill();

                        ctx.strokeStyle = this.colors.tetrisHollow;
                        ctx.lineWidth = 1.8;
                        this.roundRect(ctx, bx, by, cellSize, cellSize, r);
                        ctx.stroke();
                    } else {
                        // 实心：黄色填充 + 高光
                        const grad = ctx.createLinearGradient(bx, by, bx, by + cellSize);
                        grad.addColorStop(0, '#ffe066');
                        grad.addColorStop(0.5, this.colors.tetris);
                        grad.addColorStop(1, '#e6a800');
                        ctx.fillStyle = grad;
                        this.roundRect(ctx, bx, by, cellSize, cellSize, r);
                        ctx.fill();

                        // 边框
                        ctx.strokeStyle = borderColor;
                        ctx.lineWidth = 1.2;
                        this.roundRect(ctx, bx, by, cellSize, cellSize, r);
                        ctx.stroke();

                        // 高光（左上角亮色）
                        ctx.fillStyle = highlightColor;
                        this.roundRect(ctx,
                            bx + cellSize * 0.1, by + cellSize * 0.1,
                            cellSize * 0.5, cellSize * 0.3,
                            r * 0.6);
                        ctx.fill();
                    }
                } else {
                    // 空格子：淡淡显示网格参考线
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(bx + 1, by + 1, cellSize - 2, cellSize - 2);
                }
            }
        }

        // 倾斜标记：右下角的小旋转图标
        if (tilted) {
            const iconX = startX + totalW + 2;
            const iconY = startY + totalH + 2;
            const iconR = 6;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.arc(iconX, iconY, iconR * 0.4, 0, Math.PI * 2);
            ctx.fill();

            // 小弧形箭头
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(iconX, iconY, iconR, -Math.PI * 0.8, Math.PI * 0.4);
            ctx.stroke();

            // 箭头尖
            const arrowAngle = Math.PI * 0.4;
            const ax = iconX + iconR * Math.cos(arrowAngle);
            const ay = iconY + iconR * Math.sin(arrowAngle);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + 3, ay - 3);
            ctx.lineTo(ax - 3, ay - 3);
            ctx.closePath();
            ctx.fill();
        }

        // 空心标记：蓝色小圆圈
        if (hollow && !tilted) {
            const dotX = startX + totalW + 1;
            const dotY = startY - 1;
            ctx.fillStyle = this.colors.tetrisHollow;
            ctx.beginPath();
            ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
        }
    },

    /**
     * 辅助：绘制圆角矩形路径
     */
    roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    },

    drawTriangle(ctx, x, y, size, count) {
        const triSize = size * 0.35;
        ctx.fillStyle = this.colors.triangle;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;

        for (let i = 0; i < count; i++) {
            let tx = x, ty = y;
            if (count === 2) {
                tx = x + (i === 0 ? -triSize * 0.7 : triSize * 0.7);
            } else if (count === 3) {
                const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
                tx = x + Math.cos(angle) * triSize * 0.8;
                ty = y + Math.sin(angle) * triSize * 0.8;
            }

            ctx.beginPath();
            ctx.moveTo(tx, ty - triSize * 0.7);
            ctx.lineTo(tx - triSize * 0.7, ty + triSize * 0.5);
            ctx.lineTo(tx + triSize * 0.7, ty + triSize * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
    },

    drawElimination(ctx, x, y, size) {
        const s = size * 0.35;
        ctx.strokeStyle = this.colors.elimination;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';

        // Three lines forming an inverted Y
        // Top-left line
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - s * 0.7, y - s * 0.7);
        ctx.stroke();
        // Top-right line
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + s * 0.7, y - s * 0.7);
        ctx.stroke();
        // Bottom line
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + s);
        ctx.stroke();

        // Small circle at center
        ctx.fillStyle = this.colors.elimination;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
    },

    /**
     * Draw the path on the board
     * @param {PathController|null} pathController — if provided, uses tracked activeStartEdge/activeEndEdge
     */
    drawPath(board, ctx, path, pathColor = null, pathAlpha = 1, pathController = null) {
        const startEdges = board.findAllEdgeSymbols('start');
        const endEdges = board.findAllEdgeSymbols('end');
        const hasEdgeStart = startEdges.length > 0;
        const hasEdgeEnd = endEdges.length > 0;
        const minLen = (hasEdgeStart || hasEdgeEnd) ? 1 : 2;
        if (!path || path.length < minLen) return;

        const color = pathColor || this.colors.path;
        const glowColor = pathColor ?
            pathColor.replace(')', ', 0.3)').replace('rgb', 'rgba') :
            this.colors.pathGlow;

        // Collect all line segments: [s1_from, s1_to, s2_from, s2_to, ...]
        const segments = [];

        // If start is on edge midpoint, use the tracked activeStartEdge if available
        if (hasEdgeStart && path.length >= 1) {
            let se = null;
            // Use the tracked edge from pathController for exact match
            if (pathController && pathController.activeStartEdge) {
                se = pathController.activeStartEdge;
            } else {
                // Fallback: find which edge is adjacent to path[0]
                for (const candidate of startEdges) {
                    const [n1, n2] = board.getEdgeNodes(candidate.r, candidate.c, candidate.dir);
                    if ((path[0].r === n1.r && path[0].c === n1.c) ||
                        (path[0].r === n2.r && path[0].c === n2.c)) { se = candidate; break; }
                }
            }
            if (se) {
                const mp = board.edgeMidpointToPixel(se.r, se.c, se.dir);
                const firstNode = board.nodeToPixel(path[0].r, path[0].c);
                segments.push({from: mp, to: firstNode});
            }
        }

        // Path segments between nodes
        for (let i = 0; i < path.length - 1; i++) {
            const from = board.nodeToPixel(path[i].r, path[i].c);
            const to = board.nodeToPixel(path[i + 1].r, path[i + 1].c);
            segments.push({from, to});
        }

        // If end is on edge midpoint, find which edge and add segment
        if (hasEdgeEnd && path.length >= 1) {
            const last = path[path.length - 1];
            let ee = null;
            if (pathController && pathController.activeEndEdge) {
                ee = pathController.activeEndEdge;
            } else {
                for (const candidate of endEdges) {
                    const [n1, n2] = board.getEdgeNodes(candidate.r, candidate.c, candidate.dir);
                    if ((last.r === n1.r && last.c === n1.c) ||
                        (last.r === n2.r && last.c === n2.c)) { ee = candidate; break; }
                }
            }
            if (ee) {
                const lastNode = board.nodeToPixel(last.r, last.c);
                const mp = board.edgeMidpointToPixel(ee.r, ee.c, ee.dir);
                segments.push({from: lastNode, to: mp});
            }
        }

        if (segments.length === 0) return;

        // Draw glow
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = pathAlpha;
        ctx.beginPath();
        ctx.moveTo(segments[0].from.x, segments[0].from.y);
        for (const seg of segments) {
            ctx.lineTo(seg.to.x, seg.to.y);
        }
        ctx.stroke();

        // Draw main line
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(segments[0].from.x, segments[0].from.y);
        for (const seg of segments) {
            ctx.lineTo(seg.to.x, seg.to.y);
        }
        ctx.stroke();

        // Draw end indicator
        const lastSeg = segments[segments.length - 1];
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(lastSeg.to.x, lastSeg.to.y, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
    },

    /**
     * Highlight a region with a fill color
     */
    highlightRegion(board, ctx, cells, color, alpha = 0.3) {
        const {cellSize, padding} = board;
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        for (const {r, c} of cells) {
            const x = padding + c * cellSize + 1;
            const y = padding + r * cellSize + 1;
            ctx.fillRect(x, y, cellSize - 2, cellSize - 2);
        }
        ctx.globalAlpha = 1;
    }
};
