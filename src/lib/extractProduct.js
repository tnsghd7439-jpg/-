// Runs INSIDE the Smartstore product page (injected via
// chrome.scripting.executeScript({ world: 'MAIN' }) from the popup — the same
// pattern already used by this user's own 네이버 스토어 사업자 정보 추출기
// extension, which confirmed window.__PRELOADED_STATE__ as the data source).
//
// Because chrome.scripting.executeScript serializes this function and re-runs
// it inside the page, it MUST be fully self-contained: no imports, no
// references to anything outside its own body.
//
// §3 failure handling: if the page's data shape doesn't match what we expect,
// return an {error} descriptor instead of guessing — the popup shows a plain
// "구조를 인식할 수 없습니다" message and stops, per the spec's explicit
// instruction not to silently misbehave.
export function extractProductFromPage() {
  try {
    const state = window.__PRELOADED_STATE__;
    if (!state) return { error: 'PRELOADED_STATE_NOT_FOUND' };

    const p = state.simpleProductForDetailPage;
    // Note: `.id` can be null on an otherwise-valid, fully-populated product
    // (confirmed live 2026-09) — `.name` is the reliable "this is real data"
    // signal, not `.id`.
    if (!p || !p.name) return { error: 'PRODUCT_NOT_FOUND' };

    function parseOptionLabel(label) {
      const raw = (label || '').trim();
      const soldOut = /\(품절\)\s*$/.test(raw);
      const withoutSoldout = raw.replace(/\s*\(품절\)\s*$/, '').trim();
      // "(+30,000원)" AND "(-3,000원)" — a negative extraPrice is just as much
      // a MOEUM_003 violation as a positive one (confirmed live 2026-09-14:
      // the old +-only regex silently treated "-3,000원" as extraPrice=0).
      const m = withoutSoldout.match(/^(.*?)\s*\(([+-])\s*([\d,]+)\s*원\)\s*$/);
      if (m) {
        const amount = Number(m[3].replace(/,/g, ''));
        return { name: m[1].trim(), extraPrice: m[2] === '-' ? -amount : amount, soldOut };
      }
      return { name: withoutSoldout, extraPrice: 0, soldOut };
    }

    // Options are NOT in __PRELOADED_STATE__ (confirmed live 2026-09) — they
    // are fetched client-side once the option UI renders. Best-effort DOM
    // scrape anchored on the visible "옵션 선택" section header + ARIA
    // role="option" entries (NOT css classes — those are build-hashed and
    // change on every Naver deploy). Returns null if the panel isn't
    // currently rendered/expanded; callers must treat null as "unknown", not
    // "no options".
    // Naver product pages can show SEVERAL option groups (모델/색상, 사이즈,
    // 수량별 할인단가 등). "수량별 할인단가"(bulk-quantity discount tiers,
    // e.g. "50개 이상 (-200원)") is a different concept from a 모음전-style
    // PRODUCT VARIANT (color/model) — confirmed live 2026-09-14 a quantity
    // group was misread as if it were the product's variant option list.
    // Filter these out; if nothing else is expanded, we correctly end up with
    // no options rather than silently using the wrong group's data.
    function looksLikeQuantityTier(name) {
      return /\d+\s*개/.test(name);
    }

    function extractOptionsFromDom() {
      const all = Array.from(document.querySelectorAll('body *'));
      const header = all.find(
        (el) => el.children.length === 0 && el.textContent && el.textContent.trim().startsWith('옵션 선택')
      );
      if (!header) return null;
      let container = header;
      for (let i = 0; i < 8 && container.parentElement; i++) container = container.parentElement;
      const optionEls = Array.from(container.querySelectorAll('[role="option"]'));
      if (!optionEls.length) return null;
      const parsed = optionEls
        .map((el) => parseOptionLabel(el.getAttribute('aria-label') || el.textContent || ''))
        .filter((o) => o.name && !looksLikeQuantityTier(o.name));
      return parsed.length ? parsed : null;
    }

    let options = null;
    try {
      options = extractOptionsFromDom();
    } catch {
      options = null; // DOM shape didn't match — stay null, don't guess
    }

    // OPP_002 (쿠폰 발급 여부): NOT in __PRELOADED_STATE__ (productBenefit /
    // benefit slices are isFetched:false at load) but confirmed live 2026-09
    // to render as visible page text — "최대 혜택 적용 가능 쿠폰 N개".
    // null (not 0) means "banner not found" so callers can tell "confirmed
    // zero" apart from "couldn't read" if that distinction ever matters.
    let couponCount = null;
    try {
      const bodyText = document.body.innerText || '';
      const m = bodyText.match(/최대\s*혜택\s*적용\s*가능\s*쿠폰\s*(\d+)\s*개/);
      couponCount = m ? Number(m[1]) : 0;
    } catch {
      couponCount = null;
    }

    // Finds the first element whose text contains `text` (whitespace-
    // insensitive) and returns it — or, with `{click:true}`, clicks its
    // nearest clickable ancestor first. Purely a "find/reveal already-
    // rendered content" helper — never used for anything with a side effect
    // (e.g. we deliberately never click "알림받기" itself, which would
    // actually subscribe the viewer to marketing notifications).
    // 조건부 무료배송의 기준 금액. 배송 영역에 "무료배송 (30,000원 이상 무료)"
    // 형태로 노출되는 것을 2026-09-22 실제 페이지에서 확인했다. 이 금액을 모르면
    // 조건부 무료배송이 실제로 구매자에게 무료인지 아닌지 판단할 수 없어,
    // SHIP_002가 멀쩡한 무료배송 상품을 위반으로 잡는 오탐이 났다.
    let freeShipConditionAmount = null;
    try {
      const m = document.body.innerText.match(/무료배송\s*\(\s*([\d,]+)\s*원\s*이상\s*무료\s*\)/);
      if (m) freeShipConditionAmount = Number(m[1].replace(/,/g, ''));
    } catch (e) {
      freeShipConditionAmount = null;
    }

    function findByText(text, opts) {
      const needle = text.replace(/\s/g, '');
      const el = Array.from(document.querySelectorAll('body *')).find(
        (e) => e.children.length <= 3 && e.textContent && e.textContent.replace(/\s/g, '').includes(needle)
      );
      if (el && opts && opts.click) (el.closest('button, a, [role="button"]') || el).click();
      return el || null;
    }

    // §4.2-F 육안확인 checklist items (외국어 표기/엑박/화장품 전성분 등) all
    // require the rep to actually SEE the detail description — but Naver
    // truncates it behind a "상세정보 펼쳐보기" button (confirmed live
    // 2026-09). This isn't a data-extraction concern (③ is human judgment by
    // design, not something we read), just a one-time convenience click so
    // the content is already expanded by the time the rep looks at the page.
    // We keep the element reference to scope the alt-text check below to the
    // actual detail-description container, not header/nav/footer images.
    let detailContainer = null;
    try {
      const toggle = findByText('상세정보 펼쳐보기', { click: true }) || findByText('상세정보 접기');
      if (toggle) {
        detailContainer = toggle;
        for (let i = 0; i < 8 && detailContainer.parentElement; i++) detailContainer = detailContainer.parentElement;
      }
    } catch {
      detailContainer = null; // best-effort only — never let this affect the returned product data
    }

    // Detail-description image alt text: NOT something we need vision AI for
    // — just a plain DOM attribute read. Scoped to the detail container found
    // above so header/logo/nav images (a different concern) aren't counted.
    let imageAltStats = null;
    try {
      if (detailContainer) {
        const imgs = Array.from(detailContainer.querySelectorAll('img'));
        if (imgs.length) {
          const missing = imgs.filter((img) => !img.alt || !img.alt.trim()).length;
          imageAltStats = { total: imgs.length, missingAlt: missing };
        }
      }
    } catch {
      imageAltStats = null;
    }

    // OPP_003 (알림받기 유도 설정 여부): the "알림받기" button itself is a
    // universal UI element present on every store regardless of configuration
    // (confirmed live 2026-09), so its mere presence tells us nothing. The
    // real signal is the price breakdown panel (toggled by the "최대할인가"
    // chevron next to the price — purely informational, no side effect,
    // unlike actually clicking "알림받기") showing a "OO 알림 동의 쿠폰 적용"
    // line item when the seller has one configured.
    let notificationCouponConfigured = null;
    try {
      findByText('최대할인가', { click: true });
      const bodyText = document.body.innerText || '';
      notificationCouponConfigured = /알림\s*동의\s*쿠폰/.test(bodyText);
    } catch {
      notificationCouponConfigured = null;
    }

    // OPP_005 (리뷰이벤트 진행 여부): a running review event renders a
    // "리뷰이벤트" badge/label right next to its reward details (both a blue
    // in-page card and a top-of-page banner style were confirmed live
    // 2026-09). BUT many brand stores also have a permanent "리뷰이벤트" NAV
    // MENU TAB that's present regardless of whether anything is currently
    // running — matching on the bare phrase would false-positive on every
    // such store. Requiring a reward word (포인트/증정/선정) shortly after
    // "리뷰이벤트" distinguishes an actual running event from a nav link.
    let reviewEventActive = null;
    try {
      reviewEventActive = /리뷰\s*이벤트[\s\S]{0,40}(포인트|증정|선정)/.test(document.body.innerText || '');
    } catch {
      reviewEventActive = null;
    }

    // 네이버 AI브리핑 준비사항 ④: 상품정보제공고시(법정표시)의 소재/색상/
    // 크기 등이 "상품상세참조"로만 방치되어 있으면 AI가 인용할 구체값이
    // 없다 (사내 가이드 문서, 2026-09). "상품정보제공고시 보기" 토글을 펼친
    // 뒤 "상품상세참조" 등장 횟수를 센다 — 순수 텍스트 매칭이라 카테고리별
    // 속성 스키마 차이에 영향받지 않는다.
    let noticeReferOnlyCount = null;
    try {
      findByText('상품정보제공고시 보기', { click: true }) || findByText('상품정보제공고시 접기');
      const bodyText = document.body.innerText || '';
      noticeReferOnlyCount = (bodyText.match(/상품상세참조/g) || []).length;
    } catch {
      noticeReferOnlyCount = null;
    }

    // 네이버 AI브리핑 준비사항 ① 상품속성(체크박스형) — 가이드상 "결정적"
    // 영향력이지만, 빈 값이 실제로 어떻게 렌더링되는지(완전히 빈 줄 vs "-"
    // vs 행 자체가 안 뜸)는 육안으로 확인된 적이 없어 최선의 추정으로 구현.
    // "상품정보 펼쳐보기" 버튼 자체가 없는 경우는 그보다 확실한 신호로 본다
    // — 접을 내용(추가 속성)이 거의 없다는 뜻일 가능성이 높다는 게 사용자
    // 의견(2026-09-14). hasExpandButton=false 는 그 케이스, missingLabels는
    // 패널은 있는데 알려진 라벨 중 값이 비어 보이는 것들 — 두 경로 다 추정치.
    const KNOWN_ATTRIBUTE_LABELS = [
      '연령', '최소연령', '종류', '높이조절', '변형', '특징', '타겟연령',
      '소재', '색상', '사이즈', '중량', '용량', '지름', '길이', '기능', '전원방식', '구성',
    ];
    let attributeStats = null;
    try {
      const toggle = findByText('상품정보 펼쳐보기', { click: true }) || findByText('상품정보 접기');
      if (!toggle) {
        attributeStats = { hasExpandButton: false, missingLabels: [] };
      } else {
        let attrContainer = toggle;
        for (let i = 0; i < 10 && attrContainer.parentElement; i++) attrContainer = attrContainer.parentElement;
        const lines = (attrContainer.innerText || '').split('\n').map((l) => l.trim());
        const missing = [];
        for (let i = 0; i < lines.length; i++) {
          if (!KNOWN_ATTRIBUTE_LABELS.includes(lines[i])) continue;
          const next = lines[i + 1];
          if (!next || KNOWN_ATTRIBUTE_LABELS.includes(next) || next.includes('상품정보')) {
            missing.push(lines[i]);
          }
        }
        attributeStats = { hasExpandButton: true, missingLabels: missing };
      }
    } catch {
      attributeStats = null;
    }

    // OPP_001 (숏클립 미등록): `state.live.representShortclip` was confirmed
    // live 2026-09 to stay null even on products that visibly HAVE shortclips
    // (it looks like a different, separately-fetched slice — same pattern as
    // coupon/notification data). The reliable signal is the "관련 숏클립"
    // section heading, which only renders when shortclip content exists.
    let hasShortclip = null;
    try {
      hasShortclip = document.body.innerText.includes('관련 숏클립');
    } catch {
      hasShortclip = null;
    }

    return {
      error: null,
      name: p.name || p.dispName || '',
      categoryPath: p.category ? p.category.wholeCategoryName : '',
      categoryId: p.category ? p.category.categoryId : '',
      wholeCategoryId: p.category ? p.category.wholeCategoryId : '',
      salePrice: p.salePrice || 0,
      discountedSalePrice: p.benefitsView ? p.benefitsView.discountedSalePrice : p.salePrice || 0,
      discountedRatio: p.benefitsView ? p.benefitsView.discountedRatio : 0,
      tags: (p.seoInfo && p.seoInfo.sellerTags) || [],
      modelName: p.naverShoppingSearchInfo ? p.naverShoppingSearchInfo.modelName : '',
      brandName: p.naverShoppingSearchInfo ? p.naverShoppingSearchInfo.brandName : '',
      deliveryFeeType: p.productDeliveryInfo ? p.productDeliveryInfo.deliveryFeeType : null,
      baseFee: p.productDeliveryInfo ? p.productDeliveryInfo.baseFee : null,
      freeDelivery: !!p.freeDelivery,
      regularSubscription: !!p.regularSubscription,
      stockQuantity: typeof p.stockQuantity === 'number' ? p.stockQuantity : null,
      productStatusType: p.productStatusType || null,
      optionUsable: !!p.optionUsable,
      options,
      hasShortclip,
      couponCount,
      notificationCouponConfigured,
      reviewEventActive,
      imageAltStats,
      noticeReferOnlyCount,
      attributeStats,
      freeShipConditionAmount,
      // 브랜드스토어는 라운지·브랜드CRM 등 스마트스토어에 없는 솔루션을 쓸 수 있어
      // 전용 제안 항목을 따로 띄운다. 호스트명이 가장 확실한 구분 신호다.
      isBrandStore: location.hostname.includes('brand.naver.com'),
    };
  } catch (e) {
    return { error: 'EXTRACT_FAILED', detail: String((e && e.message) || e) };
  }
}
