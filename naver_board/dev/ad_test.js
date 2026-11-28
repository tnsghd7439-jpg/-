// 광고 관리 점검: 가짜 변경이력 파일 → 보고문, 메모 저장·삭제, 권한(팀장만), 광고센터 바로가기, 시트 읽기 횟수, 390px 가로 넘침
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const dir = path.resolve(process.argv[2]); const b = await chromium.launch(); const log = []; let bad = 0;
  const ok = (name, cond, more) => { if (!cond) bad++; log.push((cond ? '통과 ' : '실패 ') + name + (more ? ' · ' + more : '')); };
  const day = (n) => { const d = new Date(Date.now() + 9 * 3600e3 + n * 864e5); return d.toISOString().slice(0, 10); };
  const T = day(0);
  // 광고센터 변경이력 다운로드 모양(report.py 가 읽는 칸 이름). 위에 안내 줄 2개, 변경 내용은 여러 줄.
  const rows = [['네이버 검색광고 변경이력'], ['조회기간', T + ' ~ ' + T], [],
    ['변경일자', '변경 유형', '변경자', '캠페인', '광고그룹', '변경 내용']];
  const D = (id, b, a) => id + '\n변경 전\n· ' + b + '\n변경 후\n· ' + a;
  for (let i = 1; i <= 3; i++) rows.push([T + ' 10:0' + i, '키워드 수정', 'tester', '쇼핑검색_주력상품', '그룹A', D('nkw-a001-01-00000' + i, '입찰가: ' + (500 + i * 100), '입찰가: ' + (400 + i * 80))]);
  rows.push([T + ' 10:10', '키워드 수정', 'tester', '파워링크_브랜드', '브랜드', D('nkw-a001-02-000001', '입찰가: 300', '입찰가: 360')]);
  rows.push([T + ' 10:12', '캠페인 수정', 'tester', '파워링크_브랜드', '', D('cmp-a001-02', '하루예산: 50,000', '하루예산: 70,000')]);
  rows.push([T + ' 10:20', '소재 수정', 'tester', '파워링크_일반키워드', '일반', D('nad-a001-03-000001', '상태: ON', '상태: OFF')]);
  rows.push([T + ' 10:30', '키워드 수정', 'tester', '쇼핑검색_신상품', '신상', D('nkw-a001-04-000001', '입찰가: 200', '입찰가: 260')]);
  rows.push([T + ' 10:40', '키워드 등록', 'tester', '파워링크_브랜드', '브랜드', 'nkw-a001-02-000009 등록']);
  rows.push([day(-3) + ' 09:00', '키워드 수정', 'tester', '파워링크_브랜드', '브랜드', D('nkw-a001-02-000002', '입찰가: 300', '입찰가: 250')]);
  const csv = '﻿' + rows.map(r => r.map(c => /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join(',')).join('\r\n');

  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', e => { bad++; log.push('PAGEERR ' + e.message); });
  await p.goto('file://' + dir + '/board_lead.html'); await p.waitForTimeout(900);
  await p.evaluate(() => { closeModal(); go('ad'); }); await p.waitForTimeout(600);

  const r = await p.evaluate(({ csv, rows }) => {
    const L = 'lead@mymp.co.kr', A = 'a@mymp.co.kr', out = {};
    const run = (u, a, pl) => { window.__USER = u; return JSON.parse(api(a, pl || {})); };
    window.__USER = L; window.__CALLS = 0; api('adList', {}); out.reads = window.__CALLS;
    const d = run(L, 'adList').data;
    out.accounts = d.accounts.map(a => a.name).join(',');
    out.order = [...document.querySelectorAll('.ad-card .ad-name')].map(e => e.textContent.trim().replace(/\s+/g, ' ')).join(' | ');
    out.links = [...document.querySelectorAll('.ad-card .ad-name a')].map(e => e.getAttribute('href'));
    out.campLink = (document.querySelector('.ad-look a') || { getAttribute() { return ''; } }).getAttribute('href');
    out.memberTab = (() => { window.__USER = A; const t = JSON.parse(api('bootstrap', {})).data.tabs.some(t => t.id === 'ad'); return t; })();
    out.memberList = run(A, 'adList').error; out.memberSave = run(A, 'adMemoSave', { cid: '3000007', kind: '통화', text: 'x' }).error;
    const id = run(L, 'adMemoSave', { cid: '3000002', name: '가상_꽃집', kind: '통화', text: '=충전 요청드림' }).data;
    out.memoSaved = run(L, 'adList').data.memos.filter(m => m.id === id).map(m => m.kind + ':' + m.text).join('');
    out.badKind = run(L, 'adMemoSave', { cid: '3000002', kind: '아무거나', text: 'x' }).error;
    out.empty = run(L, 'adMemoSave', { cid: '3000002', kind: '통화', text: ' ' }).error;
    out.memberDelete = run(A, 'adMemoDelete', { id }).error;
    out.deleted = run(L, 'adMemoDelete', { id }).data + '줄, 남은 것 ' + run(L, 'adList').data.memos.filter(m => m.id === id).length;
    run(L, 'adMemoSave', { cid: '3000001', kind: '기준효율', text: 450 }); run(L, 'adMemoSave', { cid: '3000001', kind: '기준효율', text: 400 });
    out.target = JSON.stringify(run(L, 'adList').data.targets) + ' 줄수 ' + rows_('광고메모').filter(x => x['분류'] === '기준효율').length;
    window.__USER = L;
    // 변경이력 읽기: csv(직접 읽기) + xlsx(SheetJS, 불러와졌을 때만)
    const ch = chRead(new TextEncoder().encode(csv).buffer, '변경이력.csv');
    out.parsed = ch.map(c => c.campaign + ':' + c.target + ':' + c.action + (c.delta ? '(' + c.delta.join('→') + ')' : '')).join(' / ');
    if (window.XLSX) {
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '변경이력');
      const x = chRead(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), '변경이력.xlsx');
      out.xlsx = JSON.stringify(x) === JSON.stringify(ch) ? '같음' : '다름: ' + x.length + '건';
    } else out.xlsx = '건너뜀(엑셀 도구를 못 받아옴 — 네트워크)';
    try { chRead(new TextEncoder().encode('이름,값\n1,2').buffer, 'x.csv'); out.wrongFile = '오류 없음'; } catch (e) { out.wrongFile = e.message.slice(0, 22); }
    // 보고문
    const a = d.accounts.find(x => x.customerId === '3000001'), ms = d.memos.filter(m => m.cid === '3000001');
    const base = { seed: 0, target: 400, changes: ch, reasons: {}, memos: ms, today: B.today, base: d.baseDate, now: new Date(B.today + 'T10:00:00'), me: '팀장' };
    const mk = (o) => adReportText(a, Object.assign({}, base, o));
    const day = mk({ type: 'day' }), day2 = mk({ type: 'day', seed: 1 }), typed = mk({ type: 'day', reasons: { [day.ask[0] ? day.ask[0].key : 'x']: '신상품 노출 확보' } });
    out.dayText = day.text; out.dayAsk = day.ask.map(g => g.campaign + ' ' + g.what).join(' / ');
    out.dayUsed = day.used + '건(' + day.day + ')'; out.varies = day.text !== day2.text; out.typedIn = typed.text.indexOf('신상품 노출 확보로') >= 0 && typed.ask.length === day.ask.length - 1;
    out.basis = day.groups.map(g => g.action + '=' + g.basis).join(', ');
    out.noFile = mk({ type: 'day', changes: null }).text;
    out.week = mk({ type: 'week', fmt: 'kakao' }).text; out.weekMail = mk({ type: 'week', fmt: 'mail' }).text;
    out.month = mk({ type: 'month', month: 'this', fmt: 'kakao' }).text; out.monthLast = mk({ type: 'month', month: 'last', fmt: 'mail' }).text;
    const old = d.accounts.find(x => x.customerId === '3000004');   // 새 합계 항목이 없는 예전 수집분
    const ow = adReportText(old, Object.assign({}, base, { type: 'week', changes: null, memos: [] })), om = adReportText(old, Object.assign({}, base, { type: 'month', month: 'this', changes: null, memos: [] }));
    out.oldData = (ow.text.match(/- 광고비 : .*/) || [''])[0] + ' / ' + (om.text.match(/- 효율 : .*/) || [''])[0] + ' / 안내 ' + (ow.note.length + om.note.length) + '개';
    out.all = [day.text, day2.text, out.noFile, out.week, out.weekMail, out.month, out.monthLast, ow.text, om.text].join('\n');
    return out;
  }, { csv, rows });

  ok('시트 읽기 2번 이하', r.reads <= 2, r.reads + '번');
  ok('내 담당만(팀원A 계정 제외)', r.accounts.indexOf('팀원A') < 0 && r.accounts.split(',').length === 6, r.accounts);
  ok('급한 순서(비즈머니 → 급감 → 예산 → 미수정 → 나머지)', /^가상_꽃집.*\| 가상_반려용품.*\| 가상_캠핑용품.*\| 가상_커피원두.*\| 가상_가구/.test(r.order), r.order);
  ok('계정 바로가기 주소', r.links[0] === 'https://ads.naver.com/manage/ad-accounts/900002/dashboard?accessManagerAccountNo=77001' && r.links[1] === 'https://ads.naver.com/manage/ad-accounts/900003/dashboard', r.links.slice(0, 2).join(' , '));
  ok('캠페인 바로가기 주소', r.campLink === 'https://ads.naver.com/manage/ad-accounts/900001/sa/campaigns/cmp-a001-02?accessManagerAccountNo=77001', r.campLink);
  ok('팀원에게 메뉴 안 보임', r.memberTab === false);
  ok('팀원 요청 막힘', /팀장만/.test(r.memberList) && /팀장만/.test(r.memberSave) && /팀장만/.test(r.memberDelete), r.memberList);
  ok('메모 저장(수식 실행 방지)', r.memoSaved === '통화:=충전 요청드림', r.memoSaved);
  ok('잘못된 분류·빈 메모 거절', !!r.badKind && !!r.empty, r.badKind + ' / ' + r.empty);
  ok('메모 삭제', r.deleted === '1줄, 남은 것 0', r.deleted);
  ok('기준 효율은 계정당 한 줄', r.target === '{"3000001":400} 줄수 1', r.target);
  ok('변경이력 읽기(9줄)', r.parsed.split(' / ').length === 9 && /입찰가 하향\(600→480\)/.test(r.parsed) && /캠페인:예산 상향\(50000→70000\)/.test(r.parsed) && /소재:OFF/.test(r.parsed) && /키워드:등록/.test(r.parsed), r.parsed);
  ok('엑셀로 읽어도 같은 결과', r.xlsx === '같음' || /^건너뜀/.test(r.xlsx), r.xlsx);
  ok('다른 파일은 안내', /변경이력 칸/.test(r.wrongFile), r.wrongFile);
  ok('당일: 오늘 변경만 사용', r.dayUsed === '8건(' + T + ')', r.dayUsed);
  ok('당일: 원인 → 조치 → 다음 계획', /쇼핑검색_주력상품\n- 캠페인 기준 최근 7일 .*310%.*키워드 3개 입찰가 평균 \d+% 하향 조정하였습니다\. /.test(r.dayText) && /일예산이 최근 7일 중 4일 일찍 소진되어 노출 확보를 위해 캠페인 예산 상향 조정하였습니다/.test(r.dayText));
  ok('당일: 메모가 이유로 들어감', /시즌 종료 대비로 소재 OFF 처리하였습니다/.test(r.dayText) && /주말 데이터 좀더 지켜보고/.test(r.dayText));
  ok('모르는 이유는 지어내지 않고 물음', /쇼핑검색_신상품/.test(r.dayAsk) && /- 키워드 입찰가 30% 상향 조정하였습니다/.test(r.dayText), r.dayAsk);
  ok('직접 적은 이유 반영', r.typedIn); ok('다른 표현으로 누르면 문장이 바뀜', r.varies);
  ok('엑셀 없이도 작성', /네이버 검색광고\n- /.test(r.noFile) && /400% 후반대/.test(r.noFile) && /시즌 종료 대비/.test(r.noFile));
  ok('주간: 숫자 줄·전주 비교·조정·계획', /- 광고비 : 910,150원/.test(r.week) && /- 효율 : 482%/.test(r.week) && /전주 대비 광고비는/.test(r.week) && /이번주 조정 내용\n- /.test(r.week) && /다음주 계획\n- 주말 데이터/.test(r.week) && /감사합니다!$/.test(r.week));
  ok('주간 메일: 제목·번호', /^제목: \[네이버 검색광고\] 주간 보고/.test(r.weekMail) && /\n1\. 성과/.test(r.weekMail) && /\n3\. 다음주 계획/.test(r.weekMail) && /감사합니다\.$/.test(r.weekMail));
  ok('월간: 누적 광고비·효율·전월 대비·제안', /- 효율 : 470%/.test(r.month) && /지난달 대비 일평균 광고비는/.test(r.month) && /주요 조정\n- /.test(r.month) && /제안드릴 내용\n- /.test(r.month));
  ok('월간(지난달 마감)', /- 광고비 : 3,720,000원/.test(r.monthLast) && /- 효율 : 520%/.test(r.monthLast));
  ok('예전 수집분은 "약"·최근 7일로 표시', /약 91만원/.test(r.oldData) && /최근 7일 640%/.test(r.oldData) && /안내 2개/.test(r.oldData), r.oldData);
  ok('이상한 글자 없음(undefined·NaN·null)', !/undefined|NaN|null|\[object/.test(r.all));
  ok('소재 ID·입찰가 원 단위는 문장에 안 넣음', !/n(ad|kw)-|cmp-|\d+원으로/.test(r.dayText));

  // 화면: 목록 → 메모 저장 → 보고문 창(파일 올리기·복사)
  await p.screenshot({ path: dir + '/ad_pc.png', fullPage: true });
  await p.fill('#am_t0', '충전 요청 드림'); await p.press('#am_t0', 'Enter'); await p.waitForTimeout(500);
  ok('화면에서 메모 저장', await p.evaluate(() => AD.memos.some(m => m.text === '충전 요청 드림')), await p.textContent('#toast'));
  const idx = await p.evaluate(() => AD.list.findIndex(a => a.customerId === '3000001'));
  await p.evaluate((i) => adReport(i), idx); await p.waitForTimeout(300);
  await p.setInputFiles('#rp_file', { name: '변경이력.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') }); await p.waitForTimeout(500);
  ok('창에서 파일 읽기', /변경 9건/.test(await p.textContent('.rp-opt')) && /하향 조정하였습니다/.test(await p.inputValue('#rp_text')), (await p.textContent('.rp-opt')).replace(/\s+/g, ' ').slice(0, 60));
  await p.screenshot({ path: dir + '/ad_report_pc.png' });
  await p.fill('.rp-ask input', '신상품 노출 확보'); await p.press('.rp-ask input', 'Tab'); await p.waitForTimeout(300);
  ok('창에서 이유 입력', /신상품 노출 확보로/.test(await p.inputValue('#rp_text')));
  await p.click('text=복사'); await p.waitForTimeout(300);
  ok('복사 버튼', /복사했어요|직접 선택/.test(await p.textContent('#toast')), await p.textContent('#toast'));
  await p.click('text=조정 내용 메모로 남기기'); await p.waitForTimeout(500);
  await p.click('.chip:has-text("주간")'); await p.waitForTimeout(300);
  ok('남긴 조정 메모가 있어도 엑셀과 겹쳐 쓰지 않음', await p.evaluate((T) => AD.memos.some(m => m.kind === '변경 요약') && !new RegExp('- ' + Number(T.slice(5, 7)) + '/' + Number(T.slice(8)) + ' 쇼핑검색').test(document.getElementById('rp_text').value), T));
  await p.click('.chip:has-text("메일용")'); await p.waitForTimeout(200); await p.screenshot({ path: dir + '/ad_week_pc.png' });
  await p.close();

  // 휴대폰(390px): 목록·보고문 창 가로 넘침
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  m.on('pageerror', e => { bad++; log.push('PAGEERR(mobile) ' + e.message); });
  await m.goto('file://' + dir + '/board_lead.html'); await m.waitForTimeout(900);
  await m.evaluate(() => { closeModal(); go('ad'); }); await m.waitForTimeout(600);
  const ov = () => m.evaluate(() => Math.max(document.documentElement.scrollWidth - window.innerWidth, (document.querySelector('.sheet') || { scrollWidth: 0, clientWidth: 0 }).scrollWidth - (document.querySelector('.sheet') || { clientWidth: 0 }).clientWidth));
  ok('휴대폰 목록 가로 넘침 없음', (await ov()) <= 0, (await ov()) + 'px');
  ok('휴대폰 더보기에 메뉴 있음', await m.evaluate(() => B.tabs.some(t => t.id === 'ad')));
  await m.screenshot({ path: dir + '/ad_mobile.png', fullPage: true });
  await m.evaluate((i) => adReport(i), idx); await m.waitForTimeout(300);
  await m.setInputFiles('#rp_file', { name: '변경이력.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') }); await m.waitForTimeout(500);
  ok('휴대폰 보고문 창 가로 넘침 없음', (await ov()) <= 0, (await ov()) + 'px');
  await m.screenshot({ path: dir + '/ad_report_mobile.png' });
  await m.close();

  console.log(log.join('\n'));
  console.log('\n── 당일 보고문(가짜 데이터) ──\n' + r.dayText + '\n\n── 주간(카톡) ──\n' + r.week + '\n\n── 월간(카톡) ──\n' + r.month);
  console.log(bad ? '\n실패 ' + bad + '건' : '\n모두 통과');
  await b.close(); process.exit(bad ? 1 : 0);
})();
