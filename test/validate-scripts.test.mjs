import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkRulesDoc, checkRenderedMessages, checkAllRuleIdsHaveJudges } from '../src/lib/rules/validate.js';
import { buildFixtures } from '../src/lib/rules/fixtures.js';
import { JUDGES } from '../src/lib/rules/judges.js';
import { evaluateProduct } from '../src/lib/rules/engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const rulesDoc = JSON.parse(readFileSync(join(root, 'src', 'lib', 'rules.json'), 'utf-8'));
const dictionaries = JSON.parse(readFileSync(join(root, 'src', 'lib', 'dictionaries.generated.json'), 'utf-8'));

test('every rule.judge id resolves to a registered judge function', () => {
  assert.deepEqual(checkAllRuleIdsHaveJudges(rulesDoc, JUDGES), []);
});

test('§11.5 check 1-4, 6: static rules.json scan', () => {
  assert.deepEqual(checkRulesDoc(rulesDoc), []);
});

test('§11.5 check 1,2,5,6,7: rendered messages across representative fixtures', () => {
  assert.deepEqual(checkRenderedMessages(rulesDoc, dictionaries, buildFixtures()), []);
});

test('the fixture set actually exercises every rule at least once (no vacuous pass)', () => {
  const fired = new Set();
  for (const { product, month } of buildFixtures()) {
    const { findings } = evaluateProduct(product, rulesDoc, dictionaries, month);
    // 병합된 finding은 "A+B" 한 개의 id로 나온다(§4.2-G). 병합은 두 룰이 모두
    // 발화했을 때만 일어나므로, 분해해서 양쪽 다 태운 것으로 센다.
    findings.forEach((f) => f.id.split('+').forEach((id) => fired.add(id)));
  }
  const missing = rulesDoc.rules.map((r) => r.id).filter((id) => !fired.has(id));
  assert.deepEqual(missing, []);
});
