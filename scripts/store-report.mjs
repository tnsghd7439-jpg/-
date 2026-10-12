#!/usr/bin/env node
// 스토어 전체상품 목록 텍스트 → 스토어 단위 진단 리포트(HTML).
//
//   node scripts/store-report.mjs <붙여넣은목록.txt> "<스토어명>" [출력.html]
//
// 상세페이지 진단과 달리 목록에서 읽히는 정보만 쓰므로, 판정 가능한 항목만
// 다루고 나머지는 "개별 상품 확인 필요"로 분리해 명시한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStoreList, parseTotalCount } from '../src/lib/storeList.js';
import { createMatchEngine } from '../src/lib/matchEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dictionaries = JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'lib', 'dictionaries.generated.json'), 'utf-8')
);

const [, , inputPath, storeNameArg, outPathArg] = process.argv;
if (!inputPath) {
  console.error('사용법: node scripts/store-report.mjs <목록.txt> "<스토어명>" [출력.html]');
  process.exit(1);
}
const storeName = storeNameArg || '분석 스토어';
const outPath = outPathArg || join(process.cwd(), '스토어진단리포트.html');

const raw = readFileSync(inputPath, 'utf-8');
const products = parseStoreList(raw);
const totalCount = parseTotalCount(raw);
if (products.length === 0) {
  console.error('상품을 하나도 읽지 못했습니다. 전체상품 페이지를 Ctrl+A로 복사한 텍스트가 맞는지 확인해주세요.');
  process.exit(1);
}

const engine = createMatchEngine(dictionaries);
const month = new Date().getMonth() + 1;

// ---- 항목별 판정 -----------------------------------------------------------
const NAME_LIMIT = 60;
const IMAGE_MIN = 5;
const REVIEW_LOW = 1000;

const longNames = products.filter((p) => p.nameLength > NAME_LIMIT);
const fewImages = products.filter((p) => p.imageCount < IMAGE_MIN);
const noCoupon = products.filter((p) => !p.hasCoupon);
const lowReview = products.filter((p) => (p.reviews ?? 0) < REVIEW_LOW);

// 상품명 키워드 매칭 — 사전에 아예 안 잡히는 상품명은 검색 유입 설계가 비어 있다는 신호
const withMatches = products.map((p) => ({ ...p, matches: engine.scan(p.name) }));
const noVolumeKeyword = withMatches.filter(
  (p) => !p.matches.some((m) => m.volumeRecord && m.volumeRecord.monthlyVolume > 0)
);

// 시즌 선행: 지금 손봐두면 성수기에 순위가 잡히는 상품
const seasonAhead = [];
for (const p of withMatches) {
  for (const m of p.matches) {
    const s = m.seasonRecord;
    if (!s || s.confidence !== '실측' || !Array.isArray(s.peakMonths)) continue;
    const lead = s.leadTimeMonths ?? 2;
    const target = ((month + lead - 1) % 12) + 1;
    if (s.peakMonths.includes(target) && !s.peakMonths.includes(month)) {
      seasonAhead.push({ product: p.name, keyword: m.keyword, peak: s.peakMonths.join('·') + '월' });
      break;
    }
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = (n) => (n == null ? '-' : n.toLocaleString() + '원');
const pct = (n) => Math.round((n / products.length) * 100);

const findings = [
  {
    key: 'coupon',
    on: noCoupon.length > 0,
    tone: noCoupon.length / products.length > 0.5 ? 'high' : 'mid',
    title: '쿠폰이 걸려 있지 않은 상품',
    count: noCoupon.length,
    problem: `분석한 ${products.length}개 중 ${noCoupon.length}개(${pct(noCoupon.length)}%)에 적용 가능한 쿠폰이 보이지 않습니다.`,
    risk: '가격을 비교하다 이탈하는 고객에게 마지막으로 결정을 밀어줄 장치가 없는 상태이고, 쿠폰이 걸린 경쟁 상품과 나란히 노출될 때 상대적으로 불리해집니다.',
    benefit: '쿠폰은 판매가를 낮추지 않으면서도 구매 직전 고객의 결정을 끌어주는 장치라, 같은 트래픽에서 전환을 끌어올리는 데 효과적입니다.',
    list: noCoupon.slice(0, 10).map((p) => `${p.name} (${won(p.salePrice)})`),
  },
  {
    key: 'image',
    on: fewImages.length > 0,
    tone: 'mid',
    title: `대표이미지가 ${IMAGE_MIN}장 미만인 상품`,
    count: fewImages.length,
    problem: `${fewImages.length}개 상품의 대표이미지가 ${IMAGE_MIN}장 미만입니다. 가장 적은 상품은 ${Math.min(...fewImages.map((p) => p.imageCount))}장입니다.`,
    risk: '구매를 망설이는 고객은 이미지를 넘겨보며 확신을 얻는데, 넘길 이미지가 없으면 상세페이지까지 내려가지 않고 이탈합니다.',
    benefit: '사용 장면·크기 비교·구성품 컷을 추가하면 같은 유입에서도 전환이 올라가고, 썸네일 노출 품질에도 도움이 됩니다.',
    list: fewImages.map((p) => `${p.name} — ${p.imageCount}장`),
  },
  {
    key: 'name',
    on: longNames.length > 0,
    tone: 'mid',
    title: `상품명이 ${NAME_LIMIT}자를 넘는 상품`,
    count: longNames.length,
    problem: `${longNames.length}개 상품의 상품명이 ${NAME_LIMIT}자를 초과합니다.`,
    risk: '키워드를 과도하게 넣으면 검색 랭킹에 오히려 불리하게 작용할 수 있고, 고객 입장에서도 핵심 정보가 눈에 들어오지 않습니다.',
    benefit: '검색량이 낮은 뒤쪽 키워드를 덜어내고 핵심 키워드를 앞에 남기면, 상품명이 읽기 쉬워지면서 주력 키워드 경쟁력도 살아납니다.',
    list: longNames.map((p) => `${p.name} (${p.nameLength}자)`),
  },
  {
    key: 'keyword',
    on: noVolumeKeyword.length > 0,
    tone: 'mid',
    title: '검색량이 확인되는 키워드가 상품명에 없는 상품',
    count: noVolumeKeyword.length,
    problem: `${noVolumeKeyword.length}개 상품명에서 저희 검색량 데이터에 잡히는 키워드를 찾지 못했습니다.`,
    risk: '브랜드명을 이미 아는 고객만 찾아올 수 있는 구조라, 신규 고객이 검색으로 유입되는 경로가 사실상 닫혀 있습니다.',
    benefit: '실제로 검색되는 키워드를 상품명 앞쪽에 넣어주면, 광고비를 더 쓰지 않아도 신규 유입 경로가 열립니다.',
    list: noVolumeKeyword.slice(0, 10).map((p) => p.name),
  },
  {
    key: 'season',
    on: seasonAhead.length > 0,
    tone: 'mid',
    title: '지금 준비하면 성수기를 잡을 수 있는 상품',
    count: seasonAhead.length,
    problem: `${seasonAhead.length}개 상품이 곧 시즌에 진입하는 키워드를 갖고 있습니다.`,
    risk: '시즌 키워드는 수요가 몰린 뒤에 넣으면 이미 상위에 자리잡은 상품들과 경쟁해야 해서 순위를 올리기 어렵습니다.',
    benefit: '수요가 오르기 전에 상품명·태그를 미리 맞춰두면 시즌이 시작될 때 이미 순위가 잡혀 있어, 같은 상품으로 성수기 매출을 크게 가져갈 수 있습니다.',
    list: seasonAhead.slice(0, 10).map((s) => `${s.product} — '${s.keyword}' (성수기 ${s.peak})`),
  },
  {
    key: 'review',
    on: lowReview.length > 0,
    tone: 'low',
    title: `리뷰가 ${REVIEW_LOW.toLocaleString()}건 미만인 상품`,
    count: lowReview.length,
    problem: `${lowReview.length}개 상품의 리뷰가 ${REVIEW_LOW.toLocaleString()}건 미만입니다.`,
    risk: '리뷰는 상품 순위와 구매 결정에 모두 영향을 주는데, 리뷰가 적은 상품은 유입이 생겨도 전환까지 이어지기 어렵습니다.',
    benefit: '리뷰이벤트를 걸어 초기 리뷰를 모아주면 순위가 올라가는 속도 자체가 달라집니다.',
    list: lowReview.map((p) => `${p.name} — ${p.reviews?.toLocaleString() ?? 0}건`),
  },
].filter((f) => f.on);

const ship = products.filter((p) => !p.freeShip);
const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(storeName)} 스토어 진단 리포트</title>
<style>
:root{--navy:#1a2680;--blue:#2130a0;--ink:#16181f;--sub:#6b7280;--line:#e6e8f0;--bg:#eef0f6;--card:#fff;--red:#e03131;--amber:#e8940c;--green:#1f7a3f}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,"Malgun Gothic","맑은 고딕",sans-serif;padding:36px 16px;line-height:1.7}
.page{max-width:820px;margin:0 auto}
.hero{background:linear-gradient(135deg,var(--navy),var(--blue));color:#fff;border-radius:14px;padding:32px 30px 28px;margin-bottom:16px}
.hero__eyebrow{font-size:12.5px;opacity:.85;letter-spacing:.5px;margin-bottom:8px}
.hero__title{font-size:23px;font-weight:800;line-height:1.35}
.hero__sub{font-size:13px;opacity:.88;margin-top:10px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:16px}
.stat{background:var(--card);padding:18px 16px;text-align:center}
.stat__n{font-size:22px;font-weight:800;color:var(--navy);font-variant-numeric:tabular-nums}
.stat__l{font-size:11.5px;color:var(--sub);margin-top:4px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px 26px;margin-bottom:14px}
.card__head{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap}
.b-high{background:#fdecea;color:#c0392b}.b-mid{background:#eaefff;color:#2130a0}.b-low{background:#f1f3f5;color:#555}
.card__title{font-size:15.5px;font-weight:800}
.card__count{margin-left:auto;font-size:13px;color:var(--sub);font-variant-numeric:tabular-nums}
.row{display:flex;gap:10px;padding:7px 0}
.row__l{flex:0 0 78px;font-size:11.5px;font-weight:700;color:#888;padding-top:2px}
.row__t{flex:1;font-size:13px}
.row--risk .row__l{color:var(--red)}.row--risk .row__t{color:#a83226}
.row--benefit .row__l{color:var(--green)}.row--benefit .row__t{color:var(--green)}
details{margin-top:12px;border-top:1px dashed var(--line);padding-top:10px}
summary{font-size:12.5px;color:var(--blue);cursor:pointer;font-weight:600}
details ul{margin:10px 0 0;padding-left:18px;font-size:12.5px;color:#444}
details li{padding:2px 0}
.note{background:#fff9db;border-radius:12px;padding:18px 20px;font-size:12.5px;line-height:1.75;color:#6b5900}
.note b{color:#4a3f00}
.foot{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line);margin-top:22px;padding-top:18px;font-size:11.5px;color:var(--sub)}
@media(max-width:480px){.row{flex-direction:column;gap:2px}.row__l{flex-basis:auto}}
</style></head><body><div class="page">

<div class="hero">
  <div class="hero__eyebrow">엠피인터랙티브 네이버 전담팀</div>
  <div class="hero__title">${esc(storeName)} 스토어 진단 리포트</div>
  <div class="hero__sub">전체상품 목록 기준 분석 · ${new Date().toISOString().slice(0, 10)}</div>
</div>

<div class="stats">
  <div class="stat"><div class="stat__n">${totalCount ?? products.length}</div><div class="stat__l">스토어 전체 상품</div></div>
  <div class="stat"><div class="stat__n">${products.length}</div><div class="stat__l">분석한 상품</div></div>
  <div class="stat"><div class="stat__n">${findings.length}</div><div class="stat__l">발견된 개선 포인트</div></div>
  <div class="stat"><div class="stat__n">${avg(products.map((p) => p.discountRate ?? 0))}%</div><div class="stat__l">평균 할인율</div></div>
  <div class="stat"><div class="stat__n">${ship.length}</div><div class="stat__l">유료배송 상품</div></div>
</div>

${findings
  .map(
    (f) => `<div class="card">
  <div class="card__head">
    <span class="badge b-${f.tone}">개선 포인트</span>
    <span class="card__title">${esc(f.title)}</span>
    <span class="card__count">${f.count}개</span>
  </div>
  <div class="row"><div class="row__l">현재 상태</div><div class="row__t">${esc(f.problem)}</div></div>
  <div class="row row--risk"><div class="row__l">이대로 두면</div><div class="row__t">${esc(f.risk)}</div></div>
  <div class="row row--benefit"><div class="row__l">개선하면</div><div class="row__t">${esc(f.benefit)}</div></div>
  ${
    f.list.length
      ? `<details><summary>해당 상품 보기 (${f.list.length}${f.list.length < f.count ? ` / ${f.count}` : ''}개)</summary><ul>${f.list
          .map((x) => `<li>${esc(x)}</li>`)
          .join('')}</ul></details>`
      : ''
  }
</div>`
  )
  .join('\n')}

<div class="note">
  <b>이 리포트는 스토어 목록 화면에서 확인 가능한 범위만 분석했습니다.</b><br>
  옵션 구성·검색태그·상세이미지 대체텍스트·상품정보제공고시·숏클립·리뷰이벤트 등은
  상품을 개별로 열어야 확인할 수 있어 이번 분석에는 포함되지 않았습니다.
  해당 항목은 주요 상품을 선정해 별도로 점검해 드릴 수 있습니다.
</div>

<div class="foot">
  <span>엠피인터랙티브 네이버 전담팀</span>
  <span>www.mpinteractive.co.kr</span>
</div>
</div></body></html>`;

writeFileSync(outPath, html, 'utf-8');
console.log(`분석 상품 ${products.length}개 / 개선 포인트 ${findings.length}건`);
for (const f of findings) console.log(`  · ${f.title}: ${f.count}개`);
console.log(`\n리포트 저장: ${outPath}`);
