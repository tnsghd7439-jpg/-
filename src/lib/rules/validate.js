// §11.5 build-time message-safety checks. Pure functions returning a list of
// violation strings (empty = pass) so the same checks run from the CLI build
// script (scripts/validate-scripts.mjs) and from `npm test`.
import { FORBIDDEN_TERMS } from './helpers.js';
import { evaluateProduct, collectCopyableMessages } from './engine.js';

const PLACEHOLDER_RE = /\{\{|\}\}|(?<![0-9])00(?![0-9])|○○/;
const SEARCH_VOLUME_RULE_IDS = new Set(['SEO_001', 'SEO_003', 'SEO_005']);

function forbiddenTermsIn(text, severity) {
  const list = FORBIDDEN_TERMS[severity];
  if (!list) return [];
  return list.filter((term) => text.includes(term));
}

/** Checks 1, 3, 4: static scan of every rules.json entry. */
export function checkRulesDoc(rulesDoc) {
  const violations = [];
  for (const rule of rulesDoc.rules) {
    if (rule.severity === '확정위반' && !rule.approved_by) {
      violations.push(`[check3] ${rule.id}: 확정위반 rule missing approved_by`);
    }
    if (rule.severity === '참고' && rule.script_template) {
      violations.push(`[check2] ${rule.id}: severity=참고 rule must not carry a script_template`);
    }
    if (rule.script_template && rule.script_template !== '__DYNAMIC__') {
      const bad = forbiddenTermsIn(rule.script_template, rule.severity);
      if (bad.length) violations.push(`[check1] ${rule.id}: forbidden term(s) in script_template: ${bad.join(', ')}`);
      if (PLACEHOLDER_RE.test(rule.script_template.replace(/\{\{\w+\}\}/g, ''))) {
        violations.push(`[check6] ${rule.id}: unresolved placeholder pattern in script_template`);
      }
    }
  }
  return violations;
}

/**
 * Checks 1, 5, 6 against REAL rendered messages (not raw {{template}} text),
 * produced by running the engine over fixtures constructed to hit every rule.
 * Also feeds checks 7-8 (참고/③ never end up in the copy-all collector).
 */
export function checkRenderedMessages(rulesDoc, dictionaries, fixtures) {
  const violations = [];
  for (const { label, product, month } of fixtures) {
    const { findings } = evaluateProduct(product, rulesDoc, dictionaries, month);
    for (const f of findings) {
      if (f.severity === '참고') {
        if (f.message !== null) violations.push(`[check2] ${label}/${f.id}: 참고 finding has a non-null message`);
        if (f.copyable) violations.push(`[check7] ${label}/${f.id}: 참고 finding marked copyable`);
        continue;
      }
      if (!f.message) continue;
      const bad = forbiddenTermsIn(f.message, f.severity);
      if (bad.length) violations.push(`[check1] ${label}/${f.id}: forbidden term(s) in rendered message: ${bad.join(', ')}`);
      if (PLACEHOLDER_RE.test(f.message)) {
        violations.push(`[check6] ${label}/${f.id}: unresolved placeholder in rendered message: "${f.message}"`);
      }
      // check 5 applies only to rules that bind a search-volume number
      // (§5.2's "한 달에"/"1년에" requirement) — SEO_006's numbers are image
      // counts, a different kind of number the rule was never about.
      if (SEARCH_VOLUME_RULE_IDS.has(f.id) && /\d/.test(f.message) && !(f.message.includes('한 달에') || f.message.includes('1년에'))) {
        violations.push(`[check5] ${label}/${f.id}: SEO message has a number with no unit phrase: "${f.message}"`);
      }
    }
    const copyable = collectCopyableMessages(findings);
    const referenceMessages = findings.filter((f) => f.severity === '참고').map((f) => f.message);
    for (const m of referenceMessages) {
      if (m && copyable.includes(m)) violations.push(`[check7] ${label}: a 참고 message leaked into collectCopyableMessages`);
    }
  }
  return violations;
}

export function checkAllRuleIdsHaveJudges(rulesDoc, judgeRegistry) {
  return rulesDoc.rules.filter((r) => !judgeRegistry[r.judge]).map((r) => `${r.id}: no judge "${r.judge}" registered`);
}
