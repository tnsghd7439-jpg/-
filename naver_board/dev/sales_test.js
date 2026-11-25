// 영업노트·할일·오늘·이용 기록 흐름 점검 (가짜 구글 환경)
const { chromium } = require('playwright');
(async () => {
  const dir = require('path').resolve(process.argv[2]); const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const log = []; p.on('pageerror', e => log.push('PAGEERR ' + e.message));
  await p.goto('file://' + dir + '/board_a.html'); await p.waitForTimeout(900);
  const r = await p.evaluate(() => {
    const A = 'a@mymp.co.kr', C = 'c@mymp.co.kr', L = 'lead@mymp.co.kr';
    const run = (u, a, pl) => { window.__USER = u; return JSON.parse(api(a, pl || {})); };
    const out = {};
    const t = run(A, 'today').data;
    out.today = JSON.stringify({ calls: t.calls.map(c => c.company + (c.overdue ? '(지남)' : '')).join(','), tasks: t.tasks.map(x => x.title).join(','), goals: t.goals.length });
    out.leads = run(A, 'leadList').data.map(l => l.company + ':' + l.status + (l.due ? '/오늘' : '')).join(' | ');
    out.otherCannotSee = run(C, 'leadList').data.length + '건, 남의 가망건 열기=' + run(C, 'leadHistory', { id: window.__L1 }).error;
    out.leadSeesAll = run(L, 'leadList', {}).data.length;
    const lg = run(A, 'leadLog', { id: window.__L1, result: '점검권한 받음', memo: '내일 권한 초대 받기로', next: addDays_(today_(), 1) + ' 11:00' }).data;
    out.afterLog = lg.status + ' / 다음 ' + lg.next + ' / 기록 ' + run(A, 'leadHistory', { id: window.__L1 }).data.length + '건';
    out.flushed = rows_('이용기록').length + '줄 시트로 이동, 저장소 남은 어제 키=' + Object.keys(window.__PROPS).filter(k => k.indexOf('U|' + addDays_(today_(), -1)) === 0).length;
    const us = run(L, 'usageStats', {}).data.members.find(m => m.email === A);
    out.usage = JSON.stringify({ days: us.usage.days, opens: us.usage.opens, tabs: us.usage.tabs, alerter: us.usage.alerter, tasks: us.tasks, sales: us.sales });
    window.__USER = A; const code = JSON.parse(api('alertCode', {})).data.code; const al = alerts_(code);
    out.alerts = 'calls=' + al.calls.map(c => c.company + '@' + c.at.slice(11)).join(',') + ' tasks=' + al.tasks.length + ' now=' + al.now;
    out.calendar = run(A, 'calendar', { month: today_().slice(0, 7) }).data.calls.map(c => c.date.slice(8) + ' ' + c.company).join(',');
    const ev = run(L, 'evaluation', { email: A }).data;
    out.eval = JSON.stringify({ salesNote: ev.salesNote, calls: ev.calls.length, tasks: ev.tasks, usageDays: ev.usage.days });
    out.taskPerm = run(C, 'taskDone', { id: run(A, 'taskList').data[0].id }).error;
    window.__USER = A;
    return out;
  });
  Object.keys(r).forEach(k => log.push(k + ': ' + r[k]));
  // 화면: 영업노트 → 통화 결과 적기 모달, 액션플랜, 오늘 팝업, 팀 현황
  await p.evaluate(() => { closeModal(); go('sales'); }); await p.waitForTimeout(500); await p.screenshot({ path: dir + '/s_sales.png', fullPage: true });
  await p.evaluate(() => logForm(window._leads[0].id)); await p.waitForTimeout(200); await p.screenshot({ path: dir + '/s_log.png' });
  await p.evaluate(() => { closeModal(); go('plan'); }); await p.waitForTimeout(600); await p.screenshot({ path: dir + '/s_plan.png', fullPage: true });
  await p.evaluate(() => todayPopup()); await p.waitForTimeout(400); await p.screenshot({ path: dir + '/s_today.png' });
  const q = await b.newPage({ viewport: { width: 1280, height: 900 } }); q.on('pageerror', e => log.push('PAGEERR(lead) ' + e.message));
  await q.goto('file://' + dir + '/board_lead.html'); await q.waitForTimeout(900);
  await q.evaluate(() => { closeModal(); go('admin'); }); await q.waitForTimeout(700); await q.screenshot({ path: dir + '/s_admin.png', fullPage: true });
  await q.evaluate(() => { ST.calDay = B.today; go('calendar'); }); await q.waitForTimeout(600); await q.screenshot({ path: dir + '/s_cal.png', fullPage: true });
  const m = await b.newPage({ viewport: { width: 390, height: 844 } }); m.on('pageerror', e => log.push('PAGEERR(mobile) ' + e.message));
  await m.goto('file://' + dir + '/board_a.html'); await m.waitForTimeout(900);
  for (const t of ['sales', 'plan']) { await m.evaluate(t => { closeModal(); go(t); }, t); await m.waitForTimeout(500);
    const ov = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (ov > 0) log.push('모바일 ' + t + ' 가로 넘침 ' + ov); }
  await m.screenshot({ path: dir + '/s_mobile_plan.png', fullPage: true });
  console.log(log.join('\n')); await b.close();
})();
