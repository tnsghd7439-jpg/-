/**
 * 6팀 도구 배포 서버 (Google Apps Script, 단독 프로젝트)
 *
 * 하는 일
 * 1) 배포 폴더(구글드라이브)에 새 파일이 올라오면, 같은 도구의 기존 파일 내용을 새 파일로 바꾸고
 *    새로 올라온 파일은 휴지통으로 보낸다. → 도구마다 파일 1개만 남고, 파일 ID(링크)는 바뀌지 않는다.
 *    (구버전은 드라이브의 '버전 관리' 기록에 남으므로 필요하면 되돌릴 수 있다)
 * 2) 신입 PC의 업데이트 프로그램(install.bat)이 도구 목록과 파일을 받아 갈 수 있게 웹 앱으로 응답한다.
 *
 * 설치 방법은 deploy_tools/README.md 참고.
 * 이 저장소는 공개 저장소이므로 아래 '여기에_...' 값은 구글 Apps Script 편집기에서만 채우고 커밋하지 않는다.
 */

// ===== 설정 (Apps Script 편집기에서 채우기) =====
const FOLDER_ID = '여기에_배포폴더_ID';         // 드라이브 폴더 주소 .../folders/<이 부분>
const TEAM_KEY = '여기에_팀_키';                // 영문+숫자 아무 문자열. install.bat 의 $TeamKey 와 같아야 함
const SALES_NOTE_URL = '여기에_영업노트_웹앱_주소'; // 영업노트 웹앱 주소 (.../exec)
const TODO_UPDATE_FILE_ID = '';                // '마케터 할 일' team.json 의 update_url 에 있는 id= 값 (비우면 폴더에서 찾음)
const PYTHON_URL = 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe';
// ===============================================

/**
 * 도구 목록 — 배포 폴더에 올리는 파일 이름이 match 규칙에 맞아야 해당 도구로 인식된다.
 * type
 *   desktop   : 바탕화면 '영업6팀 도구' 폴더에 target 이름으로 저장 (HTML)
 *   link      : 바탕화면 폴더에 웹 주소 바로가기(.url) 생성
 *   extension : 크롬 확장프로그램 ZIP — PC의 고정 폴더에 풀어서 교체
 *   app       : '마케터 할 일' 앱 — 처음 한 번 설치만 (이후 업데이트는 앱이 스스로 함)
 *   self      : 업데이트 프로그램(install.bat) 자기 자신
 * legacy: 처음 설치할 때 바탕화면·다운로드 폴더에서 찾아 휴지통으로 보낼 예전 파일 이름 (와일드카드)
 */
const TOOLS = [
  { id: 'deck', name: '고액광고주 제안서 작성툴', type: 'desktop', match: /^search_ad_deck_tool.*\.html$/i,
    target: '고액광고주 제안서 작성툴.html', legacy: ['search_ad_deck_tool*.html'] },
  { id: 'deck-guide', name: '보고서 다운로드 가이드', type: 'desktop', match: /^보고서.*가이드.*\.html$/,
    target: '보고서 다운로드 가이드.html', legacy: ['보고서*가이드*.html'] },
  { id: 'auth', name: '권한분석툴', type: 'desktop', match: /^권한분석툴.*\.html$/,
    target: '권한분석툴.html', legacy: ['권한분석툴*.html'] },
  { id: 'note-guide', name: '영업노트 가이드', type: 'desktop', match: /^영업노트.*가이드.*\.html$/,
    target: '영업노트 가이드.html', legacy: ['영업노트*가이드*.html'] },
  { id: 'note', name: '영업노트', type: 'link', url: SALES_NOTE_URL, target: '영업노트 (웹).url' },
  { id: 'supporter', name: '네이버 영업 서포터', type: 'extension', match: /서포터.*\.zip$/,
    target: 'naver-sales-supporter' },
  { id: 'todo', name: '마케터 할 일', type: 'app', match: /^update.*\.zip$/i,
    target: 'marketer-todo', pinnedId: TODO_UPDATE_FILE_ID, pythonUrl: PYTHON_URL },
  { id: 'installer', name: '설치·업데이트 프로그램', type: 'self', match: /^install.*\.bat$/i },
];

/* ---------- 웹 앱 ---------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (!p.key || p.key !== TEAM_KEY) return json_({ ok: false, error: '팀 키가 맞지 않습니다. 팀장에게 문의하세요.' });
    if (p.action === 'list') return json_({ ok: true, tools: listTools_() });
    if (p.action === 'get') return json_(getTool_(p.id));
    return json_({ ok: false, error: '알 수 없는 요청입니다.' });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- 드라이브 ---------- */

const FIELDS = 'id,name,md5Checksum,modifiedTime,size,trashed';

function folderFiles_() {
  const out = [];
  let token;
  do {
    const r = Drive.Files.list({
      q: "'" + FOLDER_ID + "' in parents and trashed = false",
      fields: 'nextPageToken, files(' + FIELDS + ')',
      pageSize: 200, pageToken: token,
      supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    (r.files || []).forEach(f => out.push(f));
    token = r.nextPageToken;
  } while (token);
  return out;
}

function meta_(id) {
  if (!id) return null;
  try {
    const f = Drive.Files.get(id, { fields: FIELDS, supportsAllDrives: true });
    return f.trashed ? null : f;
  } catch (e) {
    return null;
  }
}

function nfc_(s) {
  // 맥에서 올린 한글 파일명은 자모가 분리(NFD)되어 있어 규칙에 안 맞을 수 있다
  return String(s || '').normalize('NFC');
}

function canonId_(tool) {
  if (tool.pinnedId) return tool.pinnedId;
  return PropertiesService.getScriptProperties().getProperty('canon:' + tool.id);
}

/**
 * 폴더 정리 — 도구마다 '대표 파일' 1개만 남긴다.
 * 대표 파일보다 새로 올라온 파일이 있으면 그 내용으로 대표 파일을 덮어쓰고(ID 유지), 나머지는 휴지통.
 * 10분마다 자동 실행(setupTrigger) + 목록 요청 때마다 실행.
 */
function tidy() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const files = folderFiles_();
    const props = PropertiesService.getScriptProperties();
    TOOLS.filter(t => t.match).forEach(t => { try {
      const cands = files.filter(f => t.match.test(nfc_(f.name)))
        .sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
      let canon = meta_(canonId_(t));
      if (!canon) {
        if (t.pinnedId) {
          console.warn(t.name + ': 지정한 파일(' + t.pinnedId + ')을 열 수 없습니다. 정리를 건너뜁니다.');
          return;
        }
        if (!cands.length) return;
        canon = cands[0];
        props.setProperty('canon:' + t.id, canon.id);
      }
      cands.forEach(f => {
        if (f.id === canon.id) return;
        const newer = new Date(f.modifiedTime) > new Date(canon.modifiedTime);
        if (newer && f.md5Checksum !== canon.md5Checksum) {
          const blob = DriveApp.getFileById(f.id).getBlob();
          // 고정 ID 파일(마케터 할 일 update.zip)은 앱이 이름이 아니라 ID로 받으므로 이름은 그대로 둔다
          const resource = t.pinnedId ? {} : { name: f.name };
          canon = Drive.Files.update(resource, canon.id, blob, { supportsAllDrives: true, fields: FIELDS });
          console.log(t.name + ': 새 버전 반영 → ' + f.name);
        }
        DriveApp.getFileById(f.id).setTrashed(true);
      });
    } catch (err) {
      // 한 도구에서 실패해도(예: 수정 권한 없는 고정 파일) 나머지 도구 정리는 계속한다
      console.warn(t.name + ' 정리 실패: ' + ((err && err.message) || err));
    } });
  } finally {
    lock.releaseLock();
  }
}

function listTools_() {
  tidy();
  return TOOLS.map(t => {
    const f = t.match ? meta_(canonId_(t)) : null;
    return {
      id: t.id, name: t.name, type: t.type, target: t.target || '', url: t.url || '',
      legacy: t.legacy || [], pythonUrl: t.pythonUrl || '',
      fileName: f ? f.name : '', md5: f ? (f.md5Checksum || f.modifiedTime) : '',
      modified: f ? f.modifiedTime : '', size: f ? Number(f.size || 0) : 0,
    };
  });
}

function getTool_(id) {
  const t = TOOLS.find(x => x.id === id && x.match);
  if (!t) return { ok: false, error: '없는 도구입니다: ' + id };
  const f = meta_(canonId_(t));
  if (!f) return { ok: false, error: t.name + ' 파일이 배포 폴더에 없습니다.' };
  const blob = DriveApp.getFileById(f.id).getBlob();
  return { ok: true, name: f.name, md5: f.md5Checksum || f.modifiedTime, data: Utilities.base64Encode(blob.getBytes()) };
}

/* ---------- 관리자가 편집기에서 한 번 실행 ---------- */

/** 10분마다 폴더 정리 예약 (처음 한 번 실행) */
function setupTrigger() {
  ScriptApp.getProjectTriggers().filter(tr => tr.getHandlerFunction() === 'tidy')
    .forEach(tr => ScriptApp.deleteTrigger(tr));
  ScriptApp.newTrigger('tidy').timeBased().everyMinutes(10).create();
  tidy();
  console.log('예약 완료. 현재 도구 상태:');
  listTools_().forEach(t => console.log(' - ' + t.name + ': ' + (t.fileName || (t.url ? '(웹 링크)' : '파일 없음'))));
}

/** 설정 점검 — 편집기에서 실행하면 무엇이 빠졌는지 로그로 알려준다 */
function checkSetup() {
  const miss = [];
  if (/여기에/.test(FOLDER_ID)) miss.push('FOLDER_ID');
  if (/여기에/.test(TEAM_KEY)) miss.push('TEAM_KEY');
  if (/여기에/.test(SALES_NOTE_URL)) miss.push('SALES_NOTE_URL');
  if (miss.length) { console.warn('채워야 할 값: ' + miss.join(', ')); return; }
  console.log('배포 폴더: ' + DriveApp.getFolderById(FOLDER_ID).getName());
  listTools_().forEach(t => console.log(' - ' + t.name + ': ' + (t.fileName || (t.url ? '(웹 링크)' : '파일 없음'))));
}
