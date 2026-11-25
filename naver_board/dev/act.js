const { chromium } = require('playwright');
(async () => {
  const dir = process.argv[2]; const b = await chromium.launch();
  const p = await b.newPage({ acceptDownloads: true, viewport:{width:1280,height:900} });
  const log=[]; p.on('pageerror', e => log.push('PAGEERR '+e.message));
  await p.goto('file://'+require('path').resolve(dir)+'/board_a.html'); await p.waitForTimeout(700);
  await p.click('text=모두 확인했어요'); await p.waitForTimeout(300);
  log.push('공지 배지 후: '+await p.evaluate(()=>B.badges.unread));
  await p.evaluate(()=>go('plan')); await p.waitForTimeout(400);
  await p.locator('.card.hot').first().locator('text=실패').click(); await p.waitForTimeout(200);
  await p.click('text=실패로 기록'); await p.waitForTimeout(300);
  log.push('사유 없이 실패: '+await p.textContent('#toast'));
  await p.fill('#c_reason','광고주 긴급 세팅'); await p.click('text=실패로 기록'); await p.waitForTimeout(400);
  log.push('사유 넣고 실패: '+await p.textContent('#toast'));
  await p.locator('text=달성').first().click().catch(()=>{}); 
  await p.evaluate(()=>closeModal());
  // 평가자료
  await p.waitForFunction(()=>window.XLSX, null, {timeout:15000}).catch(()=>log.push('XLSX 로드 실패(네트워크)'));
  await p.click('text=월별 평가자료 받기'); await p.waitForTimeout(200);
  const [dl] = await Promise.all([p.waitForEvent('download',{timeout:8000}).catch(()=>null), p.click('text=엑셀 받기')]);
  if (dl) { const f=dir+'/eval.xlsx'; await dl.saveAs(f); log.push('엑셀: '+dl.suggestedFilename()); }
  // 팀장: 소통완료
  const q = await b.newPage({viewport:{width:1280,height:900}}); q.on('pageerror', e => log.push('PAGEERR '+e.message));
  await q.goto('file://'+require('path').resolve(dir)+'/board_lead.html'); await q.waitForTimeout(600);
  await q.evaluate(()=>{closeModal();go('plan');}); await q.waitForTimeout(1000);
  const before = await q.evaluate(()=>B.badges.talk);
  await q.locator('button:has-text("소통완료")').first().click(); await q.waitForTimeout(200);
  await q.fill('#t_memo','다음 주 오전 작성 시간 고정'); await q.locator('.sheet button:has-text("소통완료")').click(); await q.waitForTimeout(500);
  log.push('소통 대기 '+before+' → '+await q.evaluate(()=>B.badges.talk));
  await q.evaluate(()=>go('calendar')); await q.waitForTimeout(400); await q.screenshot({path:dir+'/lead_cal2.png'});
  // 팀원이 남의 목표 조작 시도 (권한)
  log.push('권한: '+await q.evaluate(()=>{ window.__USER='a@mymp.co.kr'; const g=rows_('목표').find(x=>x['이메일']!=='a@mymp.co.kr'); return JSON.parse(api('checkSave',{goalId:g.id,result:'달성'})).error + ' / ' + JSON.parse(api('goalReview',{id:g.id,decision:'승인'})).error + ' / 남의 평가자료 이름: ' + JSON.parse(api('evaluation',{email:'c@mymp.co.kr'})).data.member.name; }));
  log.push('알리미: '+await q.evaluate(()=>{ window.__USER='a@mymp.co.kr'; const c=JSON.parse(api('alertCode',{})).data; const r=alerts_(c.code); return JSON.stringify({ok:r.ok,unread:r.unread.length,todo:r.todo.length,bad:alerts_('x'.repeat(20)).ok}); }));
  console.log(log.join('\n')); await b.close();
})();
