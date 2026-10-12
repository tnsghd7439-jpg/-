import React, { useRef, useState } from 'react';
import { toBlob, toPng } from 'html-to-image';
import ReportCard from './ReportCard.jsx';

// html-to-image needs a couple of animation-frame ticks after fonts/layout
// settle before the clone is captured, otherwise the first export can come
// back with missing text. Cheap and safe to just always do it twice.
async function settle() {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

export default function ReportModal({ product, findings, ruleVersion, onClose }) {
  const cardRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generatedAt = useState(() => new Date().toISOString().slice(0, 10))[0];

  async function copyImage() {
    if (!cardRef.current || busy) return;
    setBusy(true);
    setError('');
    try {
      await settle();
      const blob = await toBlob(cardRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      if (!blob) throw new Error('이미지 생성 실패');
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setError('클립보드 복사에 실패했습니다. 다운로드를 이용해주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadImage() {
    if (!cardRef.current || busy) return;
    setBusy(true);
    setError('');
    try {
      await settle();
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${product.name.slice(0, 30)}_진단리포트.png`;
      a.click();
    } catch (e) {
      setError('이미지 다운로드에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="report-modal-overlay" onClick={onClose}>
      <div className="report-modal" onClick={(e) => e.stopPropagation()}>
        <div className="report-modal__head">
          <span className="report-modal__head-title">리포트 이미지 미리보기</span>
          <button className="report-modal__close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="report-modal__body">
          <ReportCard ref={cardRef} product={product} findings={findings} ruleVersion={ruleVersion} generatedAt={generatedAt} />
        </div>
        {error && <div className="report-modal__error">{error}</div>}
        <div className="report-modal__actions">
          <button className="report-modal__btn-primary" onClick={copyImage} disabled={busy}>
            {copied ? '복사됨!' : '클립보드에 이미지 복사'}
          </button>
          <button className="report-modal__btn-secondary" onClick={downloadImage} disabled={busy}>
            이미지 다운로드
          </button>
        </div>
      </div>
    </div>
  );
}
