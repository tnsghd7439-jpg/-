// 툴바 아이콘을 누르면 진단 화면을 '별도 창'으로 띄운다(2026-10-07 요청).
// 사이드패널은 폭이 좁아 카테고리 데이터 표와 멘트를 같이 보기 불편했다.
//
// 창은 하나만 유지한다 — 아이콘을 다시 누르면 새로 만들지 않고 기존 창을 앞으로
// 가져온다. 창 크기는 화면 크기를 아는 페이지 쪽에서 스스로 맞춘다(서비스 워커엔
// DOM이 없어 screen 정보를 알 수 없다).
let panelWindowId = null;

async function openPanel() {
  if (panelWindowId !== null) {
    try {
      await chrome.windows.update(panelWindowId, { focused: true, drawAttention: true });
      return;
    } catch {
      panelWindowId = null; // 사용자가 닫은 뒤라 id가 더 이상 유효하지 않다
    }
  }

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('index.html'),
    type: 'popup',
    width: 760,
    height: 900,
  });
  panelWindowId = win.id;
}

chrome.action.onClicked.addListener(() => {
  openPanel().catch((e) => console.error('[진단] 창 열기 실패', e));
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === panelWindowId) panelWindowId = null;
});
