// 진단 화면이 '별도 창'으로 뜨기 때문에, currentWindow(= 진단 창 자신)의 탭을
// 보면 자기 자신을 분석하게 된다. 일반 브라우저 창 중에서 상품 페이지가 열려
// 있는 탭을 직접 찾아야 한다.

const STORE_HOSTS = ['smartstore.naver.com', 'brand.naver.com'];

export function isStoreUrl(url) {
  return typeof url === 'string' && STORE_HOSTS.some((h) => url.includes(h));
}

/**
 * 분석 대상 탭:
 *   1) 일반 창(type: 'normal')의 활성 탭 중 스마트스토어/브랜드스토어인 것
 *   2) 없으면 포커스된 일반 창의 활성 탭(안내 문구를 띄우기 위해)
 * 진단 창 자신(type: 'popup')은 후보에서 제외된다.
 */
export async function findTargetTab() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const actives = [];
  for (const win of windows) {
    const active = (win.tabs ?? []).find((t) => t.active);
    if (active) actives.push({ tab: active, focused: win.focused });
  }
  // 포커스된 창을 먼저 본다 — 사용자가 방금 보던 상품이 분석 대상이어야 한다.
  actives.sort((a, b) => Number(b.focused) - Number(a.focused));

  const store = actives.find(({ tab }) => isStoreUrl(tab.url));
  if (store) return store.tab;
  return actives.length ? actives[0].tab : null;
}

/** 해당 탭이 지금 분석 대상인지 — 이벤트가 다른 창에서 와도 되는지 판단용. */
export async function isTargetTab(tabId) {
  const tab = await findTargetTab();
  return Boolean(tab) && tab.id === tabId;
}
