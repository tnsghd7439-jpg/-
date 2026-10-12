#!/usr/bin/env node
// §11.5 build-time message-safety gate. Run by `npm run build` (and directly
// via `npm run validate`). Exits non-zero — and fails the build — on any
// violation. See src/lib/rules/validate.js for the actual checks.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRulesDoc, checkRenderedMessages, checkAllRuleIdsHaveJudges } from '../src/lib/rules/validate.js';
import { buildFixtures } from '../src/lib/rules/fixtures.js';
import { JUDGES } from '../src/lib/rules/judges.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const rulesDoc = JSON.parse(readFileSync(join(root, 'src', 'lib', 'rules.json'), 'utf-8'));
const dictionaries = JSON.parse(readFileSync(join(root, 'src', 'lib', 'dictionaries.generated.json'), 'utf-8'));

const violations = [
  ...checkAllRuleIdsHaveJudges(rulesDoc, JUDGES),
  ...checkRulesDoc(rulesDoc),
  ...checkRenderedMessages(rulesDoc, dictionaries, buildFixtures()),
];

if (violations.length) {
  console.error(`\n[validate-scripts] BUILD FAILED — ${violations.length} violation(s):`);
  for (const v of violations) console.error('  - ' + v);
  process.exit(1);
}
console.log(`[validate-scripts] all §11.5 checks passed (${rulesDoc.rules.length} rules, ${buildFixtures().length} fixtures).`);
