#!/usr/bin/env node
// data-sources/카테고리_메인키워드.csv → src/lib/categoryKeywords.generated.json
//
// 이 자료는 '네이버쇼핑' 카테고리 체계(여성패션/컴퓨터/가전…)를 쓰는데, 상품
// 페이지에서 읽히는 건 '스마트스토어' 체계(패션의류/디지털·가전…)라 경로가
// 서로 맞지 않는다(2026-10-08 실측: 전체 경로 일치율 0%).
// 그래서 소분류 '이름'으로 찾고, 대분류는 아래 별칭표로 호환되는지만 확인한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, rowsToObjects } from './csv.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'data-sources', '카테고리_메인키워드.csv');
const OUT = join(__dirname, '..', 'src', 'lib', 'categoryKeywords.generated.json');

// 스마트스토어 대분류 → 이 자료의 대분류 후보들
const BIG_ALIASES = {
  '패션의류': ['여성패션', '남성패션'],
  '패션잡화': ['여성패션', '남성패션'],
  '화장품/미용': ['화장품/미용'],
  '디지털/가전': ['가전', '디지털', '컴퓨터'],
  '가구/인테리어': ['가구/인테리어'],
  '출산/육아': ['출산/유아동'],
  '식품': ['식품'],
  '스포츠/레저': ['스포츠/레저'],
  '생활/건강': ['생활/주방용품', '건강/의료용품', '반려동물용품'],
  '여가/생활편의': ['여행', 'E쿠폰/티켓', '취미/문구/악기'],
  '도서': ['도서'],
};

const rows = rowsToObjects(parseCsv(readFileSync(SRC, 'utf-8')));

// 소분류 이름 -> [{ big, mid, small, main, expansions }]
const bySmall = {};
const groups = new Map();

for (const r of rows) {
  if (r['레벨'] !== '소분류') continue;
  const small = (r['소분류'] ?? '').trim();
  if (!small) continue;
  const key = `${r['대분류']}>${r['중분류']}>${small}`;
  if (!groups.has(key)) {
    groups.set(key, { big: r['대분류'], mid: r['중분류'], small, main: null, expansions: [] });
  }
  const g = groups.get(key);
  const entry = { keyword: (r['키워드'] ?? '').trim(), volume: Number(r['총검색량']) || 0 };
  if (!entry.keyword) continue;
  if (r['구분'] === '대표') g.main = entry;
  else g.expansions.push(entry);
}

// 두 체계의 소분류 이름이 조금씩 다르다 — 상품은 '도시락', 자료는 '도시락/밥류'.
// 그래서 전체 이름뿐 아니라 '/'로 나눈 조각으로도 찾을 수 있게 색인한다.
function indexNames(small) {
  const names = new Set([small]);
  for (const part of small.split('/')) {
    const p = part.trim();
    if (p.length >= 2) names.add(p);
  }
  return names;
}

for (const g of groups.values()) {
  if (!g.main) continue;
  g.expansions.sort((a, b) => b.volume - a.volume);
  for (const name of indexNames(g.small)) {
    (bySmall[name] ??= []).push(g);
  }
}

const fails = [];
const smallCount = Object.keys(bySmall).length;
if (smallCount < 1000) fails.push(`소분류 수가 비정상적으로 적음: ${smallCount}`);
if (!bySmall['마우스']) fails.push("기준 샘플('마우스')이 없음 — 원본 구조가 바뀐 것으로 의심됨");
if (fails.length) {
  console.error('[catkw] 검증 실패:\n' + fails.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}

writeFileSync(
  OUT,
  JSON.stringify({
    meta: { builtAt: new Date().toISOString(), source: '네이버쇼핑 카테고리 메인키워드 검색량 (2026-10-08)' },
    bigAliases: BIG_ALIASES,
    bySmall,
  })
);

console.log(`[catkw] 소분류 ${smallCount.toLocaleString()}개 / 그룹 ${groups.size.toLocaleString()}개`);
console.log(`[catkw] wrote ${OUT}`);
