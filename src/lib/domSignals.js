// Test-only mirror of the regexes inlined in extractProduct.js.
//
// extractProduct.js's exported function is injected via
// chrome.scripting.executeScript and MUST be fully self-contained (no
// imports), so these patterns are duplicated there rather than imported from
// here. This file exists purely so the patterns can be unit-tested against
// plain strings without a DOM. Keep both copies in sync when either changes.
export const REVIEW_EVENT_RE = /리뷰\s*이벤트[\s\S]{0,40}(포인트|증정|선정)/;
export const NOTIFICATION_COUPON_RE = /알림\s*동의\s*쿠폰/;
export const COUPON_BANNER_RE = /최대\s*혜택\s*적용\s*가능\s*쿠폰\s*(\d+)\s*개/;
export const NOTICE_REFER_ONLY_RE = /상품상세참조/g;
