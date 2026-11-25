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
    const ll = run(A, 'leadList').data;
    out.leads = (ll.error || '오류없음') + ' / ' + ll.leads.map(l => l.grade + ':' + l.company + (l.overdue ? '(지남)' : l.due ? '(오늘)' : '')).join(' | ');
    out.otherCannotSee = run(C, 'leadList').data.leads.map(l => l.company).join(',') + ', 남의 가망건 기록=' + run(C, 'leadHistory', { id: window.__L1 }).error;
    out.leadSeesAll = run(L, 'leadList', {}).data.leads.length;
    out.history = run(A, 'leadHistory', { id: window.__L1 }).data.map(c => c.result + ' ' + c.memo).join(',');
    const imp = run(A, 'taskImport', { items: parseTodos({ todos: [
      { text: '광고비 소진 체크', category: '관리', repeat: 'daily', time: '10:00' },
      { title: '견적 회신', done: true },
      { title: '[바른김치] 영업 다음 연락 · 11/12 14:00' },
      { title: '주간 리포트 발송', type: '영업', repeat: 'weekly', days: [1, 3] },
      { title: '비즈머니 잔액 확인', repeat: '매일' } ] }).items }).data;
    out.import = JSON.stringify(imp) + ' 할일수=' + run(A, 'taskList').data.length;
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
  const order = await p.evaluate(() => [...document.querySelectorAll('.card')].map(c => (c.querySelector('.t') || {}).textContent + ': ' + [...c.querySelectorAll('.lead-row b')].filter(b => !b.closest('.when')).map(b => b.textContent).join(',')).join(' / '));
  log.push('화면 순서: ' + order);
  await p.evaluate(() => { ST.salesDue = '기한 지남'; viewSales(); }); await p.waitForTimeout(400);
  log.push('기한 지남만: ' + await p.evaluate(() => [...document.querySelectorAll('.lead-row')].length + '건'));
  await p.evaluate(() => { ST.salesDue = '전체'; openLead('N7'); }); await p.waitForTimeout(500);
  log.push('바로가기 강조: ' + await p.evaluate(() => (document.querySelector('.lead-row.flash') || {}).id));
  await p.evaluate(() => { closeModal(); go('task'); }); await p.waitForTimeout(500); await p.screenshot({ path: dir + '/s_task.png', fullPage: true });
  await p.evaluate(() => importForm()); await p.waitForTimeout(200); await p.screenshot({ path: dir + '/s_import.png' });
  await p.evaluate(() => { closeModal(); go('plan'); }); await p.waitForTimeout(600); await p.screenshot({ path: dir + '/s_plan.png', fullPage: true });
  await p.evaluate(() => todayPopup()); await p.waitForTimeout(400); await p.screenshot({ path: dir + '/s_today.png' });
  const q = await b.newPage({ viewport: { width: 1280, height: 900 } }); q.on('pageerror', e => log.push('PAGEERR(lead) ' + e.message));
  await q.goto('file://' + dir + '/board_lead.html'); await q.waitForTimeout(900);
  await q.evaluate(() => { closeModal(); go('admin'); }); await q.waitForTimeout(700); await q.screenshot({ path: dir + '/s_admin.png', fullPage: true });
  await q.evaluate(() => { ST.calDay = B.today; go('calendar'); }); await q.waitForTimeout(600); await q.screenshot({ path: dir + '/s_cal.png', fullPage: true });
  const m = await b.newPage({ viewport: { width: 390, height: 844 } }); m.on('pageerror', e => log.push('PAGEERR(mobile) ' + e.message));
  await m.goto('file://' + dir + '/board_a.html'); await m.waitForTimeout(900);
  for (const t of ['sales', 'task', 'plan']) { await m.evaluate(t => { closeModal(); go(t); }, t); await m.waitForTimeout(500);
    const ov = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (ov > 0) log.push('모바일 ' + t + ' 가로 넘침 ' + ov); }
  await m.screenshot({ path: dir + '/s_mobile_plan.png', fullPage: true });
  console.log(log.join('\n')); await b.close();
})();
