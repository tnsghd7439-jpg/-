// MP AI 매출 가져오기 — 팀장 알리미만 사용합니다.
//
// MP AI는 회사 구글 로그인(IAP) 뒤에 있어서 서버가 직접 접속할 수 없습니다.
// 그래서 팀장 크롬에서 MP AI 탭을 (필요하면 뒤에서) 열고, 그 탭 안에서 조회를 실행합니다.
// 탭 안에서 실행하므로 팀장의 로그인 상태가 그대로 쓰입니다. 로그인 정보는 어디에도 저장하지 않습니다.

const MPAI_ORIGIN = 'https://mpai.mymp.co.kr';

/**
 * MP AI 탭 안에서 실행되는 함수(그 탭의 로그인으로 조회). from~to 기간의 광고주별 광고비를 돌려줍니다.
 * '내 광고매출' 화면과 같은 조회를 씁니다: /api/my-adv/accounts (내 광고주 + 팀원 전체)
 *  - 금액: MP AI가 계산한 공급가액(cost_supply). 쿠팡처럼 공급가액이 없는 매체는 cost_raw.
 *  - 매출공유 계정: MP AI가 공유 비율을 반영한 금액을 줍니다. 팀원 계정을 팀장에게 공유한 건은
 *    팀원 쪽에서 세므로 팀장 쪽에서는 뺍니다(이중 집계 방지).
 *  - 담당자: 팀원은 MP AI의 담당자 이메일, 팀장 본인 계정은 비워 보내면 원보드가 팀장으로 채웁니다.
 * 돌려줄 형식: { ok, rows: [{ 매체, 광고주ID, 광고주명, 담당자, 매출 }] }
 */
async function mpaiFetchRangeInPage(from, to) {
  try {
    const getJson = async (path) => {
      const r = await fetch(path, { credentials: 'same-origin', headers: { accept: '*/*' } });
      const ct = r.headers.get('content-type') || '';
      if (!r.ok || ct.indexOf('json') < 0) {
        throw new Error(r.status === 401 || r.status === 403 || ct.indexOf('html') >= 0
          ? 'MP AI 로그인이 필요해요. 크롬에서 MP AI에 다시 로그인하세요.' : 'MP AI 응답 오류(' + r.status + ')');
      }
      return r.json();
    };
    const q = (extra) => '/api/my-adv/accounts?scope=live' + extra + '&view=marketer&from=' + from + '&to=' + to + '&cmp=1';
    const team = await getJson('/api/my-adv/team');
    const teamEmails = (team.members || []).map((m) => String(m.email || '').toLowerCase());
    const mine = await getJson(q(''));
    const all = teamEmails.length ? await getJson(q('&members=all')) : { media: [] };
    const rows = [];
    const add = (data, isMine) => (data.media || []).forEach((m) => (m.accounts || []).forEach((a) => {
      const x = a.metrics || {};
      const amt = Number(x.cost_supply) || Number(x.cost_raw) || 0;
      if (!amt) return;
      let owner = String(a.owner || '').toLowerCase();
      if (isMine) {
        if (a.via === 'share' && teamEmails.indexOf(owner) >= 0) return;
        owner = '';
      }
      // 매출공유 계정은 MP AI의 공유 비율만큼만 반영 (월간보고 기준: 라이프밀 50% 등)
      const ratio = a.via === 'share' && Number(a.shareRatio) > 0 && Number(a.shareRatio) < 100 ? Number(a.shareRatio) : 0;
      const val = ratio ? amt * ratio / 100 : amt;
      rows.push({ 매체: m.label || m.key, 광고주ID: String(a.id), 광고주명: a.name || '', 담당자: owner, 매출: Math.round(val), 공유비율: ratio || '' });
    }));
    add(mine, true);
    add(all, false);
    return { ok: true, rows: rows, dataFrom: mine.dataFrom || '' };
  } catch (e) {
    const m = String((e && e.message) || e);
    // MP AI 구글 보안(IAP) 로그인이 만료되면 조회가 로그인 화면으로 튕겨 'Failed to fetch'가 됩니다
    return { ok: false, expired: /Failed to fetch|NetworkError/i.test(m), error: /Failed to fetch|NetworkError/i.test(m) ? 'MP AI 로그인이 만료됐어요' : m };
  }
}

/**
 * MP AI 매체 공지(/mp_notice/api/data). 최근 60일 게시분과 신청 마감이 남은 것만 보냅니다.
 */
async function mpaiNoticesInPage(today) {
  try {
    const r = await fetch('/mp_notice/api/data', { credentials: 'same-origin', headers: { accept: '*/*' } });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || ct.indexOf('json') < 0) return { ok: false, error: 'MP AI 공지 응답 오류(' + r.status + (ct ? ', ' + ct.split(';')[0] : '') + ')' };
    const d = await r.json();
    const from = new Date(new Date(today + 'T00:00:00Z').getTime() - 60 * 864e5).toISOString().slice(0, 10);
    const keep = ['id', 'media', 'title', 'headline', 'summary', 'sales', 'url', 'published', 'impact', 'type', 'product',
      'apply_start', 'deadline', 'event_start', 'event_end', 'period', 'digest'];
    const list = (d.notices || []).filter((n) => (n.published || '') >= from || (n.deadline || '') >= today).map((n) => {
      const o = {}; keep.forEach((k) => { o[k] = n[k]; }); return o;
    });
    return { ok: true, list };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/**
 * 매체 공지는 MP AI 안의 별도 앱(/mp_notice/)이라, 그 화면을 먼저 열어야 데이터를 줍니다.
 * 공지 화면을 뒤에서 잠깐 열어 그 안에서 가져온 뒤 닫습니다.
 */
async function mpaiNotices(today) {
  const tab = await chrome.tabs.create({ url: MPAI_ORIGIN + '/mp_notice/', active: false });
  try {
    let t = tab;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      t = await chrome.tabs.get(tab.id);
      if (t.status === 'complete') break;
    }
    if (!t.url || !t.url.startsWith(MPAI_ORIGIN + '/mp_notice')) {
      return { ok: false, error: 'MP AI 공지 화면을 열지 못했어요(로그인 확인)' };
    }
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: mpaiNoticesInPage, args: [today] });
    return (res && res.result) || { ok: false, error: 'MP AI 공지 조회 결과가 없어요' };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function postBoard(boardUrl, body) {
  let r;
  try {
    r = await fetch(boardUrl, {
      method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('원보드에 보내는 중 연결이 끊겼어요(' + String((e && e.message) || e) + ')');
  }
  const text = await r.text();
  try { return JSON.parse(text); } catch (e) {
    throw new Error('원보드 응답을 읽지 못했어요(' + r.status + '). 외부연결용 배포가 최신 버전인지 확인하세요.');
  }
}

/**
 * 열려 있던 MP AI 탭은 로그인(IAP)이 만료됐을 수 있어 재사용하지 않습니다.
 * 매번 새 탭을 뒤에서 열어 로그인을 새로 받은 뒤 조회하고, 끝나면 닫습니다.
 */
async function waitLoaded(tabId) {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const t = await chrome.tabs.get(tabId);
    if (t.status === 'complete') return t;
  }
  return chrome.tabs.get(tabId);
}

async function mpaiTab() {
  const tab = await chrome.tabs.create({ url: MPAI_ORIGIN + '/my-advertisers', active: false });
  return { tab: await waitLoaded(tab.id), opened: true };
}

async function mpaiRange(tabId, from, to) {
  const run = async () => {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId }, world: 'MAIN', func: mpaiFetchRangeInPage, args: [from, to],
    });
    return res && res.result;
  };
  let out = await run();
  if (out && out.expired) {
    // 로그인이 만료됐으면 탭을 새로고침해서 로그인을 새로 받고 한 번 더
    await chrome.tabs.reload(tabId);
    const t = await waitLoaded(tabId);
    if (!t.url || !t.url.startsWith(MPAI_ORIGIN)) {
      throw new Error('MP AI 로그인이 필요해요. 크롬에서 MP AI에 다시 로그인한 뒤 지금 가져오기를 누르세요.');
    }
    out = await run();
  }
  if (!out || out.ok === false) throw new Error((out && out.error) || 'MP AI 조회에 실패했어요.');
  await new Promise((r) => setTimeout(r, 300)); // MP AI에 부담 주지 않게 조회 사이 간격
  return out.rows;
}

const ymd = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
function kstToday() { return ymd(new Date()); }
function shift(s, n) { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function monthStart(s, n) { const d = new Date(s.slice(0, 7) + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); }

/**
 * 최근 days 일의 일별 + 최근 months 개월의 월합계를 모아 원보드로 보냅니다.
 * 평소: 3일 + 2개월. 처음 한 번(이력 채우기): 62일 + 7개월.
 */
async function syncMpai(days, months) {
  const { connect } = await chrome.storage.local.get('connect');
  if (!connect) throw new Error('연결 코드를 먼저 넣어주세요.');
  const [boardUrl, code] = connect.split('#');
  const { tab, opened } = await mpaiTab();
  try {
    if (!tab.url || !tab.url.startsWith(MPAI_ORIGIN)) {
      throw new Error('MP AI 로그인이 필요해요. 크롬에서 MP AI에 한 번 로그인한 뒤 다시 시도하세요.');
    }
    const today = kstToday();
    const dates = [], daily = [];
    for (let i = 1; i <= days; i++) {
      const d = shift(today, -i);
      dates.push(d);
      (await mpaiRange(tab.id, d, d)).forEach((r) => daily.push(Object.assign({ 날짜: d }, r)));
    }
    const monthKeys = [], monthly = [];
    for (let i = 0; i < months; i++) {
      const from = monthStart(today, -i);
      const end = shift(monthStart(today, -i + 1), -1);
      const to = end < shift(today, -1) ? end : shift(today, -1);
      if (to < from) continue;
      monthKeys.push(from.slice(0, 7));
      (await mpaiRange(tab.id, from, to)).forEach((r) => monthly.push(Object.assign({ 월: from.slice(0, 7) }, r)));
    }
    // 1) 매출 먼저 저장
    const res = await postBoard(boardUrl, { code, daily: { dates, rows: daily }, monthly: { months: monthKeys, rows: monthly } });
    if (!res.ok) throw new Error(res.error || '원보드 기록에 실패했어요.');
    // 2) 매체 공지는 따로 보냅니다. 실패해도 매출은 이미 저장돼 있습니다
    let noticeMsg;
    try {
      const nres = await mpaiNotices(today);
      if (!nres.ok) throw new Error(nres.error);
      const nr = await postBoard(boardUrl, { code, mediaNotices: nres.list });
      if (!nr.ok) throw new Error(nr.error || '원보드 공지 기록 실패');
      noticeMsg = nres.list.length;
    } catch (e) {
      noticeMsg = '실패(' + String((e && e.message) || e) + ')';
    }
    return { daily: daily.length, monthly: monthly.length, notices: noticeMsg };
  } finally {
    if (opened) chrome.tabs.remove(tab.id).catch(() => {});
  }
}
