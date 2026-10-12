// One judge function per rule id. Each returns an ARRAY of zero or more finding
// descriptors: { vars, severityOverride?, slot? }. Empty array = rule does not
// fire for this product. `slot` lets a single rule (SEO_005) place findings in
// different popup regions (opportunity / defense-reply / new-registration).
import { monthlyPhrase, annualPhrase, commas, ruleApplies } from './helpers.js';

// 공식 가이드(2503 §3.2)는 "패션의류 하위 전체"처럼 '하위 전체'를 기준으로 하는데,
// 최상위 카테고리ID만 비교하면 실제 상품(예: 패션의류>티셔츠=50000167)은 하나도
// 안 걸려 사실상 룰이 꺼져 있었다. 상품 페이지에서 wholeCategoryName으로 전체
// 경로가 내려오므로(2026-10-07 확인), 경로 이름으로도 함께 판정한다.
const SHIP_THRESHOLDS = [
  { amount: 5000, ids: ['50000000', '50000001'], names: ['패션의류', '패션잡화'] },
  {
    amount: 12000,
    ids: ['50000002', '50000006', '50000100', '50000101', '50000102', '50000104', '50000105', '50000156', '50001030', '50001828', '50000035', '50001002', '50001102', '50001103', '50001108'],
    names: [
      '화장품/미용', '식품', '침실가구', '거실가구', '주방가구', '아동/주니어가구', '서재/사무용가구',
      '악기', '소형기계', '안마의자', '오토바이/스쿠터', '러닝머신', '골프클럽', '골프백', '자전거/MTB',
    ],
  },
  {
    amount: 200000,
    ids: ['50001430', '50001431', '50001408', '50001409', '50001421', '50001395'],
    names: ['냉장고', '김치냉장고', '세탁기', '건조기/탈수기', '에어컨', 'TV'],
  },
];
const DEFAULT_SHIP_THRESHOLD = 30000;

function shipThresholdFor(product) {
  const segments = String(product.categoryPath || '')
    .split('>')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const tier of SHIP_THRESHOLDS) {
    if (tier.ids.includes(product.categoryId)) return tier.amount;
    if (segments.some((seg) => tier.names.includes(seg))) return tier.amount;
  }
  return DEFAULT_SHIP_THRESHOLD;
}

// SEO_005 조건C relevance guard: demographic/generic modifiers that match a
// product name but say nothing about the PRODUCT TYPE (e.g. "신생아" matches
// both "아기침대" and "신생아겨울우주복" equally, even though a crib and a
// baby onesie have nothing to do with each other). Confirmed live 2026-09-14
// — a crib listing was getting formula/onesie keywords suggested because
// "신생아" alone satisfied the old category-only relevance check.
const GENERIC_MODIFIER_STOPLIST = new Set([
  '신생아', '영유아', '유아', '아기', '남아', '여아', '남성', '여성', '성인', '키즈', '주니어',
  '공용', '겨울', '여름', '봄', '가을', '사계절', '신상', '인기', '추천',
]);

const SEASON_CATEGORY_TO_NAVER_PREFIX = {
  식품: ['식품'],
  '유아·키즈': ['출산/육아'],
  뷰티: ['화장품/미용'],
  '패션·의류': ['패션의류', '패션잡화'],
  생활용품: ['생활/건강'],
  '가전·리빙': ['디지털/가전', '가구/인테리어'],
  '레저·스포츠': ['스포츠/레저'],
  '꽃·원예': ['생활/건강'],
  기념일선물: null, // 전 카테고리 허용
  명절선물: null,
};

function firstOption(product) {
  return product.options && product.options.length ? product.options[0] : null;
}

// ---- 확정위반 ----

function moeum003({ product }) {
  const first = firstOption(product);
  if (!first) return [];
  return first.extraPrice !== 0 ? [{ vars: {} }] : [];
}

function moeum005({ product }) {
  const first = firstOption(product);
  if (!first) return [];
  return first.soldOut && product.productStatusType === 'SALE' ? [{ vars: {} }] : [];
}

function moeum004({ product }) {
  // 의심 등급(§4.3 강등표) — 단순 포함 여부라 오탐 가능성이 있음(예:
  // "바켄슈타이거 303 드라이 스텐 가위"처럼 모델번호가 빠진 케이스는 못
  // 잡음). 사용자 확인(2026-09-14): 가격이 다르게 붙는 옵션이 있는데
  // 상품명에 첫 옵션명이 없는 건 실제로 명백한 위반 — 다만 문자열 포함
  // 검사의 한계는 그대로라 확정위반이 아닌 의심으로 유지.
  if (!product.options?.length) return [];
  const hasPricedVariant = product.options.some((o) => o.extraPrice !== 0);
  if (!hasPricedVariant) return [];
  const first = product.options[0];
  if (!first.name) return [];
  if (product.name && product.name.includes(first.name)) return [];
  return [{ vars: {} }];
}

const TAG_SPECIAL_RE = /[\s!@#$%^&*()+={}[\]|\\:;"'<>,.?/`~]/;
function tag003({ product }) {
  const bad = (product.tags || []).filter((t) => TAG_SPECIAL_RE.test(t.text));
  return bad.length ? [{ vars: {} }] : [];
}

function price003({ product }) {
  if (!product.options?.length) return [];
  const withQty = product.options
    .map((o) => {
      const m = o.name.match(/(\d+)\s*(개입|개|세트|팩)/);
      return m ? { qty: Number(m[1]), price: product.salePrice + o.extraPrice } : null;
    })
    .filter(Boolean);
  const base = withQty.find((o) => o.qty === 1) ?? { qty: 1, price: product.salePrice };
  const unitPrice = base.price / base.qty;
  const violates = withQty.some((o) => o.qty > 1 && o.price > unitPrice * o.qty);
  return violates ? [{ vars: {} }] : [];
}

function ship001({ product }) {
  if (typeof product.baseFee !== 'number') return [];
  return product.baseFee > shipThresholdFor(product) ? [{ vars: {} }] : [];
}

function ship002({ product }) {
  // 조건부 무료배송이라도 상품가가 기준 금액 이상이면 구매자는 실제로 무료로
  // 받는다 — 2026-09-22 오탐: 34,000원 상품에 "30,000원 이상 무료"인데 위반으로
  // 잡았다. 그래서 "구매자가 배송비를 실제로 낸다"가 증명될 때만 발화한다.
  if (product.freeDelivery !== true) return [];
  if (!product.deliveryFeeType || product.deliveryFeeType === 'FREE') return [];

  const threshold = product.freeShipConditionAmount;
  if (typeof threshold !== 'number') return []; // 기준 금액을 모르면 단정하지 않는다
  const price =
    typeof product.discountedSalePrice === 'number' && product.discountedSalePrice > 0
      ? product.discountedSalePrice
      : product.salePrice;
  if (typeof price !== 'number' || price >= threshold) return []; // 이미 무료 조건 충족

  return [{ vars: { threshold: commas(threshold), price: commas(price) } }];
}

// ---- 기회손실: 태그 ----

function tag001({ product }) {
  const filled = (product.tags || []).length;
  if (filled >= 10) return [];
  return [{ vars: { filledCount: filled, emptyCount: 10 - filled } }];
}

function tag006({ product }) {
  if (!product.name || !product.tags?.length) return [];
  const dup = product.tags.filter((t) => product.name.includes(t.text));
  return dup.length ? [{ vars: { dupCount: dup.length } }] : [];
}

// ---- 기회손실: 기능 미활용 ----

function opp001({ product }) {
  if (product.hasShortclip === null || product.hasShortclip === undefined) return [];
  return product.hasShortclip === false ? [{ vars: {} }] : [];
}

function opp002({ product }) {
  // couponCount === null means the banner text wasn't found/readable at all
  // (extraction uncertainty) — stay silent rather than claim "미발급".
  if (product.couponCount === null || product.couponCount === undefined) return [];
  return product.couponCount === 0 ? [{ vars: {} }] : [];
}

function opp003({ product }) {
  if (product.notificationCouponConfigured === null || product.notificationCouponConfigured === undefined) return [];
  return product.notificationCouponConfigured === false ? [{ vars: {} }] : [];
}

function opp004({ product }) {
  return product.regularSubscription === false ? [{ vars: {} }] : [];
}

function opp005({ product }) {
  if (product.reviewEventActive === null || product.reviewEventActive === undefined) return [];
  return product.reviewEventActive === false ? [{ vars: {} }] : [];
}

// ---- SEO ----

function seo001({ matches }) {
  // Exclude generic demographic/modifier matches (§ same stoplist as
  // SEO_005 조건C) — comparing "신생아"(attaches to every baby product)
  // against "휴대용아기침대"(the actual product type) by raw volume is
  // meaningless: the modifier's volume reflects demand for the whole
  // category, not evidence that THIS product type should be reordered
  // against it. Confirmed live 2026-09-14.
  const volMatches = matches
    .filter((m) => m.volumeRecord && !GENERIC_MODIFIER_STOPLIST.has(m.keyword))
    .sort((a, b) => a.order - b.order);
  if (volMatches.length < 2) return []; // §8-9: never render on <2 same-dict matches
  for (let i = 0; i < volMatches.length - 1; i++) {
    const left = volMatches[i];
    const right = volMatches[i + 1];
    const lv = left.volumeRecord.monthlyVolume;
    const rv = right.volumeRecord.monthlyVolume;
    if (lv < rv && rv >= lv * 3) {
      return [
        {
          vars: {
            leftKeyword: left.keyword,
            rightKeyword: right.keyword,
            leftVolume: monthlyPhrase(lv),
            rightVolume: monthlyPhrase(rv),
          },
        },
      ];
    }
  }
  return [];
}

/** top-25% test used by both branches of SEO_003. */
function isTop25(match, thresholds) {
  const volTop = match.volumeRecord ? match.volumeRecord.monthlyVolume >= thresholds.seo003VolumeTop25 : null;
  const seaTop =
    match.seasonRecord && match.seasonRecord.confidence === '실측'
      ? match.seasonRecord.annualVolume >= thresholds.seo003SeasonTop25
      : null;
  return { volTop, seaTop };
}

function seo003({ product, matches, dictionaries }) {
  const nameLen = [...(product.name || '')].length;
  if (nameLen <= 60) return [];
  const thresholds = dictionaries.meta.thresholds;
  const findings = [];

  for (const m of matches) {
    const { volTop, seaTop } = isTop25(m, thresholds);
    const hasVol = volTop !== null;
    const hasSea = seaTop !== null;

    if (hasVol && hasSea) {
      if (volTop !== seaTop) {
        // B situation: judgment disagrees — 참고, no message, no copy button.
        findings.push({
          severityOverride: '참고',
          vars: {
            keyword: m.keyword,
            volumeVolume: monthlyPhrase(m.volumeRecord.monthlyVolume),
            volumeTop: volTop,
            seasonVolume: annualPhrase(m.seasonRecord.annualVolume),
            seasonTop: seaTop,
          },
        });
      }
      // both top25 -> 자르지 않음 (no finding); both below -> A 축약후보 (below)
      if (!volTop && !seaTop) {
        findings.push({ vars: { dropKeyword: m.keyword, dropVolume: monthlyPhrase(m.volumeRecord.monthlyVolume) } });
      }
    } else if (hasVol && !volTop) {
      findings.push({ vars: { dropKeyword: m.keyword, dropVolume: monthlyPhrase(m.volumeRecord.monthlyVolume) } });
    } else if (hasSea && !seaTop) {
      findings.push({ vars: { dropKeyword: m.keyword, dropVolume: annualPhrase(m.seasonRecord.annualVolume) } });
    }
  }
  return findings;
}

function seo005({ product, matches, dictionaries, currentMonth }) {
  const findings = [];
  const seasonMatches = matches.filter((m) => m.seasonRecord && m.seasonRecord.confidence === '실측');

  for (const m of seasonMatches) {
    const s = m.seasonRecord;
    const target = ((currentMonth + s.leadTimeMonths - 1) % 12) + 1;
    if (s.peakMonths.includes(target) && s.seasonIntensity >= 2.0) {
      findings.push({
        slot: 'opportunity',
        vars: { keyword: m.keyword },
        template:
          '대표님 저희 상품 보니까 {{keyword}}로 잡혀 있는데요, 저희 팀 기준으로는 지금이 준비 들어가셔야 하는 시점이에요. 보통 몇 달 전부터 상품명이랑 태그를 손봐두셔야 성수기 들어갈 때 순위가 올라와 있어요. 혹시 이런 시즌 선행 제안은 대행사 통해서 받아보신 적 있으실까요?',
      });
    }
    if (!s.peakMonths.includes(currentMonth) && s.seasonIntensity >= 3.5) {
      findings.push({
        slot: 'defense',
        vars: { keyword: m.keyword },
        template:
          '대표님 그거 상품이 문제가 아니실 거예요. 저희가 보는 자료로는 {{keyword}} 관련 상품군이 원래 이 시기엔 검색이 제일 적게 들어오는 구간이거든요. 지금 안 되는 게 정상이라서 너무 신경 안 쓰셔도 되고, 오히려 지금이 성수기 들어가기 전에 상품명이랑 태그를 미리 맞춰두기 좋은 시기예요. 혹시 이런 시즌 분석은 대행사 통해서 받아보신 적 있으실까요?',
      });
    }
  }

  // 조건 C: 영업용 10종 카테고리 매핑 + 조건 A 만족 + 상품명/태그에 없는 키워드 상위 5개
  //
  // The 10-category mapping alone is too coarse to gate this — "출산/육아"
  // covers everything from cribs to formula to onesies, so a crib listing was
  // getting "탈지분유"(formula)/"우주복"(onesie) suggested (confirmed live
  // 2026-09-14). Neither dictionary has a finer category than that, so
  // relevance is enforced instead via substring overlap with the product's
  // OWN matched keywords (its actual product-type words, e.g. "아기침대") —
  // this keeps suggestions in the same product family instead of just the
  // same broad shopping category.
  const anchors = matches.map((m) => m.keyword).filter((k) => k.length >= 2 && !GENERIC_MODIFIER_STOPLIST.has(k));
  function sharesSubstring(a, b, minLen = 2) {
    for (let len = Math.min(a.length, b.length); len >= minLen; len--) {
      for (let i = 0; i <= a.length - len; i++) {
        if (b.includes(a.slice(i, i + len))) return true;
      }
    }
    return false;
  }

  const compatibleCategories = Object.entries(SEASON_CATEGORY_TO_NAVER_PREFIX)
    .filter(([, prefixes]) => prefixes === null || prefixes.some((p) => product.categoryPath?.startsWith(p)))
    .map(([cat]) => cat);
  const existingText = (product.name || '') + (product.tags || []).map((t) => t.text).join('');
  const candidates =
    anchors.length === 0
      ? [] // no recognized product-type keyword to judge relevance against — stay silent, don't guess
      : Object.values(dictionaries.season)
          .filter((r) => r.confidence === '실측' && compatibleCategories.includes(r.category))
          .filter((r) => !existingText.includes(r.keyword))
          // Require 3+ chars of overlap so a generic 2-char modifier
          // *embedded inside* a longer anchor (e.g. "아기" inside
          // "휴대용아기침대") can't match "겨울아기옷" on its own — confirmed
          // live 2026-09-14. But when the anchor itself is only 2 chars long
          // (plenty of real product-type nouns are, e.g. "침대"/"가방"), that
          // would make it impossible to match anything at all; in that case
          // require the full anchor (2 chars) instead of demanding 3.
          .filter((r) => anchors.some((a) => sharesSubstring(a, r.keyword, Math.min(a.length, 3))))
          .filter((r) => {
            const target = ((currentMonth + r.leadTimeMonths - 1) % 12) + 1;
            return r.peakMonths.includes(target) && r.seasonIntensity >= 2.0;
          })
          .sort((a, b) => b.annualVolume - a.annualVolume)
          .slice(0, 5);
  if (candidates.length) {
    findings.push({
      slot: 'newProduct',
      vars: { candidates: candidates.map((c) => c.keyword).join(', ') },
      template:
        '대표님 지금 안 다루고 계신 상품 중에 곧 시즌이 다가오는 키워드가 몇 개 보여서요 — {{candidates}}. 이쪽으로 상품 등록을 늘려두시면 시즌 진입 전에 노출을 더 가져갈 수 있어요. 혹시 이런 신규 상품 제안은 대행사 통해서 받아보신 적 있으실까요?',
    });
  }

  return findings;
}

/**
 * "메인키워드" for messages that need one — highest-demand matched keyword,
 * degrading gracefully. Excludes generic demographic/modifier words (same
 * stoplist as SEO_001/SEO_005 조건C) for the same reason: "신생아" has huge
 * volume because it attaches to every baby product, not because it names
 * THIS product's type — picking it as "the" keyword was confirmed live
 * 2026-09-14 to misrepresent an "휴대용아기침대" listing as being about
 * "신생아".
 */
function mainKeyword(matches) {
  const real = matches.filter((m) => !GENERIC_MODIFIER_STOPLIST.has(m.keyword));
  const volCandidates = real.filter((m) => m.volumeRecord).sort((a, b) => b.volumeRecord.monthlyVolume - a.volumeRecord.monthlyVolume);
  if (volCandidates.length) return volCandidates[0].keyword;
  const seaCandidates = real
    .filter((m) => m.seasonRecord && m.seasonRecord.confidence === '실측')
    .sort((a, b) => b.seasonRecord.annualVolume - a.seasonRecord.annualVolume);
  if (seaCandidates.length) return seaCandidates[0].keyword;
  if (real.length) return real[0].keyword;
  return '이 상품';
}

function seo006({ product, matches }) {
  // Plain DOM attribute read (img.alt) — no vision AI needed. null means the
  // detail container/images weren't found (unknown), not "all present".
  if (!product.imageAltStats) return [];
  const { total, missingAlt } = product.imageAltStats;
  if (missingAlt === 0) return [];
  return [{ vars: { missingCount: missingAlt, totalCount: total, mainKeyword: mainKeyword(matches) } }];
}

const NOTICE_REFER_ONLY_THRESHOLD = 2;

function seo007({ product }) {
  // 네이버 AI브리핑 준비사항 ④ — pure text-match, unaffected by category-
  // specific attribute schema differences. null = notice panel not found.
  if (product.noticeReferOnlyCount === null || product.noticeReferOnlyCount === undefined) return [];
  if (product.noticeReferOnlyCount < NOTICE_REFER_ONLY_THRESHOLD) return [];
  return [{ vars: { count: product.noticeReferOnlyCount } }];
}

function seo008({ product }) {
  // 네이버 AI브리핑 준비사항 ① — 가이드상 "결정적" 영향력이지만 빈 값의
  // 실제 렌더링을 육안 확인한 적은 없는 추정치 구현(§ rules.json basis 참고).
  if (!product.attributeStats) return [];
  const { hasExpandButton, missingLabels } = product.attributeStats;
  if (!hasExpandButton) {
    return [
      {
        vars: {},
        template:
          '대표님 저희 상품정보에 "더보기" 버튼 자체가 없더라구요. 이게 있다는 건 등록해두신 추가 속성이 거의 없다는 뜻일 가능성이 높은데요, 네이버가 AI브리핑에서 가장 결정적으로 보는 게 바로 이 속성값들이라서요. 혹시 이런 상품속성 관리는 대행사 통해서 받고 계실까요?',
      },
    ];
  }
  if (missingLabels.length > 0) {
    return [{ vars: { labels: missingLabels.join(', ') } }];
  }
  return [];
}

/**
 * 브랜드스토어 전용 제안 항목. 이 솔루션들(라운지·브랜드CRM·브랜드분석·CRM
 * 마케팅 타겟·메타 협력광고)의 사용 여부는 상품 페이지에서 확인할 방법이 없다
 * — 셀러센터 구독 정보라 외부 신호가 없기 때문이다. 그래서 "안 하고 계시네요"로
 * 단정하지 않고, 통화 중에 물어보는 질문형 멘트로만 띄운다(별도 ④ 구역).
 */
function brandProposal() {
  return [{ slot: 'brand', vars: {} }];
}

export const JUDGES = {
  moeum003,
  moeum004,
  moeum005,
  tag003,
  price003,
  ship001,
  ship002,
  tag001,
  tag006,
  opp001,
  opp002,
  opp003,
  opp004,
  opp005,
  seo001,
  seo003,
  seo005,
  seo006,
  seo007,
  seo008,
  brandProposal,
};

export { ruleApplies };
