// §11.3 matching-engine tests.
//
// These run against the REAL generated dictionary (not a mock), per the spec's
// own instruction not to trust illustrative examples — several of the spec's
// worked examples turned out not to reproduce with the real 22,843-keyword data
// (see comments below), because the real dictionaries contain long compound
// entries the spec's simplified examples didn't anticipate. Where that happens,
// the assertion documents the real, verified behavior instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createMatchEngine, normalizeWithIndexMap } from '../src/lib/matchEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dictionaries = JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'lib', 'dictionaries.generated.json'), 'utf-8')
);
const engine = createMatchEngine(dictionaries);

function assertNonOverlapping(matches) {
  for (let i = 1; i < matches.length; i++) {
    assert.ok(
      matches[i].rawStart >= matches[i - 1].rawEnd,
      `matches overlap: ${matches[i - 1].keyword} (${matches[i - 1].rawStart}-${matches[i - 1].rawEnd}) vs ${matches[i].keyword} (${matches[i].rawStart}-${matches[i].rawEnd})`
    );
  }
}

test('case 1: longest match wins — real dictionary has "거실대형러그" as its own entry', () => {
  // The spec's illustrative example assumed "거실" would appear as a standalone
  // match (it isn't in either dictionary) and that the gap would stay unmatched.
  // In the real data, "거실대형러그" (6 chars) is itself a season-dictionary
  // keyword, so the greedy scanner correctly prefers it over shorter pieces.
  const matches = engine.scan('원형러그 거실 대형 러그');
  assert.deepEqual(matches.map((m) => m.keyword), ['원형러그', '거실대형러그']);
  assertNonOverlapping(matches);
});

test('case 2: non-overlap — "거실러그" matched once, "러그" not re-extracted from inside it', () => {
  const matches = engine.scan('무형광 아기 사계절 거실러그 대형');
  assert.deepEqual(matches.map((m) => m.keyword), ['거실러그']);
});

test('case 3: code checks volume-dictionary presence directly, does not trust the planning doc', () => {
  // "에어컨" alone IS in the volume dictionary, but the real data also contains
  // the longer compound "삼성비스포크에어컨" in the SEASON dictionary only —
  // greedy longest-match prefers the compound, so this product name yields a
  // single season-only match, not a volume match. This is exactly the kind of
  // fact the code must observe itself, per §11.3 case 3.
  const hasAircon = '에어컨' in dictionaries.volume;
  assert.equal(hasAircon, true, 'volume dictionary must contain "에어컨" for this test to be meaningful');

  const matches = engine.scan('삼성 비스포크 에어컨 AF16B');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].keyword, '삼성비스포크에어컨');
  assert.equal(matches[0].volumeRecord, null, 'the compound match has no volume-side record');
  assert.notEqual(matches[0].seasonRecord, null);
  // SEO_001 requires >=2 same-dictionary matches; with only one, volume-side
  // match here, it must not render for this product name.
});

test('case 4: "추석선물세트" matches (season-only, 추정), "한우" matches both dictionaries', () => {
  const matches = engine.scan('2026 추석선물세트 한우 1++');
  assert.deepEqual(matches.map((m) => m.keyword), ['추석선물세트', '한우']);
  assertNonOverlapping(matches);
  assert.equal(matches[0].volumeRecord, null);
  assert.equal(matches[0].seasonRecord.confidence, '추정');
  assert.notEqual(matches[1].volumeRecord, null);
});

test('case 5: 1-char keywords never match, even adjacent to a real 2+ char keyword', () => {
  // "백" and "숄" are excluded at dictionary-load time (§8-14) AND the scanner's
  // MIN_KEYWORD_LEN=2 makes single-char matches structurally impossible either way.
  assert.equal('백' in dictionaries.volume, false);
  assert.equal('숄' in dictionaries.volume, false);
  const matches = engine.scan('프리미엄 가죽 가방 백 여성 숄더');
  assert.deepEqual(matches.map((m) => m.keyword), ['가죽가방']);
});

test('case 6: greedy matching can swallow a shorter dual-dictionary keyword into a longer one', () => {
  // Spec's SEO_003 B-situation worked example used "추석과일선물" assuming it
  // would appear as an isolated match with usable numbers on both sides. In the
  // real data it is 추정 (estimated) on the season side — not usable per §8-8 —
  // AND when immediately followed by "세트" the scanner matches the longer
  // "추석과일선물세트" compound instead, which has no volume-side entry at all.
  // Both facts matter for correctly implementing SEO_003, so they're pinned here.
  const raw = keywordsCsvRow('추석과일선물');
  assert.equal(raw.confidence, '추정', 'spec\'s worked example keyword is actually 추정 in real data');

  const matches = engine.scan('추석과일선물 세트 특선');
  assert.deepEqual(matches.map((m) => m.keyword), ['추석과일선물세트']);
  assert.equal(matches[0].volumeRecord, null);
  assert.equal(matches[0].seasonRecord.confidence, '추정');
});

test('case 7: empty / special-char-only / long input never throws, returns an array', () => {
  assert.deepEqual(engine.scan(''), []);
  assert.deepEqual(engine.scan('!@#$%^&*()   ...,,,'), []);
  assert.doesNotThrow(() => engine.scan('x'.repeat(250)));
  assert.doesNotThrow(() => engine.scan(null));
  assert.deepEqual(engine.scan(null), []);
  assert.doesNotThrow(() => engine.scan(undefined));
});

test('normalizeWithIndexMap: index map round-trips to the original string', () => {
  const { norm, indexMap } = normalizeWithIndexMap('가 방[테스트]');
  assert.equal(norm, '가방테스트');
  for (let i = 0; i < norm.length; i++) {
    assert.equal('가 방[테스트]'[indexMap[i]], norm[i]);
  }
});

function keywordsCsvRow(keyword) {
  const rec = dictionaries.season[keyword];
  return { confidence: rec?.confidence };
}
