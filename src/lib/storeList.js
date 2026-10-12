// 스토어 전체상품 페이지(brand.naver.com / smartstore.naver.com)를 Ctrl+A 복사한
// 텍스트에서 상품 단위 데이터를 추출한다.
//
// 상품 상세페이지와 달리 읽어올 JSON이 없어, 화면에 보이는 것만 쓸 수 있다.
// 그래서 여기서 뽑히는 필드로 판정 가능한 룰과, 개별 상품을 열어야만 알 수 있는
// 룰이 명확히 갈린다 — 후자를 추측으로 메우지 않는다.

/** "~~19,000원~~" 같은 취소선 정가를 포함한 한 상품 블록을 파싱한다. */
function parseBlock(block) {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const thumbLine = lines.find((l) => /\d+번 썸네일/.test(l));
  if (!thumbLine) return null;

  // 대표이미지 장수 = 썸네일 인디케이터 개수
  const imageCount = (thumbLine.match(/\d+번 썸네일/g) ?? []).length;

  // 상품명은 썸네일 줄 바로 다음 줄, 끝에 붙은 "찜하기"를 뗀다
  const nameLine = lines[lines.indexOf(thumbLine) + 1] ?? '';
  const name = nameLine.replace(/찜하기\s*$/, '').trim();
  if (!name) return null;

  const num = (re) => {
    const m = block.match(re);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  };

  const freeShip = /무료배송/.test(block);
  const couponPrice = num(/([\d,]+)원최대할인가/);
  const ratingMatch = block.match(/평점([\d.]+)/);

  return {
    name,
    nameLength: name.length,
    imageCount,
    listPrice: num(/~~([\d,]+)원~~/),
    salePrice: num(/%할인\s*\n\s*([\d,]+)원/),
    discountRate: num(/(\d+)%할인/),
    couponPrice,
    hasCoupon: couponPrice !== null,
    freeShip,
    shipFee: freeShip ? 0 : num(/배송비([\d,]+)원/),
    todayShip: /오늘출발/.test(block),
    freeReturn: /무료교환반품/.test(block),
    preOrder: /^\[예약구매\]/.test(name),
    rating: ratingMatch ? Number(ratingMatch[1]) : null,
    reviews: num(/리뷰\s*([\d,]+)/),
  };
}

/**
 * 붙여넣은 전체상품 목록 텍스트에서 상품 배열을 만든다. 여러 페이지를 이어
 * 붙여도 되도록 상품명 기준으로 중복을 제거한다(페이지 간 겹침 방지).
 */
export function parseStoreList(text) {
  const blocks = text.split(/\n(?=\*\s)/).filter((b) => /\d+번 썸네일/.test(b));
  const seen = new Set();
  const products = [];
  for (const b of blocks) {
    const p = parseBlock(b);
    if (!p || seen.has(p.name)) continue;
    seen.add(p.name);
    products.push(p);
  }
  return products;
}

/** 목록 상단의 "(총 227개)" 표기에서 스토어 전체 상품 수를 읽는다. */
export function parseTotalCount(text) {
  const m = text.match(/\(총\s*([\d,]+)개\)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}
