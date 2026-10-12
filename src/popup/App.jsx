import React, { useEffect, useMemo, useRef, useState } from 'react';
import rulesDoc from '../lib/rules.json';
import dictionaries from '../lib/dictionaries.generated.json';
import bids from '../lib/bids.generated.json';
import catkw from '../lib/categoryKeywords.generated.json';
import { evaluateProduct, collectCopyableMessages } from '../lib/rules/engine.js';
import { buildEmailDraft } from '../lib/rules/emailFormat.js';
import { extractProductFromPage } from '../lib/extractProduct.js';
import { buildKeywordPanel } from '../lib/bidLookup.js';
import { buildCategoryPanel } from '../lib/categoryLookup.js';
import { findTargetTab, isTargetTab, isStoreUrl } from './activeTab.js';
import FindingCard from './components/FindingCard.jsx';
import ReferenceBlock from './components/ReferenceBlock.jsx';
import DetailPageTip from './components/DetailPageTip.jsx';
import ReportModal from './components/ReportModal.jsx';
import KeywordPanel from './components/KeywordPanel.jsx';

const DATA_BUILT_AT = dictionaries.meta.builtAt;

export default function App() {
  const [status, setStatus] = useState('loading'); // loading | error | ready
  const [errorMessage, setErrorMessage] = useState('');
  const [product, setProduct] = useState(null);
  const [result, setResult] = useState(null);
  const [defenseOpen, setDefenseOpen] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [keywordPanel, setKeywordPanel] = useState(null);
  const [topBrands, setTopBrands] = useState([]);
  const analyzedUrlRef = useRef(null);
  const runSeqRef = useRef(0);

  // 사이드패널은 탭을 옮겨도 계속 떠 있으므로, 마운트 시 한 번만 분석하면 이전
  // 상품 결과가 그대로 남는다. 페이지 로드 완료·탭 전환을 감지해 다시 분석한다.
  useEffect(() => {
    run();

    async function onUpdated(tabId, changeInfo) {
      if (changeInfo.status !== 'complete') return;
      if (await isTargetTab(tabId)) run();
    }

    async function onActivated() {
      const tab = await findTargetTab();
      // 이미 분석한 상품으로 되돌아온 경우엔 펼쳐둔 멘트가 접히지 않게 그대로 둔다.
      if (tab && tab.url !== analyzedUrlRef.current) run();
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.windows.onFocusChanged.addListener(onActivated);
    return () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.windows.onFocusChanged.removeListener(onActivated);
    };
  }, []);

  // 페이지가 __PRELOADED_STATE__를 채우기 전에 패널이 먼저 뜨는 일이 잦다.
  // 간격을 늘려가며 여러 번 시도해야 "다시 시도"를 사람이 누르지 않아도 된다.
  const RETRY_DELAYS = [400, 900, 1600, 2500];

  async function run(attempt = 0) {
    // 새 실행이 시작되면 이전 실행의 결과는 버린다. 패널 진입과 페이지 로드
    // 완료 이벤트가 겹치면 두 실행이 동시에 돌고, 늦게 끝난 실패가 성공을
    // 덮어써서 멀쩡한 페이지에 에러가 뜨던 문제를 막는다.
    const seq = attempt === 0 ? ++runSeqRef.current : runSeqRef.current;
    const stale = () => seq !== runSeqRef.current;

    setStatus('loading');
    setReportOpen(false);
    try {
      const tab = await findTargetTab();
      if (stale()) return;
      analyzedUrlRef.current = tab ? tab.url : null;

      const url = (tab && tab.url) || '';
      if (!isStoreUrl(url)) {
        setStatus('error');
        setErrorMessage('스마트스토어 또는 브랜드스토어 상품 상세페이지에서 실행해주세요.');
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: extractProductFromPage,
      });
      if (stale()) return;
      const data = results && results[0] && results[0].result;

      if (!data) {
        setStatus('error');
        setErrorMessage('상품 데이터를 읽지 못했습니다. 새로고침 후 다시 시도해주세요.');
        return;
      }
      if (data.error) {
        const notReady = data.error === 'PRELOADED_STATE_NOT_FOUND' || data.error === 'PRODUCT_NOT_FOUND';
        if (notReady && attempt < RETRY_DELAYS.length) {
          setTimeout(() => {
            if (!stale()) run(attempt + 1);
          }, RETRY_DELAYS[attempt]);
          return;
        }
        setStatus('error');
        // 상품 상세페이지가 아니면 구조가 바뀐 게 아니라 '열어둔 화면'이 문제다.
        const onProductPage = /\/products\/\d+/.test(url);
        setErrorMessage(
          !notReady
            ? `추출 중 오류가 발생했습니다: ${data.detail || data.error}`
            : onProductPage
              ? '상품 정보를 아직 읽지 못했습니다. 페이지를 새로고침(F5)한 뒤 다시 시도해주세요.'
              : '상품 상세페이지에서 실행해주세요. (목록·검색 화면에서는 분석할 수 없습니다)'
        );
        return;
      }

      if (stale()) return;
      setProduct(data);
      const evaluated = evaluateProduct(data, rulesDoc, dictionaries);
      setResult(evaluated);
      setKeywordPanel(buildCategoryPanel(catkw, dictionaries, data));
      // 탑브랜드는 기존 입찰가 사전의 브랜드 판별 로직을 그대로 쓴다(검색량만 표기).
      setTopBrands(buildKeywordPanel(bids, data)?.brands ?? []);
      setStatus('ready');
    } catch (e) {
      if (seq !== runSeqRef.current) return;
      setStatus('error');
      setErrorMessage(`실행 중 오류가 발생했습니다: ${e && e.message ? e.message : e}`);
    }
  }

  const grouped = useMemo(() => {
    if (!result) return null;
    const violations = result.findings.filter((f) => f.severity === '확정위반');
    const suspected = result.findings.filter((f) => f.severity === '의심');
    const opportunities = result.findings.filter(
      (f) => f.severity === '기회손실' && f.slot !== 'defense' && f.slot !== 'brand'
    );
    const reference = result.findings.filter((f) => f.severity === '참고');
    const defense = result.findings.filter((f) => f.slot === 'defense');
    const brand = result.findings.filter((f) => f.slot === 'brand');
    return { violations, suspected, opportunities, reference, defense, brand };
  }, [result]);

  async function copyAll() {
    if (!result) return;
    const all = collectCopyableMessages(result.findings);
    await navigator.clipboard.writeText(all.join('\n\n'));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  }

  async function copyEmailDraft() {
    if (!result || !product) return;
    const { body } = buildEmailDraft(product, result.findings);
    await navigator.clipboard.writeText(body);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 1500);
  }

  if (status === 'loading') {
    return (
      <div className="popup popup--center">
        <div className="spinner" />
        <div>상품 정보를 분석하는 중...</div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="popup popup--center">
        <div className="error-message">{errorMessage}</div>
        <button onClick={run}>다시 시도</button>
      </div>
    );
  }

  const riskDots = Math.min(grouped.violations.length, 5);

  return (
    <div className="popup">
      <header className="header">
        <div className="header__name">{product.name}</div>
        <div className="header__risk">
          위험도 {'●'.repeat(riskDots)}
          {'○'.repeat(5 - riskDots)}
        </div>
      </header>

      <KeywordPanel panel={keywordPanel} brands={topBrands} />

      <section className="section section--violation">
        <div className="section__header">① 확정 위반 ({grouped.violations.length})</div>
        {grouped.violations.map((f, i) => (
          <FindingCard key={f.id + i} finding={f} />
        ))}
        {grouped.violations.length === 0 && <div className="section__empty">확정 위반 없음</div>}
      </section>

      {grouped.suspected.length > 0 && (
        <section className="section section--suspected">
          <div className="section__header">⚠ 확인 필요 ({grouped.suspected.length})</div>
          <div className="section__notice">확정 위반은 아니지만 근거가 있어 눈으로 한 번 더 확인 후 전달하세요.</div>
          {grouped.suspected.map((f, i) => (
            <FindingCard key={f.id + i} finding={f} />
          ))}
        </section>
      )}

      {/* 브랜드스토어는 전용 솔루션 제안이 일반 개선 기회보다 우선순위가 높아
          ②보다 위에 둔다(2026-09-21 요청). 스마트스토어에서는 비어서 렌더링되지 않는다. */}
      {grouped.brand.length > 0 && (
        <section className="section section--brand">
          <div className="section__header">브랜드스토어 추가 제안 요소 ({grouped.brand.length})</div>
          <div className="section__notice">
            브랜드스토어만 쓸 수 있는 솔루션입니다. 사용 여부는 페이지에서 확인이 안 되니 통화 중에 물어보세요.
          </div>
          {grouped.brand.map((f, i) => (
            <FindingCard key={f.id + i} finding={f} />
          ))}
        </section>
      )}

      <section className="section section--opportunity">
        <div className="section__header">② 개선 기회 ({grouped.opportunities.length})</div>
        {grouped.opportunities.length > 0 && (
          <div className="seo-weight-note">가중치 배분(50/40/30/20/10/5/3/2/1)은 6팀 내부 기준입니다.</div>
        )}
        {grouped.opportunities.map((f, i) => (
          <FindingCard key={f.id + i} finding={f} />
        ))}
        {grouped.reference.map((f, i) => (
          <ReferenceBlock key={'ref' + i} finding={f} />
        ))}
        <DetailPageTip matches={result.matches} />

        {grouped.defense.length > 0 && (
          <div className="defense-slot">
            <button className="defense-slot__toggle" onClick={() => setDefenseOpen((v) => !v)}>
              {defenseOpen ? '▲' : '▼'} 광고주가 "요즘 안 팔린다"고 하면 ({grouped.defense.length})
            </button>
            {defenseOpen && grouped.defense.map((f, i) => <FindingCard key={'def' + i} finding={f} />)}
          </div>
        )}
      </section>

      <div className="copy-all">
        <button onClick={copyAll}>{copiedAll ? '복사됨!' : '전체 멘트 순서대로 복사'}</button>
      </div>

      <div className="email-draft">
        <div className="email-draft__label">광고주에게 메일로 전달할 때</div>
        <button className="email-draft__primary" onClick={copyEmailDraft}>
          {emailCopied ? '복사됨!' : '메일 본문 복사'}
        </button>
      </div>

      <div className="report-trigger">
        <button onClick={() => setReportOpen(true)}>📋 리포트 이미지로 만들기 (메일 첨부용)</button>
      </div>

      <footer className="footer">
        룰 v{rulesDoc.ruleVersion} / 갱신일 {rulesDoc.updatedAt} / 데이터 기준일 {DATA_BUILT_AT.slice(0, 10)}
      </footer>

      {reportOpen && (
        <ReportModal
          product={product}
          findings={result.findings}
          ruleVersion={rulesDoc.ruleVersion}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
