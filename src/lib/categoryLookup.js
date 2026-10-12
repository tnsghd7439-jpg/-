// 상품 카테고리 → 그 소분류의 대표/확장 키워드 + 검색량, 그리고 시즌 추이.
//
// 두 자료의 카테고리 체계가 달라(상품은 스마트스토어, 키워드 자료는 네이버쇼핑)
// 경로 전체로는 맞출 수 없다. 소분류 '이름'으로 찾고 대분류 호환만 확인한다.
// 애매하면(소분류명이 여러 대분류에 있고 어느 쪽인지 못 고르면) 비워둔다.

const clean = (s) => String(s ?? '').trim();

/** 상품 카테고리 경로에서 소분류(3번째 단계) 이름. 4단계 상품도 3번째를 쓴다. */
function smallCategoryOf(categoryPath) {
  const segs = clean(categoryPath).split('>').map(clean).filter(Boolean);
  if (segs.length >= 3) return { big: segs[0], mid: segs[1], small: segs[2] };
  if (segs.length === 2) return { big: segs[0], mid: '', small: segs[1] };
  return null;
}

/**
 * 소분류 이름이 같은 후보가 여러 대분류에 있을 때 중분류로 가린다 —
 * '패션잡화>여성신발>샌들' 상품이 '남성패션>남성신발>샌들'에 붙는 걸 막는다.
 */
function midScore(productMid, candidateMid) {
  const a = clean(productMid);
  const b = clean(candidateMid);
  if (!a || !b) return 0;
  if (a === b) return 3;
  // 두 글자 이상 겹치는 조각이 있으면 같은 계열로 본다(여성신발 ↔ 신발).
  const tokens = (s) => s.split('/').map(clean).filter((t) => t.length >= 2);
  const bt = tokens(b);
  if (tokens(a).some((t) => bt.includes(t))) return 2;
  if (a.includes(b) || b.includes(a)) return 1;
  return 0;
}

/**
 * 상품 카테고리에 해당하는 소분류 키워드 묶음을 찾는다.
 * 대분류가 호환되는 후보만 인정하고, 그래도 여러 개면 검색량이 가장 큰 쪽을 쓴다.
 */
export function findCategoryKeywords(catkw, categoryPath) {
  const target = smallCategoryOf(categoryPath);
  if (!target) return null;

  const candidates = catkw.bySmall[target.small];
  if (!candidates || !candidates.length) return null;

  const allowedBigs = catkw.bigAliases[target.big] ?? [];
  const matched = candidates.filter((c) => allowedBigs.includes(c.big));
  if (!matched.length) return null;

  // 중분류가 맞는 쪽을 먼저, 그다음 검색량이 큰 쪽.
  matched.sort(
    (a, b) =>
      midScore(target.mid, b.mid) - midScore(target.mid, a.mid) || (b.main?.volume ?? 0) - (a.main?.volume ?? 0)
  );
  const picked = matched[0];
  return {
    main: picked.main,
    expansions: picked.expansions.slice(0, 5),
    sourceCategory: `${picked.big}>${picked.mid}>${picked.small}`,
    productCategory: categoryPath,
  };
}

/**
 * 시즌 사전(실측)에 있는 키워드면 월별 추이를 돌려준다.
 * 사전에 없으면 null — 추이를 지어내지 않는다.
 */
export function findSeasonality(dictionaries, keyword) {
  const rec = dictionaries.season?.[keyword];
  if (!rec || !Array.isArray(rec.monthly) || rec.monthly.length !== 12) return null;

  const max = Math.max(...rec.monthly);
  const min = Math.min(...rec.monthly);
  if (!max) return null;

  // 성수기가 1년 내내면 시즌성이 없다는 뜻이다(실측: '귀걸이'의 peakMonths가
  // 12개월 전부). 최고/최저 차이도 작으면 그래프를 보여줄 이유가 없다.
  const peakMonths = rec.peakMonths ?? [];
  if (peakMonths.length >= 6) return null;
  if (min > 0 && max / min < 1.5) return null;

  return {
    keyword,
    monthly: rec.monthly,
    peakMonths,
    confidence: rec.confidence,
    intensity: rec.seasonIntensity,
    max,
  };
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');

/**
 * 카테고리로 못 찾을 때의 보완책. 자료의 소분류 체계가 상품 쪽과 다른 영역이
 * 있다 — 예: 출산/유아동은 연령·용도별(0~6개월, 3~4세, 돌준비)로 짜여 있어
 * '유아동의류>상하복' 같은 의류 분류와 아예 안 맞는다.
 *
 * 그래서 대분류가 호환되는 그룹 중, 대표키워드가 상품명에 실제로 들어 있는
 * 것을 찾는다. 상품명에 없는 키워드는 쓰지 않으므로 지어내는 게 아니다.
 */
function findByProductName(catkw, categoryPath, productName) {
  const target = smallCategoryOf(categoryPath);
  const name = norm(productName);
  if (!target || !name) return null;

  const allowedBigs = catkw.bigAliases[target.big] ?? [];
  if (!allowedBigs.length) return null;

  const seen = new Set();
  const hits = [];
  for (const groups of Object.values(catkw.bySmall)) {
    for (const g of groups) {
      const key = `${g.big}>${g.mid}>${g.small}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!allowedBigs.includes(g.big)) continue;
      const kw = norm(g.main?.keyword);
      if (kw.length < 2 || !name.includes(kw)) continue;
      hits.push(g);
    }
  }
  if (!hits.length) return null;

  // 더 구체적인(긴) 키워드를 우선하고, 같으면 검색량이 큰 쪽.
  hits.sort((a, b) => b.main.keyword.length - a.main.keyword.length || b.main.volume - a.main.volume);
  const picked = hits[0];
  return {
    main: picked.main,
    expansions: picked.expansions.slice(0, 5),
    sourceCategory: `${picked.big}>${picked.mid}>${picked.small}`,
    productCategory: categoryPath,
    matchedBy: 'name',
  };
}

/** 패널에 쓸 묶음. 카테고리로도 상품명으로도 못 찾으면 null. */
export function buildCategoryPanel(catkw, dictionaries, product) {
  const found =
    findCategoryKeywords(catkw, product.categoryPath) ??
    findByProductName(catkw, product.categoryPath, product.name);
  if (!found) return null;

  const rows = [found.main, ...found.expansions].filter(Boolean);
  // 시즌 추이는 대표 키워드 기준으로 찾고, 없으면 확장 키워드에서 하나라도 찾는다.
  let season = null;
  for (const r of rows) {
    season = findSeasonality(dictionaries, r.keyword);
    if (season) break;
  }

  return { ...found, season };
}
