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
      rows.push({ 매체: m.label || m.key, 광고주ID: String(a.id), 광고주명: a.name || '', 담당자: owner, 매출: Math.round(amt) });
    }));
    add(mine, true);
    add(all, false);
    return { ok: true, rows: rows, dataFrom: mine.dataFrom || '' };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

async function mpaiTab() {
  const tabs = await chrome.tabs.query({ url: MPAI_ORIGIN + '/*' });
  if (tabs.length) return { tab: tabs[0], opened: false };
  const tab = await chrome.tabs.create({ url: MPAI_ORIGIN + '/', active: false });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const t = await chrome.tabs.get(tab.id);
    if (t.status === 'complete') return { tab: t, opened: true };
  }
  return { tab: await chrome.tabs.get(tab.id), opened: true };
}

async function mpaiRange(tabId, from, to) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN', func: mpaiFetchRangeInPage, args: [from, to],
  });
  const out = res && res.result;
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
    const r = await fetch(boardUrl, {
      method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ code, daily: { dates, rows: daily }, monthly: { months: monthKeys, rows: monthly } }),
    });
    const res = JSON.parse(await r.text());
    if (!res.ok) throw new Error(res.error || '원보드 기록에 실패했어요.');
    return { daily: daily.length, monthly: monthly.length };
  } finally {
    if (opened) chrome.tabs.remove(tab.id).catch(() => {});
  }
}
