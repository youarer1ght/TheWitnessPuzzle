/**
 * Main module - Entry point, initialization, event binding, module coordination
 */
class WitnessApp {
    constructor() {
        this.board = null;
        this.pathController = null;
        this.validator = null;
        this.solver = null;
        this.canvas = null;
        this.ctx = null;

        // UI state
        this.currentPuzzle = null;
        this.hoverCell = null;
        this.selectedCell = null;
        this.tetrisShapePanel = null;
        this.showSolution = false;
        this.solutionPath = null;
        this.allSolutions = [];       // All solutions from solveAll
        this.currentSolutionIndex = 0; // Which solution is currently displayed
        this.solvingAnimating = false;
        this.animationFrameId = null;
        this.animationIndex = 0;
        this.statusLocked = false;
        this._cachedValidation = null;  // Validation result cache
        this._dragState = null;         // Custom drag state: {type, r, c, dir?, symbols, startX, startY, isDragging, ghostEl?}
        this._dragCandidate = null;     // Pending drag candidate: {symbolHit, px, py, clientX, clientY}

        // Bound handlers for document-level drag tracking
        this._onDocDragMove = this._onDocDragMove.bind(this);
        this._onDocDragEnd = this._onDocDragEnd.bind(this);
    }

    init() {
        // Get DOM elements
        this.canvas = document.getElementById('puzzle-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Create game objects
        this.board = new Board(4, 4);
        this.board.cellSize = 65;
        this.board.padding = 45;
        this.pathController = new PathController(this.board);
        this.validator = new PuzzleValidator();
        this.solver = new PuzzleSolver(this.board);

        // Setup callbacks
        this.pathController.onPathChanged = (path) => this.onPathChangedCallback(path);
        this.pathController.onValidationChanged = (result) => this.onValidationChangedCallback(result);

        // Setup canvas events
        this.setupCanvasEvents();

        // Setup UI controls
        this.setupUIControls();

        // Setup keyboard shortcuts
        this.setupKeyboard();

        // Setup drag-and-drop for edit tools
        this.setupDragAndDrop();

        // Load first puzzle
        this.loadPuzzle(PUZZLE_LIBRARY[0]);

        // Initial render
        this.resizeCanvas();
        this.render();

        // Handle window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.render();
        });
    }

    setupCanvasEvents() {
        const canvas = this.canvas;

        canvas.addEventListener('mousedown', (e) => {
            const rect = canvas.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;

            if (e.button === 0) { // Left click
                // Always check for symbol hit — drag-to-delete works in all modes
                const symbolHit = this._detectSymbolAt(px, py);
                if (symbolHit) {
                    this._dragCandidate = {
                        symbolHit,
                        px, py,
                        clientX: e.clientX,
                        clientY: e.clientY
                    };
                } else {
                    this._dragCandidate = null;
                    // No symbol: try edge-click to toggle blocked edge
                    this._tryToggleBlockedEdge(px, py);
                }
                // Always attempt path drawing (short click on symbol = normal path click)
                this.pathController.handleMouseDown(px, py);
            } else if (e.button === 2) { // Right click
                e.preventDefault();
                this.pathController.undo();
            }
            this.render();
        });

        canvas.addEventListener('mousemove', (e) => {
            // ── Drag threshold check ──
            if (this._dragCandidate) {
                const dx = e.clientX - this._dragCandidate.clientX;
                const dy = e.clientY - this._dragCandidate.clientY;
                if (Math.abs(dx) >= 5 || Math.abs(dy) >= 5) {
                    // Start custom drag
                    const hit = this._dragCandidate.symbolHit;
                    this._dragCandidate = null;
                    // Undo the mousedown path start if path was started
                    if (this.pathController.getPathNodes().length <= 1) {
                        this.pathController.clear();
                    }
                    const ghost = document.createElement('div');
                    ghost.className = 'drag-ghost';
                    ghost.textContent = this._symbolLabel(hit.symbols);
                    document.body.appendChild(ghost);
                    ghost.style.left = (e.clientX + 12) + 'px';
                    ghost.style.top = (e.clientY + 12) + 'px';
                    this._dragState = {
                        type: hit.type,
                        r: hit.r,
                        c: hit.c,
                        dir: hit.dir || null,
                        symbols: hit.symbols,
                        isDragging: true,
                        ghostEl: ghost
                    };
                    // Add document-level listeners for cross-element drag tracking
                    document.addEventListener('mousemove', this._onDocDragMove);
                    document.addEventListener('mouseup', this._onDocDragEnd);
                }
                return;
            }

            // ── Custom drag: ghost already tracked by document listener ──
            if (this._dragState && this._dragState.isDragging) {
                return;
            }

            const rect = canvas.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;

            const node = this.pathController.handleMouseMove(px, py);
            const cell = this.board.pixelToCell(px, py);

            // Always render during tracking mode (path follows mouse)
            // Otherwise only render when hover cell changes
            if (this.pathController.isDrawing ||
                (cell && (!this.hoverCell || this.hoverCell.r !== cell.r || this.hoverCell.c !== cell.c)) ||
                (!cell && this.hoverCell)) {
                if (cell) {
                    this.hoverCell = cell;
                } else {
                    this.hoverCell = null;
                }
                this.render();
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            // ── Clear drag candidate on short click ──
            if (this._dragCandidate) {
                this._dragCandidate = null;
            }

            // Active drag is handled by document-level _onDocDragEnd
            if (this._dragState && this._dragState.isDragging) {
                return;
            }

            this.pathController.handleMouseUp();
            this.render();
        });

        canvas.addEventListener('mouseleave', () => {
            this.hoverCell = null;
            this.render();
        });

        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Touch events
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            const px = touch.clientX - rect.left;
            const py = touch.clientY - rect.top;
            this.pathController.handleMouseDown(px, py);
            this.render();
        });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            const px = touch.clientX - rect.left;
            const py = touch.clientY - rect.top;

            // Use handleMouseMove which supports both extension and undo
            this.pathController.handleMouseMove(px, py);
            this.render();
        });
    }

    /**
     * Initialize HTML5 drag-and-drop for edit buttons (left panel → canvas)
     * and custom drag tracking for canvas symbols → recycle bin.
     */
    setupDragAndDrop() {
        const canvas = this.canvas;
        const canvasContainer = canvas.parentElement;
        const recycleBin = document.getElementById('recycle-bin');
        const editToolsEl = document.querySelector('.edit-tools');
        const self = this;

        // ── Left-panel button drag (HTML5 DnD) ──
        if (editToolsEl) {
            editToolsEl.addEventListener('dragstart', (e) => {
                const btn = e.target.closest('[data-edit-mode]');
                if (!btn) return;
                const mode = btn.dataset.editMode;
                e.dataTransfer.setData('application/x-witness-mode', mode);
                e.dataTransfer.effectAllowed = 'copy';
                // Custom drag image (clone the button)
                const ghost = btn.cloneNode(true);
                ghost.style.position = 'absolute';
                ghost.style.top = '-9999px';
                ghost.style.left = '-9999px';
                ghost.style.width = btn.offsetWidth + 'px';
                ghost.style.background = '#1a1a3a';
                ghost.style.color = '#00e5ff';
                ghost.style.border = '1px solid #00e5ff';
                ghost.style.borderRadius = '4px';
                ghost.style.padding = '4px 8px';
                ghost.style.fontSize = '0.85em';
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
                setTimeout(() => ghost.remove(), 0);
            });
        }

        // ── Canvas: drop target for left-panel drags ──
        canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            canvasContainer.classList.add('drop-zone-active');
        });
        canvas.addEventListener('dragleave', (e) => {
            // Only remove if we're actually leaving the canvas
            if (!canvas.contains(e.relatedTarget)) {
                canvasContainer.classList.remove('drop-zone-active');
            }
        });
        canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            canvasContainer.classList.remove('drop-zone-active');
            const mode = e.dataTransfer.getData('application/x-witness-mode');
            if (!mode) return;
            const rect = canvas.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;
            self.handleEditClick(px, py, mode);
            self.render();
        });

        // ── Recycle bin: drop target for both DnD sources ──
        if (recycleBin) {
            recycleBin.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                recycleBin.classList.add('drag-over');
            });
            recycleBin.addEventListener('dragleave', () => {
                recycleBin.classList.remove('drag-over');
            });
            recycleBin.addEventListener('drop', (e) => {
                e.preventDefault();
                recycleBin.classList.remove('drag-over');
                // Dropping a left-panel button onto recycle bin → no-op (cancel)
            });
        }
    }

    /**
     * Detect a placed symbol at canvas pixel coordinates.
     * Checks edges first, then nodes, then cells.
     * @returns {{type, r, c, dir?, symbols}|null}
     */
    _detectSymbolAt(px, py) {
        // 1) Edge midpoint symbols
        const edge = this.board.pixelToEdgeMidpoint(px, py);
        if (edge) {
            const key = this.board.getEdgeKey(edge.r, edge.c, edge.dir);
            const symbols = this.board.edgeSymbols.get(key);
            if (symbols && symbols.length > 0) {
                return {type: 'edge', r: edge.r, c: edge.c, dir: edge.dir, symbols};
            }
        }

        // 2) Node symbols
        const node = this.board.pixelToNode(px, py);
        if (node) {
            const symbols = this.board.nodeSymbols[node.r][node.c];
            if (symbols && symbols.length > 0) {
                return {type: 'node', r: node.r, c: node.c, symbols};
            }
        }

        // 3) Cell symbols
        const cell = this.board.pixelToCell(px, py);
        if (cell) {
            const symbols = this.board.cellSymbols[cell.r][cell.c];
            if (symbols && symbols.length > 0) {
                return {type: 'cell', r: cell.r, c: cell.c, symbols};
            }
        }

        return null;
    }

    /**
     * Delete a symbol that was dragged to the recycle bin.
     * Clears node/cell/edge symbols at the given position, plus related
     * symbols (corner nodes for cells, surrounding edges, mirror symbols).
     * @param {{type, r, c, dir?}} dragState
     */
    _deleteSymbol({type, r, c, dir}) {
        if (type === 'cell') {
            // Clear cell-level symbols only (not corner nodes or edge symbols,
            // which are independent and should be deleted separately)
            this.board.clearCellSymbols(r, c);
            // Also clear mirrored cell if symmetry is active
            if (this.board.symmetry !== 'none') {
                const mirror = this.board.getSymmetricCell(r, c);
                if (!(mirror.r === r && mirror.c === c)) {
                    if (mirror.r >= 0 && mirror.r < this.board.rows &&
                        mirror.c >= 0 && mirror.c < this.board.cols) {
                        this.board.clearCellSymbols(mirror.r, mirror.c);
                    }
                }
            }
        } else if (type === 'node') {
            this.board.nodeSymbols[r][c] = [];
            // Also clear mirrored node if symmetry is active
            if (this.board.symmetry !== 'none') {
                const mirror = this.board.getSymmetricNode(r, c);
                if (!(mirror.r === r && mirror.c === c)) {
                    if (mirror.r >= 0 && mirror.r <= this.board.rows &&
                        mirror.c >= 0 && mirror.c <= this.board.cols) {
                        this.board.nodeSymbols[mirror.r][mirror.c] = [];
                    }
                }
            }
        } else if (type === 'edge') {
            this.board.removeEdgeSymbol(r, c, dir, 'start');
            this.board.removeEdgeSymbol(r, c, dir, 'end');
            // Also clear mirrored edge
            if (this.board.symmetry !== 'none') {
                const me = this.board.getMirroredEdge(r, c, dir);
                if (me && !(me.r === r && me.c === c && me.dir === dir)) {
                    this.board.removeEdgeSymbol(me.r, me.c, me.dir, 'start');
                    this.board.removeEdgeSymbol(me.r, me.c, me.dir, 'end');
                }
            }
        }
        this.pathController.reset();
    }

    /**
     * Reposition a dragged symbol to a new position on the canvas.
     * Removes the symbol from its original location and places it at the
     * drop coordinates, preserving all symbol properties (color, shape, etc.).
     * Handles symmetry mirror cleanup and re-mirroring.
     * @param {{type, r, c, dir?, symbols}} dragState
     * @param {number} px - drop pixel X relative to canvas
     * @param {number} py - drop pixel Y relative to canvas
     */
    _repositionSymbol(dragState, px, py) {
        const syms = dragState.symbols;
        if (!syms || syms.length === 0) return;

        // ── Validate new position and determine placement modes ──
        const modes = []; // [{mode, sym}]
        if (dragState.type === 'node') {
            const node = this.board.pixelToNode(px, py);
            if (!node) return;
            if (node.r === dragState.r && node.c === dragState.c) return; // no-op
            for (const sym of syms) {
                let mode;
                if (sym.type === 'start') mode = 'start';
                else if (sym.type === 'end') mode = 'end';
                else if (sym.type === 'hexagon') mode = 'hexagon';
                if (mode) modes.push({mode, sym});
            }
        } else if (dragState.type === 'cell') {
            const cell = this.board.pixelToCell(px, py);
            if (!cell) return;
            if (cell.r === dragState.r && cell.c === dragState.c) return;
            for (const sym of syms) {
                let mode;
                if (sym.type === 'square') mode = 'square';
                else if (sym.type === 'star') mode = 'star';
                else if (sym.type === 'triangle') mode = 'triangle';
                else if (sym.type === 'elimination') mode = 'elimination';
                else if (sym.type === 'tetris') mode = 'tetris';
                if (mode) modes.push({mode, sym});
            }
        } else if (dragState.type === 'edge') {
            const edge = this.board.pixelToEdgeMidpoint(px, py);
            if (!edge) return;
            if (edge.r === dragState.r && edge.c === dragState.c && edge.dir === dragState.dir) return;
            for (const sym of syms) {
                let mode;
                if (sym.type === 'start') mode = 'edge_start';
                else if (sym.type === 'end') mode = 'edge_end';
                if (mode) modes.push({mode, sym});
            }
        }

        if (modes.length === 0) return;

        // ── Remove symbols from old position ──
        if (dragState.type === 'node') {
            this.board.nodeSymbols[dragState.r][dragState.c] = [];
            // Also clear mirror node if symmetry is active
            if (this.board.symmetry !== 'none') {
                const mirror = this.board.getSymmetricNode(dragState.r, dragState.c);
                if (!(mirror.r === dragState.r && mirror.c === dragState.c)) {
                    if (mirror.r >= 0 && mirror.r <= this.board.rows &&
                        mirror.c >= 0 && mirror.c <= this.board.cols) {
                        this.board.nodeSymbols[mirror.r][mirror.c] = [];
                    }
                }
            }
        } else if (dragState.type === 'cell') {
            this.board.cellSymbols[dragState.r][dragState.c] = [];
            // Also clear mirror cell if symmetry is active
            if (this.board.symmetry !== 'none') {
                const mirror = this.board.getSymmetricCell(dragState.r, dragState.c);
                if (!(mirror.r === dragState.r && mirror.c === dragState.c)) {
                    if (mirror.r >= 0 && mirror.r < this.board.rows &&
                        mirror.c >= 0 && mirror.c < this.board.cols) {
                        this.board.cellSymbols[mirror.r][mirror.c] = [];
                    }
                }
            }
        } else if (dragState.type === 'edge') {
            this.board.removeEdgeSymbol(dragState.r, dragState.c, dragState.dir, 'start');
            this.board.removeEdgeSymbol(dragState.r, dragState.c, dragState.dir, 'end');
            // Also clear mirrored edge
            if (this.board.symmetry !== 'none') {
                const me = this.board.getMirroredEdge(dragState.r, dragState.c, dragState.dir);
                if (me && !(me.r === dragState.r && me.c === dragState.c && me.dir === dragState.dir)) {
                    this.board.removeEdgeSymbol(me.r, me.c, me.dir, 'start');
                    this.board.removeEdgeSymbol(me.r, me.c, me.dir, 'end');
                }
            }
        }

        // ── Place at new position, preserving all properties ──
        for (const {mode, sym} of modes) {
            if (dragState.type === 'node') {
                const node = this.board.pixelToNode(px, py);
                if (node) {
                    this.board.addNodeSymbol(node.r, node.c, {...sym});
                    if (this.board.symmetry !== 'none') {
                        this._mirrorPlacement(node.r, node.c, 'node', sym.type);
                    }
                }
            } else if (dragState.type === 'cell') {
                const cell = this.board.pixelToCell(px, py);
                if (cell) {
                    this.board.addCellSymbol(cell.r, cell.c, {...sym});
                    if (this.board.symmetry !== 'none') {
                        this._mirrorPlacement(cell.r, cell.c, 'cell', sym.type, null, sym);
                    }
                }
            } else if (dragState.type === 'edge') {
                const edge = this.board.pixelToEdgeMidpoint(px, py);
                if (edge) {
                    this.board.addEdgeSymbol(edge.r, edge.c, edge.dir, {...sym});
                    if (this.board.symmetry !== 'none') {
                        this._mirrorPlacement(edge.r, edge.c, 'edge', sym.type, edge.dir);
                    }
                }
            }
        }

        this.pathController.reset();
    }

    /**
     * Build a human-readable label for a set of symbols (used in drag ghost).
     */
    _symbolLabel(symbols) {
        if (!symbols || symbols.length === 0) return '?';
        return symbols.map(s => {
            if (typeof s === 'string') return s;
            const typeNames = {
                start: '起点', end: '终点', hexagon: '六边形', square: '方块',
                star: '星形', triangle: '三角形', elimination: '消除', tetris: '方块',
                blocked: '隔断'
            };
            return typeNames[s.type] || s.type || '?';
        }).join(', ');
    }

    /**
     * Toggle a blocked edge near the given pixel position.
     * Detects which edge the click is near (using node-offset direction)
     * and toggles its blocked status. Called on mousedown when no symbol is hit.
     * In symmetry mode, also toggles the mirror edge for consistency.
     */
    _tryToggleBlockedEdge(px, py) {
        let node = this.board.pixelToNode(px, py);

        // Fallback: if not near any node, try snapping to edge midpoint
        if (!node) {
            const edge = this.board.pixelToEdge(px, py);
            if (edge) {
                this._toggleEdgeWithMirror(edge.r, edge.c, edge.dir);
                this.render();
            }
            return;
        }

        const {x: nx, y: ny} = this.board.nodeToPixel(node.r, node.c);
        const dx = px - nx;
        const dy = py - ny;
        const threshold = this.board.cellSize * 0.25;

        if (Math.abs(dx) > Math.abs(dy) && node.c < this.board.cols && Math.abs(dy) < threshold) {
            // Click is closer to horizontal edge
            this._toggleEdgeWithMirror(node.r, node.c, 'H');
            this.render();
        } else if (Math.abs(dy) > Math.abs(dx) && node.r < this.board.rows && Math.abs(dx) < threshold) {
            // Click is closer to vertical edge
            this._toggleEdgeWithMirror(node.r, node.c, 'V');
            this.render();
        }
    }

    /**
     * Toggle a blocked edge and its mirror (if symmetry is enabled).
     * Ensures symmetric puzzles have symmetric blocked edges.
     */
    _toggleEdgeWithMirror(r, c, dir) {
        this.board.toggleEdgeBlock(r, c, dir);
        if (this.board.symmetry !== 'none') {
            const me = this.board.getMirroredEdge(r, c, dir);
            if (me && !(me.r === r && me.c === c && me.dir === dir)) {
                this.board.toggleEdgeBlock(me.r, me.c, me.dir);
            }
        }
    }

    /**
     * Document-level mousemove handler during canvas symbol drag.
     * Tracks ghost position, recycle bin hover state, and canvas drop-zone highlight.
     */
    _onDocDragMove(e) {
        if (!this._dragState || !this._dragState.isDragging) return;
        if (this._dragState.ghostEl) {
            this._dragState.ghostEl.style.left = (e.clientX + 12) + 'px';
            this._dragState.ghostEl.style.top = (e.clientY + 12) + 'px';
        }
        // Recycle bin highlighting
        const rb = document.getElementById('recycle-bin');
        if (rb) {
            const rbRect = rb.getBoundingClientRect();
            const over = e.clientX >= rbRect.left && e.clientX <= rbRect.right &&
                         e.clientY >= rbRect.top && e.clientY <= rbRect.bottom;
            rb.classList.toggle('drag-over', over);
        }
        // Canvas drop-zone highlighting (indicates repositioning is possible)
        const canvasRect = this.canvas.getBoundingClientRect();
        const overCanvas = e.clientX >= canvasRect.left && e.clientX <= canvasRect.right &&
                           e.clientY >= canvasRect.top && e.clientY <= canvasRect.bottom;
        const container = this.canvas.parentElement;
        if (container) {
            container.classList.toggle('drop-zone-active', overCanvas);
        }
    }

    /**
     * Document-level mouseup handler during canvas-to-recycle drag.
     * Finalizes the drag: deletes symbol if dropped on recycle bin,
     * or repositions it if dropped back on the canvas.
     */
    _onDocDragEnd(e) {
        document.removeEventListener('mousemove', this._onDocDragMove);
        document.removeEventListener('mouseup', this._onDocDragEnd);

        if (!this._dragState || !this._dragState.isDragging) return;

        let handled = false;
        const rb = document.getElementById('recycle-bin');
        if (rb) {
            const rbRect = rb.getBoundingClientRect();
            const over = e.clientX >= rbRect.left && e.clientX <= rbRect.right &&
                         e.clientY >= rbRect.top && e.clientY <= rbRect.bottom;
            if (over && this._dragState) {
                this._deleteSymbol(this._dragState);
                rb.classList.add('animate-delete');
                setTimeout(() => rb.classList.remove('animate-delete'), 400);
                handled = true;
            }
            rb.classList.remove('drag-over');
        }

        // ── Reposition: drop back on the canvas moves the symbol ──
        if (!handled) {
            const canvasRect = this.canvas.getBoundingClientRect();
            const px = e.clientX - canvasRect.left;
            const py = e.clientY - canvasRect.top;
            if (px >= 0 && py >= 0 && px <= canvasRect.width && py <= canvasRect.height) {
                this._repositionSymbol(this._dragState, px, py);
            }
        }

        if (this._dragState && this._dragState.ghostEl) {
            this._dragState.ghostEl.remove();
        }
        // Clean up canvas drop-zone highlight
        const container = this.canvas.parentElement;
        if (container) {
            container.classList.remove('drop-zone-active');
        }
        this._dragState = null;
        this.render();
    }

    handleEditClick(px, py, mode) {
        if (!mode) return;
        // === Edge-midpoint placement ===
        if (mode === 'edge_start' || mode === 'edge_end') {
            const edge = this.board.pixelToEdgeMidpoint(px, py);
            if (!edge) return;

            if (mode === 'edge_start') {
                this.board.addEdgeSymbol(edge.r, edge.c, edge.dir, {type: 'start'});
                this._mirrorPlacement(edge.r, edge.c, 'edge', 'start', edge.dir);
            } else if (mode === 'edge_end') {
                this.board.addEdgeSymbol(edge.r, edge.c, edge.dir, {type: 'end'});
                this._mirrorPlacement(edge.r, edge.c, 'edge', 'end', edge.dir);
            }
            this.pathController.reset();
        } else if (mode === 'start' || mode === 'end' || mode === 'hexagon') {
            // Node-level placement
            const node = this.board.pixelToNode(px, py);
            if (!node) return;

            if (mode === 'start') {
                this.board.addNodeSymbol(node.r, node.c, {type: 'start'});
                this._mirrorPlacement(node.r, node.c, 'node', 'start');
            } else if (mode === 'end') {
                this.board.addNodeSymbol(node.r, node.c, {type: 'end'});
                this._mirrorPlacement(node.r, node.c, 'node', 'end');
            } else if (mode === 'hexagon') {
                this.board.addNodeSymbol(node.r, node.c, {type: 'hexagon', color: 'black'});
                this._mirrorPlacement(node.r, node.c, 'node', 'hexagon');
            }
            this.pathController.reset();
        } else if (mode === 'blocked') {
            // Edge blocking - find the nearest edge (node-proximity first, then edge midpoint)
            let node = this.board.pixelToNode(px, py);

            if (!node) {
                const edge = this.board.pixelToEdge(px, py);
                if (edge) {
                    this._toggleEdgeWithMirror(edge.r, edge.c, edge.dir);
                }
            } else {
                // Find which direction the click is in
                const {x: nx, y: ny} = this.board.nodeToPixel(node.r, node.c);
                const dx = px - nx;
                const dy = py - ny;
                const threshold = this.board.cellSize * 0.25;

                if (Math.abs(dx) > Math.abs(dy) && node.c < this.board.cols && Math.abs(dy) < threshold) {
                    this._toggleEdgeWithMirror(node.r, node.c, 'H');
                } else if (Math.abs(dy) > Math.abs(dx) && node.r < this.board.rows && Math.abs(dx) < threshold) {
                    this._toggleEdgeWithMirror(node.r, node.c, 'V');
                }
            }
        } else {
            // Cell-level placement
            const cell = this.board.pixelToCell(px, py);
            if (!cell) return;

            if (mode === 'square') {
                const colorSelect = document.getElementById('color-select');
                const color = colorSelect ? colorSelect.value : 'black';
                const sym = {type: 'square', color: color};
                this.board.addCellSymbol(cell.r, cell.c, sym);
                this._mirrorPlacement(cell.r, cell.c, 'cell', 'square', null, sym);
            } else if (mode === 'star') {
                const colorSelect = document.getElementById('color-select');
                const color = colorSelect ? colorSelect.value : '#ff6348';
                const sym = {type: 'star', color: color};
                this.board.addCellSymbol(cell.r, cell.c, sym);
                this._mirrorPlacement(cell.r, cell.c, 'cell', 'star', null, sym);
            } else if (mode === 'triangle') {
                const sym = {type: 'triangle', count: 1};
                this.board.addCellSymbol(cell.r, cell.c, sym);
                this._mirrorPlacement(cell.r, cell.c, 'cell', 'triangle', null, sym);
            } else if (mode === 'elimination') {
                const sym = {type: 'elimination'};
                this.board.addCellSymbol(cell.r, cell.c, sym);
                this._mirrorPlacement(cell.r, cell.c, 'cell', 'elimination', null, sym);
            } else if (mode === 'tetris') {
                // Get selected shape from dropdown
                const shapeSelect = document.getElementById('tetris-shape-select');
                const tiltedCheck = document.getElementById('tetris-tilted-check');
                const hollowCheck = document.getElementById('tetris-hollow-check');
                if (shapeSelect) {
                    const shapeKey = shapeSelect.value;
                    const shapeDef = TETRIS_SHAPES[shapeKey];
                    if (shapeDef) {
                        const sym = {
                            type: 'tetris',
                            tetris_type: shapeKey,
                            shape: shapeDef.shape,
                            tilted: tiltedCheck ? tiltedCheck.checked : false,
                            hollow: hollowCheck ? hollowCheck.checked : false
                        };
                        this.board.addCellSymbol(cell.r, cell.c, sym);
                        this._mirrorPlacement(cell.r, cell.c, 'cell', 'tetris', null, sym);
                    }
                }
            }
        }
    }

    setupUIControls() {
        // Puzzle selection
        const puzzleSelect = document.getElementById('puzzle-select');
        puzzleSelect.innerHTML = PUZZLE_LIBRARY.map((p, i) =>
            `<option value="${i}">${p.name}</option>`
        ).join('');
        puzzleSelect.addEventListener('change', (e) => {
            this.loadPuzzle(PUZZLE_LIBRARY[e.target.value]);
        });

        // Board size controls
        document.getElementById('btn-rows-up').addEventListener('click', () => this.changeSize(1, 0));
        document.getElementById('btn-rows-down').addEventListener('click', () => this.changeSize(-1, 0));
        document.getElementById('btn-cols-up').addEventListener('click', () => this.changeSize(0, 1));
        document.getElementById('btn-cols-down').addEventListener('click', () => this.changeSize(0, -1));

        // Symmetry selector
        const symmetrySelect = document.getElementById('symmetry-select');
        if (symmetrySelect) {
            symmetrySelect.addEventListener('change', (e) => {
                const val = e.target.value;
                // Diagonal only valid for square boards
                if (val === 'diagonal' && this.board.rows !== this.board.cols) {
                    alert('对角线对称需要正方形棋盘（行数=列数）');
                    symmetrySelect.value = this.board.symmetry; // restore previous
                    return;
                }
                this._applySymmetryMirroring(val);
            });
        }

        // Edit mode buttons
        const editButtons = [
            {id: 'btn-edit-start', mode: 'start', label: '起点(节点)'},
            {id: 'btn-edit-end', mode: 'end', label: '终点(节点)'},
            {id: 'btn-edit-edge-start', mode: 'edge_start', label: '起点(边缘)'},
            {id: 'btn-edit-edge-end', mode: 'edge_end', label: '终点(边缘)'},
            {id: 'btn-edit-hexagon', mode: 'hexagon', label: '六边形'},
            {id: 'btn-edit-square', mode: 'square', label: '方块'},
            {id: 'btn-edit-star', mode: 'star', label: '星形'},
            {id: 'btn-edit-triangle', mode: 'triangle', label: '三角形'},
            {id: 'btn-edit-elimination', mode: 'elimination', label: '消除'},
            {id: 'btn-edit-tetris', mode: 'tetris', label: '俄罗斯方块'},
            {id: 'btn-edit-blocked', mode: 'blocked', label: '隔断'}
        ];

        // Edit buttons are drag-only (HTML5 DnD); no click handlers needed.
        // Tetris and star config panels are always visible.

        // Populate tetris shape selector
        this.tetrisShapePanel = document.getElementById('tetris-shape-panel');
        this.colorPanel = document.getElementById('color-panel');
        // Always show config panels
        if (this.tetrisShapePanel) this.tetrisShapePanel.style.display = 'block';
        if (this.colorPanel) this.colorPanel.style.display = 'block';
        const shapeSelect = document.getElementById('tetris-shape-select');
        if (shapeSelect) {
            // Group shapes by category
            for (const [catKey, catLabel] of Object.entries(TETRIS_CATEGORIES)) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = catLabel;
                for (const [shapeKey, shapeDef] of Object.entries(TETRIS_SHAPES)) {
                    if (shapeDef.category === catKey) {
                        const option = document.createElement('option');
                        option.value = shapeKey;
                        option.textContent = `${shapeDef.name} (${TetrisUtils.countCells(shapeDef.shape)}格)`;
                        option.setAttribute('data-shape', JSON.stringify(shapeDef.shape));
                        optgroup.appendChild(option);
                    }
                }
                shapeSelect.appendChild(optgroup);
            }
        }

        // Action buttons
        document.getElementById('btn-clear-path').addEventListener('click', () => {
            this.pathController.clear();
            this.showSolution = false;
            this.solutionPath = null;
            this.allSolutions = [];
            this.updateSolutionNav();
            this.render();
        });

        document.getElementById('btn-undo').addEventListener('click', () => {
            this.pathController.undo();
            this.render();
        });

        document.getElementById('btn-reset').addEventListener('click', () => {
            this.board.clearAllSymbols();
            this.pathController.clear();
            this.showSolution = false;
            this.solutionPath = null;
            this.allSolutions = [];
            this.updateSolutionNav();
            this.render();
        });

        document.getElementById('btn-solve').addEventListener('click', () => {
            this.solvePuzzle();
        });

        document.getElementById('btn-show-solution').addEventListener('click', () => {
            this.animateSolution();
        });

        // Solution navigation
        document.getElementById('btn-prev-solution').addEventListener('click', () => {
            this.previousSolution();
        });
        document.getElementById('btn-next-solution').addEventListener('click', () => {
            this.nextSolution();
        });

        // Export debug info button
        document.getElementById('btn-export-debug').addEventListener('click', () => {
            this.exportDebug();
        });

        // Copy feedback button
        document.getElementById('btn-copy-feedback').addEventListener('click', () => {
            this.copyFeedback();
        });

        // Close feedback report button
        document.getElementById('btn-close-report').addEventListener('click', () => {
            document.getElementById('feedback-report').style.display = 'none';
        });

    }

    setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' || e.key === 'Delete' || (e.ctrlKey && e.key === 'z')) {
                e.preventDefault();
                this.pathController.undo();
                this.render();
            } else if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.solvePuzzle();
            }
        });
    }

    /**
     * Auto-place mirrored start/end when symmetry is enabled
     * @param {number} r - row coordinate
     * @param {number} c - col coordinate
     * @param {string} location - 'node' or 'edge'
     * @param {string} type - 'start' or 'end'
     * @param {string} dir - edge direction ('H' or 'V'), only for edge placement
     */
    _mirrorPlacement(r, c, location, type, dir = null, cellSymbol = null) {
        if (this.board.symmetry === 'none') return;

        if (location === 'node') {
            const mirror = this.board.getSymmetricNode(r, c);
            if (mirror.r === r && mirror.c === c) return;
            if (mirror.r >= 0 && mirror.r <= this.board.rows &&
                mirror.c >= 0 && mirror.c <= this.board.cols) {
                // Push directly (don't call addNodeSymbol which would remove opposite type)
                const arr = this.board.nodeSymbols[mirror.r][mirror.c];
                // Only add if not already present
                if (!arr.some(s => s.type === type)) {
                    arr.push({type});
                }
            }
        } else if (location === 'edge' && dir) {
            const mirrorEdge = this.board.getMirroredEdge(r, c, dir);
            if (!mirrorEdge) return;
            if (mirrorEdge.r === r && mirrorEdge.c === c && mirrorEdge.dir === dir) return;
            const key = this.board.getEdgeKey(mirrorEdge.r, mirrorEdge.c, mirrorEdge.dir);
            if (!this.board.edgeSymbols.has(key)) {
                this.board.edgeSymbols.set(key, []);
            }
            const arr = this.board.edgeSymbols.get(key);
            if (!arr.some(s => s.type === type)) {
                arr.push({type});
            }
        } else if (location === 'cell' && cellSymbol) {
            const mirror = this.board.getSymmetricCell(r, c);
            if (mirror.r === r && mirror.c === c) return;
            if (mirror.r >= 0 && mirror.r < this.board.rows &&
                mirror.c >= 0 && mirror.c < this.board.cols) {
                // Deep-copy the full symbol to the mirror cell
                const arr = this.board.cellSymbols[mirror.r][mirror.c];
                if (!arr.some(s => s.type === cellSymbol.type)) {
                    arr.push({...cellSymbol});
                }
            }
        }
    }

    /**
     * Mirror all existing symbols and blocked edges when switching to symmetry mode.
     * Collects all current elements, clears the board, then re-places each element
     * at its "preferred side" position (smaller row, or if equal, smaller column)
     * and mirrors it to the symmetric position. Conflicts (two symbols of the same
     * type whose positions map to the same preferred side) are resolved by keeping
     * the first encountered.
     * @param {string} newSymmetry - 'none', 'horizontal', 'vertical', or 'diagonal'
     */
    _applySymmetryMirroring(newSymmetry) {
        const board = this.board;
        const oldSymmetry = board.symmetry;

        // When switching TO 'none', just clear path and re-render; keep all symbols as-is
        if (newSymmetry === 'none') {
            this.pathController.clear();
            this.showSolution = false;
            this.solutionPath = null;
            this.allSolutions = [];
            this.updateSolutionNav();
            this.render();
            return;
        }

        // ── Collect all existing symbols and blocked edges ──
        const nodeData = [];
        for (let r = 0; r <= board.rows; r++) {
            for (let c = 0; c <= board.cols; c++) {
                for (const sym of board.nodeSymbols[r][c]) {
                    nodeData.push({r, c, sym: {...sym}});
                }
            }
        }

        const cellData = [];
        for (let r = 0; r < board.rows; r++) {
            for (let c = 0; c < board.cols; c++) {
                for (const sym of board.cellSymbols[r][c]) {
                    cellData.push({r, c, sym: {...sym}});
                }
            }
        }

        const edgeData = [];
        for (const [key, syms] of board.edgeSymbols) {
            const [dir, coords] = key.split(':');
            const [r, c] = coords.split(',').map(Number);
            for (const sym of syms) {
                edgeData.push({r, c, dir, sym: {...sym}});
            }
        }

        const blockedData = [];
        for (const key of board.blockedEdges) {
            const [dir, coords] = key.split(':');
            const [r, c] = coords.split(',').map(Number);
            blockedData.push({r, c, dir});
        }

        // ── Set new symmetry and clear everything ──
        board.symmetry = newSymmetry;
        board.clearAllSymbols(); // clears cell, node, edge AND blockedEdges
        this.pathController.clear();

        // Helper: is (r,c) the "preferred" position compared to its mirror?
        // Always prefers smaller row, then smaller column (top-left bias).
        // Axis nodes (mirror == self) are always preferred.
        const isPreferred = (r, c, mr, mc) => {
            if (mr === r && mc === c) return true; // on axis
            if (r < mr) return true;
            if (r === mr && c < mc) return true;
            return false;
        };

        // ── Re-place node symbols ──
        const placedNodes = new Set();
        for (const {r, c, sym} of nodeData) {
            const mirror = board.getSymmetricNode(r, c);
            let pr = r, pc = c;
            if (!isPreferred(r, c, mirror.r, mirror.c)) {
                pr = mirror.r; pc = mirror.c;
            }
            const placeKey = `${pr},${pc},${sym.type}`;
            if (placedNodes.has(placeKey)) continue; // conflict: keep first
            placedNodes.add(placeKey);
            board.addNodeSymbol(pr, pc, {...sym});
            this._mirrorPlacement(pr, pc, 'node', sym.type);
        }

        // ── Re-place cell symbols ──
        const placedCells = new Set();
        for (const {r, c, sym} of cellData) {
            const mirror = board.getSymmetricCell(r, c);
            let pr = r, pc = c;
            if (!isPreferred(r, c, mirror.r, mirror.c)) {
                pr = mirror.r; pc = mirror.c;
            }
            const placeKey = `${pr},${pc},${sym.type}`;
            if (placedCells.has(placeKey)) continue;
            placedCells.add(placeKey);
            board.addCellSymbol(pr, pc, {...sym});
            this._mirrorPlacement(pr, pc, 'cell', sym.type, null, sym);
        }

        // ── Re-place edge-midpoint symbols ──
        const placedEdges = new Set();
        for (const {r, c, dir, sym} of edgeData) {
            const me = board.getMirroredEdge(r, c, dir);
            if (!me) continue;
            let pr = r, pc = c, pDir = dir;
            if (!isPreferred(r, c, me.r, me.c)) {
                pr = me.r; pc = me.c; pDir = me.dir;
            }
            const placeKey = `${pDir}:${pr},${pc},${sym.type}`;
            if (placedEdges.has(placeKey)) continue;
            placedEdges.add(placeKey);
            board.addEdgeSymbol(pr, pc, pDir, {...sym});
            this._mirrorPlacement(pr, pc, 'edge', sym.type, pDir);
        }

        // ── Re-place blocked edges ──
        const placedBlocked = new Set();
        for (const {r, c, dir} of blockedData) {
            const me = board.getMirroredEdge(r, c, dir);
            if (!me) continue;
            let pr = r, pc = c, pDir = dir;
            if (!isPreferred(r, c, me.r, me.c)) {
                pr = me.r; pc = me.c; pDir = me.dir;
            }
            const placeKey = `${pDir}:${pr},${pc}`;
            if (placedBlocked.has(placeKey)) continue;
            placedBlocked.add(placeKey);
            board.toggleEdgeBlock(pr, pc, pDir); // add (cleared above, so always adds)
            // Mirror the blocked edge
            const mirrorEdge = board.getMirroredEdge(pr, pc, pDir);
            if (mirrorEdge && !(mirrorEdge.r === pr && mirrorEdge.c === pc && mirrorEdge.dir === pDir)) {
                board.toggleEdgeBlock(mirrorEdge.r, mirrorEdge.c, mirrorEdge.dir);
            }
        }

        // ── Reset UI state ──
        this._cachedValidation = null;
        this.showSolution = false;
        this.solutionPath = null;
        this.allSolutions = [];
        this.updateSolutionNav();
        this.render();
    }

    loadPuzzle(puzzle) {
        this.currentPuzzle = puzzle;
        loadPuzzle(this.board, puzzle);
        this.board.cellSize = Math.max(50, Math.min(80, 400 / Math.max(puzzle.rows, puzzle.cols)));
        this.pathController.clear();
        this.showSolution = false;
        this.solutionPath = null;
        this.allSolutions = [];
        this._cachedValidation = null;
        this.resizeCanvas();
        this.render();

        // Update info
        document.getElementById('puzzle-name').textContent = puzzle.name;
        document.getElementById('puzzle-desc').textContent = puzzle.description;
        document.getElementById('puzzle-info').textContent =
            `${puzzle.rows}×${puzzle.cols} 网格 | ` +
            `${(puzzle.hexagons || []).length}六边形 ` +
            `${(puzzle.squares || []).length}方块 ` +
            `${(puzzle.stars || []).length}星形 ` +
            `${(puzzle.tetris || []).length}俄罗斯方块`;

        // Update size display
        document.getElementById('rows-display').textContent = puzzle.rows;
        document.getElementById('cols-display').textContent = puzzle.cols;
    }

    changeSize(dr, dc) {
        const newRows = Math.max(2, Math.min(8, this.board.rows + dr));
        const newCols = Math.max(2, Math.min(8, this.board.cols + dc));
        if (newRows === this.board.rows && newCols === this.board.cols) return;

        this.board.resize(newRows, newCols);
        this.board.cellSize = Math.max(50, Math.min(80, 400 / Math.max(newRows, newCols)));
        this.pathController.clear();
        this.showSolution = false;
        this.solutionPath = null;
        this.allSolutions = [];
        this._cachedValidation = null;
        this.resizeCanvas();
        this.render();

        document.getElementById('rows-display').textContent = newRows;
        document.getElementById('cols-display').textContent = newCols;
    }

    resizeCanvas() {
        const size = this.board.getCanvasSize();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = size.width * dpr;
        this.canvas.height = size.height * dpr;
        this.canvas.style.width = size.width + 'px';
        this.canvas.style.height = size.height + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /**
     * Main render function - redraws everything
     */
    render() {
        this._renderImpl();
    }

    _renderImpl() {
        const ctx = this.ctx;
        const board = this.board;
        const pathController = this.pathController;

        // 1. Draw board (grid, background)
        SymbolRenderer.drawBoard(board, ctx, this.hoverCell, this.selectedCell, pathController.getPathNodes());

        // 2. Highlight regions if path is complete (use cached validation)
        if (pathController.isComplete() && this.validator) {
            if (!this._cachedValidation) {
                this._cachedValidation = this.validator.validate(board, pathController);
            }
            const result = this._cachedValidation;
            if (result && result.regions) {
                const colors = ['rgba(0,229,255,0.05)', 'rgba(255,107,53,0.05)',
                    'rgba(255,215,0,0.05)', 'rgba(160,85,247,0.05)'];
                result.regions.forEach((region, i) => {
                    SymbolRenderer.highlightRegion(board, ctx, region, colors[i % colors.length]);
                });
            }
        }

        // 3. Draw hover indicator (valid move highlight)
        if (this.hoverCell) {
            const currNode = pathController.getCurrentNode();
            if (currNode) {
                // Highlight valid next moves
                const neighbors = board.getNeighbors(currNode.r, currNode.c);
                for (const nb of neighbors) {
                    if (pathController.canReachNode(nb.r, nb.c)) {
                        const {x, y} = board.nodeToPixel(nb.r, nb.c);
                        ctx.fillStyle = 'rgba(0, 229, 255, 0.3)';
                        ctx.beginPath();
                        ctx.arc(x, y, board.cellSize * 0.2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }

        // 4. Draw hover node highlight
        if (this.pathController.currentHoverNode) {
            const hn = this.pathController.currentHoverNode;
            if (this.pathController.canReachNode(hn.r, hn.c)) {
                const {x, y} = board.nodeToPixel(hn.r, hn.c);
                ctx.fillStyle = 'rgba(0, 229, 255, 0.5)';
                ctx.beginPath();
                ctx.arc(x, y, board.cellSize * 0.25, 0, Math.PI * 2);
                ctx.fill();
                // Mirror hover highlight
                if (this.pathController.mirrorHoverNode) {
                    const mh = this.pathController.mirrorHoverNode;
                    if (mh.r !== hn.r || mh.c !== hn.c) {
                        const mp = board.nodeToPixel(mh.r, mh.c);
                        ctx.fillStyle = 'rgba(0, 229, 255, 0.25)';
                        ctx.beginPath();
                        ctx.arc(mp.x, mp.y, board.cellSize * 0.25, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }

        // 5. Draw solution path (semi-transparent overlay) if showing
        if (this.showSolution && this.solutionPath) {
            SymbolRenderer.drawPath(board, ctx, this.solutionPath, 'rgba(0, 255, 136, 0.5)', 0.6, null);
            // Also draw mirror of the solution path in symmetry mode
            if (board.symmetry !== 'none') {
                const mirrorSolution = this.solutionPath.map(n => board.getSymmetricNode(n.r, n.c));
                if (mirrorSolution.length >= 2) {
                    SymbolRenderer.drawPath(board, ctx, mirrorSolution, 'rgba(255, 180, 50, 0.5)', 0.6, null);
                }
            }
        }

        // 6. Draw current path
        const currentPath = pathController.getPathNodes();
        const startEdges = board.findAllEdgeSymbols('start');
        if (currentPath.length >= 1) {
            // drawPath now uses pathController's tracked activeStartEdge/activeEndEdge
            SymbolRenderer.drawPath(board, ctx, currentPath, null, 1, pathController);
        } else if (startEdges.length > 0 && !board.getStartNode() && currentPath.length === 0) {
            // All starts are edge-midpoint with empty path: draw start indicators
            for (const se of startEdges) {
                const mp = board.edgeMidpointToPixel(se.r, se.c, se.dir);
                ctx.fillStyle = SymbolRenderer.colors.path;
                ctx.beginPath();
                ctx.arc(mp.x, mp.y, 6, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 6b. Draw symmetric mirror path (equal weight, distinct color)
        // The mirror path is an independent co-path — both paths start simultaneously
        // from two start points and must not conflict (share edges or non-axis nodes).
        if (board.symmetry !== 'none') {
            const symPath = pathController.getSymmetricPathNodes();
            if (symPath.length >= 2) {
                // Amber/gold contrasts with cyan main path on dark background
                SymbolRenderer.drawPath(board, ctx, symPath, '#ffb432', 1, null);
            }
        }

        // 7. Draw node symbols (start, end, hexagons on grid intersections)
        SymbolRenderer.drawNodeSymbols(board, ctx);

        // 8. Draw edge-midpoint symbols (start, end on edge centers)
        SymbolRenderer.drawEdgeSymbols(board, ctx);

        // 9. Draw cell symbols (squares, stars, tetris, triangles)
        SymbolRenderer.drawCellSymbols(board, ctx);

        // Update validation display
        this.updateValidationDisplay();
    }

    onPathChangedCallback(path) {
        // Invalidate cached validation on path change
        this._cachedValidation = null;
    }

    onValidationChangedCallback(result) {
        this.updateValidationDisplay();
    }

    updateValidationDisplay() {
        if (this.statusLocked) return;
        this._updateValidationDisplayImpl();
    }

    _updateValidationDisplayImpl() {
        const statusEl = document.getElementById('status-text');
        const errorList = document.getElementById('error-list');

        if (!this.pathController.isComplete()) {
            const path = this.pathController.getPathNodes();
            if (path.length === 0) {
                statusEl.textContent = '⏳ 等待画线 — 点击起点开始';
            } else if (path.length === 1) {
                statusEl.textContent = `⏳ 画线中 — 已在起点(${path[0].r},${path[0].c})，请继续`;
            } else {
                const last = path[path.length - 1];
                statusEl.textContent = `⏳ 画线中 — 已走${path.length}步，当前在(${last.r},${last.c})`;
            }

            // Show basic path issues during drawing (only if actively drawing)
            if (path.length >= 2) {
                const basic = this.pathController.validateBasic();
                if (basic && basic.errors.length > 0) {
                    statusEl.textContent += ` (${basic.errors.length}个基础问题)`;
                    statusEl.className = 'status-error';
                    errorList.innerHTML = basic.errors.map(e =>
                        `<li class="error-item">⚠ [${e.rule}] ${e.message}</li>`
                    ).join('');
                } else {
                    statusEl.className = 'status-drawing';
                    errorList.innerHTML = '';
                }
            } else {
                statusEl.className = 'status-drawing';
                errorList.innerHTML = '';
            }
            return;
        }

        // Use cached validation result
        if (!this._cachedValidation) {
            this._cachedValidation = this.pathController.validate(this.validator);
        }
        const result = this._cachedValidation;
        if (!result) return;

        if (result.valid) {
            statusEl.textContent = '✅ 谜题解开！';
            statusEl.className = 'status-success';
            errorList.innerHTML = '';
        } else {
            statusEl.textContent = `❌ 不符合规则 (${result.errors.length}个错误)`;
            statusEl.className = 'status-error';
            errorList.innerHTML = result.errors.map(e =>
                `<li class="error-item">⚠ ${e.message}</li>`
            ).join('');
        }
    }

    /**
     * Solve the puzzle automatically
     */
    async solvePuzzle() {
        const statusEl = document.getElementById('status-text');
        this.statusLocked = true;
        statusEl.textContent = '🔍 正在求解...';
        statusEl.className = 'status-solving';

        this.solver = new PuzzleSolver(this.board);
        this.solver.onProgress = (info) => {
            const found = info.found || 0;
            const foundText = found > 0 ? ` (已找到${found}个解)` : '';
            statusEl.textContent = `🔍 搜索中... 已探索 ${info.states || info.visited || 0} 个状态${foundText}`;
        };

        // Run solver asynchronously to avoid blocking UI
        const result = await new Promise(resolve => {
            setTimeout(() => {
                try {
                    resolve(this.solver.solveAll(100));
                } catch (e) {
                    console.error('Solver error:', e);
                    resolve({success: false, message: '求解出错: ' + e.message, paths: [], totalFound: 0});
                }
            }, 50);
        });

        if (result && result.success && result.paths && result.paths.length > 0) {
            this.allSolutions = result.paths;
            this.currentSolutionIndex = 0;
            this.solutionPath = result.paths[0];
            this.showSolution = true;
            this.updateSolutionNav();
            const multiMsg = result.totalFound > 1 ? ` (共${result.totalFound}个解)` : '';
            statusEl.textContent = `✅ 找到解答！${multiMsg}点击"演示答案"查看，再次点击可关闭`;
            statusEl.className = 'status-success';
        } else {
            this.allSolutions = [];
            this.currentSolutionIndex = 0;
            this.showSolution = false;
            this.solutionPath = null;
            this.updateSolutionNav();
            statusEl.textContent = `❌ 未能求解: ${result ? result.message : '无解'}`;
            statusEl.className = 'status-error';
        }

        // Render with status locked, then unlock
        this.render();
        this.statusLocked = false;
    }

    /**
     * Show the next solution
     */
    nextSolution() {
        if (this.allSolutions.length < 2) return;
        this.currentSolutionIndex = (this.currentSolutionIndex + 1) % this.allSolutions.length;
        this.solutionPath = this.allSolutions[this.currentSolutionIndex];
        this.showSolution = true;
        this.updateSolutionNav();
        this.render();
    }

    /**
     * Show the previous solution
     */
    previousSolution() {
        if (this.allSolutions.length < 2) return;
        this.currentSolutionIndex = (this.currentSolutionIndex - 1 + this.allSolutions.length) % this.allSolutions.length;
        this.solutionPath = this.allSolutions[this.currentSolutionIndex];
        this.showSolution = true;
        this.updateSolutionNav();
        this.render();
    }

    /**
     * Update solution navigation button states and counter
     */
    updateSolutionNav() {
        const prevBtn = document.getElementById('btn-prev-solution');
        const nextBtn = document.getElementById('btn-next-solution');
        const counter = document.getElementById('solution-counter');

        if (this.allSolutions.length > 1) {
            prevBtn.disabled = false;
            nextBtn.disabled = false;
            counter.style.display = 'inline';
            counter.textContent = `解 ${this.currentSolutionIndex + 1} / ${this.allSolutions.length}`;
        } else {
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            counter.style.display = 'none';
        }
    }

    /**
     * Determine which solver method was used for the current puzzle.
     * @returns {'bfs'|'backtrack'|'none'}
     */
    _getSolverMethod() {
        if (this.allSolutions.length === 0) return 'none';
        const squares = this.board.findAllCellSymbols('square');
        const stars = this.board.findAllCellSymbols('star');
        const tetris = this.board.findAllCellSymbols('tetris');
        const hasRegions = squares.length > 0 || stars.length > 0 || tetris.length > 0;
        return hasRegions ? 'backtrack' : 'bfs';
    }

    /**
     * Show a temporary toast message in the status area.
     * @param {string} message
     * @param {number} duration - ms to display (default 3000)
     */
    _showToast(message, duration = 3000) {
        const statusEl = document.getElementById('status-text');
        const prevText = statusEl.textContent;
        const prevClass = statusEl.className;
        statusEl.textContent = message;
        statusEl.className = 'status-success';
        setTimeout(() => {
            statusEl.textContent = prevText;
            statusEl.className = prevClass;
        }, duration);
    }

    /**
     * Export current puzzle state as a debug JSON file download.
     * Includes board config, all symbols, player path, solver results,
     * and validation output.
     */
    exportDebug() {
        const exporter = new DebugExporter(
            this.board, this.pathController, this.validator, this.solver
        );
        const state = exporter.exportState({
            solutions: this.allSolutions,
            totalFound: this.allSolutions.length,
            solverMethod: this._getSolverMethod(),
            currentSolution: this.solutionPath || null
        });
        const filename = exporter.downloadDebugFile(null, state);
        this._showToast(`📋 调试信息已导出: ${filename}`);
    }

    /**
     * Copy debug JSON to clipboard and show inline analysis report.
     * Uses PuzzleAnalyzer (already loaded in browser) for instant feedback.
     */
    copyFeedback() {
        const exporter = new DebugExporter(
            this.board, this.pathController, this.validator, this.solver
        );

        // Generate debug state — include current solution so the export
        // reflects solver results even when the player hasn't drawn a full path.
        const state = exporter.exportState({
            solutions: this.allSolutions,
            totalFound: this.allSolutions.length,
            solverMethod: this._getSolverMethod(),
            currentSolution: this.solutionPath || null
        });
        const json = JSON.stringify(state, null, 2);

        // Run in-browser analysis (PuzzleAnalyzer is loaded via js/analysis.js)
        let report;
        try {
            report = PuzzleAnalyzer.reportText(state);
        } catch (e) {
            report = '分析出错: ' + e.message;
        }

        // Copy to clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(json).then(() => {
                this._showToast('✅ 调试信息已复制到剪贴板，可直接粘贴反馈');
            }).catch(() => {
                this._showToast('⚠ 复制失败，请尝试使用"导出调试信息"下载文件');
            });
        } else {
            this._showToast('⚠ 剪贴板不可用（需要 HTTPS），请使用"导出调试信息"下载文件');
        }

        // Show inline report
        const reportDiv = document.getElementById('feedback-report');
        const reportContent = document.getElementById('feedback-report-content');
        if (reportDiv && reportContent) {
            reportContent.textContent = report;
            reportDiv.style.display = 'block';
            reportDiv.scrollIntoView({behavior: 'smooth'});
        }
    }

    /**
     * Animate the solution path
     */
    animateSolution() {
        // If animation is running, stop it and hide
        if (this.solvingAnimating) {
            this.hideSolution();
            return;
        }
        // If solution is already displayed AND matches current solutionPath, toggle off
        if (this.showSolution && this.pathController.path.length > 1) {
            if (this._currentDisplayedPath && this.solutionPath &&
                this._currentDisplayedPath.length === this.solutionPath.length &&
                this._currentDisplayedPath.every((n, i) => n.r === this.solutionPath[i].r && n.c === this.solutionPath[i].c)) {
                this.hideSolution();
                return;
            }
        }
        // No solution yet — solve first if needed
        if (!this.solutionPath || this.solutionPath.length < 2) {
            this.solvePuzzle().then(() => {
                if (this.solutionPath && this.solutionPath.length >= 2) {
                    this.startAnimation();
                }
            });
            return;
        }
        // Start animation
        this.startAnimation();
    }

    hideSolution() {
        this.showSolution = false;
        this.solutionDisplayed = false;
        if (this.solvingAnimating) {
            clearTimeout(this.animationFrameId);
            this.solvingAnimating = false;
        }
        this.pathController.clear();
        this.statusLocked = false;
        const statusEl = document.getElementById('status-text');
        statusEl.textContent = '⏳ 画线中 — 点击节点开始画线';
        statusEl.className = '';
        this.render();
    }

    startAnimation() {
        // Capture solution path locally to prevent nullification during async animation
        const solutionPath = this.solutionPath;
        if (!solutionPath || solutionPath.length < 2) {
            this.statusLocked = false;
            return;
        }

        if (this.solvingAnimating) {
            clearTimeout(this.animationFrameId);
            this.solvingAnimating = false;
        }

        this.statusLocked = true;
        this.pathController.clear();
        this.showSolution = false;
        this.animationIndex = 0;
        this.solvingAnimating = true;
        const self = this;
        const statusEl = document.getElementById('status-text');
        statusEl.textContent = '▶ 正在演示答案...';
        statusEl.className = 'status-solving';

        const totalSteps = solutionPath.length - 1;
        const animateStep = () => {
            if (!self.solvingAnimating) return;

            if (self.animationIndex < solutionPath.length) {
                const node = solutionPath[self.animationIndex];
                if (self.animationIndex === 0) {
                    self.pathController.path = [{r: node.r, c: node.c}];
                    // Initialize symmetric start in symmetry mode
                    if (self.board.symmetry !== 'none') {
                        const mirror = self.board.getSymmetricNode(node.r, node.c);
                        self.pathController.symmetricPath = [mirror];
                    } else {
                        self.pathController.symmetricPath = [];
                    }
                } else {
                    const success = self.pathController.tryExtendTo(node.r, node.c);
                    if (!success) {
                        console.warn('Animation: could not extend to', node);
                    }
                }
                self.animationIndex++;
                self.render();

                if (self.animationIndex < solutionPath.length) {
                    self.animationFrameId = setTimeout(animateStep, 200);
                } else {
                    self.solvingAnimating = false;
                    self.statusLocked = false;
                    self.showSolution = true;
                    self.solutionPath = solutionPath;
                    statusEl.textContent = '✅ 答案演示完成！点击"演示答案"可关闭';
                    statusEl.className = 'status-success';
                    self.render();
                }
            } else {
                self.solvingAnimating = false;
                self.statusLocked = false;
                self.showSolution = true;
                self.solutionPath = solutionPath;
                statusEl.textContent = '✅ 答案演示完成！点击"演示答案"可关闭';
                statusEl.className = 'status-success';
                self.render();
            }
        };

        animateStep();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new WitnessApp();
    window.app.init();
});
