import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.js';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  // 진단 화면은 서비스 워커가 chrome.windows.create로 직접 여는 별도 창이라,
  // 매니페스트 어디에서도 index.html을 가리키지 않는다. 명시하지 않으면 crxjs가
  // 진입점으로 인식하지 못해 페이지가 통째로 빌드에서 빠진다.
  build: {
    rollupOptions: {
      input: { panel: 'index.html' },
    },
  },
  server: {
    port: 5183,
    strictPort: true,
    hmr: { port: 5183 },
  },
});
