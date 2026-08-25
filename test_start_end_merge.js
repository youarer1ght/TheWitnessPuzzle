/**
 * Playwright regression tests for the merged 起点/终点 auto-detect icons:
 *  1) tool-drop 起点 on node → node start
 *  2) node start → node (move, no duplicate)
 *  3) tool-drop 终点 on edge midpoint → edge end
 *  4) edge end → different edge (move, no duplicate)
 *  5) edge end → node (cross-type auto-switch)
 *  6) node start → edge midpoint (cross-type auto-switch)
 *  7) edge start → recycle bin (delete)
 *
 * Run with the dev server on :8765 (npx serve . -p 8765), then:
 *   node test_start_end_merge.js
 */
const { chromium } = require('playwright');

const URL = 'http://localhost:8765/index.html';
let failed = 0;
function assert(cond, msg) {
    if (cond) { console.log('  \x1b[32m✓\x1b[0m ' + msg); }
    else { failed++; console.log('  \x1b[31m✗\x1b[0m ' + msg); }
}
async function getState(page) {
    return page.evaluate(() => {
        const board = window.app.board;
        const nodes = [];
        for (let r = 0; r <= board.rows; r++)
            for (let c = 0; c <= board.cols; c++)
                for (const s of board.nodeSymbols[r][c]) nodes.push(s.type + '@N(' + r + ',' + c + ')');
        const edges = [];
        for (const [k, syms] of board.edgeSymbols)
            for (const s of syms) edges.push(s.type + '@E' + k);
        return { nodes, edges };
    });
}
function nodeOf(st, type) { return st.nodes.filter(s => s.startsWith(type)); }
function edgeOf(st, type) { return st.edges.filter(s => s.startsWith(type)); }

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    try {
        await page.goto(URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);
        assert(errors.length === 0, '页面加载无JS错误: ' + errors.join(' | '));

        await page.selectOption('#puzzle-select', '0'); // tutorial_1, 3x3
        await page.waitForTimeout(400);
        await page.click('#btn-reset'); // clear preset symbols → blank 3×3 board
        await page.waitForTimeout(300);

        const canvas = await page.$('#puzzle-canvas');
        const box = await canvas.boundingBox();
        const geo = await page.evaluate(() => ({pad: window.app.board.padding, cs: window.app.board.cellSize}));
        const pad = geo.pad, cs = geo.cs;
        const N = (r, c) => [box.x + pad + c * cs, box.y + pad + r * cs];          // node pixel
        const EM = (r, c, dir) => dir === 'H'
            ? [box.x + pad + (c + 0.5) * cs, box.y + pad + r * cs]
            : [box.x + pad + c * cs, box.y + pad + (r + 0.5) * cs];                 // edge midpoint pixel

        const startBtn = await page.$('#btn-edit-start');
        const endBtn = await page.$('#btn-edit-end');
        const startBox = await startBtn.boundingBox();
        const endBox = await endBtn.boundingBox();
        const toolDrag = async (btnBox, x, y) => {
            await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
            await page.mouse.down();
            await page.mouse.move(x, y, { steps: 10 });
            await page.mouse.up();
            await page.waitForTimeout(350);
        };
        const symbolDrag = async (fx, fy, tx, ty) => {
            await page.mouse.move(fx, fy);
            await page.mouse.down();
            await page.waitForTimeout(80);
            await page.mouse.move(tx, ty, { steps: 12 });
            await page.mouse.up();
            await page.waitForTimeout(350);
        };

        // T1: tool-drop 起点 on node (1,1) → node start
        let [x, y] = N(1, 1);
        await toolDrag(startBox, x, y);
        let st = await getState(page);
        assert(nodeOf(st, 'start').length === 1 && nodeOf(st, 'start')[0] === 'start@N(1,1)',
            'T1 拖拽「起点」到节点(1,1) → 节点起点: ' + JSON.stringify(nodeOf(st, 'start')));

        // T2: move node start (1,1) → (2,2), no duplicate
        let [fx, fy] = N(1, 1);
        let [tx, ty] = N(2, 2);
        await symbolDrag(fx, fy, tx, ty);
        st = await getState(page);
        assert(nodeOf(st, 'start').length === 1 && nodeOf(st, 'start')[0] === 'start@N(2,2)',
            'T2 节点起点(1,1)→(2,2)移动且无残留: ' + JSON.stringify(nodeOf(st, 'start')));

        // T3: tool-drop 终点 on edge midpoint V(1,2) → edge end
        [x, y] = EM(1, 2, 'V');
        await toolDrag(endBox, x, y);
        st = await getState(page);
        assert(edgeOf(st, 'end').length === 1 && edgeOf(st, 'end')[0] === 'end@EV:1,2',
            'T3 拖拽「终点」到边缘中点V(1,2) → 边缘终点: ' + JSON.stringify(edgeOf(st, 'end')));

        // T4: move edge end V(1,2) → H(3,1) (edge→edge, no duplicate)
        [fx, fy] = EM(1, 2, 'V');
        [tx, ty] = EM(3, 1, 'H');
        await symbolDrag(fx, fy, tx, ty);
        st = await getState(page);
        assert(edgeOf(st, 'end').length === 1 && edgeOf(st, 'end')[0] === 'end@EH:3,1',
            'T4 边缘终点V(1,2)→H(3,1)移动且无残留: ' + JSON.stringify(edgeOf(st, 'end')));

        // T5: edge end H(3,1) → node (3,3) (cross-type)
        [fx, fy] = EM(3, 1, 'H');
        [tx, ty] = N(3, 3);
        await symbolDrag(fx, fy, tx, ty);
        st = await getState(page);
        assert(edgeOf(st, 'end').length === 0 && nodeOf(st, 'end').some(s => s === 'end@N(3,3)'),
            'T5 边缘终点拖动到节点(3,3) → 变为节点终点: ' + JSON.stringify({n: nodeOf(st, 'end'), e: edgeOf(st, 'end')}));

        // T6: node start (2,2) → edge midpoint V(2,3) (cross-type)
        [fx, fy] = N(2, 2);
        [tx, ty] = EM(2, 3, 'V');
        await symbolDrag(fx, fy, tx, ty);
        st = await getState(page);
        assert(!nodeOf(st, 'start').some(s => s === 'start@N(2,2)') && edgeOf(st, 'start').some(s => s === 'start@EV:2,3'),
            'T6 节点起点拖动到边缘中点V(2,3) → 变为边缘起点: ' + JSON.stringify({n: nodeOf(st, 'start'), e: edgeOf(st, 'start')}));

        // T7: deleting an edge start removes it cleanly
        [fx, fy] = EM(2, 3, 'V');
        const rb = await page.$('#recycle-bin');
        const rbBox = await rb.boundingBox();
        await symbolDrag(fx, fy, rbBox.x + rbBox.width / 2, rbBox.y + rbBox.height / 2);
        st = await getState(page);
        assert(edgeOf(st, 'start').length === 0, 'T7 拖拽边缘起点到回收区删除');

    } catch (e) {
        console.error('\n\x1b[31mFATAL:\x1b[0m', e.message);
        console.error(e.stack);
        failed++;
    } finally {
        await browser.close();
    }
    console.log('\n' + (failed === 0 ? '\x1b[32mALL PASS\x1b[0m' : '\x1b[31m' + failed + ' FAILED\x1b[0m'));
    process.exit(failed > 0 ? 1 : 0);
})();
