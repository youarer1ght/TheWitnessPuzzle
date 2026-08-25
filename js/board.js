/**
 * Board module - Data model and Canvas rendering for the puzzle grid
 */
class Board {
    constructor(rows, cols) {
        this.rows = rows;
        this.cols = cols;
        // symbols[row][col] = array of cell-level symbols
        this.cellSymbols = Array.from({length: rows}, () => Array.from({length: cols}, () => []));
        // nodeSymbols[nodeRow][nodeCol] = array of node-level symbols
        this.nodeSymbols = Array.from({length: rows + 1}, () => Array.from({length: cols + 1}, () => []));
        // Blocked edges (gaps in the grid)
        this.blockedEdges = new Set();
        // Edge midpoint symbols (start/end on edge centers, not just nodes)
        this.edgeSymbols = new Map(); // "H:r,c" or "V:r,c" → [{type:'start'}, ...]
        // Cell size in pixels (set during render)
        this.cellSize = 60;
        this.padding = 40;
        // Symmetry
        this.symmetry = 'none'; // 'none' | 'horizontal' | 'vertical' | 'diagonal'

        // Canvas reference
        this.canvas = null;
        this.ctx = null;
    }

    // Get all horizontal edges: edge between node(r,c) and node(r,c+1)
    getEdgeKey(r, c, dir) {
        // dir: 'H' horizontal (right), 'V' vertical (down)
        return `${dir}:${r},${c}`;
    }

    isEdgeBlocked(r, c, dir) {
        return this.blockedEdges.has(this.getEdgeKey(r, c, dir));
    }

    toggleEdgeBlock(r, c, dir) {
        const key = this.getEdgeKey(r, c, dir);
        if (this.blockedEdges.has(key)) {
            this.blockedEdges.delete(key);
        } else {
            this.blockedEdges.add(key);
        }
    }

    // Get neighbors of a node
    getNeighbors(nodeR, nodeC) {
        const neighbors = [];
        // Up
        if (nodeR > 0 && !this.isEdgeBlocked(nodeR - 1, nodeC, 'V')) {
            neighbors.push({r: nodeR - 1, c: nodeC, dir: 'up'});
        }
        // Down
        if (nodeR < this.rows && !this.isEdgeBlocked(nodeR, nodeC, 'V')) {
            neighbors.push({r: nodeR + 1, c: nodeC, dir: 'down'});
        }
        // Left
        if (nodeC > 0 && !this.isEdgeBlocked(nodeR, nodeC - 1, 'H')) {
            neighbors.push({r: nodeR, c: nodeC - 1, dir: 'left'});
        }
        // Right
        if (nodeC < this.cols && !this.isEdgeBlocked(nodeR, nodeC, 'H')) {
            neighbors.push({r: nodeR, c: nodeC + 1, dir: 'right'});
        }
        return neighbors;
    }

    // Get the edge between two adjacent nodes
    getEdgeBetween(n1r, n1c, n2r, n2c) {
        if (n1r === n2r) {
            const c = Math.min(n1c, n2c);
            return {r: n1r, c: c, dir: 'H'};
        } else {
            const r = Math.min(n1r, n2r);
            return {r: r, c: n1c, dir: 'V'};
        }
    }

    // ==================== Symmetry Methods ====================

    /**
     * Get the mirror node of (r, c) under the current symmetry
     */
    getSymmetricNode(r, c) {
        switch (this.symmetry) {
            case 'horizontal': return {r, c: this.cols - c};   // left-right mirror (vertical axis)
            case 'vertical':   return {r: this.rows - r, c};   // top-bottom mirror (horizontal axis)
            case 'diagonal':   return {r: c, c: r};             // main diagonal mirror
            default:           return {r, c};
        }
    }

    /**
     * Get the mirror cell of (r, c) under the current symmetry.
     * Cells use a different formula from nodes because cell indices are 0..cols-1
     * while node indices are 0..cols.
     */
    getSymmetricCell(r, c) {
        switch (this.symmetry) {
            case 'horizontal': return {r, c: this.cols - 1 - c};
            case 'vertical':   return {r: this.rows - 1 - r, c};
            case 'diagonal':   return {r: c, c: r};
            default:           return {r, c};
        }
    }

    /**
     * Check if a node lies on the symmetry axis (self-symmetric)
     */
    isOnAxis(r, c) {
        switch (this.symmetry) {
            case 'horizontal': return c * 2 === this.cols;
            case 'vertical':   return r * 2 === this.rows;
            case 'diagonal':   return r === c;
            default:           return false;
        }
    }

    /**
     * Get the mirror of an edge-midpoint under the current symmetry
     * @returns {{r, c, dir}|null} — mirrored edge, or null if out of bounds
     */
    getMirroredEdge(r, c, dir) {
        if (this.symmetry === 'none') return {r, c, dir};
        const [n1, n2] = this.getEdgeNodes(r, c, dir);
        const m1 = this.getSymmetricNode(n1.r, n1.c);
        const m2 = this.getSymmetricNode(n2.r, n2.c);
        // Check both mirrored nodes are in bounds
        if (m1.r < 0 || m1.r > this.rows || m1.c < 0 || m1.c > this.cols) return null;
        if (m2.r < 0 || m2.r > this.rows || m2.c < 0 || m2.c > this.cols) return null;
        return this.getEdgeBetween(m1.r, m1.c, m2.r, m2.c);
    }

    // Add a cell symbol
    addCellSymbol(row, col, symbol) {
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            this.cellSymbols[row][col].push(symbol);
        }
    }

    // Remove cell symbols of a type
    removeCellSymbols(row, col, type) {
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            this.cellSymbols[row][col] = this.cellSymbols[row][col].filter(s => s.type !== type);
        }
    }

    // Clear all cell symbols
    clearCellSymbols(row, col) {
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            this.cellSymbols[row][col] = [];
        }
    }

    // Add a node symbol
    addNodeSymbol(nodeRow, nodeCol, symbol) {
        if (nodeRow >= 0 && nodeRow <= this.rows && nodeCol >= 0 && nodeCol <= this.cols) {
            // Don't duplicate start/end
            if (symbol.type === 'start' || symbol.type === 'end') {
                this.nodeSymbols[nodeRow][nodeCol] = this.nodeSymbols[nodeRow][nodeCol]
                    .filter(s => s.type !== 'start' && s.type !== 'end');
            }
            this.nodeSymbols[nodeRow][nodeCol].push(symbol);
        }
    }

    // Remove node symbols of a type
    removeNodeSymbols(nodeRow, nodeCol, type) {
        if (nodeRow >= 0 && nodeRow <= this.rows && nodeCol >= 0 && nodeCol <= this.cols) {
            this.nodeSymbols[nodeRow][nodeCol] = this.nodeSymbols[nodeRow][nodeCol]
                .filter(s => s.type !== type);
        }
    }

    // Find all symbols of a given type
    findAllNodeSymbols(type) {
        const result = [];
        for (let r = 0; r <= this.rows; r++) {
            for (let c = 0; c <= this.cols; c++) {
                for (const sym of this.nodeSymbols[r][c]) {
                    if (sym.type === type) {
                        result.push({r, c, symbol: sym});
                    }
                }
            }
        }
        return result;
    }

    findAllCellSymbols(type) {
        const result = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                for (const sym of this.cellSymbols[r][c]) {
                    if (sym.type === type) {
                        result.push({r, c, symbol: sym});
                    }
                }
            }
        }
        return result;
    }

    // Get the start node
    getStartNode() {
        const starts = this.findAllNodeSymbols('start');
        return starts.length > 0 ? starts[0] : null;
    }

    // Get the end node
    getEndNode() {
        const ends = this.findAllNodeSymbols('end');
        return ends.length > 0 ? ends[0] : null;
    }

    // Get the start edge midpoint
    getStartEdge() {
        const starts = this.findAllEdgeSymbols('start');
        return starts.length > 0 ? starts[0] : null;
    }

    // Get the end edge midpoint
    getEndEdge() {
        const ends = this.findAllEdgeSymbols('end');
        return ends.length > 0 ? ends[0] : null;
    }

    // ==================== Edge Midpoint Methods ====================

    // Add a symbol at an edge midpoint
    addEdgeSymbol(r, c, dir, symbol) {
        const key = this.getEdgeKey(r, c, dir);
        // Validate edge exists
        if (dir === 'H' && (r < 0 || r > this.rows || c < 0 || c >= this.cols)) return;
        if (dir === 'V' && (r < 0 || r >= this.rows || c < 0 || c > this.cols)) return;
        // Don't duplicate start/end on the same edge (but allow multiple across edges)
        if (symbol.type === 'start' || symbol.type === 'end') {
            if (this.edgeSymbols.has(key)) {
                this.edgeSymbols.set(key,
                    this.edgeSymbols.get(key).filter(s => s.type !== 'start' && s.type !== 'end'));
            }
        }
        if (!this.edgeSymbols.has(key)) {
            this.edgeSymbols.set(key, []);
        }
        this.edgeSymbols.get(key).push(symbol);
    }

    // Remove edge midpoint symbols of a type
    removeEdgeSymbol(r, c, dir, type) {
        const key = this.getEdgeKey(r, c, dir);
        const symbols = this.edgeSymbols.get(key);
        if (symbols) {
            this.edgeSymbols.set(key, symbols.filter(s => s.type !== type));
            if (this.edgeSymbols.get(key).length === 0) {
                this.edgeSymbols.delete(key);
            }
        }
    }

    // Find all edge midpoint symbols of a type
    findAllEdgeSymbols(type) {
        const result = [];
        for (const [key, symbols] of this.edgeSymbols) {
            const [dir, coords] = key.split(':');
            const [r, c] = coords.split(',').map(Number);
            for (const sym of symbols) {
                if (sym.type === type) {
                    result.push({r, c, dir, symbol: sym});
                }
            }
        }
        return result;
    }

    // Clear all edge midpoint symbols
    clearAllEdgeSymbols() {
        this.edgeSymbols.clear();
    }

    // Get pixel position of an edge midpoint
    edgeMidpointToPixel(r, c, dir) {
        const cellSize = this.cellSize;
        const padding = this.padding;
        if (dir === 'H') {
            return {
                x: padding + (c + 0.5) * cellSize,
                y: padding + r * cellSize
            };
        } else { // 'V'
            return {
                x: padding + c * cellSize,
                y: padding + (r + 0.5) * cellSize
            };
        }
    }

    // Pixel to nearest edge midpoint
    pixelToEdgeMidpoint(px, py) {
        const threshold = this.cellSize * 0.35;
        let best = null;
        let bestDist = Infinity;

        // Check all H edges
        for (let r = 0; r <= this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const mp = this.edgeMidpointToPixel(r, c, 'H');
                const dist = Math.sqrt((px - mp.x) ** 2 + (py - mp.y) ** 2);
                if (dist < threshold && dist < bestDist) {
                    bestDist = dist;
                    best = {r, c, dir: 'H'};
                }
            }
        }

        // Check all V edges
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c <= this.cols; c++) {
                const mp = this.edgeMidpointToPixel(r, c, 'V');
                const dist = Math.sqrt((px - mp.x) ** 2 + (py - mp.y) ** 2);
                if (dist < threshold && dist < bestDist) {
                    bestDist = dist;
                    best = {r, c, dir: 'V'};
                }
            }
        }

        return best;
    }

    // Get the two nodes that an edge connects
    getEdgeNodes(r, c, dir) {
        if (dir === 'H') {
            return [{r, c}, {r, c: c + 1}];
        } else { // 'V'
            return [{r, c}, {r: r + 1, c}];
        }
    }

    // Clear all symbols
    clearAllSymbols() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this.cellSymbols[r][c] = [];
            }
        }
        for (let r = 0; r <= this.rows; r++) {
            for (let c = 0; c <= this.cols; c++) {
                this.nodeSymbols[r][c] = [];
            }
        }
        this.clearAllEdgeSymbols();
        this.blockedEdges.clear();
    }

    // Resize the board
    resize(newRows, newCols) {
        const oldCell = this.cellSymbols;
        const oldNode = this.nodeSymbols;
        this.rows = newRows;
        this.cols = newCols;
        this.cellSymbols = Array.from({length: newRows}, () => Array.from({length: newCols}, () => []));
        this.nodeSymbols = Array.from({length: newRows + 1}, () => Array.from({length: newCols + 1}, () => []));
        // Copy over symbols that fit
        for (let r = 0; r < Math.min(oldCell.length, newRows); r++) {
            for (let c = 0; c < Math.min(oldCell[r].length, newCols); c++) {
                this.cellSymbols[r][c] = oldCell[r][c];
            }
        }
        for (let r = 0; r < Math.min(oldNode.length, newRows + 1); r++) {
            for (let c = 0; c < Math.min(oldNode[r].length, newCols + 1); c++) {
                this.nodeSymbols[r][c] = oldNode[r][c];
            }
        }
    }

    // Node coordinate to pixel
    nodeToPixel(nodeR, nodeC) {
        return {
            x: this.padding + nodeC * this.cellSize,
            y: this.padding + nodeR * this.cellSize
        };
    }

    // Cell center to pixel
    cellCenterToPixel(cellR, cellC) {
        return {
            x: this.padding + (cellC + 0.5) * this.cellSize,
            y: this.padding + (cellR + 0.5) * this.cellSize
        };
    }

    // Pixel to nearest node
    pixelToNode(px, py) {
        const c = Math.round((px - this.padding) / this.cellSize);
        const r = Math.round((py - this.padding) / this.cellSize);
        if (r < 0 || r > this.rows || c < 0 || c > this.cols) return null;
        // Check if click is close enough to the node
        const {x, y} = this.nodeToPixel(r, c);
        const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
        if (dist < this.cellSize * 0.4) {
            return {r, c};
        }
        return null;
    }

    // Pixel to nearest edge midpoint
    // Returns {r, c, dir} or null if no edge is close enough
    pixelToEdge(px, py) {
        const cell = this.pixelToCell(px, py);
        let r, c;
        if (cell) {
            r = cell.r; c = cell.c;
        } else {
            // Clamp to the nearest in-grid cell so edge midpoints on the right
            // or bottom border still resolve (floor() would otherwise land on
            // the out-of-bounds last column/row). Points beyond the border grid
            // are ignored.
            const cx = Math.floor((px - this.padding) / this.cellSize);
            const cy = Math.floor((py - this.padding) / this.cellSize);
            if (cx < 0 || cy < 0 || cx > this.cols || cy > this.rows) return null;
            r = Math.max(0, Math.min(this.rows - 1, cy));
            c = Math.max(0, Math.min(this.cols - 1, cx));
        }
        const cs = this.cellSize;
        const pad = this.padding;
        const threshold = cs * 0.4;

        // All 4 edges of this cell, with their midpoint pixel positions
        const candidates = [
            {r, c, dir: 'H', ex: pad + (c + 0.5) * cs, ey: pad + r * cs},           // top H(r, c)
            {r: r + 1, c, dir: 'H', ex: pad + (c + 0.5) * cs, ey: pad + (r + 1) * cs}, // bottom H(r+1, c)
            {r, c, dir: 'V', ex: pad + c * cs, ey: pad + (r + 0.5) * cs},           // left V(r, c)
            {r, c: c + 1, dir: 'V', ex: pad + (c + 1) * cs, ey: pad + (r + 0.5) * cs}, // right V(r, c+1)
        ];

        let best = null, bestDist = Infinity;
        for (const e of candidates) {
            // Validate edge bounds
            if (e.r < 0 || e.r > this.rows || e.c < 0 || e.c > this.cols) continue;
            if (e.dir === 'H' && e.c >= this.cols) continue;
            if (e.dir === 'V' && e.r >= this.rows) continue;
            const dist = Math.hypot(px - e.ex, py - e.ey);
            if (dist < bestDist) { bestDist = dist; best = e; }
        }

        if (best && bestDist < threshold) {
            return {r: best.r, c: best.c, dir: best.dir};
        }
        return null;
    }

    // Pixel to nearest cell
    pixelToCell(px, py) {
        const c = Math.floor((px - this.padding) / this.cellSize);
        const r = Math.floor((py - this.padding) / this.cellSize);
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;
        return {r, c};
    }

    // ==================== Symmetry Path Validation ====================

    /**
     * Validate that a completed path is symmetric under the current symmetry.
     * Checks: mirror bounds, mirror uniqueness, mirror not blocked,
     * edge non-interference, node non-interference.
     *
     * This is the single canonical implementation shared by Validator,
     * Solver, and DebugExporter (via PuzzleAnalyzer).
     *
     * @param {Array} pathNodes - array of {r, c} node positions
     * @returns {{valid: boolean, errors: Array<{rule, message}>}}
     */
    validateSymmetricPath(pathNodes) {
        const errors = [];
        const sym = this.symmetry;
        const rows = this.rows;
        const cols = this.cols;

        if (sym === 'none' || pathNodes.length < 2) {
            return {valid: true, errors: []};
        }

        // Build mirror path
        const mirrorPath = [];
        const mirrorSeen = new Set();
        for (let i = 0; i < pathNodes.length; i++) {
            const mir = this.getSymmetricNode(pathNodes[i].r, pathNodes[i].c);
            if (mir.r < 0 || mir.r > rows || mir.c < 0 || mir.c > cols) {
                errors.push({
                    rule: 'symmetry',
                    message: `路径不对称——节点${i}(位于(${pathNodes[i].r},${pathNodes[i].c}))的镜像(${mir.r},${mir.c})超出棋盘`
                });
                return {valid: false, errors};
            }
            const key = `${mir.r},${mir.c}`;
            if (mirrorSeen.has(key)) {
                errors.push({
                    rule: 'symmetry',
                    message: `路径不对称——镜像路径有重复节点(${mir.r},${mir.c})`
                });
                return {valid: false, errors};
            }
            mirrorSeen.add(key);
            mirrorPath.push(mir);
        }

        // Verify mirror edges are not blocked
        for (let i = 0; i < mirrorPath.length - 1; i++) {
            const a = mirrorPath[i];
            const b = mirrorPath[i + 1];
            const dr = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
            if (dr === 1) {
                const edge = this.getEdgeBetween(a.r, a.c, b.r, b.c);
                if (this.isEdgeBlocked(edge.r, edge.c, edge.dir)) {
                    errors.push({
                        rule: 'symmetry',
                        message: `路径不对称——镜像路径第${i}步的边被隔断`
                    });
                    return {valid: false, errors};
                }
            }
        }

        // Edge non-interference
        const mainEdges = new Set();
        for (let i = 0; i < pathNodes.length - 1; i++) {
            const a = pathNodes[i], b = pathNodes[i + 1];
            const dr = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
            if (dr === 1) {
                const e = this.getEdgeBetween(a.r, a.c, b.r, b.c);
                mainEdges.add(`${e.r},${e.c}:${e.dir}`);
            }
        }
        for (let i = 0; i < mirrorPath.length - 1; i++) {
            const a = mirrorPath[i], b = mirrorPath[i + 1];
            const dr = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
            if (dr === 1) {
                const e = this.getEdgeBetween(a.r, a.c, b.r, b.c);
                if (mainEdges.has(`${e.r},${e.c}:${e.dir}`)) {
                    errors.push({
                        rule: 'symmetry',
                        message: `路径冲突——主路径和镜像路径共用同一条边(${e.r},${e.c}:${e.dir})`
                    });
                    return {valid: false, errors};
                }
            }
        }

        // Node non-interference — both paths must never share any node
        const mainNodeSet = new Set();
        for (const n of pathNodes) {
            mainNodeSet.add(`${n.r},${n.c}`);
        }
        for (const n of mirrorPath) {
            if (mainNodeSet.has(`${n.r},${n.c}`)) {
                errors.push({
                    rule: 'symmetry',
                    message: `路径冲突——主路径和镜像路径共用节点(${n.r},${n.c})，两条轨迹不能占据同一节点`
                });
                return {valid: false, errors};
            }
        }

        return {valid: true, errors: []};
    }

    /**
     * Fast boolean-only symmetry check for BFS solver inner loop.
     * Wraps validateSymmetricPath() and discards error messages.
     * @param {Array} pathNodes - array of {r, c} node positions
     * @returns {boolean}
     */
    isSymmetricPathValid(pathNodes) {
        return this.validateSymmetricPath(pathNodes).valid;
    }

    // Get the total canvas size needed
    getCanvasSize() {
        return {
            width: this.padding * 2 + this.cols * this.cellSize,
            height: this.padding * 2 + this.rows * this.cellSize
        };
    }
}
