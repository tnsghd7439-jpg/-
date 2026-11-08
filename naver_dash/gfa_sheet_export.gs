/**
 * 6팀 GFA 현황 시트 → 네이버 SA 계정 점검판 「GFA 액션」 탭용 조회 주소 (읽기 전용).
 * 설치: GFA 시트 > 확장 프로그램 > Apps Script 에 붙여넣기 → 배포 > 새 배포 > 유형: 웹 앱
 *       (실행 사용자: 나, 액세스 권한: 모든 사용자) → 웹 앱 URL 을 회사 PC 환경변수 NAVER_GFA_URL 로 등록.
 * 비밀번호(선택): TOKEN 에 문자열을 넣으면 같은 값을 NAVER_GFA_TOKEN 환경변수로 등록해야 읽을 수 있다.
 * 비워 두면('') 웹 앱 주소만 알면 누구나 시트 내용을 읽을 수 있다.
 */
const TOKEN = '';
const SUMMARY = '팀 요약';

function doGet(e) {
  if (TOKEN && (!e || !e.parameter || e.parameter.token !== TOKEN)) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'token' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabs = {};
  let note = '';
  ss.getSheets().forEach(function (sh) {
    if (sh.getName() === SUMMARY) {
      note = String(sh.getRange(2, 1).getDisplayValue()); // "기준 10/1~10/14 … 마지막 업데이트 …"
      return;
    }
    tabs[sh.getName()] = sh.getDataRange().getValues();   // 팀원 탭: 원본 값 그대로
  });
  return ContentService.createTextOutput(JSON.stringify({ ok: true, note: note, tabs: tabs }))
    .setMimeType(ContentService.MimeType.JSON);
}
