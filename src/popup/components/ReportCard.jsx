import React, { forwardRef } from 'react';

const SENDER_COMPANY = '엠피인터랙티브';
const SENDER_TEAM = '영업6팀';
const SENDER_SITE = 'www.mpinteractive.co.kr';
const SENDER_NAME_PLACEHOLDER = '000';
const SENDER_TITLE = '대리';

function severityBadge(severity) {
  if (severity === '확정위반') return { label: '확정 위반', bg: '#fdecea', fg: '#c0392b' };
  return { label: '확인 필요', bg: '#fff4e0', fg: '#b9700a' };
}

/**
 * Splits a citation like `가이드(2506) §1.3.1 원칙 — "원문 문구"` into a source
 * label and, only when the guide is actually quoted verbatim (a `"..."` span
 * is present), the quoted text. SHIP_001's citation points at a table rather
 * than quoting a line, so it falls back to plain source-only — never dress a
 * paraphrase up as if it were the guide's own words.
 */
function splitCitation(citation) {
  const quoted = citation.match(/"([^"]+)"/);
  const source = citation.split(' — ')[0];
  return { source, quote: quoted ? quoted[1] : null };
}

/**
 * Client-facing report image. Only real official-policy findings
 * (basisType==='official') appear here — the 6팀 internal-only SEO/기회
 * items are intentionally left out of anything sent to the advertiser
 * (2026-09-16 user decision: internal-only judgment calls shouldn't be
 * presented to the client as if they carried the same weight as an actual
 * policy violation).
 *
 * Each item is expanded into 문제점/공지 원문/리스크/개선 효과 because a bare
 * one-line citation isn't enough to make the case to an advertiser — a real
 * screenshot of the official notice would be better, but no such capture
 * exists on this machine, so the "공지 원문" block quotes the verified guide
 * text instead (§9's own script-safety rule against fabricating what can't
 * be verified applies here too).
 */
const ReportCard = forwardRef(function ReportCard({ product, findings, ruleVersion, generatedAt }, ref) {
  const official = findings.filter(
    (f) => f.basisType === 'official' && (f.severity === '확정위반' || f.severity === '의심') && f.report
  );
  // slot==='brand'는 "쓰고 계실까요?" 질문형이라 진단 결과로 단정할 수 없다.
  // 통화용 멘트로만 쓰고, 광고주에게 나가는 리포트에는 넣지 않는다.
  const improvements = findings.filter(
    (f) => f.severity === '기회손실' && f.slot !== 'defense' && f.slot !== 'brand' && f.report
  );

  const violationCount = findings.filter((f) => f.severity === '확정위반' && f.basisType === 'official').length;
  const suspectedCount = findings.filter((f) => f.severity === '의심' && f.basisType === 'official').length;

  return (
    <div ref={ref} className="report-card">
      <style>{`
        .report-card { width: 680px; background: #ffffff; font-family: -apple-system,"Malgun Gothic","맑은 고딕",sans-serif; color: #1a1a1a; }
        .report-card__header { background: linear-gradient(135deg,#1a2680,#2130a0); color: #fff; padding: 28px 32px 24px; }
        .report-card__brand { font-size: 12.5px; letter-spacing: 0.5px; opacity: 0.85; margin-bottom: 10px; }
        .report-card__title { font-size: 19px; font-weight: 700; margin-bottom: 6px; }
        .report-card__subtitle { font-size: 11.5px; opacity: 0.8; margin-bottom: 10px; }
        .report-card__product { font-size: 14px; opacity: 0.95; word-break: break-all; }
        .report-card__date { font-size: 11.5px; opacity: 0.7; margin-top: 10px; }
        .report-card__stats { display: flex; gap: 10px; padding: 18px 32px; background: #f7f8fc; border-bottom: 1px solid #eceef7; }
        .report-card__stat { flex: 1; text-align: center; padding: 10px 6px; border-radius: 8px; background: #fff; border: 1px solid #eceef7; }
        .report-card__stat-num { font-size: 20px; font-weight: 700; }
        .report-card__stat-label { font-size: 11px; color: #777; margin-top: 2px; }
        .report-card__section { padding: 20px 32px 8px; }
        .report-card__section + .report-card__section { border-top: 8px solid #f4f5fa; }
        .report-card__section-head { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 800; margin-bottom: 4px; }
        .report-card__section-bar { display: inline-block; width: 4px; height: 15px; border-radius: 2px; }
        .report-card__section-bar--red { background: #e03131; }
        .report-card__section-bar--blue { background: #2130a0; }
        .report-card__empty { font-size: 12.5px; color: #999; padding: 14px 0 18px; }
        .report-card__entry { padding: 20px 0; border-top: 1px solid #f0f0f0; }
        .report-card__entry:first-child { border-top: none; }
        .report-card__entry-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .report-card__entry-badge { flex: 0 0 auto; font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
        .report-card__entry-title { font-size: 14px; font-weight: 700; }
        .report-card__block { display: flex; gap: 10px; padding: 7px 0; }
        .report-card__block-label { flex: 0 0 78px; font-size: 11px; font-weight: 700; color: #888; padding-top: 1px; }
        .report-card__block-text { flex: 1; font-size: 12.5px; line-height: 1.6; color: #333; }
        .report-card__quote { margin: 8px 0 10px; padding: 10px 14px; background: #f7f8fc; border-left: 3px solid #2130a0; border-radius: 0 6px 6px 0; }
        .report-card__quote-text { font-size: 12px; line-height: 1.6; color: #2a2a4a; font-style: italic; }
        .report-card__quote-text--plain { font-style: normal; color: #444; }
        .report-card__quote-src { font-size: 10px; color: #8890a6; margin-top: 4px; }
        .report-card__block--risk .report-card__block-label { color: #c0392b; }
        .report-card__block--risk .report-card__block-text { color: #a83226; }
        .report-card__block--benefit .report-card__block-label { color: #1f7a3f; }
        .report-card__block--benefit .report-card__block-text { color: #1f7a3f; }
        .report-card__footer { padding: 20px 32px 26px; background: #fafafa; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
        .report-card__footer-left { font-size: 11px; color: #999; line-height: 1.6; }
        .report-card__footer-right { font-size: 12.5px; font-weight: 600; text-align: right; color: #333; white-space: nowrap; }
      `}</style>

      <div className="report-card__header">
        <div className="report-card__brand">{SENDER_COMPANY} {SENDER_TEAM}</div>
        <div className="report-card__title">스마트스토어 상품 진단 리포트</div>
        <div className="report-card__subtitle">네이버쇼핑 공식 정책 기준 진단 결과</div>
        <div className="report-card__product">{product.name}</div>
        <div className="report-card__date">진단일 {generatedAt}</div>
      </div>

      <div className="report-card__stats">
        <div className="report-card__stat">
          <div className="report-card__stat-num" style={{ color: '#e03131' }}>{violationCount}</div>
          <div className="report-card__stat-label">확정 위반</div>
        </div>
        <div className="report-card__stat">
          <div className="report-card__stat-num" style={{ color: '#b9700a' }}>{suspectedCount}</div>
          <div className="report-card__stat-label">확인 필요</div>
        </div>
        <div className="report-card__stat">
          <div className="report-card__stat-num" style={{ color: '#2130a0' }}>{improvements.length}</div>
          <div className="report-card__stat-label">개선 제안</div>
        </div>
      </div>

      <div className="report-card__section">
        <div className="report-card__section-head">
          <span className="report-card__section-bar report-card__section-bar--red" />
          네이버 공식 정책 위반
        </div>
        {official.length === 0 ? (
          <div className="report-card__empty">네이버 공식 정책 위반 사항은 확인되지 않았습니다.</div>
        ) : (
          official.map((f, i) => {
            const b = severityBadge(f.severity);
            const { source, quote } = f.citation ? splitCitation(f.citation) : {};
            return (
              <div className="report-card__entry" key={f.id + i}>
                <div className="report-card__entry-head">
                  <span className="report-card__entry-badge" style={{ background: b.bg, color: b.fg }}>
                    {b.label}
                  </span>
                  <span className="report-card__entry-title">{f.title}</span>
                </div>

                <div className="report-card__block">
                  <div className="report-card__block-label">현재 문제점</div>
                  <div className="report-card__block-text">{f.report.problem}</div>
                </div>

                {f.citation && (
                  <div className="report-card__quote">
                    {quote ? (
                      <div className="report-card__quote-text">“{quote}”</div>
                    ) : (
                      <div className="report-card__quote-text report-card__quote-text--plain">{source}</div>
                    )}
                    <div className="report-card__quote-src">
                      {quote ? `출처: ${source}` : `${source} (원문 인용이 아닌 기준 요약)`}
                    </div>
                  </div>
                )}

                <div className="report-card__block report-card__block--risk">
                  <div className="report-card__block-label">방치하면</div>
                  <div className="report-card__block-text">{f.report.risk}</div>
                </div>
                <div className="report-card__block report-card__block--benefit">
                  <div className="report-card__block-label">개선하면</div>
                  <div className="report-card__block-text">{f.report.benefit}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {improvements.length > 0 && (
        <div className="report-card__section">
          <div className="report-card__section-head">
            <span className="report-card__section-bar report-card__section-bar--blue" />
            매출 개선 제안
          </div>
          {improvements.map((f, i) => (
            <div className="report-card__entry" key={f.id + i}>
              <div className="report-card__entry-head">
                <span className="report-card__entry-badge" style={{ background: '#eaefff', color: '#2130a0' }}>
                  개선 제안
                </span>
                <span className="report-card__entry-title">{f.title}</span>
              </div>
              <div className="report-card__block">
                <div className="report-card__block-label">현재 상태</div>
                <div className="report-card__block-text">{f.report.problem}</div>
              </div>
              <div className="report-card__block report-card__block--risk">
                <div className="report-card__block-label">이대로 두면</div>
                <div className="report-card__block-text">{f.report.risk}</div>
              </div>
              <div className="report-card__block report-card__block--benefit">
                <div className="report-card__block-label">개선하면</div>
                <div className="report-card__block-text">{f.report.benefit}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="report-card__footer">
        <div className="report-card__footer-left">
          룰 v{ruleVersion} 기준 자동 진단 결과이며,
          <br />
          실제 적용 여부는 셀러센터에서 최종 확인해주세요.
        </div>
        <div className="report-card__footer-right">
          {SENDER_COMPANY} {SENDER_NAME_PLACEHOLDER} {SENDER_TITLE}
          <br />
          <span style={{ fontWeight: 400, color: '#888' }}>{SENDER_SITE}</span>
        </div>
      </div>
    </div>
  );
});

export default ReportCard;
