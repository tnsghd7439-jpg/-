import React from 'react';

// §4.2-H: fixed tip card, always shown in ②, not counted in the finding total
// (it's not a judgment — no rule id, no severity).
export default function DetailPageTip({ matches }) {
  const withMobileShare = matches.filter((m) => m.volumeRecord && typeof m.volumeRecord.mobileShare === 'number');
  const avg =
    withMobileShare.length > 0
      ? Math.round(withMobileShare.reduce((s, m) => s + m.volumeRecord.mobileShare, 0) / withMobileShare.length)
      : null;

  return (
    <div className="tip-card">
      <div className="tip-card__title">💡 상세페이지 분석 팁 — 이런 내용을 어필해보세요</div>
      <div className="tip-card__body">
        요새 소비자들이 인내심이 많지 않다 보니 상세페이지 최상단에서 3초 동안 원하는 정보가 확인되지 않으면 이탈하는
        경우가 매우 빈번해요. 조금만 개선하면 전환율을 올릴 수 있을 것 같은데, 디자인은 저희가 무료로 도와드릴 수
        있어요. 소비자들이 빠르고 명확하게 기능·장점·프로모션을 확인할 수 있게 재구성해보면 좋을 것 같습니다.
        {avg !== null && (
          <>
            {' '}
            저희 키워드는 검색의 {avg}%가 모바일로 들어오는데, 상세페이지가 PC 기준으로 짜여 있다면 그 부분부터
            손봐드릴 수 있어요.
          </>
        )}
      </div>
    </div>
  );
}
