// 상품명 → 메인 키워드 + 연관 키워드의 입찰가·검색량 조회.
//
// 설계상 가장 중요한 건 "틀린 키워드를 집지 않는 것"이다. 단순 부분 문자열
// 매칭만 쓰면 긴 상품명 안의 조각이 엉뚱한 카테고리 키워드와 우연히 맞는다
// (실측: "수면교육"에서 '교육'이 잡혀 교원임용고시 키워드가 추천됨).
// 그래서 두 가지 장치를 둔다.
//   1) 최장 일치 우선 — 검색량 우선으로 뽑으면 짧고 흔한 단어가 이긴다
//   2) 상품 카테고리와 키워드 카테고리의 대분류 일치 요구
// 조건을 못 맞추면 아무것도 반환하지 않는다(추측 금지).

const norm = (s) => String(s).toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
const topCategory = (path) => path.split('>')[0].trim();

function record(bids, keyword) {
  const v = bids.keywords[keyword];
  if (!v) return null;
  return {
    keyword,
    volume: v[0],
    pcBid: v[1],
    mobileBid: v[2],
    competition: v[3],
    categories: v.slice(4).map((i) => bids.categories[i]),
  };
}

/** 상품 카테고리(대분류)에 속한 키워드만 후보로 본다. categoryPath가 없으면 전체 허용. */
function allowed(bids, keyword, productTopCategory) {
  if (!productTopCategory) return true;
  const v = bids.keywords[keyword];
  return v.slice(4).some((i) => topCategory(bids.categories[i]) === productTopCategory);
}

/**
 * 키워드가 상품명 안에 '순서대로, 가까이' 나타나는 최소 구간의 길이.
 * 없으면 null.
 *
 * 연속 일치만 보면 실제 상품의 메인 키워드를 놓친다 — 실측:
 *   "가을신상 유아 키즈 여아룩 원피스 상하복"에서 정답은 '여아원피스'(월 8,923회)인데
 *   '여아'와 '원피스' 사이에 '룩'이 끼어 연속 매칭으로도, 단어 조합으로도 안 잡혔다.
 * 그렇다고 순서만 맞으면 다 받아주면 긴 상품명이 엉뚱한 키워드와 전부 매칭된다.
 * 그래서 '글자 사이에 끼어들 수 있는 여유'를 제한한다.
 */
const MIN_PART = 2;

/**
 * 한국어 상품명은 수식어가 겹겹이 끼어든다:
 *   "솔리드 유아 키즈 스트라이프 골지 티셔츠" → '유아티셔츠'
 *   "가을신상 유아 키즈 여아룩 원피스"        → '여아원피스'
 * 글자 간격으로 판단하면 이 둘을 동시에 만족시킬 수 없다(앞은 9자, 뒤는 1자 간격).
 * 그래서 키워드를 두 조각으로 쪼개, 두 조각이 '각각 통째로' 상품명에 있으면
 * 그 키워드로 본다. 조각은 2자 이상이어야 해서 우연한 한 글자 일치는 걸리지 않는다.
 */
function appearsIn(name, keyword) {
  return matchPosition(name, keyword) >= 0;
}

/** 키워드가 상품명에서 시작되는 위치. 없으면 -1. */
function matchPosition(name, keyword) {
  const direct = name.indexOf(keyword);
  if (direct >= 0) return direct;
  let best = -1;
  for (let i = MIN_PART; i <= keyword.length - MIN_PART; i++) {
    const h = name.indexOf(keyword.slice(0, i));
    const t = name.indexOf(keyword.slice(i));
    if (h < 0 || t < 0) continue;
    const pos = Math.min(h, t);
    if (best < 0 || pos < best) best = pos;
  }
  return best;
}

/**
 * 경쟁강도(상품수÷검색수)가 비정상적으로 높은 키워드는 상품을 특정하지 못하는
 * 광범위어다 — '키즈'는 4,349로, 유아 원피스 상품의 메인 키워드가 될 수 없다.
 * 일반적인 상품 키워드는 수십 수준이다.
 */
const MAIN_MAX_COMPETITION = 500;

/**
 * 키워드의 카테고리가 상품 카테고리와 앞에서부터 몇 단계나 일치하는지.
 * 네이버쇼핑은 키워드마다 대표 카테고리가 있고, 내 상품 카테고리가 그와 다르면
 * 상품명에 그 키워드를 넣어도 상위노출이 안 된다(2026-10-07 사용자 확인).
 * 그래서 '상품명 순서'보다 '카테고리 일치'가 먼저다.
 */
function categoryMatchDepth(bids, keyword, categoryPath) {
  if (!categoryPath) return 0;
  const target = categoryPath.split('>').map((s) => s.trim());
  let best = 0;
  for (const idx of bids.keywords[keyword].slice(4)) {
    const segs = bids.categories[idx].split('>').map((s) => s.trim());
    let d = 0;
    while (d < segs.length && d < target.length && segs[d] === target[d]) d++;
    if (d > best) best = d;
  }
  return best;
}

/**
 * 메인 키워드 = 상품명에 들어 있는 키워드 중
 *   ① 상품 카테고리와 가장 깊이 일치하고   ← 네이버 랭킹이 카테고리 기준이라 최우선
 *   ② 그 다음 상품명 앞쪽에 있고
 *   ③ 그 다음 더 구체적이고(길고) 검색량이 큰 것.
 */
export function findMainKeyword(bids, productName, categoryPath) {
  const name = norm(productName);
  if (!name) return null;
  const top = categoryPath ? topCategory(categoryPath) : null;
  const candidates = [];
  for (const keyword of Object.keys(bids.keywords)) {
    if (keyword.length < 2) continue;
    const pos = matchPosition(name, norm(keyword));
    if (pos < 0) continue;
    if (!allowed(bids, keyword, top)) continue;
    const comp = bids.keywords[keyword][3];
    if (typeof comp === 'number' && comp > MAIN_MAX_COMPETITION) continue;
    candidates.push({ keyword, pos, depth: categoryMatchDepth(bids, keyword, categoryPath) });
  }
  if (!candidates.length) return null;

  candidates.sort(
    (a, b) =>
      b.depth - a.depth || // ① 카테고리 일치가 깊은 쪽
      a.pos - b.pos || // ② 상품명 앞쪽
      b.keyword.length - a.keyword.length || // ③ 더 구체적인 쪽
      (bids.keywords[b.keyword][0] ?? 0) - (bids.keywords[a.keyword][0] ?? 0)
  );

  const main = record(bids, candidates[0].keyword);
  main.categoryDepth = candidates[0].depth;

  // 상품명 맨 앞 키워드가 다른 카테고리 소속이면, 그 키워드로는 순위가 안 잡힌다.
  // 셀러가 주력으로 민 키워드와 등록 카테고리가 어긋났다는 뜻이라 알려줘야 한다.
  const lead = [...candidates].sort((a, b) => a.pos - b.pos || b.keyword.length - a.keyword.length)[0];
  if (lead.keyword !== main.keyword && lead.depth < candidates[0].depth) {
    main.mismatch = {
      keyword: lead.keyword,
      category: bids.categories[bids.keywords[lead.keyword][4]],
      volume: bids.keywords[lead.keyword][0],
    };
  }
  return main;
}

/**
 * 하나의 키워드가 여러 카테고리에 걸쳐 있을 수 있다(예: '백색소음'은 출산/육아와
 * 디지털/가전 양쪽에 있다). 연관 키워드는 반드시 '상품과 같은 대분류' 쪽
 * 카테고리에서만 가져와야 한다 — 안 그러면 아기용품 상품에 학습기기 키워드가 붙는다.
 */
function categoriesMatching(main, categoryPath) {
  if (!categoryPath) return main.categories;
  const top = topCategory(categoryPath);
  const matched = main.categories.filter((c) => topCategory(c) === top);
  return matched.length ? matched : main.categories;
}

/**
 * 메인 키워드와 같은 세부 카테고리에 있으면서 상품명에는 아직 없는 키워드를
 * 검색량 순으로 추린다 — 이미 상품명에 있는 키워드는 제안할 이유가 없다.
 */
export function findRelatedKeywords(bids, main, productName, limit = 3, categoryPath = null) {
  if (!main) return [];
  const name = norm(productName);
  const targetCats = new Set(categoriesMatching(main, categoryPath));
  const candidates = [];

  for (const keyword of Object.keys(bids.keywords)) {
    if (keyword === main.keyword || keyword.length < 2) continue;
    if (name.includes(norm(keyword))) continue;
    const v = bids.keywords[keyword];
    if (!v.slice(4).some((i) => targetCats.has(bids.categories[i]))) continue;
    candidates.push(keyword);
  }

  candidates.sort((a, b) => (bids.keywords[b][0] ?? 0) - (bids.keywords[a][0] ?? 0));
  return candidates.slice(0, limit).map((k) => record(bids, k));
}

/**
 * 브랜드로 '추정'되는 키워드인지. 데이터에 브랜드 플래그가 없어 두 신호를 겹쳐 쓴다.
 *   1) 경쟁강도가 낮다 — 브랜드 키워드는 그 브랜드 상품만 걸려 상품수가 적다
 *   2) 카테고리 명사를 포함하지 않는다 — '아기내복'은 일반어, '해피버스'는 고유명사
 * 둘 중 하나만으론 오분류가 난다(실측: '신생아우주복'은 명사 미포함이지만
 * 경쟁강도 42.87로 명백한 일반 키워드). 그래서 AND 조건이며, 애매하면 제외한다.
 */
const BRAND_MAX_COMPETITION = 5;

function categoryNouns(categoryPaths) {
  const nouns = new Set();
  for (const path of categoryPaths) {
    const segs = path.split('>').slice(-2); // 최하위 + 그 상위
    for (const seg of segs) {
      for (const token of seg.split('/')) {
        const t = norm(token);
        if (t.length >= 2) nouns.add(t);
      }
    }
  }
  return [...nouns];
}

function looksLikeBrand(bids, keyword, nouns) {
  const v = bids.keywords[keyword];
  if (!v) return false;
  if (typeof v[3] !== 'number' || v[3] > BRAND_MAX_COMPETITION) return false;
  const k = norm(keyword);
  if (k.length < 3) return false;
  return !nouns.some((n) => k.includes(n));
}

/**
 * 같은 카테고리에서 검색량이 높은 브랜드 키워드. "이 카테고리에선 000 브랜드를
 * 많이 찾는다"는 영업 멘트용이라, 확실하지 않으면 비워두는 쪽을 택한다.
 */
export function findTopBrands(bids, main, productName, limit = 2, categoryPath = null) {
  if (!main) return [];
  const cats = categoriesMatching(main, categoryPath);
  const nouns = categoryNouns(cats);
  const catSet = new Set(cats);
  const name = norm(productName);

  const out = [];
  for (const keyword of Object.keys(bids.keywords)) {
    if (keyword === main.keyword || name.includes(norm(keyword))) continue;
    const v = bids.keywords[keyword];
    if (!v.slice(4).some((i) => catSet.has(bids.categories[i]))) continue;
    if (!looksLikeBrand(bids, keyword, nouns)) continue;
    out.push(keyword);
  }
  out.sort((a, b) => (bids.keywords[b][0] ?? 0) - (bids.keywords[a][0] ?? 0));
  return out.slice(0, limit).map((k) => record(bids, k));
}

function median(nums) {
  const xs = nums.filter((n) => typeof n === 'number' && n > 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : Math.round((xs[m - 1] + xs[m]) / 2);
}

/**
 * 상품명과 맞는 키워드가 사전에 없을 때, 같은 카테고리 키워드들로 대략적인
 * 수준을 추정한다(2026-10-07 요청). 평균이 아니라 중앙값을 쓰는 이유는
 * '키즈'(입찰가 8,220원) 같은 극단값이 평균을 통째로 왜곡하기 때문이다.
 *
 * 추정치는 실측과 반드시 구분해서 표기해야 한다 — 광고주에게 숫자를 그대로
 * 읽어주는 도구라, 섞이는 순간 틀린 말을 하게 된다.
 */
/**
 * 카테고리 경로를 깊은 쪽부터 좁혀가며, 그 안에 속한 키워드를 충분히 모을 수
 * 있는 단계를 찾는다. 세부 카테고리에 데이터가 없으면 상위로 한 칸씩 넓힌다.
 */
function keywordsUnderCategory(bids, categoryPath, minSample = 5) {
  if (!categoryPath) return null;
  const segs = categoryPath.split('>').map((s) => s.trim()).filter(Boolean);

  for (let depth = segs.length; depth >= 1; depth--) {
    const prefix = segs.slice(0, depth).join('>');
    const ids = new Set();
    bids.categories.forEach((c, i) => {
      if (c === prefix || c.startsWith(prefix + '>')) ids.add(i);
    });
    if (!ids.size) continue;

    const entries = [];
    for (const [keyword, v] of Object.entries(bids.keywords)) {
      if (v.slice(4).some((i) => ids.has(i))) entries.push(keyword);
    }
    if (entries.length >= minSample) return { prefix, keywords: entries };
  }
  return null;
}

export function estimateFromCategory(bids, categoryPath) {
  const found = keywordsUnderCategory(bids, categoryPath);
  if (!found) return null;
  const rows = found.keywords.map((k) => bids.keywords[k]);
  return {
    estimated: true,
    volume: median(rows.map((v) => v[0])),
    pcBid: median(rows.map((v) => v[1])),
    mobileBid: median(rows.map((v) => v[2])),
    sampleSize: rows.length,
    basis: found.prefix,
  };
}

/**
 * 메인 키워드를 못 찾았을 때도 그 카테고리의 '실제' 상위 키워드는 보여줄 수
 * 있다. 추정은 메인 한 줄에만 쓰고 나머지는 실측값을 쓴다.
 */
function categoryTopKeywords(bids, categoryPath, productName, limit) {
  const found = keywordsUnderCategory(bids, categoryPath);
  if (!found) return [];
  const name = norm(productName);
  return found.keywords
    .filter((k) => {
      if (name.includes(norm(k))) return false;
      const comp = bids.keywords[k][3];
      return !(typeof comp === 'number' && comp > MAIN_MAX_COMPETITION);
    })
    .sort((a, b) => (bids.keywords[b][0] ?? 0) - (bids.keywords[a][0] ?? 0))
    .slice(0, limit)
    .map((k) => record(bids, k));
}

function categoryTopBrands(bids, categoryPath, productName, limit) {
  const found = keywordsUnderCategory(bids, categoryPath);
  if (!found) return [];
  const nouns = categoryNouns([found.prefix]);
  const name = norm(productName);
  return found.keywords
    .filter((k) => !name.includes(norm(k)) && looksLikeBrand(bids, k, nouns))
    .sort((a, b) => (bids.keywords[b][0] ?? 0) - (bids.keywords[a][0] ?? 0))
    .slice(0, limit)
    .map((k) => record(bids, k));
}

/** 화면 상단 "카테고리 데이터" 블록에 쓸 묶음. 메인 키워드를 못 찾으면 null. */
export function buildKeywordPanel(bids, product) {
  const main = findMainKeyword(bids, product.name, product.categoryPath);

  // 상품명과 맞는 키워드가 사전에 없으면, 메인 한 줄만 카테고리 중앙값으로
  // 추정하고 연관·탑브랜드는 그 카테고리의 실제 키워드를 쓴다.
  if (!main) {
    const estimate = estimateFromCategory(bids, product.categoryPath);
    if (!estimate) return null;
    const brands = categoryTopBrands(bids, product.categoryPath, product.name, 2);
    const brandKeys = new Set(brands.map((b) => b.keyword));
    return {
      main: { keyword: '이 카테고리 평균 수준', ...estimate },
      related: categoryTopKeywords(bids, product.categoryPath, product.name, 5)
        .filter((r) => !brandKeys.has(r.keyword))
        .slice(0, 3),
      brands,
      category: estimate.basis,
      estimated: true,
    };
  }
  const matched = categoriesMatching(main, product.categoryPath);
  const brands = findTopBrands(bids, main, product.name, 2, product.categoryPath);
  const brandKeys = new Set(brands.map((b) => b.keyword));
  // 브랜드로 뽑힌 건 연관 키워드 줄에서 빼서 중복 노출을 막는다
  const related = findRelatedKeywords(bids, main, product.name, 5, product.categoryPath)
    .filter((r) => !brandKeys.has(r.keyword))
    .slice(0, 3);
  return { main, related, brands, category: matched[0] ?? null };
}
