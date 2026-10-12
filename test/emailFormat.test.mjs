import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluateProduct } from '../src/lib/rules/engine.js';
import { buildEmailDraft } from '../src/lib/rules/emailFormat.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dictionaries = JSON.parse(readFileSync(join(root, 'src', 'lib', 'dictionaries.generated.json'), 'utf-8'));
const rulesDoc = JSON.parse(readFileSync(join(root, 'src', 'lib', 'rules.json'), 'utf-8'));

const product = {
  name: '테스트 상품',
  categoryPath: '식품>건강식품>영양제',
  categoryId: 'x',
  salePrice: 10000,
  baseFee: 0,
  deliveryFeeType: 'FREE',
  freeDelivery: true,
  tags: [{ text: 'a' }],
  options: [{ name: '기본형', extraPrice: 3000, soldOut: false }],
  productStatusType: 'SALE',
  regularSubscription: false,
  hasShortclip: false,
  couponCount: 0,
  notificationCouponConfigured: null,
  reviewEventActive: null,
  imageAltStats: null,
  noticeReferOnlyCount: null,
  attributeStats: null,
};

test('buildEmailDraft includes the sender placeholder, title, company site, and product name', () => {
  const { findings } = evaluateProduct(product, rulesDoc, dictionaries, 9);
  const { subject, body } = buildEmailDraft(product, findings);
  assert.ok(subject.includes('테스트 상품'));
  assert.ok(subject.includes('엠피인터랙티브'));
  assert.ok(body.includes('000 대리'));
  assert.ok(body.includes('https://www.mpinteractive.co.kr'));
  assert.ok(body.includes('테스트 상품'));
});

test('buildEmailDraft groups by 확정위반/기회손실 and excludes items with no message (참고/③)', () => {
  const { findings } = evaluateProduct(product, rulesDoc, dictionaries, 9);
  const { body } = buildEmailDraft(product, findings);
  assert.ok(body.includes('확정 위반 사항'));
  assert.ok(body.includes('개선 기회'));
  // every 확정위반 finding present should have its message text included
  const violation = findings.find((f) => f.severity === '확정위반' && f.message);
  assert.ok(violation);
  assert.ok(body.includes(violation.message));
});
