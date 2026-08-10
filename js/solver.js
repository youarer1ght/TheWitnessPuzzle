/**
 * Solver module - BFS + backtracking auto-solver for The Witness puzzles
 *
 * Strategy:
 * - Level 1: BFS for hexagon-only puzzles (fast, polynomial)
 * - Level 2: Backtracking with early pruning for region-based puzzles
 */
class PuzzleSolver {
    constructor(board) {
        this.board = board;
        this.onProgress = null; // Callback for progress updates
        this.cancelled = false;
    }

    cancel() {
        this.cancelled = true;
    }

    /**
     * Resolve all start and end candidates (shared by solve/solveAll)
     */
    _resolveCandidates() {
        const startNodes = this.board.findAllNodeSymbols('start');
        const endNodes = this.board.findAllNodeSymbols('end');
        const startEdges = this.board.findAllEdgeSymbols('start');
        const endEdges = this.board.findAllEdgeSymbols('end');

        // Resolve start candidates: ALL node-level + all edge-midpoint starts
        let startCandidates = [];
        for (const sn of startNodes) {
            startCandidates.push({r: sn.r, c: sn.c});
        }
        for (const se of startEdges) {
            const nodes = this.board.getEdgeNodes(se.r, se.c, se.dir);
            for (const n of nodes) {
                if (!startCandidates.some(sc => sc.r === n.r && sc.c === n.c)) {
                    startCandidates.push(n);
                }
            }
        }

        // Resolve end candidates: ALL node-level + all edge-midpoint ends
        let endCandidates = [];
        for (const en of endNodes) {
            endCandidates.push({r: en.r, c: en.c});
        }
        for (const ee of endEdges) {
            const nodes = this.board.getEdgeNodes(ee.r, ee.c, ee.dir);
            for (const n of nodes) {
                if (!endCandidates.some(ec => ec.r === n.r && ec.c === n.c)) {
                    endCandidates.push(n);
                }
            }
        }

        // In symmetry mode, filter to preferred side (top-left bias) to avoid
        // finding mirrored duplicates of the same dual-path configuration.
        // The symmetric path is auto-derived; solving from the mirror start
        // yields the same (main↔symmetric) pair, just swapped.
        if (this.board.symmetry !== 'none') {
            const filterPreferred = (candidates) => candidates.filter(({r, c}) => {
                const mirror = this.board.getSymmetricNode(r, c);
                // On axis → always keep
                if (mirror.r === r && mirror.c === c) return true;
                // Prefer smaller row, or same row + smaller column (top-left bias)
                if (r < mirror.r) return true;
                if (r === mirror.r && c < mirror.c) return true;
                return false;
            });
            startCandidates = filterPreferred(startCandidates);
            endCandidates = filterPreferred(endCandidates);
        }

        return {startCandidates, endCandidates};
    }

    /**
     * Main solve entry point — finds the first solution
     * Uses BFS for simple path-only puzzles, backtracking for puzzles with
     * region symbols or symmetry (where multiple path variations must be explored).
     */
    solve() {
        this.cancelled = false;
        const {startCandidates, endCandidates} = this._resolveCandidates();
        if (startCandidates.length === 0) {
            return {success: false, message: '缺少起点', path: null};
        }
        if (endCandidates.length === 0) {
            return {success: false, message: '缺少终点', path: null};
        }

        // Backtracking for symmetry or region-symbol puzzles:
        // - Symmetry: BFS visited-set only captures one path per (end,start) pair,
        //   missing alternative paths with different mirror trajectories
        // - Region symbols: backtracking required for area-based validation
        const useBacktrack = this.hasRegionSymbols() || this.board.symmetry !== 'none';
        if (!useBacktrack) {
            return this.bfsSolve(startCandidates, endCandidates);
        } else {
            return this.backtrackSolve(startCandidates, endCandidates);
        }
    }

    /**
     * Find ALL solutions (up to maxSolutions)
     * Useful when multiple start/end points produce different valid paths
     * @returns {{success: boolean, paths: Array, totalFound: number, statesExplored: number}}
     */
    solveAll(maxSolutions = 100) {
        this.cancelled = false;
        const {startCandidates, endCandidates} = this._resolveCandidates();
        if (startCandidates.length === 0) {
            return {success: false, message: '缺少起点', paths: [], totalFound: 0};
        }
        if (endCandidates.length === 0) {
            return {success: false, message: '缺少终点', paths: [], totalFound: 0};
        }

        // Backtracking for symmetry or region-symbol puzzles (see solve() comment)
        const useBacktrack = this.hasRegionSymbols() || this.board.symmetry !== 'none';
        if (!useBacktrack) {
            return this.bfsSolveAll(startCandidates, endCandidates, maxSolutions);
        } else {
            return this.backtrackSolveAll(startCandidates, endCandidates, maxSolutions);
        }
    }

    hasRegionSymbols() {
        const regionTypes = ['square', 'star', 'tetris', 'triangle', 'elimination'];
        for (const type of regionTypes) {
            if (this.board.findAllCellSymbols(type).length > 0) return true;
        }
        return false;
    }

    // Symmetry validation delegated to Board.validateSymmetricPath()
    // (shared with Validator — single canonical implementation)

    /**
     * Per-step symmetry validation for backtracking DFS.
     * Checks whether extending `path` with `nextR,nextC` would produce a
     * valid symmetric (mirror) extension. Used in backtrackSolve/backtrackSolveAll
     * to prune invalid paths early instead of waiting until the end.
     *
     * @param {Array} path - current main path nodes [{r,c},...]
     * @param {Set} visitedNodes - set of "r,c" keys in the main path
     * @param {number} nextR - candidate next node row
     * @param {number} nextC - candidate next node col
     * @returns {boolean} true if the symmetric extension is valid
     */
    _canExtendSymmetric(path, visitedNodes, nextR, nextC) {
        const board = this.board;
        const mirrorNext = board.getSymmetricNode(nextR, nextC);

        // 1. Mirror node must be inside board
        if (mirrorNext.r < 0 || mirrorNext.r > board.rows ||
            mirrorNext.c < 0 || mirrorNext.c > board.cols) {
            return false;
        }

        // 1b. Mirror must not be the same node as the candidate (axis node).
        //     Both paths would share it — disallowed per strict symmetry rules.
        if (mirrorNext.r === nextR && mirrorNext.c === nextC) {
            return false;
        }

        // 2. Mirror node must not already be in the (derived) symmetric path
        for (let i = 0; i < path.length; i++) {
            const symNode = board.getSymmetricNode(path[i].r, path[i].c);
            if (symNode.r === mirrorNext.r && symNode.c === mirrorNext.c) {
                return false; // self-intersection in mirror path
            }
        }

        // 3. Mirror node must never be in main path (both paths must stay fully separate)
        if (visitedNodes.has(`${mirrorNext.r},${mirrorNext.c}`)) {
            return false;
        }

        if (path.length === 0) return true; // First step — no edges to check

        const curr = path[path.length - 1];

        // 4. Main-path edge must not overlap any existing symmetric-path edge
        const mainEdge = board.getEdgeBetween(curr.r, curr.c, nextR, nextC);
        // Build symmetric edges from existing path and check for overlap
        for (let i = 0; i < path.length - 1; i++) {
            const sa = board.getSymmetricNode(path[i].r, path[i].c);
            const sb = board.getSymmetricNode(path[i + 1].r, path[i + 1].c);
            const symEdge = board.getEdgeBetween(sa.r, sa.c, sb.r, sb.c);
            if (symEdge.r === mainEdge.r && symEdge.c === mainEdge.c && symEdge.dir === mainEdge.dir) {
                return false;
            }
        }

        // 5. Mirror edge must not be blocked
        if (path.length >= 1) {
            const symCurr = board.getSymmetricNode(curr.r, curr.c);
            const symEdge = board.getEdgeBetween(symCurr.r, symCurr.c, mirrorNext.r, mirrorNext.c);
            if (board.isEdgeBlocked(symEdge.r, symEdge.c, symEdge.dir)) {
                return false;
            }

            // 6. Mirror edge must not overlap any main-path edge
            for (let i = 0; i < path.length - 1; i++) {
                const a = path[i], b = path[i + 1];
                const me = board.getEdgeBetween(a.r, a.c, b.r, b.c);
                if (me.r === symEdge.r && me.c === symEdge.c && me.dir === symEdge.dir) {
                    return false;
                }
            }
        }

        return true;
    }

    // ==================== BFS Solvers ====================

    /**
     * BFS solver for puzzles with only hexagon constraints
     * @param {Array} startCandidates - array of {r, c} possible start nodes
     * @param {Array} endCandidates - array of {r, c} possible end nodes
     */
    bfsSolve(startCandidates, endCandidates) {
        const hexagons = this.board.findAllNodeSymbols('hexagon');
        const hexMap = new Map(); // Map hex position to bit index
        hexagons.forEach((h, i) => hexMap.set(`${h.r},${h.c}`, i));

        const totalHexMask = (1 << hexagons.length) - 1;
        const endSet = new Set(endCandidates.map(e => `${e.r},${e.c}`));
        const isSymmetry = this.board.symmetry !== 'none';
        const totalCols = this.board.cols;
        const nodeIdx = (r, c) => r * (totalCols + 1) + c;

        const queue = [];
        const visited = new Map();

        const makeVisitedKey = (r, c, mask, startR, startC, direFlag) => {
            const suffix = direFlag ? ':d' : '';
            if (isSymmetry) return `${r},${c}:${mask}:${startR},${startC}${suffix}`;
            return `${r},${c}:${mask}${suffix}`;
        };

        // Initialize: start from each candidate node
        for (const start of startCandidates) {
            const startKey = `${start.r},${start.c}`;
            const startMask = hexMap.has(startKey) ? (1 << hexMap.get(startKey)) : 0;
            const state = {
                r: start.r, c: start.c, mask: startMask, parent: null,
                startR: start.r, startC: start.c, steps: 0,
                nodeMask: 1 << nodeIdx(start.r, start.c),
                dire: false
            };
            const visitedKey = makeVisitedKey(start.r, start.c, startMask, start.r, start.c, false);
            visited.set(visitedKey, state);
            queue.push(state);
        }

        let head = 0;

        while (head < queue.length && !this.cancelled) {
            const state = queue[head++];

            if (this.onProgress && head % 100 === 0) {
                this.onProgress({visited: visited.size, queued: queue.length - head});
            }

            // End node — can't pass through
            const stateKey = `${state.r},${state.c}`;
            if (state.steps > 0 && endSet.has(stateKey)) {
                continue;
            }

            // Try all neighbors
            const neighbors = this.board.getNeighbors(state.r, state.c);
            for (const nb of neighbors) {
                const nbKey = `${nb.r},${nb.c}`;
                let newMask = state.mask;
                if (hexMap.has(nbKey)) {
                    newMask |= (1 << hexMap.get(nbKey));
                }

                const nIdx = nodeIdx(nb.r, nb.c);
                const newNodeMask = state.nodeMask | (1 << nIdx);
                const isDire = state.dire || (newNodeMask === state.nodeMask); // revisit

                const visitedKey = makeVisitedKey(nb.r, nb.c, newMask, state.startR, state.startC, isDire);
                if (!visited.has(visitedKey)) {
                    const newState = {
                        r: nb.r, c: nb.c,
                        mask: newMask,
                        parent: state,
                        startR: state.startR, startC: state.startC,
                        steps: state.steps + 1,
                        nodeMask: newNodeMask,
                        dire: isDire
                    };

                    // Check if this neighbor completes the puzzle (end + all hexagons)
                    if (newState.steps > 0 && endSet.has(nbKey) && newMask === totalHexMask) {
                        // Only accept clean (non-dire) paths
                        if (!isDire) {
                            const pathNodes = this._reconstructPathNodes(newState);
                            const simplified = this.removeLoops(pathNodes, hexMap);
                            if (isSymmetry) {
                                if (this.board.isSymmetricPathValid(simplified)) {
                                    return {success: true, path: simplified};
                                }
                            } else {
                                return {success: true, path: simplified};
                            }
                        }
                        // Dire path — skip, let BFS find clean one
                        continue;
                    }

                    visited.set(visitedKey, newState);
                    queue.push(newState);
                }
            }
        }

        return {
            success: false,
            message: this.cancelled ? '求解已取消' : `BFS搜索完毕(${visited.size}个状态)，未找到解`,
            path: null
        };
    }

    /**
     * BFS solver that finds ALL solutions (for hexagon-only puzzles)
     * Collects all end states that satisfy constraints, then reconstructs all paths
     */
    bfsSolveAll(startCandidates, endCandidates, maxSolutions) {
        const hexagons = this.board.findAllNodeSymbols('hexagon');
        const hexMap = new Map();
        hexagons.forEach((h, i) => hexMap.set(`${h.r},${h.c}`, i));

        const totalHexMask = (1 << hexagons.length) - 1;
        const endSet = new Set(endCandidates.map(e => `${e.r},${e.c}`));
        const isSymmetry = this.board.symmetry !== 'none';
        const totalCols = this.board.cols;
        const nodeIdx = (r, c) => r * (totalCols + 1) + c;

        const queue = [];
        const visited = new Map();
        const endStates = [];

        // Visited key includes a "dire" flag: 0 = clean (no revisits),
        // 1 = tainted (has ≥1 revisit). Both coexist for the same (r,c,mask).
        const makeVisitedKey = (r, c, mask, startR, startC, direFlag) => {
            const suffix = direFlag ? ':d' : '';
            if (isSymmetry) return `${r},${c}:${mask}:${startR},${startC}${suffix}`;
            return `${r},${c}:${mask}${suffix}`;
        };

        // Initialize from each start candidate
        for (const start of startCandidates) {
            const startKey = `${start.r},${start.c}`;
            const startMask = hexMap.has(startKey) ? (1 << hexMap.get(startKey)) : 0;
            const state = {
                r: start.r, c: start.c, mask: startMask, parent: null,
                startR: start.r, startC: start.c, steps: 0,
                nodeMask: 1 << nodeIdx(start.r, start.c),
                dire: false
            };
            const visitedKey = makeVisitedKey(start.r, start.c, startMask, start.r, start.c, false);
            visited.set(visitedKey, state);
            queue.push(state);
        }

        let head = 0;
        while (head < queue.length && !this.cancelled && endStates.length < maxSolutions) {
            const state = queue[head++];

            if (this.onProgress && head % 100 === 0) {
                this.onProgress({visited: visited.size, queued: queue.length - head});
            }

            // End node — path must stop here, cannot pass through and continue
            const stateKey2 = `${state.r},${state.c}`;
            if (state.steps > 0 && endSet.has(stateKey2)) {
                continue;
            }

            const neighbors = this.board.getNeighbors(state.r, state.c);
            for (const nb of neighbors) {
                const nbKey = `${nb.r},${nb.c}`;
                let newMask = state.mask;
                if (hexMap.has(nbKey)) {
                    newMask |= (1 << hexMap.get(nbKey));
                }

                const nIdx = nodeIdx(nb.r, nb.c);
                const newNodeMask = state.nodeMask | (1 << nIdx);
                const isDire = state.dire || (newNodeMask === state.nodeMask); // revisit detected

                const visitedKey = makeVisitedKey(nb.r, nb.c, newMask, state.startR, state.startC, isDire);
                if (!visited.has(visitedKey)) {
                    const newState = {
                        r: nb.r, c: nb.c,
                        mask: newMask,
                        parent: state,
                        startR: state.startR, startC: state.startC,
                        steps: state.steps + 1,
                        nodeMask: newNodeMask,
                        dire: isDire
                    };

                    // Check if this is a valid end state
                    if (newState.steps > 0 && endSet.has(nbKey) && newMask === totalHexMask) {
                        // Only accept clean (non-dire) paths — dire paths have
                        // node revisits that removeLoops can't always fix
                        if (!isDire) {
                            visited.set(visitedKey, newState);
                            queue.push(newState);
                            if (isSymmetry) {
                                const pathNodes = this._reconstructPathNodes(newState);
                                const simplifiedPath = this.removeLoops(pathNodes, hexMap);
                                if (this.board.isSymmetricPathValid(simplifiedPath)) {
                                    endStates.push(newState);
                                    if (endStates.length >= maxSolutions) break;
                                }
                            } else {
                                endStates.push(newState);
                                if (endStates.length >= maxSolutions) break;
                            }
                        }
                        // If dire, skip (don't mark visited — let clean path compete)
                        continue;
                    }

                    visited.set(visitedKey, newState);
                    queue.push(newState);
                }
            }
        }

        // Reconstruct all paths
        const paths = endStates.map(es => this.removeLoops(this._reconstructPathNodes(es), hexMap));
        return {
            success: paths.length > 0,
            paths,
            totalFound: paths.length,
            statesExplored: visited.size,
            message: paths.length > 0 ? null :
                (this.cancelled ? '求解已取消' : `BFS搜索完毕(${visited.size}个状态)，未找到解`)
        };
    }

    /**
     * Reconstruct path nodes from a BFS state (no dedup — raw parent chain)
     */
    _reconstructPathNodes(endState) {
        const path = [];
        let state = endState;
        while (state) {
            path.unshift({r: state.r, c: state.c});
            state = state.parent;
        }
        return path;
    }

    /**
     * Backtracking solver for puzzles with region constraints
     * @param {Array} startCandidates - array of {r, c} possible start nodes
     * @param {Array} endCandidates - array of {r, c} possible end nodes
     */
    backtrackSolve(startCandidates, endCandidates) {
        const endSet = new Set(endCandidates.map(e => `${e.r},${e.c}`));
        const validator = new PuzzleValidator();
        const pathController = new PathController(this.board);
        const maxPathLength = (this.board.rows + 1) * (this.board.cols + 1);
        const maxDepth = maxPathLength;
        const isSymmetry = this.board.symmetry !== 'none';

        let statesExplored = 0;
        const maxStates = 500000; // Safety limit

        const dfs = (path, visitedNodes, depth, startR, startC) => {
            if (this.cancelled) return null;
            if (depth > maxDepth) return null;
            statesExplored++;

            if (this.onProgress && statesExplored % 1000 === 0) {
                this.onProgress({states: statesExplored, pathLength: path.length});
            }

            if (statesExplored > maxStates) return null;
            if (path.length > maxPathLength) return null;

            const current = path[path.length - 1];

            // Check if we reached an end candidate
            // Require path.length > 1 so a start node with an auto-mirror
            // end symbol doesn't count as a degenerate 1-node "path"
            const currentKey = `${current.r},${current.c}`;
            if (path.length > 1 && endSet.has(currentKey)) {
                pathController.path = [...path];
                // Derive symmetricPath so isComplete() check works in symmetry mode
                if (isSymmetry) {
                    pathController.symmetricPath = path.map(n => this.board.getSymmetricNode(n.r, n.c));
                }
                const result = validator.validate(this.board, pathController);
                if (result.valid) {
                    return [...path];
                }
                return null;
            }

            // Get possible next moves
            const neighbors = this.board.getNeighbors(current.r, current.c);
            const sortedNeighbors = this.prioritizeNeighbors(neighbors, endCandidates);

            // Filter to unvisited nodes, and check symmetry if applicable
            let unvisitedNeighbors = sortedNeighbors.filter(n =>
                !visitedNodes.has(`${n.r},${n.c}`)
            );

            // Per-step symmetry validation: prune neighbors whose mirror is invalid
            if (isSymmetry && unvisitedNeighbors.length > 0) {
                unvisitedNeighbors = unvisitedNeighbors.filter(n =>
                    this._canExtendSymmetric(path, visitedNodes, n.r, n.c)
                );
            }

            if (unvisitedNeighbors.length === 0 && path.length > 1) {
                return null; // Dead end
            }

            for (const nb of unvisitedNeighbors) {
                path.push({r: nb.r, c: nb.c});
                visitedNodes.add(`${nb.r},${nb.c}`);

                const result = dfs(path, visitedNodes, depth + 1, startR, startC);
                if (result) return result;

                path.pop();
                visitedNodes.delete(`${nb.r},${nb.c}`);
            }

            return null;
        };

        // Try each start candidate
        for (const start of startCandidates) {
            if (this.cancelled) break;
            const path = [{r: start.r, c: start.c}];
            const visitedNodes = new Set([`${start.r},${start.c}`]);
            const result = dfs(path, visitedNodes, 1, start.r, start.c);
            if (result) {
                return {success: true, path: result, statesExplored};
            }
        }

        return {
            success: false,
            message: this.cancelled ?
                '求解已取消' :
                `回溯搜索完毕(${statesExplored}个状态)，未找到解`,
            path: null,
            statesExplored
        };
    }

    /**
     * Backtracking solver that finds ALL solutions (for region-based puzzles)
     * Collects all valid paths instead of returning the first one
     */
    backtrackSolveAll(startCandidates, endCandidates, maxSolutions) {
        const endSet = new Set(endCandidates.map(e => `${e.r},${e.c}`));
        const validator = new PuzzleValidator();
        const pathController = new PathController(this.board);
        const maxPathLength = (this.board.rows + 1) * (this.board.cols + 1);
        const solutions = [];
        const isSymmetry = this.board.symmetry !== 'none';

        let statesExplored = 0;
        const maxStates = 500000;

        const dfs = (path, visitedNodes, depth, startR, startC) => {
            if (this.cancelled) return;
            if (solutions.length >= maxSolutions) return;
            if (depth > maxPathLength) return;
            if (statesExplored > maxStates) return;
            statesExplored++;

            if (this.onProgress && statesExplored % 1000 === 0) {
                this.onProgress({states: statesExplored, pathLength: path.length, found: solutions.length});
            }

            const current = path[path.length - 1];

            // Check if we reached an end candidate
            // Require path.length > 1 so a start node with an auto-mirror
            // end symbol doesn't count as a degenerate 1-node "path"
            if (path.length > 1 && endSet.has(`${current.r},${current.c}`)) {
                pathController.path = [...path];
                // Derive symmetricPath so isComplete() check works in symmetry mode
                if (isSymmetry) {
                    pathController.symmetricPath = path.map(n => this.board.getSymmetricNode(n.r, n.c));
                }
                const result = validator.validate(this.board, pathController);
                if (result.valid) {
                    solutions.push([...path]);
                }
                return; // Don't continue past an end node
            }

            // Get possible next moves
            const neighbors = this.board.getNeighbors(current.r, current.c);
            const sortedNeighbors = this.prioritizeNeighbors(neighbors, endCandidates);

            const unvisitedNeighbors = sortedNeighbors.filter(n =>
                !visitedNodes.has(`${n.r},${n.c}`)
            );

            // Per-step symmetry validation: prune neighbors whose mirror is invalid
            let validNeighbors = unvisitedNeighbors;
            if (isSymmetry && unvisitedNeighbors.length > 0) {
                validNeighbors = unvisitedNeighbors.filter(n =>
                    this._canExtendSymmetric(path, visitedNodes, n.r, n.c)
                );
            }

            if (validNeighbors.length === 0) return; // Dead end

            for (const nb of validNeighbors) {
                if (solutions.length >= maxSolutions) return;
                path.push({r: nb.r, c: nb.c});
                visitedNodes.add(`${nb.r},${nb.c}`);

                dfs(path, visitedNodes, depth + 1, startR, startC);

                path.pop();
                visitedNodes.delete(`${nb.r},${nb.c}`);
            }
        };

        // Try each start candidate
        for (const start of startCandidates) {
            if (this.cancelled || solutions.length >= maxSolutions) break;
            const path = [{r: start.r, c: start.c}];
            const visitedNodes = new Set([`${start.r},${start.c}`]);
            dfs(path, visitedNodes, 1, start.r, start.c);
        }

        return {
            success: solutions.length > 0,
            paths: solutions,
            totalFound: solutions.length,
            statesExplored,
            message: solutions.length > 0 ? null :
                (this.cancelled ? '求解已取消' :
                    `回溯搜索完毕(${statesExplored}个状态)，未找到解`)
        };
    }

    /**
     * Prioritize neighbors by direction toward the nearest end candidate
     */
    prioritizeNeighbors(neighbors, endCandidates) {
        // Find minimum Manhattan distance from a node to any end candidate
        const minDistToEnd = (r, c) => {
            let min = Infinity;
            for (const end of endCandidates) {
                const d = Math.abs(r - end.r) + Math.abs(c - end.c);
                if (d < min) min = d;
            }
            return min;
        };
        return neighbors.sort((a, b) => {
            return minDistToEnd(a.r, a.c) - minDistToEnd(b.r, b.c);
        });
    }

    /**
     * Reconstruct path from BFS result
     */
    reconstructPath(endState, hexMap = null) {
        const path = [];
        let state = endState;
        while (state) {
            path.unshift({r: state.r, c: state.c});
            state = state.parent;
        }
        // Remove any loops (duplicate nodes) from the path
        // Since BFS allows revisiting nodes with different hex masks
        return {success: true, path: this.removeLoops(path, hexMap)};
    }

    /**
     * Remove loops from a path (duplicate node visits)
     * A→B→C→B→D becomes A→B→D
     * Uses iterative approach to avoid stack overflow
     */
    removeLoops(path, hexMap = null) {
        let result = path;
        let changed = true;
        while (changed) {
            changed = false;
            const seen = new Map(); // "r,c" → index
            for (let i = 0; i < result.length; i++) {
                const key = `${result[i].r},${result[i].c}`;
                if (seen.has(key)) {
                    const prevIdx = seen.get(key);
                    const loopSegment = result.slice(prevIdx, i);
                    const restPath = [...result.slice(0, prevIdx), ...result.slice(i)];

                    // If hexMap provided, check that removing this loop doesn't lose
                    // any hexagon that doesn't appear elsewhere in the path
                    if (hexMap) {
                        const hexInLoop = loopSegment.filter(n => hexMap.has(`${n.r},${n.c}`));
                        const restKeySet = new Set(restPath.map(n => `${n.r},${n.c}`));
                        const lostHexagons = hexInLoop.filter(n => !restKeySet.has(`${n.r},${n.c}`));
                        if (lostHexagons.length > 0) {
                            // Don't remove this loop — it contains unique hexagon(s)
                            // Update seen to point to the later occurrence
                            seen.set(key, i);
                            continue;
                        }
                    }

                    // Remove the loop segment
                    result = restPath;
                    changed = true;
                    break; // Restart scanning
                }
                seen.set(key, i);
            }
        }
        return result;
    }
}
