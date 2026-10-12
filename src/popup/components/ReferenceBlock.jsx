import React from 'react';

// §6, §8-13: severity=참고 findings render numbers only — no message, no copy
// button, and must never appear in the "전체 멘트 순서대로 복사" output.
export default function ReferenceBlock({ finding }) {
  const v = finding.vars;
  return (
    <div className="reference-block">
      <div className="reference-block__label">⚪ 참고 — 판단이 필요합니다</div>
      <div className="reference-block__numbers">
        {v.keyword} — 볼륨사전 {v.volumeVolume} ({v.volumeTop ? '상위' : '하위'} 25%) / 시즌사전 {v.seasonVolume} (
        {v.seasonTop ? '상위' : '하위'} 25%)
      </div>
      <div className="reference-block__note">두 기준이 엇갈립니다. 축약 여부는 직접 판단하세요.</div>
    </div>
  );
}
