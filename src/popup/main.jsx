import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './popup.css';

// 별도 창으로 뜰 때 화면 오른쪽 절반을 차지하게 맞춘다. 서비스 워커에는 DOM이
// 없어 모니터 크기를 모르므로, screen을 아는 이 페이지에서 직접 조정한다.
// 사용자가 창을 옮기거나 크기를 바꾼 뒤에는 건드리지 않도록 최초 1회만 실행한다.
(async () => {
  try {
    const win = await chrome.windows.getCurrent();
    if (win.type !== 'popup') return; // 사이드패널/탭으로 열린 경우는 그대로 둔다
    const { availWidth: w, availHeight: h, availLeft = 0, availTop = 0 } = window.screen;
    const key = `sized:${win.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    await chrome.windows.update(win.id, {
      left: Math.round(availLeft + w / 2),
      top: Math.round(availTop),
      width: Math.round(w / 2),
      height: Math.round(h),
    });
  } catch (e) {
    // 창 조정에 실패해도 진단 자체는 돌아가야 한다
    console.warn('[진단] 창 크기 조정 생략', e);
  }
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
