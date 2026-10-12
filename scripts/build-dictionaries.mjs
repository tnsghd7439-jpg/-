#!/usr/bin/env node
// Builds src/lib/dictionaries.generated.json from the two source CSVs.
//
// Per the spec (§11.1): never trust the planning document's numbers — verify the
// real data on every build, and FAIL LOUDLY if the structural assumptions this
// codebase depends on (row counts, uniqueness, value domains) stop holding.
// Everything under "hard asserts" below was independently verified against the
// live CSVs before this script was written; everything under "derived analytics"
// is computed fresh here and only logged, since this script is now the source of
// truth for those numbers, not the planning doc.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, rowsToObjects } from './csv.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'src', 'lib', 'dictionaries.generated.json');

// 원본 CSV는 data-sources/에 프로젝트와 함께 보관한다 — 다른 PC로 폴더째
// 옮겨도 빌드가 그대로 돌아가야 하므로 절대경로를 쓰지 않는다.
const DATA_DIR = join(__dirname, '..', 'data-sources');
const VOLUME_CSV_PATH = join(DATA_DIR, '검색량_카테고리재라벨_22843.csv');
const SEASON_CSV_PATH = join(DATA_DIR, 'keywords.csv');

// 1-char keywords the spec requires we drop at load time (safety item §8-14).
// This is the exact, hand-verified set — used as an assertion, not a filter rule,
// so a *different* set of 1-char keywords in a future CSV update fails the build
// instead of being silently dropped.
const EXPECTED_ONE_CHAR_KEYWORDS = new Set(['랙', '농', '팬', '쌀', '떡', '귤', '롤', '휠', '땀', '백', '숄', '캡', '팩']);

const fails = [];
function assert(cond, msg) {
  if (!cond) fails.push(msg);
}
function fail(msg) {
  fails.push(msg);
}

function readObjects(path) {
  const text = readFileSync(path, 'utf-8'); // utf-8 in Node strips a leading BOM already for readFileSync? No — it does not. parseCsv strips it.
  return rowsToObjects(parseCsv(text));
}

function toInt(s) {
  const n = Number(String(s).replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}
function toFloat(s) {
  const n = Number(String(s).trim());
  return Number.isFinite(n) ? n : NaN;
}

// linear-interpolation percentile (matches numpy/pandas default)
function percentile(sortedAsc, p) {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}
function assertNear(actual, expected, tolerance, msg) {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    fail(`${msg} — expected ~${expected}, got ${actual}`);
  }
}

console.log('[dictionaries] reading volume CSV:', VOLUME_CSV_PATH);
const volumeRows = readObjects(VOLUME_CSV_PATH);
console.log('[dictionaries] reading season CSV:', SEASON_CSV_PATH);
const seasonRows = readObjects(SEASON_CSV_PATH);

// ---------- volume dictionary: hard asserts ----------
assert(volumeRows.length === 18939, `volume row count expected 18939, got ${volumeRows.length}`);

const volumeHeader = Object.keys(volumeRows[0] ?? {});
assert(!volumeHeader.includes('신뢰도'), 'volume CSV unexpectedly has a 신뢰도 column — spec assumption changed');

const volKeywordSet = new Set();
const volDupes = [];
for (const r of volumeRows) {
  if (volKeywordSet.has(r['키워드'])) volDupes.push(r['키워드']);
  volKeywordSet.add(r['키워드']);
}
assert(volDupes.length === 0, `volume dictionary has duplicate keywords: ${volDupes.slice(0, 5).join(', ')}`);

const oneCharInVolume = new Set(volumeRows.filter((r) => [...r['키워드']].length === 1).map((r) => r['키워드']));
assert(oneCharInVolume.size === EXPECTED_ONE_CHAR_KEYWORDS.size, `expected 13 one-char keywords, got ${oneCharInVolume.size}: ${[...oneCharInVolume].join(',')}`);
for (const kw of oneCharInVolume) {
  assert(EXPECTED_ONE_CHAR_KEYWORDS.has(kw), `unexpected 1-char keyword not in the hand-verified set: ${kw}`);
}

for (const r of volumeRows) {
  const len = [...r['키워드']].length;
  if (len === 1) continue; // excluded at load time below
  assert(len >= 2 && len <= 19, `keyword length out of [2,19]: "${r['키워드']}" (${len})`);
}

const monthlyVolumes = [];
for (const r of volumeRows) {
  const v = toInt(r['총_월간검색량']);
  assert(Number.isInteger(v), `총_월간검색량 not an integer for "${r['키워드']}": "${r['총_월간검색량']}"`);
  assert(v >= 150, `총_월간검색량 below the verified floor (150) for "${r['키워드']}": ${v}`);
  monthlyVolumes.push(v);
}
for (const r of volumeRows) {
  const m = toFloat(r['모바일_비중']);
  assert(m >= 0 && m <= 100, `모바일_비중 out of [0,100] for "${r['키워드']}": ${r['모바일_비중']}`);
}

const ALLOWED_LABEL_METHODS = new Set(['접두', '접미', '포함', '-']);
for (const r of volumeRows) {
  assert(ALLOWED_LABEL_METHODS.has(r['라벨방식']), `unexpected 라벨방식 value: "${r['라벨방식']}"`);
}

monthlyVolumes.sort((a, b) => a - b);
const volP25 = percentile(monthlyVolumes, 25);
const volP50 = percentile(monthlyVolumes, 50);
const volP75 = percentile(monthlyVolumes, 75);
const volP90 = percentile(monthlyVolumes, 90);
assertNear(volP25, 360, 10, '볼륨 사전 총_월간검색량 p25');
assertNear(volP50, 760, 15, '볼륨 사전 총_월간검색량 p50');
assertNear(volP75, 2110, 25, '볼륨 사전 총_월간검색량 p75');
assertNear(volP90, 6390, 60, '볼륨 사전 총_월간검색량 p90');
console.log(`[dictionaries] volume 총_월간검색량 percentiles: p25=${volP25} p50=${volP50} p75=${volP75} p90=${volP90}`);

// ---------- season dictionary: hard asserts ----------
assert(seasonRows.length === 6344, `season row count expected 6344, got ${seasonRows.length}`);

const seaKeywordSet = new Set();
const seaDupes = [];
for (const r of seasonRows) {
  if (seaKeywordSet.has(r['키워드'])) seaDupes.push(r['키워드']);
  seaKeywordSet.add(r['키워드']);
}
assert(seaDupes.length === 0, `season dictionary has duplicate keywords: ${seaDupes.slice(0, 5).join(', ')}`);

let measured = 0;
let estimated = 0;
for (const r of seasonRows) {
  if (r['신뢰도'] === '실측') measured++;
  else if (r['신뢰도'] === '추정') estimated++;
  else fail(`unexpected 신뢰도 value: "${r['신뢰도']}" for "${r['키워드']}"`);
}
assert(measured === 5470, `season 신뢰도=실측 expected 5470, got ${measured}`);
assert(estimated === 874, `season 신뢰도=추정 expected 874, got ${estimated}`);

const ALLOWED_LEAD_TIMES = new Set([1, 2, 3]);
for (const r of seasonRows) {
  const lt = toInt(r['리드타임']);
  assert(ALLOWED_LEAD_TIMES.has(lt), `리드타임 outside {1,2,3} for "${r['키워드']}": "${r['리드타임']}"`);
}

const MONTH_COLS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
for (const r of seasonRows) {
  for (const col of MONTH_COLS) {
    assert(Number.isFinite(toFloat(r[col])), `${col} not numeric for "${r['키워드']}": "${r[col]}"`);
  }
  const months = (r['성수기구간'] || '').split('|').map((s) => s.trim()).filter(Boolean).map(Number);
  assert(months.length > 0, `성수기구간 empty for "${r['키워드']}"`);
  for (const m of months) {
    assert(Number.isInteger(m) && m >= 1 && m <= 12, `성수기구간 value out of [1,12] for "${r['키워드']}": "${r['성수기구간']}"`);
  }
}

const seasonIntensities = seasonRows.map((r) => toFloat(r['시즌강도'])).sort((a, b) => a - b);
assert(seasonIntensities.every((v) => Number.isFinite(v)), '시즌강도 has non-numeric values');
const seaMin = seasonIntensities[0];
const seaMax = seasonIntensities[seasonIntensities.length - 1];
assertNear(seaMin, 0.78, 0.1, '시즌강도 min');
assertNear(seaMax, 10.58, 0.2, '시즌강도 max');
const annualVolumes = seasonRows.map((r) => toInt(r['연간검색량'])).sort((a, b) => a - b);
const seaP25 = percentile(annualVolumes, 25);
const seaP75 = percentile(annualVolumes, 75);
assertNear(seaP25, 5434, 200, '시즌 사전 연간검색량 p25');
assertNear(seaP75, 37172, 1500, '시즌 사전 연간검색량 p75');
console.log(`[dictionaries] season 시즌강도: min=${seaMin} max=${seaMax}; 연간검색량 p25=${seaP25} p75=${seaP75}`);

// ---------- cross-dictionary ----------
const intersection = [...volKeywordSet].filter((k) => seaKeywordSet.has(k));
assert(intersection.length === 2440, `dictionary intersection expected 2440, got ${intersection.length}`);

// derived analytics — computed fresh, logged (not hard-gated: this script is now
// the authority on these, the planning doc's numbers were only a preview).
const seasonByKeyword = new Map(seasonRows.map((r) => [r['키워드'], r]));
const intersectionHighIntensity = intersection.filter((k) => toFloat(seasonByKeyword.get(k)['시즌강도']) >= 2.0);
const intersectionEstimated = intersection.filter((k) => seasonByKeyword.get(k)['신뢰도'] === '추정');
console.log(`[dictionaries] intersection=${intersection.length}, 시즌강도>=2.0=${intersectionHighIntensity.length} (spec preview: 580), 신뢰도=추정=${intersectionEstimated.length} (spec preview: 197)`);

if (fails.length) {
  console.error(`\n[dictionaries] BUILD FAILED — ${fails.length} assertion(s) did not hold:`);
  for (const f of fails) console.error('  - ' + f);
  console.error('\nThis means either the source CSVs changed, or a loading bug was introduced.');
  console.error('Do not guess which — inspect the CSVs and this script before proceeding.');
  process.exit(1);
}
console.log('[dictionaries] all §11.1 assertions passed.');

// ---------- build the bundle ----------
// Safety §8-15: volume 카테고리/원본카테고리 must not reach judge logic — kept only
// under `display`, which judges never receive (see src/lib/rules/engine.js).
const volume = {};
for (const r of volumeRows) {
  const kw = r['키워드'];
  if (EXPECTED_ONE_CHAR_KEYWORDS.has(kw)) continue; // §8-14: excluded at load time
  volume[kw] = {
    keyword: kw,
    monthlyVolume: toInt(r['총_월간검색량']),
    mobileShare: toFloat(r['모바일_비중']),
    competition: r['경쟁정도'],
    avgAdCount: toInt(r['월평균노출광고수']),
    labelMethod: r['라벨방식'],
    display: {
      category: r['카테고리'],
      originalCategory: r['원본카테고리'],
    },
  };
}

// Safety §8-8: 추정 season rows carry NO numeric fields at all — not filtered at
// render time, physically absent from the object, so a rule that forgets to check
// confidence simply has nothing to read.
const season = {};
for (const r of seasonRows) {
  const kw = r['키워드'];
  const confidence = r['신뢰도'];
  if (confidence === '추정') {
    season[kw] = {
      keyword: kw,
      confidence: '추정',
      display: { note: r['비고'] || '기준월 비수기 - 절대값 오차 큼' },
    };
    continue;
  }
  season[kw] = {
    keyword: kw,
    confidence: '실측',
    annualVolume: toInt(r['연간검색량']),
    seasonIntensity: toFloat(r['시즌강도']),
    competition: r['경쟁정도'],
    leadTimeMonths: toInt(r['리드타임']),
    peakMonths: r['성수기구간'].split('|').map((s) => Number(s.trim())),
    category: r['카테고리'], // 영업용 10종 — used only by SEO_005 조건 C, not a Naver category
    monthly: MONTH_COLS.map((c) => toInt(r[c])),
    display: {
      maxVolume: toInt(r['최고검색량']),
      peakMonth: r['성수기월'],
      offPeakMonth: r['비수기월'],
    },
  };
}

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(
  OUT_PATH,
  JSON.stringify(
    {
      meta: {
        builtAt: new Date().toISOString(),
        volumeCount: Object.keys(volume).length,
        seasonCount: Object.keys(season).length,
        intersectionCount: intersection.length,
        thresholds: {
          seo001MinSameDictMatches: 2,
          seo001RatioThreshold: 3,
          seo003VolumeTop25: 2110,
          seo003SeasonTop25: 37172,
          intersectionPriorityIntensity: 2.0,
          seo005ConditionBIntensity: 3.5,
        },
      },
      volume,
      season,
    },
    null,
    0
  )
);
console.log(`[dictionaries] wrote ${OUT_PATH} (volume=${Object.keys(volume).length}, season=${Object.keys(season).length})`);
