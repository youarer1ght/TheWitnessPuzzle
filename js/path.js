/**
 * Path module - Path data model and mouse/touch interaction handling
 *
 * Updated: Supports edge-midpoint start/end and mouse-following tracking mode.
 * - Click to toggle tracking mode (start/stop drawing)
 * - During tracking, path automatically follows mouse along edges
 * - Moving back along path auto-undoes
 */
class PathController {
    constructor(board) {
        this.board = board;
        this.path = []; // Array of {r, c} node positions
        this.isDrawing = false; // Tracking mode: true when actively drawing
        this.currentHoverNode = null;
        this.mirrorHoverNode = null;  // Mirror hover for symmetry rendering
        this.onPathChanged = null; // Callback when path changes
        this.onValidationChanged = null; // Callback when validation status changes
        this.validationResult = null; // {valid, errors, regions}
        this.symmetricPath = [];      // Mirror path for symmetry mode
        this.activeStartEdge = null; // {r, c, dir} — which edge midpoint start was used
        this.activeEndEdge = null;   // {r, c, dir} — which edge midpoint end was reached
    }

    /**
     * Initialize path from board's start point(s)
     * - Single edge start or multiple starts of any kind: path empty, user clicks to choose
     * - Single node start (no edge starts): auto-place for convenience
     * - No starts: path empty
     */
    reset() {
        const startEdges = this.board.findAllEdgeSymbols('start');
        const startNodes = this.board.findAllNodeSymbols('start');
        const sym = this.board.symmetry;
        if (startEdges.length > 0) {
            // Edge-midpoint starts exist — user must choose start by clicking
            this.path = [];
            this.symmetricPath = [];
        } else if (startNodes.length === 1) {
            // Single node start — auto-place for convenience
            this.path = [{r: startNodes[0].r, c: startNodes[0].c}];
            if (sym !== 'none') {
                const mirror = this.board.getSymmetricNode(startNodes[0].r, startNodes[0].c);
                this.symmetricPath = [mirror];
            } else {
                this.symmetricPath = [];
            }
        } else if (startNodes.length > 1) {
            // Multiple node starts — user chooses by clicking
            this.path = [];
            this.symmetricPath = [];
        } else {
            this.path = [];
            this.symmetricPath = [];
        }
        this.isDrawing = false;
        this.activeStartEdge = null;
        this.activeEndEdge = null;
        this.validationResult = null;
        if (this.onPathChanged) this.onPathChanged(this.path);
        if (this.onValidationChanged) this.onValidationChanged(null);
    }

    /**
     * Get current path end node
     */
    getCurrentNode() {
        return this.path.length > 0 ? this.path[this.path.length - 1] : null;
    }

    /**
     * Check if a node is in the path
     */
    isNodeInPath(r, c) {
        return this.path.some(n => n.r === r && n.c === c);
    }

    /**
     * Check if two adjacent nodes are connected in the path
     */
    isEdgeInPath(r1, c1, r2, c2) {
        for (let i = 0; i < this.path.length - 1; i++) {
            const a = this.path[i];
            const b = this.path[i + 1];
            if ((a.r === r1 && a.c === c1 && b.r === r2 && b.c === c2) ||
                (a.r === r2 && a.c === c2 && b.r === r1 && b.c === c1)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if an edge is in EITHER the main path or the symmetric path.
     * Used by region detection and triangle validation so that both paths act
     * as region boundaries in symmetry mode.
     */
    isEdgeInAnyPath(r1, c1, r2, c2) {
        if (this.isEdgeInPath(r1, c1, r2, c2)) return true;
        if (this.board.symmetry !== 'none' && this.symmetricPath.length > 0) {
            for (let i = 0; i < this.symmetricPath.length - 1; i++) {
                const a = this.symmetricPath[i];
                const b = this.symmetricPath[i + 1];
                if ((a.r === r1 && a.c === c1 && b.r === r2 && b.c === c2) ||
                    (a.r === r2 && a.c === c2 && b.r === r1 && b.c === c1)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Check if an edge is in the symmetric path (for non-interference checks)
     */
    _isEdgeInSymmetricPath(r1, c1, r2, c2) {
        for (let i = 0; i < this.symmetricPath.length - 1; i++) {
            const a = this.symmetricPath[i];
            const b = this.symmetricPath[i + 1];
            if ((a.r === r1 && a.c === c1 && b.r === r2 && b.c === c2) ||
                (a.r === r2 && a.c === c2 && b.r === r1 && b.c === c1)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if a node is adjacent to any start edge midpoint
     */
    canStartFromEdge(r, c) {
        return this.findStartEdgeForNode(r, c) !== null;
    }

    /**
     * Find which edge-midpoint start is adjacent to the given node
     * @returns {{r, c, dir}|null}
     */
    findStartEdgeForNode(r, c) {
        const startEdges = this.board.findAllEdgeSymbols('start');
        for (const se of startEdges) {
            const [n1, n2] = this.board.getEdgeNodes(se.r, se.c, se.dir);
            if ((r === n1.r && c === n1.c) || (r === n2.r && c === n2.c)) return se;
        }
        return null;
    }

    /**
     * Try to extend the path to a node
     * @returns {boolean} true if extension was successful
     */
    tryExtendTo(targetR, targetC) {
        const sym = this.board.symmetry;

        if (this.path.length === 0) {
            // Check if target matches ANY valid start (node or edge)
            const startNodes = this.board.findAllNodeSymbols('start');
            const isNodeStart = startNodes.some(s => s.r === targetR && s.c === targetC);
            if (isNodeStart) {
                this.path.push({r: targetR, c: targetC});
                // Initialize symmetric start
                if (sym !== 'none') {
                    const mirror = this.board.getSymmetricNode(targetR, targetC);
                    this.symmetricPath.push(mirror);
                }
                this.isDrawing = true;
                if (this.onPathChanged) this.onPathChanged(this.path);
                return true;
            }
            if (this.canStartFromEdge(targetR, targetC)) {
                // Edge-midpoint start — record which edge was used
                this.activeStartEdge = this.findStartEdgeForNode(targetR, targetC);
                this.path.push({r: targetR, c: targetC});
                // Initialize symmetric start for edge
                if (sym !== 'none') {
                    const mirror = this.board.getSymmetricNode(targetR, targetC);
                    this.symmetricPath.push(mirror);
                }
                this.isDrawing = true;
                if (this.onPathChanged) this.onPathChanged(this.path);
                return true;
            }
            return false;
        }

        const curr = this.getCurrentNode();

        // Check if target is adjacent to current node
        const dr = Math.abs(targetR - curr.r);
        const dc = Math.abs(targetC - curr.c);
        if (!((dr === 1 && dc === 0) || (dr === 0 && dc === 1))) return false;

        // Check if edge is not blocked
        const edge = this.board.getEdgeBetween(curr.r, curr.c, targetR, targetC);
        if (this.board.isEdgeBlocked(edge.r, edge.c, edge.dir)) return false;

        // Check if node is already in path (no revisiting)
        if (this.isNodeInPath(targetR, targetC)) return false;

        // Symmetry check: validate mirror extension before pushing
        // Key constraints:
        // 1. Mirror path must not self-intersect
        // 2. Mirror path must not share edges with main path (no crossing/blocking)
        // 3. Mirror path must not share nodes with main path (except on symmetry axis)
        if (sym !== 'none') {
            const mirrorTarget = this.board.getSymmetricNode(targetR, targetC);
            const symCurr = this.symmetricPath.length > 0
                ? this.symmetricPath[this.symmetricPath.length - 1]
                : null;

            if (symCurr) {
                // Reject axis nodes — both paths would share the same node
                // (mirrorTarget === target when target is on the symmetry axis)
                if (mirrorTarget.r === targetR && mirrorTarget.c === targetC) {
                    return false;
                }
                // Check mirror node is inside board
                if (mirrorTarget.r < 0 || mirrorTarget.r > this.board.rows ||
                    mirrorTarget.c < 0 || mirrorTarget.c > this.board.cols) {
                    return false;
                }
                // Check mirror node not already in symmetric path (self-intersection)
                const symVisited = this.symmetricPath.some(n => n.r === mirrorTarget.r && n.c === mirrorTarget.c);
                if (symVisited) return false;
                // Check mirror node not already in main path (paths must never share nodes)
                if (this.isNodeInPath(mirrorTarget.r, mirrorTarget.c)) return false;
                // Check mirror edge is not blocked
                const mirrorEdge = this.board.getEdgeBetween(symCurr.r, symCurr.c, mirrorTarget.r, mirrorTarget.c);
                if (this.board.isEdgeBlocked(mirrorEdge.r, mirrorEdge.c, mirrorEdge.dir)) {
                    return false;
                }
                // Check mirror edge does not overlap any main-path edge (no crossing)
                if (this.isEdgeInPath(symCurr.r, symCurr.c, mirrorTarget.r, mirrorTarget.c)) {
                    return false;
                }
            }
        }

        // Check that the new main-path edge does not overlap the symmetric path
        if (sym !== 'none' && this.symmetricPath.length >= 2) {
            if (this._isEdgeInSymmetricPath(curr.r, curr.c, targetR, targetC)) {
                return false;
            }
        }

        // Extend path
        this.path.push({r: targetR, c: targetC});
        if (sym !== 'none') {
            const mirrorTarget = this.board.getSymmetricNode(targetR, targetC);
            this.symmetricPath.push(mirrorTarget);
        }
        this.isDrawing = true;

        if (this.onPathChanged) this.onPathChanged(this.path);
        return true;
    }

    /**
     * Undo the last step
     */
    undo() {
        if (this.path.length === 0) return false;
        this.path.pop();
        if (this.symmetricPath.length > 0) this.symmetricPath.pop();
        if (this.onPathChanged) this.onPathChanged(this.path);
        if (this.onValidationChanged) this.onValidationChanged(null);
        return true;
    }

    /**
     * Clear the entire path
     */
    clear() {
        const startEdges = this.board.findAllEdgeSymbols('start');
        const startNodes = this.board.findAllNodeSymbols('start');
        const sym = this.board.symmetry;
        if (startEdges.length > 0) {
            this.path = [];
            this.symmetricPath = [];
        } else if (startNodes.length === 1) {
            this.path = [{r: startNodes[0].r, c: startNodes[0].c}];
            if (sym !== 'none') {
                const mirror = this.board.getSymmetricNode(startNodes[0].r, startNodes[0].c);
                this.symmetricPath = [mirror];
            } else {
                this.symmetricPath = [];
            }
        } else {
            this.path = [];
            this.symmetricPath = [];
        }
        this.isDrawing = false;
        this.activeStartEdge = null;
        this.activeEndEdge = null;
        this.validationResult = null;
        if (this.onPathChanged) this.onPathChanged(this.path);
        if (this.onValidationChanged) this.onValidationChanged(null);
    }

    /**
     * Check if the path is complete
     * - Edge midpoint end(s): last node must be adjacent to any end edge
     * - Node end(s): last node must be any node-level end
     * Supports ANY start → ANY end (no pairing required)
     */
    isComplete() {
        const endEdges = this.board.findAllEdgeSymbols('end');
        const endNodes = this.board.findAllNodeSymbols('end');
        const sym = this.board.symmetry;

        // Check edge-midpoint ends: path complete if last node adjacent to ANY end edge
        if (endEdges.length > 0) {
            if (this.path.length < 1) return false;
            const last = this.getCurrentNode();
            let mainComplete = false;
            for (const ee of endEdges) {
                const [n1, n2] = this.board.getEdgeNodes(ee.r, ee.c, ee.dir);
                if ((last.r === n1.r && last.c === n1.c) ||
                    (last.r === n2.r && last.c === n2.c)) { mainComplete = true; break; }
            }
            if (!mainComplete) return false;
            // Symmetry: mirror path must also reach a mirrored end
            if (sym !== 'none') {
                return this._isSymmetricPathComplete();
            }
            return mainComplete;
        }

        // Check ALL node-level ends
        if (endNodes.length > 0) {
            if (this.path.length < 2) return false;
            const last = this.getCurrentNode();
            let mainComplete = false;
            for (const en of endNodes) {
                if (last.r === en.r && last.c === en.c) { mainComplete = true; break; }
            }
            if (!mainComplete) return false;
            // Symmetry: mirror path must also reach a mirrored end
            if (sym !== 'none') {
                return this._isSymmetricPathComplete();
            }
            return mainComplete;
        }

        return false;
    }

    /**
     * Check if symmetric path also ends at a valid end point.
     * In symmetry mode, the symmetric path reaches the mirror of the main end,
     * which may not be explicitly placed on the board as an end symbol.
     */
    _isSymmetricPathComplete() {
        if (this.symmetricPath.length < 1) return false;
        const endEdges = this.board.findAllEdgeSymbols('end');
        const endNodes = this.board.findAllNodeSymbols('end');
        const symLast = this.symmetricPath[this.symmetricPath.length - 1];
        const mainLast = this.getCurrentNode();

        // Check if symLast is an explicit end node on the board
        if (endEdges.length > 0) {
            for (const ee of endEdges) {
                const [n1, n2] = this.board.getEdgeNodes(ee.r, ee.c, ee.dir);
                if ((symLast.r === n1.r && symLast.c === n1.c) ||
                    (symLast.r === n2.r && symLast.c === n2.c)) return true;
            }
        }
        if (endNodes.length > 0) {
            for (const en of endNodes) {
                if (symLast.r === en.r && symLast.c === en.c) return true;
            }
        }

        // Check if symLast is the mirror of mainLast (and mainLast is an end)
        if (mainLast) {
            const mirrorMainLast = this.board.getSymmetricNode(mainLast.r, mainLast.c);
            if (symLast.r === mirrorMainLast.r && symLast.c === mirrorMainLast.c) {
                // Verify mainLast itself is a valid end
                if (endNodes.length > 0) {
                    return endNodes.some(en => en.r === mainLast.r && en.c === mainLast.c);
                }
                if (endEdges.length > 0) {
                    for (const ee of endEdges) {
                        const [n1, n2] = this.board.getEdgeNodes(ee.r, ee.c, ee.dir);
                        if ((mainLast.r === n1.r && mainLast.c === n1.c) ||
                            (mainLast.r === n2.r && mainLast.c === n2.c)) return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Validate the current path against all puzzle rules
     */
    validate(validator) {
        if (!validator) return null;
        this.validationResult = validator.validate(this.board, this);
        if (this.onValidationChanged) this.onValidationChanged(this.validationResult);
        return this.validationResult;
    }

    /**
     * Get the path as an array of nodes
     */
    getPathNodes() {
        return [...this.path];
    }

    /**
     * Get the symmetric mirror path nodes
     */
    getSymmetricPathNodes() {
        return this.board.symmetry !== 'none' ? [...this.symmetricPath] : [];
    }

    /**
     * Set the path from a solution array.
     * In symmetry mode, also derives the symmetric mirror path.
     */
    setPath(nodes) {
        this.path = nodes.map(n => ({r: n.r, c: n.c}));
        this.isDrawing = false;
        // Derive symmetric path so validation and rendering work correctly
        if (this.board.symmetry !== 'none' && nodes.length > 0) {
            this.symmetricPath = nodes.map(n => this.board.getSymmetricNode(n.r, n.c));
        } else {
            this.symmetricPath = [];
        }
        if (this.onPathChanged) this.onPathChanged(this.path);
    }

    // ==================== Mouse/Interaction Handlers ====================

    /**
     * Handle mouse down: toggle tracking mode
     * - If not tracking: try to start tracking
     * - If tracking: stop tracking
     */
    /**
     * Handle mouse down on canvas.
     *
     * Interaction model:
     *  - Click a START node (or edge-adjacent node): begin/switch to that start.
     *  - Click a valid ADJACENT unvisited node: extend path, tracking turns ON.
     *  - Click the CURRENT end node: NO-OP (keeps current tracking state).
     *  - Click a node that's NOT adjacent: stop tracking.
     *  - Right-click / Backspace: undo last step.
     *  - Mouse movement during tracking (isDrawing=true): auto-extends to adjacent nodes.
     */
    handleMouseDown(px, py) {
        let node = this.board.pixelToNode(px, py);

        // Edge-midpoint snap for start detection
        if (!node) {
            const startEdges = this.board.findAllEdgeSymbols('start');
            if (startEdges.length > 0) {
                const clickedEdge = this.board.pixelToEdgeMidpoint(px, py);
                if (clickedEdge) {
                    const hasStartSymbol = startEdges.some(se =>
                        se.r === clickedEdge.r && se.c === clickedEdge.c && se.dir === clickedEdge.dir);
                    if (hasStartSymbol) {
                        const [n1, n2] = this.board.getEdgeNodes(clickedEdge.r, clickedEdge.c, clickedEdge.dir);
                        const p1 = this.board.nodeToPixel(n1.r, n1.c);
                        const p2 = this.board.nodeToPixel(n2.r, n2.c);
                        const d1 = Math.sqrt((px - p1.x) ** 2 + (py - p1.y) ** 2);
                        const d2 = Math.sqrt((px - p2.x) ** 2 + (py - p2.y) ** 2);
                        node = d1 <= d2 ? n1 : n2;
                    }
                }
            }
        }

        if (!node) {
            // Clicked empty space: stop tracking
            if (this.isDrawing) {
                this.isDrawing = false;
                if (this.onPathChanged) this.onPathChanged(this.path);
            }
            return;
        }

        const curr = this.getCurrentNode();

        // ----- Clicking the CURRENT end node: NO-OP (don't toggle tracking) -----
        if (curr && node.r === curr.r && node.c === curr.c) {
            // If path has only the auto-placed start and tracking is off, turn it on
            if (!this.isDrawing && this.path.length === 1) {
                this.isDrawing = true;
            }
            // Otherwise, do nothing — mousemove already handled extension
            return;
        }

        // ----- Clicking a DIFFERENT valid start: switch to it -----
        if (this.path.length > 0) {
            const isCurrentStart = (node.r === this.path[0].r && node.c === this.path[0].c);
            if (!isCurrentStart) {
                const startNodes = this.board.findAllNodeSymbols('start');
                const isNodeStart = startNodes.some(s => s.r === node.r && s.c === node.c);
                const isEdgeStartAdj = this.findStartEdgeForNode(node.r, node.c) !== null;
                if (isNodeStart || isEdgeStartAdj) {
                    this.path = [];
                    this.symmetricPath = [];
                    this.activeStartEdge = null;
                    this.activeEndEdge = null;
                    this.validationResult = null;
                    if (this.onValidationChanged) this.onValidationChanged(null);
                    this.tryExtendTo(node.r, node.c);
                    return;
                }
            }
        }

        // ----- Try to extend path to the clicked node -----
        if (this.path.length === 0) {
            // First node: must be a valid start
            this.tryExtendTo(node.r, node.c);
        } else {
            const dr = Math.abs(node.r - curr.r);
            const dc = Math.abs(node.c - curr.c);
            const isAdjacent = (dr === 1 && dc === 0) || (dr === 0 && dc === 1);

            if (isAdjacent && !this.isNodeInPath(node.r, node.c)) {
                // Valid next node — extend (keeps/alerts tracking ON)
                this.tryExtendTo(node.r, node.c);
            } else if (!isAdjacent) {
                // Not adjacent — stop tracking
                if (this.isDrawing) {
                    this.isDrawing = false;
                    if (this.onPathChanged) this.onPathChanged(this.path);
                }
            }
            // If isAdjacent but visited: keep tracking (mousemove already handled it)
        }
    }

    /**
     * Handle mouse move: auto-extend path during tracking mode
     */
    handleMouseMove(px, py) {
        let node = this.board.pixelToNode(px, py);
        const prevHover = this.currentHoverNode;
        this.currentHoverNode = node;
        // Update mirror hover for symmetry rendering
        if (node && this.board.symmetry !== 'none') {
            this.mirrorHoverNode = this.board.getSymmetricNode(node.r, node.c);
        } else {
            this.mirrorHoverNode = null;
        }

        // During tracking with empty path: snap edge-midpoint hover to nearest node
        if (!node && this.isDrawing && this.path.length === 0) {
            const startEdges = this.board.findAllEdgeSymbols('start');
            if (startEdges.length > 0) {
                const clickedEdge = this.board.pixelToEdgeMidpoint(px, py);
                if (clickedEdge) {
                    const hasStartSymbol = startEdges.some(se =>
                        se.r === clickedEdge.r && se.c === clickedEdge.c && se.dir === clickedEdge.dir);
                    if (hasStartSymbol) {
                        const [n1, n2] = this.board.getEdgeNodes(clickedEdge.r, clickedEdge.c, clickedEdge.dir);
                        const p1 = this.board.nodeToPixel(n1.r, n1.c);
                        const p2 = this.board.nodeToPixel(n2.r, n2.c);
                        const d1 = Math.sqrt((px - p1.x) ** 2 + (py - p1.y) ** 2);
                        const d2 = Math.sqrt((px - p2.x) ** 2 + (py - p2.y) ** 2);
                        node = d1 <= d2 ? n1 : n2;
                    }
                }
            }
        }

        if (!this.isDrawing || !node) return node;

        if (this.path.length === 0) {
            // Check all node-level starts
            const startNodes = this.board.findAllNodeSymbols('start');
            if (startNodes.some(s => s.r === node.r && s.c === node.c)) {
                this.path = [{r: node.r, c: node.c}];
                // Initialize symmetric start so both paths begin simultaneously
                if (this.board.symmetry !== 'none') {
                    const mirror = this.board.getSymmetricNode(node.r, node.c);
                    this.symmetricPath = [mirror];
                } else {
                    this.symmetricPath = [];
                }
                if (this.onPathChanged) this.onPathChanged(this.path);
                return node;
            }
            // Check edge-level starts
            if (this.canStartFromEdge(node.r, node.c)) {
                this.path = [{r: node.r, c: node.c}];
                this.activeStartEdge = this.findStartEdgeForNode(node.r, node.c);
                // Initialize symmetric start for edge starts too
                if (this.board.symmetry !== 'none') {
                    const mirror = this.board.getSymmetricNode(node.r, node.c);
                    this.symmetricPath = [mirror];
                } else {
                    this.symmetricPath = [];
                }
                if (this.onPathChanged) this.onPathChanged(this.path);
            }
            return node;
        }

        // Undo detection: mouse moved back to the previous node
        if (this.path.length >= 2) {
            const prev = this.path[this.path.length - 2];
            if (node.r === prev.r && node.c === prev.c && node !== prevHover) {
                this.undo();
                return node;
            }
        }

        // Extension detection: mouse on a valid next node
        const curr = this.getCurrentNode();
        if (node.r !== curr.r || node.c !== curr.c) {
            if (this.canReachNode(node.r, node.c)) {
                this.tryExtendTo(node.r, node.c);
            }
        }

        return node;
    }

    /**
     * Handle mouse up: no-op in toggle mode
     */
    handleMouseUp(px, py) {
        // No longer used - drawing is toggled by clicks, not drags
    }

    // ==================== Basic Path Validation ====================

    /**
     * Lightweight path validation (no region detection).
     * Checks: adjacency, no self-intersection, blocked edges,
     * valid start, end reachability, hexagon coverage.
     *
     * Used for real-time status display before path completion.
     * Full region-rule validation is handled by PuzzleValidator.
     *
     * @returns {{valid: boolean, errors: Array<{rule, message}>}}
     */
    validateBasic() {
        const errors = [];
        const path = this.path;
        const board = this.board;

        if (path.length === 0) {
            return {valid: true, errors: []};
        }

        // 1. Start validity
        const startNodes = board.findAllNodeSymbols('start');
        const startEdges = board.findAllEdgeSymbols('start');
        if (startNodes.length > 0 || startEdges.length > 0) {
            const first = path[0];
            let validStart = false;
            for (const sn of startNodes) {
                if (first.r === sn.r && first.c === sn.c) { validStart = true; break; }
            }
            if (!validStart) {
                for (const se of startEdges) {
                    const [n1, n2] = board.getEdgeNodes(se.r, se.c, se.dir);
                    if ((first.r === n1.r && first.c === n1.c) ||
                        (first.r === n2.r && first.c === n2.c)) { validStart = true; break; }
                }
            }
            if (!validStart) {
                errors.push({rule: 'path', message: `路径起点(${first.r},${first.c})不是有效的起点`});
            }
        }

        // 2. No self-intersection
        const visited = new Set();
        for (let i = 0; i < path.length; i++) {
            const key = `${path[i].r},${path[i].c}`;
            if (visited.has(key)) {
                errors.push({rule: 'path', message: `路径在第${i+1}步重复经过节点(${path[i].r},${path[i].c})`});
            }
            visited.add(key);
        }

        // 3. Adjacency and blocked edges
        for (let i = 1; i < path.length; i++) {
            const a = path[i - 1], b = path[i];
            const dr = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
            if (dr !== 1) {
                errors.push({rule: 'path', message: `第${i}步: (${a.r},${a.c})→(${b.r},${b.c}) 不相邻`});
            } else {
                const edge = board.getEdgeBetween(a.r, a.c, b.r, b.c);
                if (board.isEdgeBlocked(edge.r, edge.c, edge.dir)) {
                    errors.push({rule: 'path', message: `第${i}步跨越了隔断边`});
                }
            }
        }

        // 4. End reachability (only if ends exist)
        const endNodes = board.findAllNodeSymbols('end');
        const endEdges = board.findAllEdgeSymbols('end');
        if (endNodes.length > 0 || endEdges.length > 0) {
            const last = path[path.length - 1];
            let reachedEnd = false;
            for (const en of endNodes) {
                if (last.r === en.r && last.c === en.c) { reachedEnd = true; break; }
            }
            if (!reachedEnd) {
                for (const ee of endEdges) {
                    const [n1, n2] = board.getEdgeNodes(ee.r, ee.c, ee.dir);
                    if ((last.r === n1.r && last.c === n1.c) ||
                        (last.r === n2.r && last.c === n2.c)) { reachedEnd = true; break; }
                }
            }
            if (!reachedEnd) {
                errors.push({rule: 'path', message: `路径尚未到达终点，当前在(${last.r},${last.c})`});
            }
        }

        // 5. Hexagon coverage
        const hexagons = board.findAllNodeSymbols('hexagon');
        const pathNodeSet = new Set(path.map(n => `${n.r},${n.c}`));
        for (const hex of hexagons) {
            if (!pathNodeSet.has(`${hex.r},${hex.c}`)) {
                errors.push({rule: 'hexagon', message: `六边形(${hex.r},${hex.c})未被路径经过`});
            }
        }

        return {valid: errors.length === 0, errors};
    }

    /**
     * Check if a node can be reached from the current path end
     */
    canReachNode(r, c) {
        if (this.path.length === 0) {
            const startNodes = this.board.findAllNodeSymbols('start');
            if (startNodes.some(s => s.r === r && s.c === c)) return true;
            return this.canStartFromEdge(r, c);
        }
        const curr = this.getCurrentNode();
        const dr = Math.abs(r - curr.r);
        const dc = Math.abs(c - curr.c);
        if (!((dr === 1 && dc === 0) || (dr === 0 && dc === 1))) return false;
        if (this.isNodeInPath(r, c)) return false;
        const edge = this.board.getEdgeBetween(curr.r, curr.c, r, c);
        return !this.board.isEdgeBlocked(edge.r, edge.c, edge.dir);
    }
}
