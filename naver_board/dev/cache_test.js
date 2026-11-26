// 빠른 화면(저장해 둔 결과 먼저 보여주기) 점검: 탭을 다시 열 때·새로 열 때 서버 요청 수와 첫 그림까지 걸린 시간
const { chromium } = require('playwright');
(async () => {
  const dir = process.argv[2];
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const url = 'file://' + require('path').resolve(dir) + '/board_lead.html';
  // 서버 요청마다 1.5초 걸리게(실제 앱스 스크립트 비슷하게) 하고 요청 수를 셈
  await p.addInitScript(() => { window.__NET = []; window.__DELAY = 1500; });
  const firstPaint = async () => { const t0 = Date.now(); await p.waitForFunction(() => document.querySelector('#view') && !document.querySelector('#view .loading') && document.querySelector('#view').textContent.length > 50, null, { timeout: 20000 }); return Date.now() - t0; };
  await p.goto(url);
  const cold = await firstPaint();
  await p.waitForTimeout(12000);  // 미리 받기 끝날 때까지
  const pre = await p.evaluate(() => window.__NET.slice());
  // 탭 이동: 미리 받아 둔 탭은 바로 보여야 함
  const tabs = ['task', 'perf', 'check', 'plan', 'notice'];
  const sw = {};
  for (const t of tabs) {
    const t0 = Date.now();
    await p.evaluate((x) => go(x), t);
    await p.waitForFunction(() => !document.querySelector('#view .loading') && document.querySelector('#view').textContent.length > 50, null, { timeout: 20000 });
    sw[t] = Date.now() - t0;
  }
  // 다시 열기: 저장분으로 바로 그려야 함
  await p.reload();
  const warm = await firstPaint();
  // 쓰기 뒤에는 저장분을 지우는지
  const cleared = await p.evaluate(() => { CACHE.x = 1; return call('noticeAck', { id: 'none' }).catch(() => 0).then(() => !CACHE.x); });
  console.log(JSON.stringify({ '처음 열기(ms)': cold, '다시 열기(ms)': warm, '탭 이동(ms)': sw, '미리 받은 요청': pre, '쓰기 뒤 비움': cleared }));
  await b.close();
})();
