// 운영 기능 점검: 토큰 보관·만료 경고 메일·MP AI 멈춤 메일·자동 업데이트·팀원 추가
const { chromium } = require('playwright');
(async () => {
  const dir = process.argv[2];
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + require('path').resolve(dir) + '/board_lead.html'); await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const out = {}, P = window.__PROPS, J = (a, pl) => JSON.parse(api(a, pl || {}));
    window.__USER = 'lead@mymp.co.kr';
    // 1) 토큰: 설정 칸 → 내부 저장소, 칸에는 안내 글
    MEMO_ = {}; ensureKick_(); MEMO_ = {};
    update_('설정', '키', '깃허브토큰', { '값': 'github_pat_TESTTOKEN1234567890abcdef' }); MEMO_ = {};
    const t = ghToken_(); MEMO_ = {};
    out['토큰 이동'] = [t === P.GH_TOKEN, settings_()['깃허브토큰'].indexOf('github_pat_') < 0];
    // 2) 예약 실행: 저장된 토큰으로 요청, 만료일 기억, 13시 이후 메일
    const realToday = today_, realNow = now_;
    // 가짜 오늘: 실제 오늘 +3일 뒤의 평일(→ MP AI 매출이 어제까지 안 들어온 상태), 15:20(15:15 예약 직후)
    let fd = addDays_(realToday(), 3); while ([0, 6].indexOf(dt_(fd).getUTCDay()) >= 0) fd = addDays_(fd, 1);
    window.today_ = () => fd; window.now_ = () => fd + ' 15:20';
    window.__FETCH.length = 0; window.__MAIL.length = 0;
    kickRunner();
    const auth = (window.__FETCH[0] || { o: { headers: {} } }).o.headers.Authorization;
    out['저장 토큰 사용'] = auth === 'Bearer github_pat_TESTTOKEN1234567890abcdef';
    out['만료일'] = P.GH_EXP;
    MEMO_ = {}; delete P.WATCH_DAY; window.__MAIL.length = 0; kickRunner();
    out['메일'] = window.__MAIL.map(m => m.to + ' / ' + m.body.split('\n').filter(l => l[0] === '·').map(l => l.slice(0, 26)).join(' | '));
    MEMO_ = {}; kickRunner(); out['하루 한 번'] = window.__MAIL.length;
    // 3) 자동 업데이트(가짜 Apps Script API): 접근 설정이 다른 배포 2개 → 버전 2개, 배포 2번 변경
    const calls = [];
    const big = 'function doGet(){}\nfunction selfUpdate_(){}\n' + 'x'.repeat(60000), html = '<html>' + 'y'.repeat(60000) + '</html>';
    let ver = 10, sha = 'aaaaaaa1111';
    window.__FETCH_FN = (url, o) => {
      const m = (o.method || 'get').toLowerCase();
      if (url.indexOf('/commits?') > 0) return { body: [{ sha: sha }] };
      if (url.indexOf('raw.githubusercontent.com') > 0) return { body: url.indexOf('Code.gs') > 0 ? big : html };
      if (url.indexOf('script.googleapis.com') < 0) return null;
      calls.push(m + ' ' + url.split('/projects/SID')[1].split('?')[0] + (o.payload && url.indexOf('/content') > 0 ? ' ' + JSON.parse(JSON.parse(o.payload).files.find(f => f.name === 'appsscript').source).webapp.access : '') + (o.payload && url.indexOf('/deployments/') > 0 ? ' v' + JSON.parse(o.payload).deploymentConfig.versionNumber : ''));
      if (url.indexOf('/content') > 0 && m === 'get') return { body: { files: [{ name: 'appsscript', type: 'JSON', source: '{"timeZone":"Asia/Seoul","oauthScopes":["a"]}' }, { name: 'Code', type: 'SERVER_JS', source: 'old' }, { name: 'Index', type: 'HTML', source: 'old' }] } };
      if (url.indexOf('/deployments') > 0 && m === 'get') return { body: { deployments: [
        { deploymentId: 'HEAD', deploymentConfig: {}, entryPoints: [{ webApp: {} }] },
        { deploymentId: 'D1', deploymentConfig: { versionNumber: 5, description: '보드용' }, entryPoints: [{ webApp: { entryPointConfig: { access: 'DOMAIN', executeAs: 'USER_DEPLOYING' } } }] },
        { deploymentId: 'D2', deploymentConfig: { versionNumber: 5, description: '외부연결용' }, entryPoints: [{ webApp: { entryPointConfig: { access: 'ANYONE_ANONYMOUS', executeAs: 'USER_DEPLOYING' } } }] }] } };
      if (url.indexOf('/versions') > 0) return { body: { versionNumber: ++ver } };
      return { body: {} };
    };
    MEMO_ = {};
    out['첫 연결 전 자동 실행 안 함'] = P.UPD_ON !== '1' && calls.length === 0;
    out['첫 실행(기준 잡기)'] = selfUpdate_(false).msg.slice(0, 12) + ' / API ' + calls.length;
    out['변경 없음'] = selfUpdate_(false).same === true;
    sha = 'bbbbbbb2222';
    const u = selfUpdate_(false);
    out['변경 적용'] = [u.ok, calls.join(', ')];
    out['적용 뒤 켜짐'] = P.UPD_ON === '1' && P.UPD_SEEN.indexOf('bbbbbbb') === 0;
    // 이상한 파일은 거부, 3번 실패하면 멈춤
    sha = 'ccccccc3333'; const keepBig = big; calls.length = 0;
    const bad = window.__FETCH_FN; window.__FETCH_FN = (url, o) => url.indexOf('Code.gs') > 0 && url.indexOf('raw.') > 0 ? { body: 'oops' } : bad(url, o);
    const errs = [];
    for (let i = 0; i < 4; i++) { try { const x = selfUpdate_(false); errs.push(x.ok ? 'ok' : 'stop'); } catch (e) { errs.push('거부'); } }
    out['이상한 파일'] = errs.join(',') + ' / API ' + calls.length;
    out['팀원이 누르면'] = (() => { window.__USER = 'a@mymp.co.kr'; MEMO_ = {}; const x = J('updateSave'); window.__USER = 'lead@mymp.co.kr'; MEMO_ = {}; return x.error; })();
    window.__FETCH_FN = null;
    // 4) 팀원 추가·빼기·추천
    const n0 = members_().length;
    J('memberDelete', { email: 'a@mymp.co.kr' }); MEMO_ = {}; out['추천(명단에 없는 영업노트 사용자)'] = J('memberHints').data.map(x => x.name || x.email).join(',');
    J('memberSave', { email: 'a@mymp.co.kr', name: '팀원A' }); MEMO_ = {};
    out['추가'] = [J('memberSave', { email: 'New1@mymp.co.kr', name: '신입일' }).data, J('memberSave', { email: 'new1@mymp.co.kr', name: '신입일', manager: '신입1' }).data];
    MEMO_ = {}; out['명단'] = n0 + ' → ' + members_().length + ' (' + members_().filter(m => m.email === 'new1@mymp.co.kr').map(m => m.manager).join() + ')';
    out['잘못된 이메일'] = J('memberSave', { email: 'abc', name: 'x' }).error;
    J('memberDelete', { email: 'new1@mymp.co.kr' }); MEMO_ = {}; out['빼기'] = members_().length;
    out['본인 빼기'] = J('memberDelete', { email: 'lead@mymp.co.kr' }).error;
    window.__USER = 'a@mymp.co.kr'; MEMO_ = {}; out['팀원 권한'] = J('memberSave', { email: 'z@mymp.co.kr', name: 'z' }).error;
    window.today_ = realToday; window.now_ = realNow;
    return out;
  });
  Object.keys(r).forEach(k => console.log(k + ': ' + JSON.stringify(r[k])));
  // 화면: 팀 현황 줄과 팀원 추가 창
  await p.evaluate(() => { window.__USER = 'lead@mymp.co.kr'; cclear(); go('admin'); }); await p.waitForTimeout(1200);
  console.log('팀 현황 줄: ' + (await p.evaluate(() => (document.querySelector('#view .card') || {}).innerText || '').then(t => t.replace(/\n+/g, ' | '))));
  await p.evaluate(() => memberForm()); await p.waitForTimeout(600);
  console.log('팀원 추가 창: ' + (await p.evaluate(() => $('modal').innerText.replace(/\n+/g, ' | ').slice(0, 160))));
  await b.close();
})();
