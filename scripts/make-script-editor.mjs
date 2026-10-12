#!/usr/bin/env node
// rules.json → 멘트편집기.html (자체완결 1파일)
//
// 멘트를 손으로 고치다 보면 빌드가 막히는 실수가 반복된다 — severity별 금칙어,
// {{플레이스홀더}} 삭제. 편집기에서 실시간으로 잡아주고, 결과를 JSON으로 뽑아
// 그대로 반영할 수 있게 한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'lib', 'rules.json'), 'utf-8'));
const OUT = join(__dirname, '..', '멘트편집기.html');

const PRIORITY = {
  SEO_006: 1, SEO_007: 2, SEO_008: 2, SEO_005: 3, SEO_001: 4, SEO_003: 4,
  TAG_001: 5, TAG_006: 6, OPP_002: 8, OPP_003: 8, OPP_005: 8,
  BRAND_005: -4, BRAND_004: -3, BRAND_002: -2, BRAND_003: -2, BRAND_001: -1,
};

const SECTIONS = {
  확정위반: { label: '① 확정 위반', tone: 'red' },
  의심: { label: '⚠ 확인 필요', tone: 'amber' },
  brand: { label: '브랜드스토어 추가 제안 요소', tone: 'purple' },
  기회손실: { label: '② 개선 기회', tone: 'blue' },
};

const FORBIDDEN = {
  확정위반: [],
  의심: ['입니다', '확실', '반드시', '무조건'],
  기회손실: ['위반', '제재', '삭제', '적발', '불이익'],
};

const items = [];
for (const r of doc.rules) {
  const section = r.applies_to?.brandStoreOnly ? 'brand' : r.severity;
  const forbidden = FORBIDDEN[r.severity] ?? [];
  if (r.script_template && r.script_template !== '__DYNAMIC__') {
    items.push({ key: r.id, rule: r.id, field: 'script_template', section, title: r.title, text: r.script_template, forbidden });
  }
  if (r.mergedTemplate) {
    items.push({
      key: `${r.id}::merged`, rule: r.id, field: 'mergedTemplate', section,
      title: `${r.mergedTitle ?? r.title} (병합 발화)`, text: r.mergedTemplate, forbidden,
    });
  }
}
items.sort((a, b) => {
  const sa = Object.keys(SECTIONS).indexOf(a.section);
  const sb = Object.keys(SECTIONS).indexOf(b.section);
  return sa - sb || (PRIORITY[a.rule] ?? 9) - (PRIORITY[b.rule] ?? 9);
});

const data = JSON.stringify({ sections: SECTIONS, items });

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>멘트 편집기 — 스마트스토어 상품 진단</title>
<style>
:root{--navy:#1a2680;--blue:#2130a0;--ink:#16181f;--sub:#6b7280;--line:#e5e7f0;--bg:#eef0f6;--card:#fff;
--red:#e03131;--amber:#e8940c;--purple:#6741d9;--green:#1f7a3f}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,"Malgun Gothic","맑은 고딕",sans-serif;line-height:1.6}
.wrap{max-width:900px;margin:0 auto;padding:28px 16px 80px}
.hero{background:linear-gradient(135deg,var(--navy),var(--blue));color:#fff;border-radius:14px;padding:26px 28px;margin-bottom:14px}
.hero h1{margin:0 0 6px;font-size:20px;font-weight:800}
.hero p{margin:0;font-size:13px;opacity:.9}
.howto{background:#fff9db;border:1px solid #f0dca0;border-radius:10px;padding:14px 16px;font-size:13px;margin-bottom:18px;color:#6b5900}
.howto b{color:#4a3f00}
.howto ol{margin:8px 0 0;padding-left:20px}
.sec{margin:26px 0 10px;font-size:15px;font-weight:800;display:flex;align-items:center;gap:8px}
.sec span{display:inline-block;width:4px;height:16px;border-radius:2px}
.t-red{background:var(--red)}.t-amber{background:var(--amber)}.t-purple{background:var(--purple)}.t-blue{background:var(--blue)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:12px}
.card.changed{border-color:var(--blue);box-shadow:0 0 0 2px rgba(33,48,160,.08)}
.card.bad{border-color:var(--red);box-shadow:0 0 0 2px rgba(224,49,49,.1)}
.ttl{font-weight:700;font-size:14px;margin-bottom:3px}
.meta{font-size:11px;color:var(--sub);font-family:Consolas,monospace;margin-bottom:9px}
textarea{width:100%;min-height:132px;padding:11px 12px;border:1px solid var(--line);border-radius:8px;
font-family:inherit;font-size:13.5px;line-height:1.75;resize:vertical;background:#fcfcfe;color:var(--ink)}
textarea:focus{outline:none;border-color:var(--blue);background:#fff}
.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:8px;font-size:11.5px;color:var(--sub)}
.bar .spacer{flex:1}
.btn{font:inherit;font-size:11.5px;padding:4px 10px;border:1px solid var(--line);background:#fff;border-radius:6px;cursor:pointer;color:#444}
.btn:hover{background:#f5f6fa}
.warn{margin-top:8px;padding:8px 10px;border-radius:8px;font-size:12px;line-height:1.6}
.warn.err{background:#fff5f5;border:1px solid #f3c2c2;color:#9b2c2c}
.warn.ok{background:#f1f8f3;border:1px solid #cce5d5;color:var(--green)}
.chip{display:inline-block;background:#eef0fa;color:var(--blue);border-radius:4px;padding:1px 6px;font-family:Consolas,monospace;font-size:11px;margin-right:4px}
.footer{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);padding:11px 16px;
display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;box-shadow:0 -2px 10px rgba(0,0,0,.05)}
.footer .stat{font-size:12.5px;color:var(--sub);margin-right:6px}
.primary{background:var(--blue);color:#fff;border:none;padding:9px 18px;border-radius:7px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.primary:hover{background:var(--navy)}
.ghost{background:#fff;color:var(--blue);border:1.5px solid var(--blue);padding:8px 14px;border-radius:7px;font:inherit;font-size:12.5px;cursor:pointer}
@media(max-width:480px){.wrap{padding:18px 12px 96px}}
</style></head><body>
<div class="wrap">
  <div class="hero">
    <h1>멘트 편집기</h1>
    <p>고치시는 동안 금칙어와 플레이스홀더를 자동으로 검사합니다. 내용은 브라우저에 자동 저장돼요.</p>
  </div>

  <div class="howto">
    <b>사용법</b>
    <ol>
      <li>아래 칸에서 멘트를 직접 고치세요. 닫았다 열어도 내용이 남아 있습니다.</li>
      <li>빨간 경고가 뜨면 그 부분은 빌드가 막히니 고쳐주세요.</li>
      <li>다 되면 맨 아래 <b>수정본 복사</b>를 눌러서 저한테 그대로 붙여주시면 반영하겠습니다.</li>
    </ol>
  </div>

  <div id="list"></div>
</div>

<div class="footer">
  <span class="stat" id="stat"></span>
  <button class="ghost" id="reset">전체 되돌리기</button>
  <button class="ghost" id="download">파일로 저장</button>
  <button class="primary" id="copy">수정본 복사</button>
</div>

<script>
const DATA = ${data};
const KEY = 'ment-editor-v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();

const list = document.getElementById('list');
let lastSection = null;

for (const it of DATA.items) {
  if (it.section !== lastSection) {
    lastSection = it.section;
    const s = DATA.sections[it.section];
    const h = document.createElement('div');
    h.className = 'sec';
    h.innerHTML = '<span class="t-' + s.tone + '"></span>' + s.label;
    list.appendChild(h);
  }

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.key = it.key;

  const ph = [...new Set((it.text.match(/\\{\\{\\w+\\}\\}/g) || []))];
  card.innerHTML =
    '<div class="ttl">' + esc(it.title) + '</div>' +
    '<div class="meta">' + it.rule + (it.field === 'mergedTemplate' ? ' · 병합' : '') +
      (ph.length ? ' · 필수 치환어 ' + ph.map(p => '<span class="chip">' + esc(p) + '</span>').join('') : '') +
    '</div>' +
    '<textarea spellcheck="false"></textarea>' +
    '<div class="bar"><span class="len"></span><span class="spacer"></span>' +
      '<button class="btn revert">원래대로</button></div>' +
    '<div class="warn" hidden></div>';

  const ta = card.querySelector('textarea');
  ta.value = saved[it.key] ?? it.text;
  ta.addEventListener('input', () => { save(it.key, ta.value); check(card, it, ta.value); });
  card.querySelector('.revert').addEventListener('click', () => {
    ta.value = it.text; save(it.key, it.text); check(card, it, it.text);
  });

  list.appendChild(card);
  check(card, it, ta.value);
}

function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function save(key, val) {
  saved[key] = val;
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {}
  updateStat();
}

/** 빌드에서 걸리는 것과 같은 규칙으로 미리 검사한다. */
function check(card, it, text) {
  const problems = [];

  for (const word of it.forbidden) {
    if (text.includes(word)) problems.push('이 구역에서는 "' + word + '" 라는 표현을 쓸 수 없습니다');
  }

  const origPh = [...new Set((it.text.match(/\\{\\{\\w+\\}\\}/g) || []))];
  const nowPh = new Set(text.match(/\\{\\{\\w+\\}\\}/g) || []);
  for (const p of origPh) {
    if (!nowPh.has(p)) problems.push(p + ' 가 빠졌습니다 — 실제 진단 숫자가 들어가는 자리라 꼭 있어야 합니다');
  }

  if (/(?<![0-9])00(?![0-9])/.test(text.replace(/\\{\\{\\w+\\}\\}/g, ''))) {
    problems.push('"00" 같은 빈칸 표시가 남아 있습니다');
  }
  if (!text.trim()) problems.push('내용이 비어 있습니다');

  const warn = card.querySelector('.warn');
  const changed = text !== it.text;
  card.classList.toggle('changed', changed && !problems.length);
  card.classList.toggle('bad', problems.length > 0);

  if (problems.length) {
    warn.className = 'warn err';
    warn.innerHTML = problems.map(p => '⚠ ' + esc(p)).join('<br>');
    warn.hidden = false;
  } else if (changed) {
    warn.className = 'warn ok';
    warn.textContent = '✓ 수정됨 — 문제 없습니다';
    warn.hidden = false;
  } else {
    warn.hidden = true;
  }

  card.querySelector('.len').textContent = text.length + '자';
  updateStat();
}

function changedItems() {
  return DATA.items.filter(it => (saved[it.key] ?? it.text) !== it.text);
}

function updateStat() {
  const bad = document.querySelectorAll('.card.bad').length;
  const n = changedItems().length;
  document.getElementById('stat').textContent =
    '수정 ' + n + '건' + (bad ? ' · ⚠ 문제 ' + bad + '건' : '');
}

function payload() {
  const out = {};
  for (const it of changedItems()) {
    out[it.key] = { rule: it.rule, field: it.field, title: it.title, text: saved[it.key] };
  }
  return JSON.stringify(out, null, 2);
}

document.getElementById('copy').addEventListener('click', async () => {
  const n = changedItems().length;
  if (!n) return alert('수정된 멘트가 없습니다.');
  if (document.querySelectorAll('.card.bad').length) {
    if (!confirm('빨간 경고가 남아 있습니다. 그래도 복사할까요?')) return;
  }
  await navigator.clipboard.writeText(payload());
  alert(n + '건이 복사되었습니다. 대화창에 그대로 붙여넣어 주세요.');
});

document.getElementById('download').addEventListener('click', () => {
  const blob = new Blob([payload()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '멘트_수정본.json';
  a.click();
});

document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('고치신 내용을 전부 버리고 원래 멘트로 되돌릴까요?')) return;
  localStorage.removeItem(KEY);
  location.reload();
});

updateStat();
</script>
</body></html>`;

writeFileSync(OUT, html, 'utf-8');
console.log(`[editor] 멘트 ${items.length}건 → ${OUT}`);
