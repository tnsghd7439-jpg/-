import React, { useState } from 'react';

const cnt = (n) => (typeof n === 'number' ? n.toLocaleString() : '-');

/**
 * 화면 맨 위 "카테고리 데이터".
 *
 * 상품의 소분류와 자료의 소분류가 맞아떨어질 때만 그 카테고리의 대표/확장
 * 키워드와 월 검색량을 보여준다(2026-10-08 요청). 맞지 않으면 추측해서
 * 채우지 않고 비워둔다. 입찰가는 표기하지 않는다.
 */
export default function KeywordPanel({ panel, brands }) {
  const [copied, setCopied] = useState(false);

  const brandLine =
    brands && brands.length
      ? `이 카테고리에서는 ${brands.map((b) => `${b.keyword}(월 ${b.volume?.toLocaleString()}회)`).join(', ')} 쪽을 많이 찾으시는 것 같더라구요.`
      : '';

  async function copyBrandLine() {
    if (!brandLine) return;
    await navigator.clipboard.writeText(brandLine);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!panel) {
    return (
      <section className="kwpanel">
        <div className="kwpanel__head">
          <span className="kwpanel__title">카테고리 데이터</span>
        </div>
        <div className="kwpanel__note">
          이 상품의 소분류에 해당하는 키워드 자료가 없습니다. (추측해서 표시하지 않습니다)
        </div>
      </section>
    );
  }

  const { main, expansions, sourceCategory, season } = panel;

  return (
    <section className="kwpanel">
      <div className="kwpanel__head">
        <span className="kwpanel__title">카테고리 데이터</span>
        <span className="kwpanel__cat">{sourceCategory}</span>
      </div>

      <table className="kwpanel__table">
        <thead>
          <tr>
            <th>키워드</th>
            <th>월 검색량</th>
          </tr>
        </thead>
        <tbody>
          <tr className="kwpanel__row--main">
            <td>
              <span className="kwpanel__tag">대표</span>
              {main.keyword}
            </td>
            <td>{cnt(main.volume)}</td>
          </tr>
          {expansions.map((e) => (
            <tr key={e.keyword}>
              <td>
                <span className="kwpanel__tag kwpanel__tag--rel">확장</span>
                {e.keyword}
              </td>
              <td>{cnt(e.volume)}</td>
            </tr>
          ))}
          {(brands ?? []).map((b) => (
            <tr key={b.keyword}>
              <td>
                <span className="kwpanel__tag kwpanel__tag--brand">탑브랜드</span>
                {b.keyword}
              </td>
              <td>{cnt(b.volume)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {season && <SeasonChart season={season} />}

      {brandLine && (
        <button className="kwpanel__script" onClick={copyBrandLine} title="클릭하면 멘트가 복사됩니다">
          {copied ? '복사됨!' : `💬 ${brandLine}`}
        </button>
      )}
    </section>
  );
}

/** 월별 검색량 막대그래프. 성수기 달은 색을 달리해 한눈에 보이게 한다. */
function SeasonChart({ season }) {
  const now = new Date().getMonth() + 1;
  const peak = new Set(season.peakMonths);

  return (
    <div className="season">
      <div className="season__head">
        <b>{season.keyword}</b> 월별 검색 추이
        <span className="season__meta">
          성수기 {season.peakMonths.join('·')}월 · {season.confidence}
        </span>
      </div>
      <div className="season__chart">
        {season.monthly.map((v, i) => {
          const month = i + 1;
          const h = Math.max(2, Math.round((v / season.max) * 100));
          const cls = peak.has(month) ? 'season__bar season__bar--peak' : 'season__bar';
          return (
            <div className="season__col" key={month} title={`${month}월 ${v.toLocaleString()}회`}>
              <div className={cls} style={{ height: `${h}%` }} />
              <div className={month === now ? 'season__label season__label--now' : 'season__label'}>{month}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
