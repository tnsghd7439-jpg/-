const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function render(d, at) {
  const s = $('status');
  if (!d) { s.textContent = '아직 확인 전이에요.'; return; }
  if (!d.ok) { s.className = 'msg err'; s.textContent = d.error; $('cfg').open = true; return; }
  s.className = 'msg';
  const todo = (d.todo || []).filter((t) => !t.checked);
  let h = `<b>${esc(d.name)}</b>님<br>`;
  h += d.unread.length ? `확인 안 한 공지 <b>${d.unread.length}건</b><ul>${d.unread.map((n) => `<li>${n.important ? '[중요] ' : ''}${esc(n.title)}</li>`).join('')}</ul>` : '확인 안 한 공지가 없어요.<br>';
  h += todo.length ? `오늘 체크할 목표 <b>${todo.length}개</b><ul>${todo.map((t) => `<li>${esc(t.title)} · 오늘 ${esc(t.daily)}${esc(t.unit)}</li>`).join('')}</ul>` : '오늘 목표 체크를 모두 마쳤어요.';
  if (d.role === 'lead') h += `<br>승인 대기 <b>${d.pending || 0}</b> · 소통 필요 실패 <b>${d.talk || 0}</b>`;
  s.innerHTML = h;
  if (d.role === 'lead') {
    $('syncBox').style.display = 'block';
    chrome.storage.local.get('syncStatus', ({ syncStatus: x }) => {
      $('syncMsg').textContent = !x ? `매일 ${d.syncHour || 11}시 이후 자동으로 가져와요.`
        : x.ok ? `마지막 성공 ${new Date(x.at).toLocaleString('ko-KR')} · 일별 ${x.daily}행, 월별 ${x.monthly}행, 매체 공지 ${x.notices ?? '-'}건`
          : `실패: ${x.error}`;
    });
  }
  if (at) $('when').textContent = '마지막 확인 ' + new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

chrome.storage.local.get(['last', 'checkedAt', 'connect'], (st) => {
  if (!st.connect) { $('cfg').open = true; $('status').textContent = '연결 코드를 먼저 넣어주세요.'; }
  else render(st.last, st.checkedAt);
});
$('now').onclick = () => { $('status').textContent = '확인 중…'; chrome.runtime.sendMessage({ type: 'poll' }, (d) => render(d, Date.now())); };
$('open').onclick = () => chrome.storage.local.get('last', ({ last }) => {
  if (last && last.board) chrome.tabs.create({ url: last.board });
  else $('status').textContent = '연결 후에 열 수 있어요.';
});
$('save').onclick = () => {
  const v = $('code').value.trim();
  if (!/^https:\/\/script\.google\.com\/.+#[0-9a-f]{16,}$/i.test(v)) { $('status').className = 'msg err'; $('status').textContent = '코드 형식이 맞지 않아요. 보드에서 다시 복사해 주세요.'; return; }
  chrome.storage.local.set({ connect: v }, () => { $('code').value = ''; $('cfg').open = false; $('now').click(); });
};

function sync(backfill) {
  $('syncMsg').textContent = backfill ? '최근 62일·7개월을 가져오는 중이에요. 몇 분 걸릴 수 있어요…' : '가져오는 중…';
  chrome.runtime.sendMessage({ type: 'sync', backfill }, (x) => {
    $('syncMsg').textContent = x && x.ok ? `완료 · 일별 ${x.daily}행, 월별 ${x.monthly}행, 매체 공지 ${x.notices ?? '-'}건` : `실패: ${x ? x.error : '알 수 없는 오류'}`;
  });
}
$('sync').onclick = () => sync(false);
$('backfill').onclick = () => sync(true);
