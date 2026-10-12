import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOptionLabel } from '../src/lib/rules/helpers.js';

test('parseOptionLabel: positive extra price', () => {
  assert.deepEqual(parseOptionLabel('옐로우 (+30,000원)'), { name: '옐로우', extraPrice: 30000, soldOut: false });
});

test('parseOptionLabel: NEGATIVE extra price is parsed as a negative number, not silently 0', () => {
  // Confirmed live 2026-09-14: a "+"-only regex treated "(-3,000원)" as if
  // there were no price suffix at all, so extraPrice fell back to 0 — a
  // MOEUM_003 violation (non-zero first-option price) went undetected.
  assert.deepEqual(parseOptionLabel('기본형 (-3,000원)'), { name: '기본형', extraPrice: -3000, soldOut: false });
});

test('parseOptionLabel: sold-out suffix combined with a negative price', () => {
  assert.deepEqual(parseOptionLabel('차콜 (-3,000원) (품절)'), { name: '차콜', extraPrice: -3000, soldOut: true });
});

test('parseOptionLabel: plain label with no price/soldout suffix', () => {
  assert.deepEqual(parseOptionLabel('20인치'), { name: '20인치', extraPrice: 0, soldOut: false });
});
