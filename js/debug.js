/**
 * Debug module - Puzzle state export/import for feedback and troubleshooting
 *
 * Usage:
 *   const exporter = new DebugExporter(board, pathController, validator, solver);
 *   const json = exporter.exportState();          // Full state as JSON string
 *   exporter.downloadDebugFile();                 // Triggers browser download
 *
 *   // Server-side:
 *   const report = DebugExporter.analyze(jsonData); // Parse & validate offline
 */

class DebugExporter {
    constructor(board, pathController, validator, solver) {
        this.board = board;
        this.pathController = pathController;
        this.validator = validator;
        this.solver = solver;
    }

    /**
     * Export complete puzzle state as a structured object
     * @param {Object} opts
     * @param {Array}  opts.solutions - solver result paths (optional)
     * @param {number} opts.totalFound - number of solutions found (optional)
     * @param {string} opts.solverMethod - 'bfs' | 'backtrack' (optional)
     * @param {Array}  opts.currentSolution - currently displayed solution path (optional)
     * @returns {Object} serializable debug state
     */
    exportState(opts = {}) {
        const board = this.board;
        const pc = this.pathController;

        // Serialize cell symbols: each cell → array of type-tagged strings
        const cellSymbols = [];
        for (let r = 0; r < board.rows; r++) {
            const row = [];
            for (let c = 0; c < board.cols; c++) {
                row.push(board.cellSymbols[r][c].map(s => this._serializeSymbol(s)));
            }
            cellSymbols.push(row);
        }

        // Serialize node symbols
        const nodeSymbols = [];
        for (let r = 0; r <= board.rows; r++) {
            const row = [];
            for (let c = 0; c <= board.cols; c++) {
                row.push(board.nodeSymbols[r][c].map(s => this._serializeSymbol(s)));
            }
            nodeSymbols.push(row);
        }

        // Serialize edge symbols
        const edgeSymbols = {};
        for (const [key, symbols] of board.edgeSymbols) {
            edgeSymbols[key] = symbols.map(s => this._serializeSymbol(s));
        }

        // Blocked edges
        const blockedEdges = [...board.blockedEdges];

        // Current player path
        const playerPath = pc.getPathNodes().map(n => ({r: n.r, c: n.c}));

        // Symmetric path (if applicable)
        let symmetricPath = null;
        if (board.symmetry !== 'none') {
            const sp = pc.getSymmetricPathNodes();
            if (sp && sp.length > 0) {
                symmetricPath = sp.map(n => ({r: n.r, c: n.c}));
            }
        }

        // Save original validator errors to avoid polluting the UI state
        // (validate() mutates the validator's internal errors array)
        const savedErrors = this.validator ? [...this.validator.errors] : [];

        // Validation result for player path
        let playerValidation = null;
        if (pc.isComplete() && this.validator) {
            const result = this.validator.validate(board, pc);
            if (result) {
                playerValidation = {
                    valid: result.valid,
                    errors: result.errors.map(e => ({
                        rule: e.rule,
                        message: e.message
                    }))
                };
            }
        }

        // Solutions (if available)
        const solutions = (opts.solutions || []).map(path =>
            path.map(n => ({r: n.r, c: n.c}))
        );

        // Current displayed solution (if available)
        let currentSolution = null;
        if (opts.currentSolution && opts.currentSolution.length > 0) {
            currentSolution = opts.currentSolution.map(n => ({r: n.r, c: n.c}));
        }

        // Validate the current solution path if available and player hasn't drawn it
        let currentSolutionValidation = null;
        if (currentSolution && this.validator) {
            const tempPC = new PathController(board);
            tempPC.setPath(currentSolution);
            const result = this.validator.validate(board, tempPC);
            if (result) {
                currentSolutionValidation = {
                    valid: result.valid,
                    errors: result.errors.map(e => ({
                        rule: e.rule,
                        message: e.message
                    }))
                };
            }
        }

        // If player hasn't drawn a complete path but we have a current solution,
        // use the solution path as the effective path for validation purposes
        const effectivePath = playerPath.length > 1 ? playerPath :
            (currentSolution || playerPath);

        // Restore original validator errors so the UI shows the correct state
        if (this.validator) {
            this.validator.errors = savedErrors;
        }

        return {
            version: 1,
            timestamp: new Date().toISOString(),
            board: {
                rows: board.rows,
                cols: board.cols,
                symmetry: board.symmetry,
                cellSize: board.cellSize,
                cellSymbols: cellSymbols,
                nodeSymbols: nodeSymbols,
                edgeSymbols: edgeSymbols,
                blockedEdges: blockedEdges
            },
            playerPath: effectivePath,
            symmetricPath: symmetricPath,
            playerValidation: playerValidation,
            solutions: solutions,
            currentSolution: currentSolution,
            currentSolutionValidation: currentSolutionValidation,
            solverInfo: {
                totalFound: opts.totalFound || solutions.length,
                method: opts.solverMethod || 'unknown'
            }
        };
    }

    /**
     * Serialize a single symbol to a plain object or type-tagged string
     */
    _serializeSymbol(symbol) {
        if (!symbol || !symbol.type) return null;

        const out = {type: symbol.type};
        // Copy over all known properties
        const copyProps = ['color', 'count', 'shape', 'name', 'tetris_type', 'tilted', 'hollow', 'dir'];
        for (const prop of copyProps) {
            if (symbol[prop] !== undefined) {
                out[prop] = symbol[prop];
            }
        }
        return out;
    }

    /**
     * Trigger a browser download of the debug data as a JSON file
     */
    downloadDebugFile(filename = null, state = null) {
        if (!state) {
            state = this.exportState();
        }
        const json = JSON.stringify(state, null, 2);

        if (!filename) {
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const rows = this.board.rows;
            const cols = this.board.cols;
            const sym = this.board.symmetry !== 'none' ? `_${this.board.symmetry}` : '';
            filename = `witness_debug_${rows}x${cols}${sym}_${ts}.json`;
        }

        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return filename;
    }

    // ==================== Static: Offline Analysis ====================
    // All analysis methods delegate to PuzzleAnalyzer (shared with Node.js CLI)

    /**
     * Analyze an exported debug file and produce a human-readable report.
     * @param {Object} data - parsed debug JSON
     * @returns {Object} {summary, details, checks}
     */
    static analyze(data) {
        return PuzzleAnalyzer.analyze(data);
    }

    /**
     * Print a formatted analysis report (for Node.js CLI)
     * @param {Object} data - parsed debug JSON
     * @returns {string} formatted report
     */
    static reportText(data) {
        return PuzzleAnalyzer.reportText(data);
    }
}
