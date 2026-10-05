/**
 * 6팀 일일 점검 누적 시트 — 수집기가 보낸 결과를 탭별로 아래에 추가한다.
 * 설치: 시트 > 확장 프로그램 > Apps Script 에 붙여넣기 → 배포 > 새 배포 > 웹 앱
 *       (실행 사용자: 나, 액세스 권한: 모든 사용자) → 웹 앱 URL 을 GSHEET_WEBAPP 환경변수로 등록
 * 아래 TOKEN 값을 임의의 문자열로 바꾸고, 같은 값을 GSHEET_TOKEN 환경변수로 등록한다.
 */
const TOKEN = '여기에-임의의-비밀문자열';

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.token !== TOKEN) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'token' }));
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const added = {};
  Object.keys(body.tabs).forEach(function (name) {
    const rows = body.tabs[name];
    const sheet = ss.getSheetByName(name);
    if (!sheet || !rows.length) return;
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    // 같은 수집일 데이터가 이미 있으면 지우고 다시 쓴다 (재실행 시 중복 방지)
    const last = sheet.getLastRow();
    if (last > 1) {
      const dates = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
      for (let i = dates.length - 1; i >= 0; i--) {
        if (dates[i][0] === body.date) sheet.deleteRow(i + 2);
      }
    }
    const values = rows.map(function (r) {
      return header.map(function (h) { return h === '수집일' ? body.date : (r[h] === undefined ? '' : r[h]); });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, header.length).setValues(values);
    added[name] = values.length;
  });
  return ContentService.createTextOutput(JSON.stringify({ ok: true, added: added }));
}
