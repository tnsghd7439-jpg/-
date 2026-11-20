// MP AI 매출 가져오기 — 팀장 알리미만 사용합니다.
//
// MP AI는 회사 구글 로그인(IAP) 뒤에 있어서 서버가 직접 접속할 수 없습니다.
// 그래서 팀장 크롬에서 MP AI 탭을 (필요하면 뒤에서) 열고, 그 탭 안에서 조회를 실행합니다.
// 탭 안에서 실행하므로 팀장의 로그인 상태가 그대로 쓰입니다. 로그인 정보는 어디에도 저장하지 않습니다.

const MPAI_ORIGIN = 'https://mpai.mymp.co.kr';

/**
 * MP AI 탭 안에서 실행되는 함수. from~to 기간의 광고주별 매출을 돌려줍니다.
 * 돌려줄 형식: [{ 매체, 광고주ID, 광고주명, 담당자, 매출 }]
 *
 * TODO(MP AI 조회 주소 확인 후 채움): MP AI '내 광고매출' 화면이 쓰는 조회 요청을 HAR 로 확인한 뒤
 * 아래 fetch 부분을 실제 주소·파라미터·응답 필드에 맞게 바꿉니다. 지금은 연결 전 상태를 알려줍니다.
 */
function mpaiFetchRangeInPage(from, to) {
  return { ok: false, error: 'MP AI 조회 방식이 아직 연결되지 않았어요. (개발자: mpai.js 의 조회 부분 채우기 필요)', from: from, to: to };
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
  return out.rows || out;
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
