const { chromium } = require('playwright');
(async () => {
  const dir=process.argv[2]; const b=await chromium.launch(); const p=await b.newPage();
  await p.goto('file://'+require('path').resolve(dir)+'/board_lead.html'); await p.waitForTimeout(900);
  const r=await p.evaluate(()=>{ window.__USER='lead@mymp.co.kr'; const out={};
    const m=(n,a,pl)=>{ window.__CALLS=0; api(a,pl||{}); out[n]=window.__CALLS; };
    m('첫 화면(bootstrap)','bootstrap'); m('계정별 실적','perf'); m('액션플랜','goalList'); m('실패 목록','failureList');
    m('공지','noticeList'); m('매체공지','mediaNoticeList'); m('캘린더','calendar',{month:today_().slice(0,7)}); m('팀 현황','teamStats');
    return out; });
  console.log(JSON.stringify(r)); await b.close();
})();
