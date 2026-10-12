import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluateProduct, collectCopyableMessages } from '../src/lib/rules/engine.js';
import { JUDGES } from '../src/lib/rules/judges.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dictionaries = JSON.parse(readFileSync(join(root, 'src', 'lib', 'dictionaries.generated.json'), 'utf-8'));
const rulesDoc = JSON.parse(readFileSync(join(root, 'src', 'lib', 'rules.json'), 'utf-8'));

function baseProduct(overrides = {}) {
  return {
    name: '테스트 상품',
    categoryPath: '생활/건강>테스트',
    categoryId: '99999999',
    salePrice: 10000,
    baseFee: 0,
    deliveryFeeType: 'FREE',
    freeDelivery: true,
    tags: [],
    options: null,
    optionUsable: false,
    productStatusType: 'SALE',
    regularSubscription: true,
    hasShortclip: true,
    couponCount: null,
    notificationCouponConfigured: null,
    reviewEventActive: null,
    imageAltStats: null,
    noticeReferOnlyCount: null,
    attributeStats: null,
    ...overrides,
  };
}

test('OPP_004 (정기구독) only fires for consumable-type categories, not general merchandise', () => {
  const durable = baseProduct({ regularSubscription: false, categoryPath: '가구/인테리어>거실가구>소파' });
  assert.ok(!evaluateProduct(durable, rulesDoc, dictionaries, 9).findings.some((f) => f.id === 'OPP_004'));

  const consumable = baseProduct({ regularSubscription: false, categoryPath: '식품>건강식품>영양제' });
  assert.ok(evaluateProduct(consumable, rulesDoc, dictionaries, 9).findings.some((f) => f.id === 'OPP_004'));
});

test('SEO_001 message presents both directions as options, not a one-sided directive', () => {
  const product = baseProduct({ name: '문구 가방' }); // 문구=20,610/월 < 가방=75,500/월
  const { findings } = evaluateProduct(product, rulesDoc, dictionaries, 9);
  const f = findings.find((x) => x.id === 'SEO_001');
  assert.ok(f);
  assert.ok(f.message.includes('전략'), 'message should acknowledge the deliberate-placement strategy, not just say "fix it"');
});

test('SEO_001 never compares against a generic demographic modifier (§ same guard as SEO_005 조건C)', () => {
  // Confirmed live 2026-09-14: comparing "신생아" (attaches to every baby
  // product) against "휴대용아기침대" (the actual product type) suggested
  // reordering based on a meaningless volume comparison.
  const product = baseProduct({ name: '썬데이허그 ABC 휴대용 아기침대 접이식 이동식 신생아 유아침대 여행용' });
  const { findings } = evaluateProduct(product, rulesDoc, dictionaries, 9);
  const f = findings.find((x) => x.id === 'SEO_001');
  if (f) {
    assert.ok(!f.message.includes('신생아'), '신생아 should never appear as either side of an SEO_001 comparison');
  }
});

test('SEO_006 (alt 텍스트 누락) fires with the exact counts, stays silent when stats are unknown or clean', () => {
  const missing = baseProduct({ imageAltStats: { total: 8, missingAlt: 5 } });
  const f = evaluateProduct(missing, rulesDoc, dictionaries, 9).findings.find((x) => x.id === 'SEO_006');
  assert.ok(f);
  // "22장에" style — just the missing count, no "총 N장 중" framing (2026-09-14 request)
  assert.ok(f.message.includes('5장'));
  assert.ok(!f.message.includes('8장'), 'should not mention the total image count anymore');

  const clean = baseProduct({ imageAltStats: { total: 8, missingAlt: 0 } });
  assert.ok(!evaluateProduct(clean, rulesDoc, dictionaries, 9).findings.some((x) => x.id === 'SEO_006'));

  const unknown = baseProduct({ imageAltStats: null });
  assert.ok(!evaluateProduct(unknown, rulesDoc, dictionaries, 9).findings.some((x) => x.id === 'SEO_006'));
});

test('SEO_006 message names an actual product-type keyword, never a generic modifier like 신생아', () => {
  const product = baseProduct({
    name: '썬데이허그 ABC 휴대용 아기침대 접이식 이동식 신생아 유아침대 여행용',
    imageAltStats: { total: 136, missingAlt: 51 },
  });
  const f = evaluateProduct(product, rulesDoc, dictionaries, 9).findings.find((x) => x.id === 'SEO_006');
  assert.ok(f);
  assert.ok(!f.message.includes('신생아를 검색'), 'must not pick "신생아" as the representative keyword');
});

test('SEO_007 (상품상세참조 방치) fires only at/above the threshold, stays silent below it or when unknown', () => {
  const many = baseProduct({ noticeReferOnlyCount: 3 });
  const f = evaluateProduct(many, rulesDoc, dictionaries, 9).findings.find((x) => x.id === 'SEO_007');
  assert.ok(f);
  assert.ok(f.message.includes('3'));

  const one = baseProduct({ noticeReferOnlyCount: 1 });
  assert.ok(!evaluateProduct(one, rulesDoc, dictionaries, 9).findings.some((x) => x.id === 'SEO_007'));

  const unknown = baseProduct({ noticeReferOnlyCount: null });
  assert.ok(!evaluateProduct(unknown, rulesDoc, dictionaries, 9).findings.some((x) => x.id === 'SEO_007'));
});

test('SEO_008 (상품속성 누락 추정): no-expand-button and missing-label cases each fire, unknown/clean stay silent', () => {
  const noButton = baseProduct({ attributeStats: { hasExpandButton: false, missingLabels: [] } });
  const f1 = evaluateProduct(noButton, rulesDoc, dictionaries, 9).findings.find((x) => x.id === 'SEO_008');
  assert.ok(f1);
  assert.ok(f1.message.includes('더보기'));

  const missingField = baseProduct({ attributeStats: { hasExpandButton: true, missingLabels: ['특징', '색상'] } });
  const f2 = evaluateProduct(missingField, rulesDoc, dictionaries, 9).findings.find((x) => x.id === 'SEO_008');
  assert.ok(f2);
  assert.ok(f2.message.includes('특징') && f2.message.includes('색상'));

  const clean = baseProduct({ attributeStats: { hasExpandButton: true, missingLabels: [] } });
  assert.ok(!evaluateProduct(clean, rulesDoc, dictionaries, 9).findings.some((x) => x.id === 'SEO_008'));

  const unknown = baseProduct({ attributeStats: null });
  assert.ok(!evaluateProduct(unknown, rulesDoc, dictionaries, 9).findings.some((x) => x.id === 'SEO_008'));
});

test('OPP_002 (쿠폰) fires on couponCount=0, stays silent on null (unknown), and does not fire when >=1', () => {
  const none = baseProduct({ couponCount: 0 });
  assert.ok(evaluateProduct(none, rulesDoc, dictionaries, 9).findings.some((f) => f.id === 'OPP_002'));

  const unknown = baseProduct({ couponCount: null });
  assert.ok(!evaluateProduct(unknown, rulesDoc, dictionaries, 9).findings.some((f) => f.id === 'OPP_002'));

  const has = baseProduct({ couponCount: 1 });
  assert.ok(!evaluateProduct(has, rulesDoc, dictionaries, 9).findings.some((f) => f.id === 'OPP_002'));
});

test('OPP_003 (알림받기 유도) fires only on a confirmed false, stays silent on unknown/true', () => {
  const missing = baseProduct({ notificationCouponConfigured: false, couponCount: 1 });
  assert.ok(evaluateProduct(missing, rulesDoc, dictionaries, 9).findings.some((f) => f.id === 'OPP_003'));

  const unknown = baseProduct({ notificationCouponConfigured: null, couponCount: 1 });
  assert.ok(!evaluateProduct(unknown, rulesDoc, dictionaries, 9).findings.some((f) => f.id === 'OPP_003'));

  const configured = baseProduct({ notificationCouponConfigured: true, couponCount: 1 });
  assert.ok(!evaluateProduct(configured, rulesDoc, dictionaries, 9).findings.some((f) => f.id === 'OPP_003'));
});

test('OPP_005 (리뷰이벤트) fires only on a confirmed false, stays silent on unknown/true', () => {
  const missing = baseProduct({ reviewEventActive: false });
  assert.ok(evaluateProduct(missing, rulesDoc, dictionaries, 9).findings.some((f) => f.id === 'OPP_005'));

  const unknown = baseProduct({ reviewEventActive: null });
  assert.ok(!evaluateProduct(unknown, rulesDoc, dictionaries, 9).findings.some((f) => f.id === 'OPP_005'));
});

test('OPP_002 and OPP_003 merge into one finding when both fire (§4.2-G 병합 규칙)', () => {
  const both = baseProduct({ couponCount: 0, notificationCouponConfigured: false });
  const { findings } = evaluateProduct(both, rulesDoc, dictionaries, 9);
  assert.ok(!findings.some((f) => f.id === 'OPP_002'), 'OPP_002 should not appear standalone once merged');
  assert.ok(!findings.some((f) => f.id === 'OPP_003'), 'OPP_003 should not appear standalone once merged');
  const merged = findings.find((f) => f.id === 'OPP_002+OPP_003');
  assert.ok(merged, 'expected a single merged finding');
  assert.equal(findings.filter((f) => f.id.includes('OPP_002') || f.id.includes('OPP_003')).length, 1);
});

test('MOEUM_003 triggers when the first option carries an extra charge', () => {
  const product = baseProduct({ options: [{ name: '기본형', extraPrice: 3000, soldOut: false }] });
  const { findings } = evaluateProduct(product, rulesDoc, dictionaries, 9);
  assert.ok(findings.some((f) => f.id === 'MOEUM_003' && f.severity === '확정위반'));
});

test('MOEUM_003 also triggers on a NEGATIVE first-option price (confirmed live 2026-09-14 bug)', () => {
  const product = baseProduct({ options: [{ name: '기본형', extraPrice: -3000, soldOut: false }] });
  const { findings } = evaluateProduct(product, rulesDoc, dictionaries, 9);
  assert.ok(findings.some((f) => f.id === 'MOEUM_003' && f.severity === '확정위반'));
});

test('MOEUM_004 (의심): fires when a priced option exists and its name is missing from the product name', () => {
  const product = baseProduct({ name: '아무 이름', options: [{ name: '블랙', extraPrice: -3000, soldOut: false }] });
  const { findings } = evaluateProduct(product, rulesDoc, dictionaries, 9);
  const f = findings.find((x) => x.id === 'MOEUM_004');
  assert.ok(f);
  assert.equal(f.severity, '의심');
  assert.ok(f.copyable, '의심 findings should still be copyable, unlike 참고');
});

test('MOEUM_004 stays silent when the first option name IS in the product title', () => {
  const product = baseProduct({ name: '블랙 텀블러 세트', options: [{ name: '블랙', extraPrice: -3000, soldOut: false }] });
  assert.ok(!evaluateProduct(product, rulesDoc, dictionaries, 9).findings.some((x) => x.id === 'MOEUM_004'));
});

test('MOEUM_004 stays silent when no option actually has a price difference', () => {
  const product = baseProduct({ name: '아무 이름', options: [{ name: '블랙', extraPrice: 0, soldOut: false }] });
  assert.ok(!evaluateProduct(product, rulesDoc, dictionaries, 9).findings.some((x) => x.id === 'MOEUM_004'));
});

test('MOEUM_003 does not trigger when there are no options at all', () => {
  const product = baseProduct({ options: null });
  const { findings } = evaluateProduct(product, rulesDoc, dictionaries, 9);
  assert.ok(!findings.some((f) => f.id === 'MOEUM_003'));
});

test('MOEUM_005 triggers only when the first option is sold out AND the product is on sale', () => {
  const soldOut = baseProduct({ options: [{ name: '기본형', extraPrice: 0, soldOut: true }], productStatusType: 'SALE' });
  assert.ok(evaluateProduct(soldOut, rulesDoc, dictionaries, 9).findings.some((f) => f.id === 'MOEUM_005'));

  const suspended = baseProduct({ options: [{ name: '기본형', extraPrice: 0, soldOut: true }], productStatusType: 'SUSPENSION' });
  assert.ok(!evaluateProduct(suspended, rulesDoc, dictionaries, 9).findings.some((f) => f.id === 'MOEUM_005'));
});

test('TAG_001 reports the exact filled/empty counts', () => {
  const product = baseProduct({ tags: [{ text: 'a' }, { text: 'b' }] });
  const { findings } = evaluateProduct(product, rulesDoc, dictionaries, 9);
  const f = findings.find((x) => x.id === 'TAG_001');
  assert.equal(f.vars.filledCount, 2);
  assert.equal(f.vars.emptyCount, 8);
  assert.ok(f.message.includes('8개'));
});

test('TAG_003 fires on special-char/whitespace tags, and forbidden terms never leak in', () => {
  const product = baseProduct({ tags: [{ text: '공백 태그' }] });
  const { findings } = evaluateProduct(product, rulesDoc, dictionaries, 9);
  assert.ok(findings.some((f) => f.id === 'TAG_003'));
});

test('SEO_001 does not render with fewer than 2 same-dictionary (volume) matches', () => {
  // "가방" alone is a single volume match — must not render.
  const product = baseProduct({ name: '가방' });
  const { findings } = evaluateProduct(product, rulesDoc, dictionaries, 9);
  assert.ok(!findings.some((f) => f.id === 'SEO_001'));
});

test('SEO_005 조건C: does not suggest unrelated products via a generic demographic modifier', () => {
  // Confirmed live 2026-09-14: a crib listing was getting "겨울아기옷"
  // (baby clothes) suggested, because "신생아"/"아기" — generic modifiers —
  // matched both the crib and the clothing keyword. Neither should appear.
  const crib = baseProduct({
    name: '썬데이허그 ABC 휴대용 아기침대 접이식 이동식 신생아 유아침대 여행용',
    categoryPath: '출산/육아>침구/가구>아기침대',
  });
  const { findings } = evaluateProduct(crib, rulesDoc, dictionaries, 9);
  const newProduct = findings.find((f) => f.id === 'SEO_005' && f.slot === 'newProduct');
  if (newProduct) {
    assert.ok(!newProduct.message.includes('우주복'));
    assert.ok(!newProduct.message.includes('아기옷'));
  }
});

test('SEO_005 조건C: still suggests genuinely related keywords when they exist', () => {
  const purifier = baseProduct({ name: '삼성 공기청정기 필터 교체형', categoryPath: '디지털/가전>생활가전>공기청정기' });
  const { findings } = evaluateProduct(purifier, rulesDoc, dictionaries, 10);
  const newProduct = findings.find((f) => f.id === 'SEO_005' && f.slot === 'newProduct');
  assert.ok(newProduct, 'expected a condition-C suggestion for a clearly on-topic keyword family');
  assert.ok(newProduct.message.includes('공기청정기'));
});

test('SEO_005 조건C: a 2-char main keyword can still match (not just 3+ char anchors)', () => {
  // A flat "require 3+ overlap chars" rule would make a 2-char anchor like
  // "가방" unable to match anything at all — confirmed as a real gap.
  const product = baseProduct({ name: '2026 신상 가방', categoryPath: '패션잡화>가방>기타가방' });
  const { findings } = evaluateProduct(product, rulesDoc, dictionaries, 11);
  const newProduct = findings.find((f) => f.id === 'SEO_005' && f.slot === 'newProduct');
  assert.ok(newProduct, 'a 2-char anchor ("가방") should still be able to surface a relevant candidate');
  assert.ok(newProduct.message.includes('가방'));
});

test('참고 findings carry no message and are excluded from the copy-all collector', () => {
  // "캠핑용매트리스" is a real, verified SEO_003 B-situation keyword: volume
  // side is top-25% (7,390 >= 2,110) but season side is not (14,405 < 37,172),
  // confidence=실측 on both — a genuine judgment disagreement, not a data gap.
  const padded = '캠핑용매트리스 ' + 'ㅁ'.repeat(55);
  const { findings } = evaluateProduct(baseProduct({ name: padded }), rulesDoc, dictionaries, 9);
  const reference = findings.filter((f) => f.severity === '참고');
  assert.ok(reference.length > 0, 'expected at least one 참고 (B-situation) finding');
  for (const f of reference) {
    assert.equal(f.message, null);
    assert.equal(f.copyable, false);
  }
  const copyable = collectCopyableMessages(findings);
  for (const msg of copyable) {
    assert.ok(!reference.some((f) => f.message === msg));
  }
});

test('collectCopyableMessages never includes a null message', () => {
  const product = baseProduct({ tags: [{ text: 'a' }] });
  const { findings } = evaluateProduct(product, rulesDoc, dictionaries, 9);
  const msgs = collectCopyableMessages(findings);
  assert.ok(msgs.every((m) => typeof m === 'string' && m.length > 0));
});

test('findings are ordered: alt(1) → 고시/속성(2) → 시즌선행(3) → 상품명(4) → 태그10개(5) → 태그중복(6) → 쿠폰+알림받기 병합(7) → 리뷰이벤트 등 단독(8) → 나머지(9) (2026-09-14 재지정)', () => {
  const product = baseProduct({
    name: '문구 가방', // SEO_001 (상품명 앞/뒤 배치)
    imageAltStats: { total: 8, missingAlt: 5 }, // SEO_006 — tier 1
    noticeReferOnlyCount: 3, // SEO_007 — tier 2
    couponCount: 0,
    notificationCouponConfigured: false, // merges into OPP_002+OPP_003 — tier 7
    reviewEventActive: false, // OPP_005 — tier 8
    hasShortclip: false, // OPP_001 — tier 9 (default)
    tags: [{ text: 'a' }], // TAG_001 — tier 5
  });
  const { findings } = evaluateProduct(product, rulesDoc, dictionaries, 9);
  const order = findings.map((f) => f.id);
  const idx = (id) => order.indexOf(id);

  for (const id of ['SEO_006', 'SEO_007', 'SEO_001', 'TAG_001', 'OPP_002+OPP_003', 'OPP_005', 'OPP_001']) {
    assert.ok(idx(id) !== -1, `expected ${id} to fire in this fixture`);
  }
  assert.ok(idx('SEO_006') < idx('SEO_007'));
  assert.ok(idx('SEO_007') < idx('SEO_001'));
  assert.ok(idx('SEO_001') < idx('TAG_001'));
  assert.ok(idx('TAG_001') < idx('OPP_002+OPP_003'));
  assert.ok(idx('OPP_002+OPP_003') < idx('OPP_005'));
  assert.ok(idx('OPP_005') < idx('OPP_001'));
});

// 2026-10-07: 공식 가이드는 "패션의류 하위 전체 5,000원"인데 최상위 카테고리ID만
// 비교하던 탓에 실제 상품(티셔츠 등)이 하나도 안 걸렸다. wholeCategoryName 경로로
// 판정하도록 고친 뒤의 회귀 방지.
test('SHIP_001: 카테고리 경로로 하위 상품까지 상한이 적용된다', () => {
  const fires = (product) => JUDGES.ship001({ product }).length > 0;

  // 패션의류 하위 → 5,000원 상한
  assert.equal(fires({ categoryPath: '패션의류>여성의류>티셔츠', categoryId: '50000167', baseFee: 6000 }), true);
  assert.equal(fires({ categoryPath: '패션의류>여성의류>티셔츠', categoryId: '50000167', baseFee: 4000 }), false);

  // 침실가구 하위 → 12,000원 상한
  assert.equal(fires({ categoryPath: '가구/인테리어>침실가구>침대', categoryId: '50000123', baseFee: 15000 }), true);
  assert.equal(fires({ categoryPath: '가구/인테리어>침실가구>침대', categoryId: '50000123', baseFee: 10000 }), false);

  // 냉장고 → 200,000원 상한이라 15만원은 위반이 아니다
  assert.equal(fires({ categoryPath: '디지털/가전>주방가전>냉장고', categoryId: '50009999', baseFee: 150000 }), false);

  // 표에 없는 카테고리 → 기본 30,000원
  assert.equal(fires({ categoryPath: '생활/건강>문구>볼펜', categoryId: '50007777', baseFee: 35000 }), true);
});
