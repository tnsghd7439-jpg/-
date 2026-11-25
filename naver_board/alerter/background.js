// 원보드 알리미 — 크롬이 켜져 있으면 보드 창이 닫혀 있어도 동작합니다.
// 5분마다 원보드에 물어보고,
//  - 영업노트 다음 연락 시각이 되면 바로 알림 (누르면 그 가망건의 통화 결과 화면이 열림)
//  - 새 공지는 바로, 확인 안 한 공지는 1시간마다 다시 알림 (확인할 때까지 닫히지 않는 알림)
//  - 오늘 할 일은 아침 알림 시각 이후 하루 한 번
importScripts('mpai.js');

const POLL_MIN = 5;
const REMIND_MS = 60 * 60 * 1000;

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
function schedule() {
  chrome.alarms.create('poll', { periodInMinutes: POLL_MIN, delayInMinutes: 0.2 });
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'poll') poll(false); });
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg && msg.type === 'poll') { poll(true).then(reply); return true; }
  if (msg && msg.type === 'sync') { runSync(msg.backfill).then(reply); return true; }
  return false;
});

async function fetchAlerts() {
  const { connect } = await chrome.storage.local.get('connect');
  if (!connect || connect.indexOf('#') < 0) return { ok: false, error: '연결 코드를 넣어주세요.' };
  const [url, code] = connect.split('#');
  try {
    const v = chrome.runtime.getManifest().version;
    const r = await fetch(url + '?api=alerts&v=' + v + '&code=' + encodeURIComponent(code), { redirect: 'follow', cache: 'no-store' });
    const text = await r.text();
    try { return JSON.parse(text); } catch (e) {
      return { ok: false, error: '원보드 응답을 읽지 못했어요. 연결 코드의 주소가 "외부 연결용" 배포 주소인지 확인하세요.' };
    }
  } catch (e) {
    return { ok: false, error: '원보드에 연결하지 못했어요. 인터넷 연결을 확인하세요.' };
  }
}

async function poll(manual) {
  const d = await fetchAlerts();
  const st = await chrome.storage.local.get(['seen', 'lastNotice', 'lastTodo', 'lastLead', 'calledAt']);
  await chrome.storage.local.set({ last: d, checkedAt: Date.now() });
  if (!d.ok) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#b42318' });
    return d;
  }
  const unread = d.unread || [];
  chrome.action.setBadgeText({ text: unread.length ? String(unread.length) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#c2410c' });

  const seen = st.seen || [];
  const fresh = unread.filter((n) => seen.indexOf(n.id) < 0);
  const due = !st.lastNotice || Date.now() - st.lastNotice >= REMIND_MS;
  if (unread.length && (fresh.length || due || manual)) {
    const head = fresh.length ? '새 공지가 올라왔어요' : `확인하지 않은 공지 ${unread.length}건`;
    notify('notice', head, unread.slice(0, 4).map((n) => (n.important ? '[중요] ' : '') + n.title).join('\n'), true);
    await chrome.storage.local.set({ lastNotice: Date.now() });
  }
  if (!unread.length) await chrome.storage.local.remove('lastNotice');
  await chrome.storage.local.set({ seen: unread.map((n) => n.id) });

  // 영업노트: 연락 시각이 된 가망건(5분 전부터)을 한 번씩 알림. 시각을 바꾸면 다시 알림
  const calledAt = st.calledAt || {};
  const soon = d.now ? addMin(d.now, 5) : '';
  for (const c of (d.calls || [])) {
    const key = c.id + '|' + c.at;
    if (soon && c.at <= soon && !calledAt[key]) {
      notify('call:' + c.id, `📞 ${c.company} 연락할 시간이에요 (${c.at.slice(11)})`, (c.memo || '통화 결과를 적으면 다음 연락을 다시 알려드려요') + (c.phone ? '\n' + c.phone : ''), true);
      calledAt[key] = Date.now();
    }
  }
  const keep = {};
  Object.keys(calledAt).filter((k) => Date.now() - calledAt[k] < 7 * 864e5).forEach((k) => { keep[k] = calledAt[k]; });
  await chrome.storage.local.set({ calledAt: keep });

  const todo = (d.todo || []).filter((t) => !t.checked);
  if (d.hour >= d.morningHour && st.lastTodo !== d.today) {
    const lines = [];
    if ((d.calls || []).length) lines.push(`📞 오늘 연락할 곳 ${d.calls.length}곳: ` + d.calls.slice(0, 3).map((c) => c.at.slice(11) + ' ' + c.company).join(', '));
    if ((d.tasks || []).length) lines.push(`✅ 오늘 할일 ${d.tasks.length}개: ` + d.tasks.slice(0, 3).map((t) => t.title).join(', '));
    todo.forEach((t) => lines.push(`🎯 ${t.title} · 오늘 ${t.daily}${t.unit || ''}`));
    if (d.role === 'lead' && (d.pending || d.talk)) lines.push(`승인 대기 ${d.pending || 0}건 · 소통 필요 실패 ${d.talk || 0}건`);
    if (lines.length) notify('plan', `${d.name}님, 오늘은 이것부터 해요`, lines.slice(0, 5).join('\n'), false);
    await chrome.storage.local.set({ lastTodo: d.today });
  }

  // 팀장 알리미: 하루 한 번, 수집 시각 이후 MP AI 매출을 원보드로 보냄
  if (d.role === 'lead' && d.hour >= (d.syncHour || 11)) {
    const { syncDay } = await chrome.storage.local.get('syncDay');
    if (syncDay !== d.today) {
      await chrome.storage.local.set({ syncDay: d.today });
      const r = await runSync(false);
      if (!r.ok) notify('sync', 'MP AI 매출을 가져오지 못했어요', r.error + '\n알리미 아이콘에서 다시 시도할 수 있어요.', false);
    }
  }
  return d;
}

async function runSync(backfill) {
  let out;
  try {
    const n = backfill ? await syncMpai(62, 7) : await syncMpai(3, 2);
    out = { ok: true, at: Date.now(), daily: n.daily, monthly: n.monthly, notices: n.notices, backfill: !!backfill };
  } catch (e) {
    out = { ok: false, at: Date.now(), error: String(e && e.message || e) };
  }
  await chrome.storage.local.set({ syncStatus: out });
  return out;
}

function notify(id, title, message, sticky) {
  chrome.notifications.clear(id, () => {
    chrome.notifications.create(id, {
      type: 'basic', iconUrl: 'icon128.png', title, message, priority: 2, requireInteraction: sticky,
    });
  });
}

function addMin(s, n) {
  const d = new Date(s.replace(' ', 'T') + ':00+09:00');
  d.setMinutes(d.getMinutes() + n);
  return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
}

chrome.notifications.onClicked.addListener(async (id) => {
  const { last } = await chrome.storage.local.get('last');
  if (id.indexOf('call:') === 0 && last && last.board) {
    chrome.tabs.create({ url: last.board + '?tab=sales&lead=' + encodeURIComponent(id.slice(5)) });
    chrome.notifications.clear(id);
    return;
  }
  if (id === 'sync') { chrome.action.openPopup && chrome.action.openPopup().catch(() => {}); }
  else if (last && last.board) chrome.tabs.create({ url: last.board + '?tab=' + (id === 'notice' ? 'notice' : 'plan') });
  chrome.notifications.clear(id);
});
