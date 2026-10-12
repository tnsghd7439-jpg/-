export function won(n) {
  return `${Number(n).toLocaleString('ko-KR')}원`;
}

export function commas(n) {
  return Number(n).toLocaleString('ko-KR');
}

/** §5.2 "검색량 숫자에는 단위를 병기": the unit phrase itself, not just the number. */
export function monthlyPhrase(n) {
  return `한 달에 ${commas(n)}번`;
}
export function annualPhrase(n) {
  return `1년에 ${commas(n)}번`;
}

/**
 * Parses an option choice's accessible-name text, e.g. "옐로우 (+30,000원)" or
 * "차콜 (+30,000원) (품절)" or a plain "20인치" with no suffixes.
 * This is the format observed live on smartstore.naver.com in 2026-09.
 */
export function parseOptionLabel(label) {
  const raw = (label || '').trim();
  const soldOut = /\(품절\)\s*$/.test(raw);
  const withoutSoldout = raw.replace(/\s*\(품절\)\s*$/, '').trim();
  const priceMatch = withoutSoldout.match(/^(.*?)\s*\(([+-])\s*([\d,]+)\s*원\)\s*$/);
  if (priceMatch) {
    const amount = Number(priceMatch[3].replace(/,/g, ''));
    return { name: priceMatch[1].trim(), extraPrice: priceMatch[2] === '-' ? -amount : amount, soldOut };
  }
  return { name: withoutSoldout, extraPrice: 0, soldOut };
}

/**
 * §4.1 applies_to matching: pathPrefix wins over categoryIds; `always` bypasses
 * both. `pathContains` is an extension added after live testing (2026-09-14):
 * some rules need a substring match anywhere in the category path (e.g.
 * "소모품/식품성 카테고리인가?") rather than a root-level prefix, since the
 * relevant word usually sits at depth 2-3, not depth 1.
 */
export function ruleApplies(rule, product) {
  const cond = rule.applies_to;
  if (!cond) return true;
  // 게이트(AND 조건): 브랜드스토어 전용 룰은 스마트스토어에서 아예 평가하지 않는다.
  if (cond.brandStoreOnly && !product.isBrandStore) return false;
  if (cond.always) return true;
  if (cond.pathPrefix?.length && product.categoryPath) {
    if (cond.pathPrefix.some((p) => product.categoryPath.startsWith(p))) return true;
  }
  if (cond.pathContains?.length && product.categoryPath) {
    if (cond.pathContains.some((p) => product.categoryPath.includes(p))) return true;
  }
  if (cond.categoryIds?.length && product.categoryId) {
    if (cond.categoryIds.includes(product.categoryId)) return true;
  }
  return false;
}

/** §5.2 forbidden-term gate, applied at build time in scripts/validate-scripts.mjs. */
export const FORBIDDEN_TERMS = {
  기회손실: ['위반', '제재', '삭제', '적발', '불이익'],
  의심: ['입니다', '확실', '반드시', '무조건'],
  참고: null, // any script_template at all is forbidden for 참고 — checked separately
};
