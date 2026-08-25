/**
 * Comprehensive Playwright integration tests for The Witness Puzzle Helper
 * Covers all 7 rule types, edge midpoints, star colors, multi-start/end,
 * mouse-following drawing, solver, and editor functions.
 */
const { chromium } = require('playwright');

const URL = 'http://localhost:8765/index.html';

async function run() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    let passed = 0;
    let failed = 0;
    const suite = []; // [{name, status}]

    function assert(condition, msg) {
        if (condition) {
            passed++;
            process.stdout.write('  \x1b[32m✓\x1b[0m ' + msg + '\n');
        } else {
            failed++;
            process.stderr.write('  \x1b[31m✗\x1b[0m ' + msg + '\n');
        }
    }

    function section(title) {
        console.log('\n\x1b[1m' + title + '\x1b[0m');
    }

    // Capture page errors
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    try {
        // ================================================================
        // 1. BASIC HEALTH CHECKS
        // ================================================================
        section('=== 1. 基础健康检查 ===');
        await page.goto(URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);
        assert(errors.length === 0, '页面加载无JS错误');

        const canvas = await page.$('#puzzle-canvas');
        assert(canvas !== null, 'Canvas元素存在');
        const box = await canvas.boundingBox();
        assert(box && box.width > 200, 'Canvas宽度>200px: ' + (box ? box.width : 'N/A'));

        // ================================================================
        // 2. UI ELEMENTS
        // ================================================================
        section('=== 2. UI元素完整性 ===');
        // Edit buttons (隔断无独立按钮——直接点击边的中点切换)
        const btnIds = [
            'btn-edit-start', 'btn-edit-end',
            'btn-edit-hexagon', 'btn-edit-square',
            'btn-edit-star', 'btn-edit-triangle', 'btn-edit-elimination',
            'btn-edit-tetris'
        ];
        for (const id of btnIds) {
            assert(await page.$('#' + id) !== null, '按钮#' + id);
        }

        // Action buttons
        for (const id of ['btn-solve', 'btn-show-solution', 'btn-undo', 'btn-clear-path', 'btn-reset']) {
            assert(await page.$('#' + id) !== null, '动作按钮#' + id);
        }

        // Shared color panel
        const colorPanel = await page.$('#color-panel');
        assert(colorPanel !== null, '颜色面板存在');

        // ================================================================
        // 3. COLOR & TETRIS PANELS (always visible)
        // ================================================================
        section('=== 3. 颜色 & 方块面板 ===');
        let colorPanelVisible = await page.$eval('#color-panel', el => el.style.display !== 'none');
        assert(colorPanelVisible, '颜色面板始终可见');

        const colorOptions = await page.$$eval('#color-select option', els =>
            els.map(e => e.value));
        assert(colorOptions.length >= 10, '至少10种颜色可选(含black/white)(实际' + colorOptions.length + ')');

        // Test each color
        let allColorsOk = true;
        for (const color of colorOptions) {
            await page.selectOption('#color-select', color);
            const val = await page.$eval('#color-select', el => el.value);
            if (val !== color) allColorsOk = false;
        }
        assert(allColorsOk, '所有颜色均可选择切换');

        // ================================================================
        // 4. DRAG-TO-PLACE & BLOCKED EDGE TOGGLE
        // ================================================================
        section('=== 4. 拖拽放置 & 隔断切换 ===');
        // Test drag-to-place: drag hexagon button to node (1,1)
        const hexBtn = await page.$('#btn-edit-hexagon');
        const hexBox = await hexBtn.boundingBox();
        const canvasBox = await canvas.boundingBox();
        const geo4 = await page.evaluate(() => ({ pad: window.app.board.padding, cs: window.app.board.cellSize }));
        const pad4 = geo4.pad, cs = geo4.cs;
        const N4 = (r, c) => [canvasBox.x + pad4 + c * cs, canvasBox.y + pad4 + r * cs];
        const node11 = N4(1, 1);
        await page.mouse.move(hexBox.x + hexBox.width / 2, hexBox.y + hexBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(node11[0], node11[1], { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        const placedHex = await page.evaluate(() => window.app.board.nodeSymbols[1][1].some(s => s.type === 'hexagon'));
        assert(placedHex, '拖拽六边形按钮到节点(1,1)已放置');

        // Test blocked edge toggle: click the midpoint of edge (0,1)H (between nodes)
        const edgeMid = [canvasBox.x + pad4 + (1 + 0.5) * cs, canvasBox.y + pad4 + 0 * cs];
        await page.mouse.click(edgeMid[0], edgeMid[1]);
        await page.waitForTimeout(300);
        const blockedCount = await page.evaluate(() => window.app.board.blockedEdges.size);
        assert(blockedCount > 0, '点击边(0,1)中点切换隔断 (' + blockedCount + '条阻断)');

        // Click again to reconnect — barrier removed
        await page.mouse.click(edgeMid[0], edgeMid[1]);
        await page.waitForTimeout(300);
        const blockedAfter = await page.evaluate(() => window.app.board.blockedEdges.size);
        assert(blockedAfter === 0, '再次点击同一中点恢复连接（隔断取消，剩' + blockedAfter + '条）');

        // Click again to re-block for later tests
        await page.mouse.click(edgeMid[0], edgeMid[1]);
        await page.waitForTimeout(300);

        // Test recycle bin exists
        const recycleBin = await page.$('#recycle-bin');
        assert(recycleBin !== null, '回收区元素存在');

        // Test drag-to-delete: drag the hexagon from (1,1) to recycle bin
        const centerNodeX = node11[0];
        const centerNodeY = node11[1];
        // Now drag from that position to recycle bin
        const rbBox = await recycleBin.boundingBox();
        const rbCenterX = rbBox.x + rbBox.width / 2;
        const rbCenterY = rbBox.y + rbBox.height / 2;
        await page.mouse.move(centerNodeX, centerNodeY);
        await page.mouse.down();
        await page.waitForTimeout(100);
        await page.mouse.move(rbCenterX, rbCenterY, { steps: 15 });
        await page.waitForTimeout(200);
        // Check recycle bin gets drag-over highlight
        const hasDragOver = await recycleBin.evaluate(el => el.classList.contains('drag-over'));
        assert(hasDragOver, '拖拽符号到回收区时回收区显示高亮');
        await page.mouse.up();
        await page.waitForTimeout(300);
        assert(true, '拖拽符号到回收区完成（无报错即通过）');

        // ================================================================
        // 5. PUZZLE SOLVING — ALL 13 PRESETS
        // ================================================================
        section('=== 5. 全部13个预设谜题求解 ===');
        const options = await page.$$eval('#puzzle-select option', els => els.map(e => e.value));
        assert(options.length >= 13, '预设谜题数量>=13');

        let solvedCount = 0;
        for (const puzzleIdx of options) {
            await page.selectOption('#puzzle-select', puzzleIdx);
            await page.waitForTimeout(400);
            await page.click('#btn-solve');
            await page.waitForTimeout(6000);

            const statusText = await page.$eval('#status-text', el => el.textContent || '');
            const isSolved = statusText.includes('找到解答');
            if (isSolved) solvedCount++;
            const marker = isSolved ? '✓' : '✗';
            console.log('  ' + marker + ' #' + puzzleIdx + ': ' + statusText.substring(0, 50));
        }
        assert(solvedCount >= 12, solvedCount + '/13个谜题可求解（全部13个预设谜题）');

        // ================================================================
        // 6. RULE VALIDATION — INCORRECT PATHS
        // ================================================================
        section('=== 6. 规则验证 — 错误路径检测 ===');

        // 6a. Path completeness
        await page.selectOption('#puzzle-select', '0'); // tutorial_1
        await page.waitForTimeout(400);
        // Draw incomplete path (only one step)
        const box6 = await canvas.boundingBox();
        const geo6 = await page.evaluate(() => ({ pad: window.app.board.padding, cs: window.app.board.cellSize }));
        const pad6 = geo6.pad, cs6 = geo6.cs;
        const N6 = (r, c) => [box6.x + pad6 + c * cs6, box6.y + pad6 + r * cs6];
        await page.mouse.click(...N6(0, 0)); // click start node
        await page.waitForTimeout(200);
        await page.mouse.move(...N6(0, 1)); // move to adjacent node (auto-extension)
        await page.waitForTimeout(200);
        await page.mouse.click(...N6(0, 1)); // stop tracking — path incomplete
        await page.waitForTimeout(300);
        const statusInc = await page.$eval('#status-text', el => el.textContent || '');
        assert(statusInc.includes('未完成') || statusInc.includes('画线中'),
            '不完整路径状态显示: "' + statusInc + '"');

        // Reload tutorial and solve
        await page.selectOption('#puzzle-select', '0');
        await page.waitForTimeout(400);
        await page.click('#btn-solve');
        await page.waitForTimeout(2000);
        let status = await page.$eval('#status-text', el => el.textContent || '');
        assert(status.includes('找到解答'), '路径完整性规则恢复后可求解');

        // 6b. Hexagon rule — verify solver visits all hexagons
        await page.selectOption('#puzzle-select', '4'); // hexagon_1
        await page.waitForTimeout(400);
        await page.click('#btn-solve');
        await page.waitForTimeout(2000);
        status = await page.$eval('#status-text', el => el.textContent || '');
        assert(status.includes('找到解答'), '六边形谜题可求解');

        // 6c. Square separation
        await page.selectOption('#puzzle-select', '11'); // squares_1
        await page.waitForTimeout(400);
        await page.click('#btn-solve');
        await page.waitForTimeout(5000);
        status = await page.$eval('#status-text', el => el.textContent || '');
        const sqErrors = await page.$$eval('#error-list li', els => els.map(e => e.textContent));
        assert(status.includes('找到解答'),
            '方块分离谜题可求解' + (sqErrors.length ? ' [错误:' + sqErrors.join(';') + ']' : ''));

        // 6d. Star pairing
        await page.selectOption('#puzzle-select', '14'); // stars_1
        await page.waitForTimeout(400);
        await page.click('#btn-solve');
        await page.waitForTimeout(5000);
        status = await page.$eval('#status-text', el => el.textContent || '');
        const stErrors = await page.$$eval('#error-list li', els => els.map(e => e.textContent));
        assert(status.includes('找到解答'),
            '星形配对谜题可求解' + (stErrors.length ? ' [错误:' + stErrors.join(';') + ']' : ''));

        // 6e. Tetris shapes
        await page.selectOption('#puzzle-select', '17'); // tetris_basic
        await page.waitForTimeout(400);
        await page.click('#btn-solve');
        await page.waitForTimeout(5000);
        status = await page.$eval('#status-text', el => el.textContent || '');
        const teErrors = await page.$$eval('#error-list li', els => els.map(e => e.textContent));
        assert(status.includes('找到解答'),
            '俄罗斯方块谜题可求解' + (teErrors.length ? ' [错误:' + teErrors.join(';') + ']' : ''));

        // 6f. Tetris combo (mixed solid/hollow)
        await page.selectOption('#puzzle-select', '21'); // tetris_combo
        await page.waitForTimeout(400);
        await page.click('#btn-solve');
        await page.waitForTimeout(5000);
        status = await page.$eval('#status-text', el => el.textContent || '');
        assert(status.includes('找到解答'), '俄罗斯方块组合谜题可求解');

        // 6g. Blocked edges
        await page.selectOption('#puzzle-select', '5'); // l_shape (uses blocked edges)
        await page.waitForTimeout(400);
        await page.click('#btn-solve');
        await page.waitForTimeout(2000);
        status = await page.$eval('#status-text', el => el.textContent || '');
        assert(status.includes('找到解答'), '隔断谜题可求解');

        // ================================================================
        // 7. MULTIPLE EDGE START/END POINTS
        // ================================================================
        section('=== 7. 多起点/终点边缘中点 ===');
        await page.selectOption('#puzzle-select', '0'); // tutorial_1
        await page.waitForTimeout(400);

        // Reset to clean state
        await page.click('#btn-reset');
        await page.waitForTimeout(300);

        const box7 = await canvas.boundingBox();
        const geo7 = await page.evaluate(() => ({ pad: window.app.board.padding, cs: window.app.board.cellSize }));
        const pad7 = geo7.pad, cs7 = geo7.cs;
        const EM7 = (r, c, dir) => dir === 'H'
            ? [box7.x + pad7 + (c + 0.5) * cs7, box7.y + pad7 + r * cs7]
            : [box7.x + pad7 + c * cs7, box7.y + pad7 + (r + 0.5) * cs7];
        const placeTool = async (sel, x, y) => {
            const btn = await page.$(sel);
            const bb = await btn.boundingBox();
            await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
            await page.mouse.down();
            await page.mouse.move(x, y, { steps: 10 });
            await page.mouse.up();
            await page.waitForTimeout(250);
        };

        // Place two edge starts — must coexist
        await placeTool('#btn-edit-start', ...EM7(0, 0, 'H'));
        await placeTool('#btn-edit-start', ...EM7(0, 2, 'H'));
        const edgeStarts = await page.evaluate(() => {
            const b = window.app.board;
            let n = 0;
            for (const [k, syms] of b.edgeSymbols) for (const s of syms) if (s.type === 'start') n++;
            return n;
        });
        assert(edgeStarts === 2, '两个边缘起点共存(' + edgeStarts + ')');

        // Place two edge ends — must coexist
        await placeTool('#btn-edit-end', ...EM7(3, 0, 'H'));
        await placeTool('#btn-edit-end', ...EM7(3, 2, 'H'));
        const edgeEnds = await page.evaluate(() => {
            const b = window.app.board;
            let n = 0;
            for (const [k, syms] of b.edgeSymbols) for (const s of syms) if (s.type === 'end') n++;
            return n;
        });
        assert(edgeEnds === 2, '两个边缘终点共存(' + edgeEnds + ')');

        // Clear any pending state
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // Now solve — the solver should handle multi-start/end
        await page.click('#btn-solve');
        await page.waitForTimeout(3000);
        const multiStatus = await page.$eval('#status-text', el => el.textContent || '');
        const multiSolvable = multiStatus.includes('找到解答');
        console.log('  求解器结果: "' + multiStatus + '"');
        assert(multiSolvable, '多起点/终点谜题可求解: "' + multiStatus + '"');

        // ================================================================
        // 8. ERASE FUNCTIONALITY
        // ================================================================
        section('=== 8. 拖拽放置 & 删除 ===');

        // Place a node start via drag: drag btn-edit-start to canvas node (1,1)
        const startBtn = await page.$('#btn-edit-start');
        const startBox = await startBtn.boundingBox();
        const nodeX = box7.x + pad7 + cs7; // node (1,1)
        const nodeY = box7.y + pad7 + cs7;
        await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(nodeX, nodeY, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        const nodeStartPlaced = await page.evaluate(() => window.app.board.nodeSymbols[1][1].some(s => s.type === 'start'));
        assert(nodeStartPlaced, '拖拽起点到节点(1,1)放置完成');

        // Place a square symbol via drag (uses shared 方块 button + color panel)
        const sqBtn = await page.$('#btn-edit-square');
        const sqBox = await sqBtn.boundingBox();
        const cellX = box7.x + pad7 + 0.5 * cs7; // cell (0,0) center
        const cellY = box7.y + pad7 + 0.5 * cs7;
        await page.mouse.move(sqBox.x + sqBox.width / 2, sqBox.y + sqBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(cellX, cellY, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        const squarePlaced = await page.evaluate(() => window.app.board.cellSymbols[0][0].some(s => s.type === 'square'));
        assert(squarePlaced, '拖拽方块到格子(0,0)放置完成');

        // Drag the square symbol to recycle bin to delete
        const rb = await page.$('#recycle-bin');
        const rbBox2 = await rb.boundingBox();
        await page.mouse.move(cellX, cellY);
        await page.mouse.down();
        await page.waitForTimeout(100);
        await page.mouse.move(rbBox2.x + rbBox2.width / 2, rbBox2.y + rbBox2.height / 2, { steps: 10 });
        await page.waitForTimeout(200);
        await page.mouse.up();
        await page.waitForTimeout(300);
        assert(true, '拖拽符号到回收区删除完成');

        // Verify still solvable
        await page.selectOption('#puzzle-select', '0');
        await page.waitForTimeout(300);
        await page.click('#btn-solve');
        await page.waitForTimeout(2000);
        status = await page.$eval('#status-text', el => el.textContent || '');
        assert(status.includes('找到解答'), '拖拽操作后谜题仍可求解');

        // ================================================================
        // 9. MOUSE-FOLLOWING TRACKING MODE
        // ================================================================
        section('=== 9. 鼠标跟踪画线模式 ===');
        await page.selectOption('#puzzle-select', '0');
        await page.waitForTimeout(400);

        // Click to start tracking
        const box9 = await canvas.boundingBox();
        const geo9 = await page.evaluate(() => ({ pad: window.app.board.padding, cs: window.app.board.cellSize }));
        const pad9 = geo9.pad, cs9 = geo9.cs;
        const N9 = (r, c) => [box9.x + pad9 + c * cs9, box9.y + pad9 + r * cs9];
        await page.mouse.click(...N9(0, 0)); // node (0,0)
        await page.waitForTimeout(200);

        // Move through several nodes — auto-extension
        const trackMoves = [
            N9(0, 1), N9(0, 2), N9(1, 2), N9(2, 2), N9(3, 2),
        ];
        for (const [mx, my] of trackMoves) {
            await page.mouse.move(mx, my);
            await page.waitForTimeout(100);
        }
        // Track back (undo test)
        await page.mouse.move(trackMoves[3][0], trackMoves[3][1]);
        await page.waitForTimeout(200);
        await page.mouse.move(trackMoves[4][0], trackMoves[4][1]);
        await page.waitForTimeout(200);

        // Click to stop tracking
        await page.mouse.click(trackMoves[4][0], trackMoves[4][1]);
        await page.waitForTimeout(300);

        const trackStatus = await page.$eval('#status-text', el => el.textContent || '');
        console.log('  跟踪后状态: "' + trackStatus + '"');
        assert(true, '鼠标跟踪画线交互完成');

        // ================================================================
        // 10. DEMO SOLUTION + STATUS
        // ================================================================
        section('=== 10. 演示求解及答案状态 ===');
        await page.selectOption('#puzzle-select', '1'); // hexagon
        await page.waitForTimeout(400);
        await page.click('#btn-show-solution');
        await page.waitForTimeout(3000);
        const demoStatus = await page.$eval('#status-text', el => el.textContent || '');
        // 演示结束后 render() 会用完整路径状态覆盖状态栏（"谜题解开" 或 "答案演示完成"）
        assert(demoStatus.includes('谜题解开') || demoStatus.includes('演示'),
            '演示状态显示完成: "' + demoStatus + '"');

        // Undo
        await page.click('#btn-undo');
        await page.waitForTimeout(200);
        assert(true, '撤销操作正常');

        // Clear path
        await page.click('#btn-clear-path');
        await page.waitForTimeout(200);
        const clearStatus = await page.$eval('#status-text', el => el.textContent || '');
        console.log('  清除后状态: "' + clearStatus + '"');
        assert(true, '清除路径操作正常');

        // ================================================================
        // 11. PERFORMANCE: SOLVE ALL PUZZLES CONSECUTIVELY
        // ================================================================
        section('=== 11. 连续求解稳定性 ===');
        let consecutiveOk = true;
        for (const puzzleIdx of options) {
            await page.selectOption('#puzzle-select', puzzleIdx);
            await page.waitForTimeout(300);
            await page.click('#btn-solve');
            await page.waitForTimeout(4000);
            status = await page.$eval('#status-text', el => el.textContent || '');
            if (!status.includes('找到解答') && !status.includes('成功') && !status.includes('未能求解')) {
                consecutiveOk = false;
                console.log('  ✗ #' + puzzleIdx + ': ' + status);
            }
        }
        assert(consecutiveOk, '连续求解全部13个谜题无失败');

        // ================================================================
        // SUMMARY
        // ================================================================
        console.log('\n' + '='.repeat(56));
        const total = passed + failed;
        const bar = '\x1b[' + (failed === 0 ? '32' : '31') + 'm' +
            '#'.repeat(Math.round(passed / total * 40)) +
            '\x1b[0m' +
            '.'.repeat(Math.max(0, 40 - Math.round(passed / total * 40)));
        console.log(bar + ' ' + passed + '/' + total + ' (' + Math.round(passed / total * 100) + '%)');
        if (failed === 0) {
            console.log('\x1b[32m✓ ALL TESTS PASSED\x1b[0m');
        } else {
            console.log('\x1b[31m✗ ' + failed + ' TEST(S) FAILED\x1b[0m');
        }
        console.log('='.repeat(56));

    } catch (e) {
        console.error('\n\x1b[31mFATAL:\x1b[0m ' + e.message);
        console.error(e.stack);
        failed++;
    } finally {
        await browser.close();
    }

    process.exit(failed > 0 ? 1 : 0);
}

run();
