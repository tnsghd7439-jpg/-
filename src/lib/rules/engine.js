import { createMatchEngine } from '../matchEngine.js';
import { JUDGES } from './judges.js';
import { ruleApplies } from './helpers.js';

function interpolate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

/**
 * Runs every rule in rules.json against one product and returns findings ready
 * for the popup to render. `currentMonth` is injected (not read from Date()
 * here) so tests can pin it.
 */
export function evaluateProduct(product, rulesDoc, dictionaries, currentMonth = new Date().getMonth() + 1) {
  const matchEngine = createMatchEngine(dictionaries);
  const matches = matchEngine.scan(product.name);

  const findings = [];
  for (const rule of rulesDoc.rules) {
    if (!ruleApplies(rule, product)) continue;
    const judge = JUDGES[rule.judge];
    if (!judge) throw new Error(`no judge registered for rule ${rule.id} (judge="${rule.judge}")`);

    const results = judge({ product, matches, dictionaries, currentMonth }) ?? [];
    for (const r of results) {
      const severity = r.severityOverride ?? rule.severity;
      const isReference = severity === '참고';
      const template = isReference ? null : r.template ?? rule.script_template;
      findings.push({
        id: rule.id,
        category: rule.category,
        severity,
        title: rule.title,
        basis: rule.basis,
        basisType: rule.basisType,
        citation: rule.citation,
        report: rule.report && {
          problem: interpolate(rule.report.problem, r.vars),
          risk: interpolate(rule.report.risk, r.vars),
          benefit: interpolate(rule.report.benefit, r.vars),
        },
        fix: rule.fix,
        slot: r.slot ?? 'opportunity',
        vars: r.vars,
        message: template ? interpolate(template, r.vars) : null,
        copyable: !isReference,
        approvedBy: rule.approved_by,
      });
    }
  }
  return { matches, findings: sortByPriority(mergePairedFindings(findings, rulesDoc)) };
}

/**
 * ② 개선 기회 display/copy-all/email order (2026-09-14 request, superseding
 * the earlier 4-tier version):
 *   1. alt 누락 (SEO_006)
 *   2. 상품정보제공고시 방치 / 상품속성 누락 (SEO_007, SEO_008)
 *   3. 시즌 선행 키워드 (SEO_005)
 *   4. 키워드 앞/뒤 배치 (SEO_001, SEO_003 — 둘 다 "상품명" 이슈로 같은 묶음)
 *   5. 태그 10개 미만 (TAG_001)
 *   6. 태그·상품명 중복 (TAG_006)
 *   7. 쿠폰+알림받기 병합 (OPP_002+OPP_003)
 *   8. 쿠폰/알림받기 단독 또는 리뷰이벤트 (OPP_002, OPP_003, OPP_005)
 *   9. 그 외 (OPP_001, OPP_004 등)
 * ①확정위반·⚠의심은 각각 별도 화면 구역이라(App.jsx가 severity로 먼저
 * 필터링) 이 우선순위의 영향을 받지 않는다 — 전부 기본값(9)을 공유해도
 * 무방. Array.prototype.sort는 stable이라 동순위는 rules.json 순서 유지.
 */
const FINDING_PRIORITY = {
  SEO_006: 1,
  SEO_007: 2,
  SEO_008: 2,
  SEO_005: 3,
  SEO_001: 4,
  SEO_003: 4,
  TAG_001: 5,
  TAG_006: 6,
  'OPP_002+OPP_003': 7,
  OPP_002: 8,
  OPP_003: 8,
  OPP_005: 8,
  // 브랜드스토어 구역은 화면에서 ② 개선 기회보다 위에 오므로(2026-09-21 요청),
  // 전체 멘트 복사 순서도 같도록 음수 우선순위를 준다.
  // 메타 → 브랜드분석 → CRM+광고연동(병합) → 라운지.
  BRAND_005: -4,
  BRAND_004: -3,
  'BRAND_002+BRAND_003': -2,
  BRAND_002: -2,
  BRAND_003: -2,
  BRAND_001: -1,
};
const DEFAULT_PRIORITY = 9;

function priorityOf(finding) {
  if (FINDING_PRIORITY[finding.id] !== undefined) return FINDING_PRIORITY[finding.id];
  return DEFAULT_PRIORITY;
}

function sortByPriority(findings) {
  return [...findings].sort((a, b) => priorityOf(a) - priorityOf(b));
}

/**
 * §4.2-G 병합 규칙: if a rule declares `mergeWith` and BOTH it and its partner
 * fired for this product, collapse them into one finding (same underlying
 * logic — coupon absence and notification-coupon absence — so reading both
 * out loud would just repeat the same point twice).
 */
function mergePairedFindings(findings, rulesDoc) {
  const rulesById = Object.fromEntries(rulesDoc.rules.map((r) => [r.id, r]));
  const result = [...findings];
  for (const rule of rulesDoc.rules) {
    if (!rule.mergeWith) continue;
    const aIdx = result.findIndex((f) => f.id === rule.id);
    const bIdx = result.findIndex((f) => f.id === rule.mergeWith);
    if (aIdx === -1 || bIdx === -1) continue;
    const keepIdx = Math.min(aIdx, bIdx);
    const dropIdx = Math.max(aIdx, bIdx);
    result[keepIdx] = {
      ...result[keepIdx],
      id: `${rule.mergeWith}+${rule.id}`,
      title: rule.mergedTitle ?? rulesById[rule.mergeWith]?.title,
      message: rule.mergedTemplate ?? result[keepIdx].message,
    };
    result.splice(dropIdx, 1);
  }
  return result;
}

/** Findings eligible for the "전체 멘트 순서대로 복사" button (§11.5 checks 7-8). */
export function collectCopyableMessages(findings) {
  return findings.filter((f) => f.copyable && f.message).map((f) => f.message);
}
