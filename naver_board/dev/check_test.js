// 오늘 점검(일일점검 흡수) 점검: 실제 일일점검 화면 틀 + 수집 결과를 원보드에 넣고 팀장·팀원 화면 확인
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const dir = path.resolve(process.argv[2]), sa = process.argv[3];
  const data = JSON.parse(fs.readFileSync(sa, 'utf8'));
  const tpl = fs.readFileSync(path.resolve(__dirname, '../../naver_dash/dashboard.html'), 'utf8');
  const owner = (data.accounts.find(a => a.owners && a.owners.length) || { owners: ['미지정'] }).owners[0];
  const b = await chromium.launch(); const log = [];
  for (const who of ['lead', 'a']) {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    p.on('pageerror', e => log.push(`[${who}] PAGEERR ` + e.message));
    await p.goto('file://' + dir + `/board_${who}.html`); await p.waitForTimeout(900);
    const r = await p.evaluate(({ data, tpl, owner }) => {
      // 팀원A 를 실제 데이터의 담당자 이름과 연결(테스트용)
      update_('팀원', '이메일', 'a@mymp.co.kr', { '담당자명': owner });
      const tok = settings_()['수집토큰'];
      const res = JSON.parse(doPost({ postData: { contents: JSON.stringify({ token: tok, sa: { data, template: tpl },
        intraChecks: { date: today_(), transfers: [{ '구분': '신규', '상태': '완료', '매체': '네이버', '광고주명': '테스트상사', '담당자': owner, '신청일': today_(), '전월매출': 0 }],
          missing: [{ '매체': '네이버', '광고주명': '정보누락상사', '담당자': '다른사람', '월매출': 120000, '누락항목': '사업자번호' }], fees: [] } }) } }).text);
      const prev = ContentService.createTextOutput; let prevTxt = '';
      const g = doGet({ parameter: { api: 'saPrev', token: tok } }); prevTxt = g.text || '';
      const bad = doGet({ parameter: { api: 'saPrev', token: 'x' } }).text;
      return { res, prevOk: prevTxt.indexOf('"accounts"') >= 0, bad };
    }, { data, tpl, owner });
    if (who === 'lead') log.push('저장: ' + JSON.stringify(r.res) + ' / 전날 결과 되받기 ' + r.prevOk + ' / 잘못된 토큰 ' + r.bad);
    const v = await p.evaluate(() => { window.__USER = window.__AS; const d = JSON.parse(api('checkView', {})).data;
      return { empty: d.empty, accounts: d.data ? d.data.accounts.length : 0, personal: d.data ? d.data.personal || '(전체)' : '', intra: d.intra ? [d.intra.transfers.length, d.intra.missing.length].join('/') : '' }; });
    log.push(`[${who}] 오늘 점검: ` + JSON.stringify(v));
    await p.evaluate(() => { closeModal(); go('check'); }); await p.waitForTimeout(2500);
    const links = await p.evaluate(() => { const f = document.getElementById('saFrame'); if (!f) return 'iframe 없음';
      const as = [...f.contentDocument.querySelectorAll('a[href*="ads.naver.com"]')].map(a => a.getAttribute('href'));
      return as.length + '개, 예: ' + (as[0] || '').replace(/ad-accounts\/\d+/, 'ad-accounts/…').replace(/=\d+/, '=…') + ' / 높이 ' + f.offsetHeight; });
    log.push(`[${who}] 광고센터 바로가기: ` + links);
    await p.screenshot({ path: dir + `/c_${who}.png`, fullPage: true });
    await p.close();
  }
  console.log(log.join('\n')); await b.close();
})();
