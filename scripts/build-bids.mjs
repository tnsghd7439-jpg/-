#!/usr/bin/env node
// data-sources/키워드_입찰가.csv → src/lib/bids.generated.json
//
// 아이템스카우트 카테고리별 인기키워드 추출본(2026-03~09). 키워드마다
// 월검색수·PC/모바일 입찰가·경쟁강도와, 그 키워드가 속한 카테고리 경로를 담는다.
// 번들 크기를 줄이려고 카테고리 경로는 문자열 테이블로 빼고 인덱스만 저장한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, rowsToObjects } from './csv.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'data-sources', '키워드_입찰가.csv');
const OUT = join(__dirname, '..', 'src', 'lib', 'bids.generated.json');

const rows = rowsToObjects(parseCsv(readFileSync(SRC, 'utf-8')));

const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const catIndex = new Map();
const categories = [];
function catId(path) {
  if (!catIndex.has(path)) {
    catIndex.set(path, categories.length);
    categories.push(path);
  }
  return catIndex.get(path);
}

/** 키워드 -> [월검색수, PC입찰가, 모바일입찰가, 경쟁강도, ...카테고리인덱스] */
const keywords = {};
for (const r of rows) {
  const kw = (r['키워드'] ?? '').trim();
  const path = (r['카테고리경로'] ?? '').trim();
  if (!kw || !path) continue;
  // 1자 키워드는 상품명 어디에나 걸려 오탐을 만든다 — 사전 단계에서 제외(§8-14와 동일 원칙)
  if (kw.length < 2) continue;

  const id = catId(path);
  const cur = keywords[kw];
  if (cur) {
    if (!cur.slice(4).includes(id) && cur.length < 4 + 3) cur.push(id);
    continue;
  }
  keywords[kw] = [num(r['월검색수']), num(r['PC입찰가']), num(r['모바일입찰가']), num(r['경쟁강도']), id];
}

const withBid = Object.values(keywords).filter((v) => v[1] != null && v[1] > 0).length;
const total = Object.keys(keywords).length;

// §11.1과 같은 취지의 하드 어서션 — 데이터가 조용히 비어버리면 빌드를 멈춘다
const fails = [];
if (total < 10000) fails.push(`키워드 수가 비정상적으로 적음: ${total}`);
if (withBid / total < 0.9) fails.push(`입찰가 보유 비율이 낮음: ${Math.round((withBid / total) * 100)}%`);
if (categories.length < 100) fails.push(`카테고리 경로 수가 비정상적으로 적음: ${categories.length}`);
if (fails.length) {
  console.error('[bids] 검증 실패:\n' + fails.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}

writeFileSync(
  OUT,
  JSON.stringify({
    meta: { builtAt: new Date().toISOString(), source: '아이템스카우트 카테고리별 인기키워드 2026-03~09', keywordCount: total },
    categories,
    keywords,
  })
);

console.log(`[bids] 키워드 ${total.toLocaleString()}개 (입찰가 보유 ${Math.round((withBid / total) * 100)}%), 카테고리 ${categories.length}개`);
console.log(`[bids] wrote ${OUT}`);
