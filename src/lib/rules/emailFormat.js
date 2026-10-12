// Builds a client-facing email draft from the same findings used on screen —
// re-shaped from spoken phone-script tone into a written report, with a
// signature block the rep fills in themselves (name is never guessed).
const SENDER_COMPANY = '엠피인터랙티브';
const SENDER_SITE = 'https://www.mpinteractive.co.kr';
const SENDER_NAME_PLACEHOLDER = '000';
const SENDER_TITLE = '대리';

function section(title, findings) {
  if (!findings.length) return '';
  const lines = findings.map((f, i) => `${i + 1}. ${f.title}\n   ${f.message}`);
  return `▶ ${title} (${findings.length}건)\n${lines.join('\n\n')}\n`;
}

export function buildEmailDraft(product, findings) {
  const violations = findings.filter((f) => f.severity === '확정위반' && f.message);
  const suspected = findings.filter((f) => f.severity === '의심' && f.message);
  // 브랜드스토어 제안은 "쓰고 계실까요?" 질문형이라 통화용이다 — 메일 본문에
  // 그대로 넣으면 진단 결과가 아니라 영업 질문이 섞여버리므로 제외한다.
  const opportunities = findings.filter(
    (f) => f.severity === '기회손실' && f.slot !== 'brand' && f.message
  );

  const subject = `[${SENDER_COMPANY}] ${product.name} 상품 진단 결과 안내`;

  const body = `안녕하세요, 대표님.
${SENDER_COMPANY} ${SENDER_NAME_PLACEHOLDER} ${SENDER_TITLE}입니다.

요청하신 상품 진단 분석 결과를 정리해서 보내드립니다.

[분석 상품] ${product.name}

${section('확정 위반 사항', violations)}
${section('확인 필요 사항', suspected)}
${section('개선 기회', opportunities)}
문의사항 있으시면 편하게 말씀해 주세요. 감사합니다.

--
${SENDER_COMPANY} ${SENDER_NAME_PLACEHOLDER} ${SENDER_TITLE}
${SENDER_SITE}`;

  return { subject, body };
}
