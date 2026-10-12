// Synthetic products used by build-time validation (§11.5) and by
// test/validate-scripts.test.mjs. Each is constructed from real, verified
// dictionary keywords (see the exploration commands in git history / session
// notes) so the checks exercise the actual rendered message text, not just
// the raw {{template}} strings.
const MOEUM_CATEGORY = '생활/건강>테스트카테고리';

export function buildFixtures() {
  return [
    {
      label: 'moeum-violations',
      month: 9,
      product: base({
        categoryPath: MOEUM_CATEGORY,
        categoryId: '90000001',
        name: '테스트 상품',
        options: [{ name: '기본형', extraPrice: 3000, soldOut: true }], // triggers MOEUM_003/004/005 together
        productStatusType: 'SALE',
      }),
    },
    {
      label: 'tag-violations',
      month: 9,
      product: base({
        name: '겨울 목도리',
        tags: [
          { text: '목도리' }, // TAG_006: literal substring of the product name
          { text: '공백 있는 태그' }, // TAG_003
        ],
      }),
    },
    {
      label: 'price-and-ship',
      month: 9,
      product: base({
        salePrice: 10000,
        options: [
          { name: '1개', extraPrice: 0, soldOut: false },
          { name: '3개세트', extraPrice: 25000, soldOut: false }, // unit price 11,666 > 10,000
        ],
        categoryId: '50000000', // 패션의류 tier: 5,000원 상한
        baseFee: 6000,
        deliveryFeeType: 'CONDITIONAL_FREE',
        freeDelivery: true,
        // 10,000원 상품 + "30,000원 이상 무료" → 실제로는 배송비를 낸다(SHIP_002 발화).
        freeShipConditionAmount: 30000,
      }),
    },
    {
      // 2026-09-22 오탐 회귀 방지: 34,000원 상품 + "30,000원 이상 무료"는
      // 구매자가 실제로 무료로 받으므로 SHIP_002가 발화하면 안 된다.
      label: 'ship002-conditional-but-already-free',
      month: 9,
      product: base({
        salePrice: 34000,
        discountedSalePrice: 34000,
        deliveryFeeType: 'CONDITIONAL_FREE',
        freeDelivery: true,
        freeShipConditionAmount: 30000,
      }),
    },
    {
      label: 'opp-opportunities',
      month: 9,
      product: base({
        hasShortclip: false,
        regularSubscription: false,
        couponCount: 0,
        reviewEventActive: false,
        imageAltStats: { total: 8, missingAlt: 5 },
        noticeReferOnlyCount: 3,
        attributeStats: { hasExpandButton: true, missingLabels: ['특징'] },
        tags: [{ text: 'a' }, { text: 'b' }],
        categoryPath: '식품>건강식품>영양제', // OPP_004 now gated to consumable categories
      }),
    },
    {
      label: 'opp003-notification-coupon-alone',
      month: 9,
      // couponCount:1 keeps OPP_002 from also firing, so this exercises
      // OPP_003 on its own (not merged) — the merge path is covered separately.
      product: base({ couponCount: 1, notificationCouponConfigured: false }),
    },
    {
      label: 'opp002-003-merge',
      month: 9,
      product: base({ couponCount: 0, notificationCouponConfigured: false }),
    },
    {
      label: 'seo001-order-swap',
      month: 9,
      product: base({ name: '문구 가방' }), // 문구=20,610/월 < 가방=75,500/월, ratio 3.66x
    },
    {
      label: 'seo003-drop-candidate',
      month: 9,
      // "쪼갬목" is a real, low-volume (210/월) keyword; padded past 60 chars.
      product: base({ name: '쪼갬목 ' + '테'.repeat(58) }),
    },
    {
      label: 'seo003-b-situation',
      month: 9,
      // 캠핑용매트리스: 월 7,390(상위) vs 연 14,405(하위) — genuine disagreement.
      product: base({ name: '캠핑용매트리스 ' + 'ㅁ'.repeat(55) }),
    },
    {
      label: 'seo005-condition-a',
      month: 8,
      // 룸슈즈: 성수기 10-12월, 리드타임 2개월 → 8월 기준 착수시점 대상.
      product: base({ name: '룸슈즈', categoryPath: '생활/건강>실내화' }),
    },
    {
      label: 'seo005-condition-b',
      month: 8,
      // 삼계탕: 성수기 7월뿐, 8월엔 비수기, 강도 3.86 → 부진방어 대상.
      product: base({ name: '삼계탕', categoryPath: '식품>즉석식품' }),
    },
    {
      label: 'seo005-condition-c',
      month: 10,
      // 공기청정기 → 공기청정기호환필터 (intensity 3.61, peak=[1], lead=3 →
      // target month 1 at month=10): a real, on-topic condition-C suggestion,
      // confirming the relevance filter doesn't just suppress everything.
      product: base({ name: '삼성 공기청정기 필터 교체형', categoryPath: '디지털/가전>생활가전>공기청정기' }),
    },
    {
      label: 'seo008-no-expand-button',
      month: 9,
      product: base({ attributeStats: { hasExpandButton: false, missingLabels: [] } }),
    },
    {
      // BRAND_001~005는 브랜드스토어에서만 평가되므로 전용 픽스처가 없으면
      // "모든 룰을 한 번은 태운다"는 커버리지 테스트가 깨진다.
      label: 'brand-store',
      month: 9,
      product: base({ isBrandStore: true }),
    },
  ];
}

function base(overrides) {
  return {
    name: '기본 테스트 상품',
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
    couponCount: null, // "unknown" by default in fixtures, same as a real page where the banner wasn't found
    notificationCouponConfigured: null,
    reviewEventActive: null,
    imageAltStats: null,
    noticeReferOnlyCount: null,
    attributeStats: null,
    ...overrides,
  };
}
