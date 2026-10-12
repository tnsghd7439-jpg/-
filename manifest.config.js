import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: '스마트스토어 상품 진단',
  description: '스마트스토어 상품 상세페이지를 네이버 정책·SEO 기준으로 진단하고 광고주 안내 멘트를 뽑아줍니다.',
  version: pkg.version,
  // default_popup이 있으면 아이콘 클릭을 팝업이 가로채서 onClicked가 안 온다.
  // 클릭은 background/service-worker.js에서 받아 별도 창을 띄운다.
  action: {},
  background: { service_worker: 'src/background/service-worker.js', type: 'module' },
  permissions: ['scripting', 'activeTab', 'storage', 'tabs'],
  host_permissions: ['https://smartstore.naver.com/*', 'https://brand.naver.com/*'],
});
