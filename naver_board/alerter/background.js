// 원보드 알리미 — 크롬이 켜져 있으면 보드 창이 닫혀 있어도 동작합니다.
// 10분마다 원보드에 물어보고,
//  - 새 공지는 바로, 확인 안 한 공지는 1시간마다 다시 알림 (확인할 때까지 닫히지 않는 알림)
//  - 오늘 할 일은 아침 알림 시각 이후 하루 한 번
const POLL_MIN = 10;
const REMIND_MS = 60 * 60 * 1000;

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
function schedule() {
  chrome.alarms.create('poll', { periodInMinutes: POLL_MIN, delayInMinutes: 0.2 });
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'poll') poll(false); });
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg && msg.type === 'poll') { poll(true).then(reply); return true; }
  return false;
});

async function fetchAlerts() {
  const { connect } = await chrome.storage.local.get('connect');
  if (!connect || connect.indexOf('#') < 0) return { ok: false, error: '연결 코드를 넣어주세요.' };
  const [url, code] = connect.split('#');
  try {
    const r = await fetch(url + '?api=alerts&code=' + encodeURIComponent(code), { redirect: 'follow', cache: 'no-store' });
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
  const st = await chrome.storage.local.get(['seen', 'lastNotice', 'lastTodo', 'lastLead']);
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

  const todo = (d.todo || []).filter((t) => !t.checked);
  if (d.hour >= d.morningHour && st.lastTodo !== d.today) {
    const lines = todo.map((t) => `${t.title} · 오늘 ${t.daily}${t.unit || ''}`);
    if (d.role === 'lead' && (d.pending || d.talk)) lines.push(`승인 대기 ${d.pending || 0}건 · 소통 필요 실패 ${d.talk || 0}건`);
    if (lines.length) notify('plan', `${d.name}님, 오늘은 이것부터 해요`, lines.slice(0, 5).join('\n'), false);
    await chrome.storage.local.set({ lastTodo: d.today });
  }
  return d;
}

function notify(id, title, message, sticky) {
  chrome.notifications.clear(id, () => {
    chrome.notifications.create(id, {
      type: 'basic', iconUrl: 'icon128.png', title, message, priority: 2, requireInteraction: sticky,
    });
  });
}

chrome.notifications.onClicked.addListener(async (id) => {
  const { last } = await chrome.storage.local.get('last');
  if (last && last.board) chrome.tabs.create({ url: last.board + '?tab=' + (id === 'notice' ? 'notice' : 'plan') });
  chrome.notifications.clear(id);
});
