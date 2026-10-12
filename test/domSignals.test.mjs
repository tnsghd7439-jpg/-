import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_EVENT_RE, NOTIFICATION_COUPON_RE, COUPON_BANNER_RE, NOTICE_REFER_ONLY_RE } from '../src/lib/domSignals.js';

test('REVIEW_EVENT_RE: matches a real running event (blue in-page card format)', () => {
  const text = '리뷰이벤트\nNpay 포인트 5,000원 증정!\n솔직한 첫 후기, 다른 엄마들에게 큰 힘이 돼요\n기간 26.08.31 ~ 26.09.30';
  assert.match(text, REVIEW_EVENT_RE);
});

test('REVIEW_EVENT_RE: matches the real running event (top-banner format)', () => {
  const text = '리뷰 이벤트 | 월간 베스트리뷰 선정 시 1만 포인트';
  assert.match(text, REVIEW_EVENT_RE);
});

test('REVIEW_EVENT_RE: does NOT match a bare store nav-menu tab (no reward nearby)', () => {
  // Real nav bar text observed live: "...허그메이트 라운지 공지사항 쇼핑스토리 리뷰이벤트 더보기"
  const navText = '쇼핑LIVE 베스트 전체상품 아기침대 슬리핑백 신생아 데일리룩 허그메이트 라운지 공지사항 쇼핑스토리 리뷰이벤트 더보기';
  assert.doesNotMatch(navText, REVIEW_EVENT_RE);
});

test('NOTIFICATION_COUPON_RE: matches the price-breakdown line item', () => {
  assert.match('투에그 알림 동의 쿠폰 적용 -1,000원', NOTIFICATION_COUPON_RE);
});

test('COUPON_BANNER_RE: extracts the coupon count', () => {
  const m = '최대 혜택 적용 가능 쿠폰 1개'.match(COUPON_BANNER_RE);
  assert.equal(Number(m[1]), 1);
});

test('NOTICE_REFER_ONLY_RE: counts every "상품상세참조" occurrence in a notice panel', () => {
  const text = '소재 상품상세참조\n색상 상품상세참조\n크기 42cm\n세탁방법 상품상세참조';
  const count = (text.match(NOTICE_REFER_ONLY_RE) || []).length;
  assert.equal(count, 3);
});
