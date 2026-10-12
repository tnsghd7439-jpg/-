import React, { useState } from 'react';

// 확장프로그램 안에 동봉한 이해자료(public/problem-guide.html)의 섹션 앵커.
// 여기 없는 룰은 설명 섹션이 아직 없다는 뜻이라 링크를 띄우지 않는다.
const GUIDE_SECTIONS = new Set([
  'p-moeum003', 'p-moeum004', 'p-moeum005',
  'p-tag001', 'p-tag003', 'p-tag006',
  'p-price003', 'p-ship001', 'p-ship002',
  'p-seo001', 'p-seo003', 'p-seo005', 'p-seo006', 'p-seo007', 'p-seo008',
  'p-opp001', 'p-opp002', 'p-opp004', 'p-opp005',
  'p-brand001', 'p-brand002', 'p-brand004', 'p-brand005',
]);

// 병합된 finding은 "OPP_002+OPP_003"처럼 두 룰이 합쳐진 id를 갖는다. 이해자료는
// 합쳐진 쪽(쿠폰·CRM) 섹션에서 둘을 같이 설명하므로 앞 id 기준으로 보낸다.
function guideAnchor(findingId) {
  const base = findingId.split('+')[0];
  const anchor = 'p-' + base.toLowerCase().replace(/_/g, '');
  if (GUIDE_SECTIONS.has(anchor)) return anchor;
  const partnerOf = { OPP_003: 'p-opp002', BRAND_003: 'p-brand002' };
  return partnerOf[base] ?? null;
}

export default function FindingCard({ finding }) {
  const [copied, setCopied] = useState(false);
  // 신입은 멘트를 읽어야 하지만 기존 사원은 굳이 볼 필요가 없어서(2026-09-14
  // 요청), 멘트 본문은 기본적으로 접혀있고 눌러야 펼쳐진다. "복사"는 접힌
  // 상태에서도 그대로 동작 — 안 보고 바로 복사만 하는 용도.
  const [expanded, setExpanded] = useState(false);

  async function copy(e) {
    e.stopPropagation();
    if (!finding.message) return;
    await navigator.clipboard.writeText(finding.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  const anchor = guideAnchor(finding.id);

  function openGuide(e) {
    e.stopPropagation();
    chrome.tabs.create({ url: chrome.runtime.getURL(`problem-guide.html#${anchor}`) });
  }

  const variant =
    finding.slot === 'brand'
      ? 'brand'
      : finding.severity === '확정위반'
        ? 'violation'
        : finding.severity === '의심'
          ? 'suspected'
          : 'opportunity';

  return (
    <div className={`finding finding--${variant}`}>
      <div className="finding__title">{finding.title}</div>
      {finding.message && (
        <button className="finding__toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '▲ 멘트 접기' : '▼ 멘트 보기'}
        </button>
      )}
      {finding.message && expanded && <div className="finding__message">{finding.message}</div>}
      {finding.copyable && finding.message && (
        <button className="finding__copy" onClick={copy}>
          {copied ? '복사됨!' : '복사'}
        </button>
      )}
      {anchor && (
        <button className="finding__guide" onClick={openGuide}>
          💡 이해가 안 가면 클릭하세요!
        </button>
      )}
    </div>
  );
}
