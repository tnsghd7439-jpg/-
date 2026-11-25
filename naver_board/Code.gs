/**
 * 네이버 전담팀 원보드 — 서버 코드 (구글 앱스 스크립트)
 *
 * 설치 방법은 같은 폴더의 README.md 를 보세요.
 * 이 저장소는 공개입니다. 팀원 명단·매출·연결 코드는 코드에 넣지 말고 반드시 시트에만 둡니다.
 */

const TZ = 'Asia/Seoul';

const SCHEMA = {
  '설정': ['키', '값', '설명'],
  '팀원': ['이메일', '이름', '역할', '담당자명', '사용', '알림코드'],
  '공지': ['id', '구분', '제목', '내용', '중요', '작성자', '작성일'],
  '공지확인': ['공지id', '이메일', '확인시각'],
  '목표': ['id', '이메일', '기간', '시작일', '종료일', '분류', '제목', '목표수치', '단위', '실행계획',
          '상태', '검토의견', '검토자', '검토일', '작성일'],
  '일일체크': ['id', '목표id', '이메일', '날짜', '결과', '실적', '메모', '실패사유', '소통완료', '소통메모',
              '소통시각', '기록시각'],
  '일정': ['id', '유형', '제목', '시작일', '종료일', '시간', '대상', '작성자', '메모'],
  '가이드': ['id', '매체', '구분', '제목', '내용', '링크', '순서', '수정일'],
  '매체공지': ['id', '매체', '제목', '요약', '영업포인트', '링크', '게시일', '중요도', '유형', '상품', '신청시작', '마감일',
              '행사시작', '행사종료', '기간', '수집일'],
  '가망건': ['id', '이메일', '업체명', '스토어주소', '매체', '담당자', '연락처', '상태', '메모', '다음연락', '등록일', '수정일', '계약일'],
  '통화기록': ['id', '가망건id', '이메일', '시각', '결과', '메모', '다음연락', '기록자'],
  '할일': ['id', '이메일', '분류', '제목', '메모', '반복', '반복값', '기한', '시간', '시작일', '상태', '작성일'],
  '할일완료': ['id', '할일id', '이메일', '날짜', '완료시각'],
  '이용기록': ['날짜', '이메일', '기록'],
  '실적_일별': ['날짜', '담당자', '매체', '광고주ID', '광고주명', '매출', '출처'],
  '실적_월별': ['월', '담당자', '매체', '광고주ID', '광고주명', '매출', '출처'],
};

const DEFAULT_SETTINGS = [
  ['솔루션폴더ID', '', '솔루션 파일을 올리는 구글 드라이브 폴더 주소에서 folders/ 뒤의 값'],
  ['보드주소', '', '배포한 원보드 웹 앱 주소(/exec 로 끝남). 알리미가 알림을 누르면 이 주소를 엽니다'],
  ['알림주소', '', '알리미 전용 배포 주소(/exec). 비워두면 보드주소를 씁니다'],
  ['VAT포함매체', '', 'MP AI가 공급가액을 주므로 보통 비워둡니다. 넣은 매체(이름 일부만 맞아도 적용)는 1.1로 나눠 저장'],
  ['제외계정', '', '실적에서 뺄 광고주ID (쉼표로 구분). 월간보고 제외 계정과 같게'],
  ['절반반영계정', '', 'MP AI 공유 비율과 별개로 50%만 반영할 광고주ID (쉼표로 구분). 보통 비워둡니다'],
  ['인트라넷보충매체', '11번가,카카오,에이블리', 'MP AI에 아직 없는 매체만 인트라넷에서 보충. MP AI에 들어오기 시작하면 여기서 지우세요(겹치는 기간은 자동으로 MP AI 우선)'],
  ['수집토큰', '', '인트라넷 보충 수집기(GitHub Actions)가 보낼 때 쓰는 비밀 문자열. BOARD_TOKEN 과 같은 값'],
  ['마지막인트라넷수집', '', '자동으로 기록됩니다'],
  ['마지막SA수집', '', '오늘 점검(네이버 SA) 마지막 수집. 자동으로 기록됩니다'],
  ['매체공지매체', '네이버,지마켓,카카오,11번가', 'MP AI 매체 공지 중 보드에 보여줄 매체(쉼표로 구분). 비우면 전부'],
  ['매체공지확인일', '7', "'조치필요' 매체 공지를 확인 대상으로 삼는 기간(게시 후 며칠). 신청 마감이 남아 있으면 기간이 지나도 대상"],
  ['매체공지팝업매체', '네이버', '이 매체의 공지는 중요도·유형과 관계없이 확인 팝업(1시간 재알림)으로 띄웁니다(최근 게시 또는 신청 마감이 남은 것). 쉼표로 구분'],
  ['매체공지확인제외유형', '프로모션·이벤트', "'조치필요'여도 확인 팝업 없이 목록·캘린더로만 보여줄 유형(쉼표로 구분). 비우면 조치필요 전부 확인 대상"],
  ['수집시각', '11', '팀장 알리미가 MP AI 매출을 가져오는 시각(0~23시). MP AI 전일 집계 이후로'],
  ['마지막수집', '', '자동으로 기록됩니다'],
  ['아침알림시각', '9','알리미가 오늘 할 일 알림을 띄우는 시각(0~23시)'],
  ['경고_비율하락', '5', '유지율·정착률·신규 매출 비중이 전월보다 몇 %p 이상 떨어지면 경고'],
  ['경고_성장률하락', '5', '동일 광고주 성장률이 전월보다 몇 %p 이상 떨어지면 경고'],
  ['경고_휴면상승', '3', '휴면 전환율이 전월보다 몇 %p 이상 오르면 경고'],
  ['경고_유효광고주감소', '10', '유효 광고주 수가 전월보다 몇 % 이상 줄면 경고'],
  ['경고_계정하락', '30', '어제 계정 매출이 직전 7일 평균보다 몇 % 이상 낮으면 하락 계정으로 표시'],
];

const NOTICE_TYPES = ['팀장 공지', '회사 공지'];
const GOAL_PERIODS = ['주', '월', '분기'];
const GOAL_CATEGORIES = ['광고매출', '계정 맵핑', '신규 계약', '영상 제작', '영상 편집', '블로그 포스팅',
  '교육·학습', '기타'];
const EVENT_TYPES = ['팀', '개인', '미팅', '프로모션'];
const GUIDE_SECTIONS = ['맵핑 방법', '세팅 방법', '문의 경로'];

/** 탭 목록. lead: true 는 팀장에게만 보입니다. 팀장 전용 탭은 여기에 한 줄 추가하면 됩니다. */
const TABS = [
  { id: 'perf', name: '계정별 실적' },
  { id: 'check', name: '오늘 점검' },
  { id: 'plan', name: '개인별 액션플랜' },
  { id: 'sales', name: '영업노트' },
  { id: 'notice', name: '공지사항' },
  { id: 'solution', name: '솔루션' },
  { id: 'guide', name: '매체별 가이드' },
  { id: 'calendar', name: '캘린더' },
  { id: 'admin', name: '팀 현황', lead: true },
];

/* ───────────────────────── 웹 앱 진입점 ───────────────────────── */

function doGet(e) {
  MEMO_ = {};
  const p = (e && e.parameter) || {};
  if (p.api === 'alerts') return json_(alerts_(p.code || ''));
  if (p.api === 'saPrev') {
    const tk = settings_()['수집토큰'];
    if (!tk || p.token !== tk) return json_({ ok: false, error: 'token' });
    return ContentService.createTextOutput(blobRead_('sa') || '{}').setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('네이버 전담팀 원보드')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** 화면에서 google.script.run.api(action, payload) 로 부르는 단일 창구 */
function api(action, payload) {
  MEMO_ = {};
  try {
    const fn = ACTIONS[action];
    if (!fn) throw new Error('알 수 없는 요청입니다: ' + action);
    const me = me_();
    const data = fn(me, payload || {});
    if (USAGE_TAB_[action]) useMark_(me.email, USAGE_TAB_[action]);
    return JSON.stringify({ ok: true, data: data });
  } catch (err) {
    return JSON.stringify({ ok: false, error: String(err && err.message || err) });
  }
}

/**
 * 매출을 받는 곳. 두 군데서 옵니다.
 *  - MP AI: 팀장 알리미(크롬 확장)가 팀장 연결 코드로 보냄
 *  - 인트라넷: 보충 수집기(mp_report/board_sync.py)가 수집토큰으로 보냄. '인트라넷보충매체'에 적힌 매체만 저장
 * 같은 출처·같은 날짜(월) 데이터는 지우고 다시 씁니다. 일별은 최근 120일만 남깁니다(월별에 이력이 남음).
 */
function doPost(e) {
  MEMO_ = {};
  try {
    const body = JSON.parse(e.postData.contents);
    const s = settings_();
    const lead = body.code ? members_().find(function (m) { return m.role === 'lead' && m.code && m.code === body.code; }) : null;
    const viaToken = !lead && !!s['수집토큰'] && body.token === s['수집토큰'];
    if (!lead && !viaToken) return json_({ ok: false, error: '팀장 알리미 연결 코드 또는 수집토큰이 맞지 않습니다.' });
    const source = viaToken ? '인트라넷' : 'MP AI';
    return json_(locked_(function () {
      const rule = salesRules_();
      const norm = function (rows) { return normalizeSales_(rows || [], rule, lead, source); };
      const out = { ok: true, source: source };
      if (body.daily) {
        const keep = addDays_(today_(), -120);
        out.daily = replaceRows_('실적_일별', '날짜', body.daily.dates || [], norm(body.daily.rows), source,
          function (v) { return v < keep; });
      }
      if (body.monthly) out.monthly = replaceRows_('실적_월별', '월', body.monthly.months || [], norm(body.monthly.rows), source);
      if (body.schedules && viaToken) out.schedules = replaceIntraEvents_(body.schedules);
      if (body.mediaNotices && lead) out.mediaNotices = upsertMediaNotices_(body.mediaNotices);
      if (body.sa && viaToken) {
        blobWrite_('sa', JSON.stringify(body.sa.data));
        if (body.sa.template) blobWrite_('sadash', String(body.sa.template));
        update_('설정', '키', '마지막SA수집', { '값': now_() + ' (기준일 ' + (body.sa.data && body.sa.data.baseDate || '?') + ')' });
        out.sa = { accounts: ((body.sa.data || {}).accounts || []).length };
      }
      if (body.intraChecks && viaToken) { blobWrite_('intra', JSON.stringify(body.intraChecks)); out.intra = true; }
      update_('설정', '키', viaToken ? '마지막인트라넷수집' : '마지막수집', { '값': now_() + (lead ? ' (' + lead.name + ')' : '') });
      return out;
    }));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/**
 * 인트라넷 근태·외근을 캘린더 '일정' 시트에 넣습니다. 작성자 '인트라넷' 행만 기간 안에서 지우고 다시 씁니다.
 * 대상(직원 이름)은 팀원 명단의 담당자명·이름으로 이메일을 찾아 저장합니다.
 */
function replaceIntraEvents_(sc) {
  const from = String(sc.from || ''), to = String(sc.to || '');
  if (!isDate_(from) || !isDate_(to)) throw new Error('일정 기간이 올바르지 않습니다.');
  const removed = remove_('일정', function (e) {
    return e['작성자'] === '인트라넷' && e['시작일'] <= to && (e['종료일'] || e['시작일']) >= from;
  });
  const mem = members_();
  const find = function (name) {
    const n = String(name || '').trim();
    const m = mem.find(function (x) { return x.manager === n || x.name === n; });
    return m ? m.email : '';
  };
  const rows = (sc.rows || []).filter(function (r) { return isDate_(r['시작일']); });
  rows.forEach(function (r) {
    const type = ['외근', '근태', '개인'].indexOf(r['유형']) >= 0 ? r['유형'] : '근태';
    insert_('일정', {
      id: 'in' + uid_(), '유형': type, '제목': text_(r['제목'], 200), '시작일': r['시작일'],
      '종료일': isDate_(r['종료일']) ? r['종료일'] : r['시작일'], '시간': text_(r['시간'], 40),
      '대상': find(r['대상']), '작성자': '인트라넷', '메모': text_(r['메모'], 500),
    });
  });
  return { removed: removed, added: rows.length };
}

/**
 * MP AI 매체 공지를 id 기준으로 덮어쓰고, 게시 180일이 지난 것(마감 남은 것 제외)은 지웁니다.
 * 수백 건을 한 줄씩 쓰면 느려서(알리미 연결이 끊김) 시트 전체를 한 번에 다시 씁니다.
 */
function upsertMediaNotices_(list) {
  forget_('매체공지');
  const sh = sheet_('매체공지');
  const head = SCHEMA['매체공지'];
  const vals = sh.getDataRange().getValues();
  const cur = vals.length > 1 ? vals.slice(1) : [];
  const col = function (name) { return head.indexOf(name); };
  const ids = {};
  list.forEach(function (n) { if (n && n.id) ids[String(n.id)] = true; });
  const old = addDays_(today_(), -180), day = today_();
  const kept = cur.filter(function (r) {
    const id = String(r[col('id')] || '');
    const pub = String(cell_(r[col('게시일')])), dl = String(cell_(r[col('마감일')]));
    return id && !ids[id] && !(pub < old && !(dl >= day));
  }).map(function (r) { return head.map(function (h, i) { return String(cell_(r[i])); }); });
  const d = function (v) { return isDate_(String(v || '').slice(0, 10)) ? String(v).slice(0, 10) : ''; };
  const add = list.filter(function (n) { return n && n.id; }).map(function (n) {
    const o = {
      id: String(n.id), '매체': text_(n.media, 30), '제목': text_(n.title, 300),
      '요약': text_([n.headline || ''].concat(n.summary || []).filter(String).join('\n'), 2000),
      '영업포인트': text_(n.sales, 1000), '링크': text_(n.url, 500), '게시일': d(n.published),
      '중요도': text_(n.impact, 20), '유형': text_(n.type, 30), '상품': text_(n.product, 30),
      '신청시작': d(n.apply_start), '마감일': d(n.deadline), '행사시작': d(n.event_start), '행사종료': d(n.event_end),
      '기간': text_(n.period || n.digest, 200), '수집일': day,
    };
    return head.map(function (h) { return safe_(o[h]); });
  });
  const all = kept.concat(add);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(head.length, sh.getLastColumn())).clearContent();
  if (all.length) {
    sh.getRange(2, 1, all.length, head.length).setNumberFormat('@');
    sh.getRange(2, 1, all.length, head.length).setValues(all);
  }
  return { saved: add.length, total: all.length };
}

/** 보드에 보여줄 매체 공지 (설정의 매체만) */
function mediaNotices_() {
  const media = list_(settings_()['매체공지매체']);
  return rows_('매체공지').filter(function (n) { return !media.length || media.indexOf(String(n['매체'])) >= 0; });
}

/** '조치필요'이면서 최근 게시됐거나 신청 마감이 남은 공지만 확인 대상 */
function needsAck_(n, s) {
  const days0 = num_(s['매체공지확인일'] || 7);
  const popup = s['매체공지팝업매체'] === undefined ? ['네이버'] : list_(s['매체공지팝업매체']);
  if (popup.indexOf(String(n['매체'])) >= 0) {
    // 팝업 매체(기본: 네이버)는 유형과 관계없이 최근 게시분, 또는 신청 마감이 남은 조치필요·영업기회
    return n['게시일'] >= addDays_(today_(), -days0) ||
      (n['마감일'] >= today_() && (n['중요도'] === '조치필요' || n['중요도'] === '영업기회'));
  }
  if (n['중요도'] !== '조치필요') return false;
  if (list_(s['매체공지확인제외유형']).indexOf(String(n['유형'])) >= 0) return false;
  const days = num_(s['매체공지확인일'] || 14);
  return n['게시일'] >= addDays_(today_(), -days) || n['마감일'] >= today_();
}

/** 이 사람이 아직 확인하지 않은 공지(팀장·회사 공지 + 확인 대상 매체 공지) */
function unreadAll_(email) {
  const acks = rows_('공지확인');
  const read = function (id) { return acks.some(function (a) { return a['공지id'] === id && low_(a['이메일']) === email; }); };
  const s = settings_();
  const internal = rows_('공지').filter(function (n) { return !read(n.id); }).map(function (n) {
    return { id: n.id, type: n['구분'], title: n['제목'], important: n['중요'] === 'Y', at: n['작성일'] };
  });
  const media = mediaNotices_().filter(function (n) { return needsAck_(n, s) && !read('m:' + n.id); }).map(function (n) {
    return { id: 'm:' + n.id, type: '매체 공지', title: '[' + n['매체'] + '] ' + n['제목'], important: true, at: n['게시일'] };
  });
  return internal.concat(media);
}

function list_(v) { return String(v || '').split(/[,\n]/).map(function (x) { return x.trim(); }).filter(String); }

/** 매체 이름 맞추기: 띄어쓰기 무시, 11번가전시입찰은 11번가로 (월간보고 규칙) */
function mediaKey_(name) {
  const k = String(name || '').replace(/\s+/g, '');
  return k.indexOf('11번가') === 0 ? '11번가' : k;
}

function salesRules_() {
  const s = settings_();
  return {
    vat: list_(s['VAT포함매체']), exclude: list_(s['제외계정']), half: list_(s['절반반영계정']),
    supplement: list_(s['인트라넷보충매체']).map(mediaKey_),
  };
}

/** 제외 계정은 빼고, (MP AI만) VAT 포함 매체는 1.1로 나누고, 수익쉐어 계정은 50%만. 인트라넷은 보충 매체만 남김 */
function normalizeSales_(rows, rule, lead, source) {
  const intra = source === '인트라넷';
  return rows.filter(function (r) {
    if (rule.exclude.indexOf(String(r['광고주ID'])) >= 0) return false;
    return !intra || rule.supplement.indexOf(mediaKey_(r['매체'])) >= 0;
  }).map(function (r) {
    let amt = num_(r['매출']);
    const media = String(r['매체'] || '');
    if (!intra && rule.vat.some(function (v) { return media.indexOf(v) >= 0; })) amt = amt / 1.1;
    // 알리미가 MP AI 공유 비율을 이미 적용한 행은 절반 규칙을 다시 적용하지 않습니다(이중 반영 방지)
    if (!r['공유비율'] && rule.half.indexOf(String(r['광고주ID'])) >= 0) amt = amt * 0.5;
    const o = {};
    Object.keys(r).forEach(function (k) { o[k] = r[k]; });
    o['매출'] = Math.round(amt);
    o['매체'] = intra ? mediaKey_(media) : media;
    // MP AI는 담당자 이메일(비어 있으면 보낸 팀장 본인), 인트라넷은 담당자 이름으로 저장합니다
    o['담당자'] = intra ? String(r['담당자'] || '').trim() : (low_(r['담당자']) || lead.email);
    o['출처'] = source;
    delete o['공유비율'];
    return o;
  });
}

function replaceRows_(name, keyCol, keys, rows, source, dropIf) {
  forget_(name);
  const sh = sheet_(name);
  const head = SCHEMA[name];
  const vals = sh.getDataRange().getValues();
  const cur = vals[0] && vals[0][0] !== '' ? vals.slice(1) : [];
  const k = head.indexOf(keyCol), src = head.indexOf('출처');
  const set = {};
  keys.forEach(function (x) { set[String(x)] = true; });
  const kept = cur.filter(function (r) {
    const v = String(cell_(r[k])).slice(0, keyCol === '월' ? 7 : 10);
    const rs = String(r[src] || 'MP AI');
    return v && !(set[v] && rs === source) && !(dropIf && dropIf(v));
  }).map(function (r) { return head.map(function (h, i) { return i === k ? String(cell_(r[i])) : (r[i] === undefined ? '' : r[i]); }); });
  const add = rows.map(function (o) { return head.map(function (h) { return h === '매출' ? num_(o[h]) : String(o[h] === undefined ? '' : o[h]); }); });
  const all = kept.concat(add);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(head.length, sh.getLastColumn())).clearContent();
  if (all.length) {
    sh.getRange(2, 1, all.length, head.length).setNumberFormat('@');
    sh.getRange(2, head.indexOf('매출') + 1, all.length, 1).setNumberFormat('#,##0');
    sh.getRange(2, 1, all.length, head.length).setValues(all);
  }
  return { added: add.length, total: all.length };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ───────────────────────── 설치 ───────────────────────── */

/** 처음 한 번 실행: 시트를 만들고, 실행한 사람을 팀장으로 등록합니다. 여러 번 실행해도 안전합니다. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(SCHEMA).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const head = SCHEMA[name];
    const cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    head.forEach(function (h) {
      if (cur.indexOf(h) < 0) { cur.push(h); }
    });
    sh.getRange(1, 1, 1, cur.length).setValues([cur]).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (name.indexOf('실적') < 0) sh.getRange('A:Z').setNumberFormat('@');
  });
  const settings = rows_('설정').map(function (r) { return r['키']; });
  DEFAULT_SETTINGS.forEach(function (s) {
    if (settings.indexOf(s[0]) < 0) insert_('설정', { '키': s[0], '값': s[1], '설명': s[2] });
  });
  if (!settings_()['수집토큰']) update_('설정', '키', '수집토큰', { '값': Utilities.getUuid().replace(/-/g, '') });
  const email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (email && !rows_('팀원').some(function (r) { return low_(r['이메일']) === email; })) {
    insert_('팀원', { '이메일': email, '이름': email.split('@')[0], '역할': '팀장', '담당자명': '', '사용': 'Y' });
  }
  if (!rows_('가이드').length) seedGuides_();
  return '설치 완료';
}

/* ───────────────────────── 시트 도우미 ───────────────────────── */

function sheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh && SCHEMA[name]) {
    // 새 기능의 시트는 처음 쓸 때 자동으로 만듭니다(setup 을 다시 돌리지 않아도 되게)
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (name.indexOf('실적') < 0) sh.getRange('A:Z').setNumberFormat('@');
  }
  if (!sh) throw new Error("'" + name + "' 시트가 없습니다. 앱스 스크립트에서 setup 을 먼저 실행하세요.");
  return sh;
}

function cell_(v) {
  if (v instanceof Date) {
    const hasTime = v.getHours() || v.getMinutes();
    return Utilities.formatDate(v, TZ, hasTime ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
  }
  return v === null || v === undefined ? '' : v;
}

/**
 * 한 번의 요청 안에서 같은 시트를 여러 번 읽지 않도록 기억해 둡니다(요청이 끝나면 사라짐).
 * 쓰기(insert_/update_/remove_/전체 다시 쓰기)를 하면 그 시트의 기억을 지웁니다.
 */
var MEMO_ = {};
function forget_(name) { delete MEMO_[name]; }

function rows_(name) {
  if (!MEMO_[name]) MEMO_[name] = readRows_(name);
  return MEMO_[name].map(function (o) { const c = {}; for (const k in o) c[k] = o[k]; return c; });
}

function readRows_(name) {
  const vals = sheet_(name).getDataRange().getValues();
  const head = vals.shift() || [];
  return vals.filter(function (r) { return r.some(function (c) { return c !== ''; }); }).map(function (r) {
    const o = {};
    head.forEach(function (h, i) { if (h !== '') o[h] = cell_(r[i]); });
    return o;
  });
}

function safe_(v) {
  // 사용자가 쓴 글이 수식으로 실행되지 않게 막습니다
  if (typeof v === 'string' && /^[=+@]/.test(v)) return "'" + v;
  return v === undefined || v === null ? '' : v;
}

function insert_(name, obj) {
  forget_(name);
  const sh = sheet_(name);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(head.map(function (h) { return safe_(obj[h]); }));
}

function update_(name, key, id, patch) {
  forget_(name);
  const sh = sheet_(name);
  const vals = sh.getDataRange().getValues();
  const head = vals[0];
  const k = head.indexOf(key);
  for (let i = 1; i < vals.length; i++) {
    if (String(cell_(vals[i][k])) === String(id)) {
      Object.keys(patch).forEach(function (p) {
        const c = head.indexOf(p);
        if (c >= 0) sh.getRange(i + 1, c + 1).setValue(safe_(patch[p]));
      });
      return true;
    }
  }
  return false;
}

function remove_(name, pred) {
  forget_(name);
  const sh = sheet_(name);
  const vals = sh.getDataRange().getValues();
  const head = vals[0];
  let n = 0;
  for (let i = vals.length - 1; i >= 1; i--) {
    const o = {};
    head.forEach(function (h, j) { o[h] = cell_(vals[i][j]); });
    if (pred(o)) { sh.deleteRow(i + 1); n++; }
  }
  return n;
}

function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function settings_() {
  const o = {};
  rows_('설정').forEach(function (r) { o[r['키']] = String(r['값']); });
  return o;
}

function low_(s) { return String(s || '').trim().toLowerCase(); }
function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function num_(v) { const n = Number(String(v).replace(/[^\d.\-]/g, '')); return isFinite(n) ? n : 0; }
function text_(v, max) { return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 2000); }

/* ───────────────────────── 날짜 도우미 (문자열 yyyy-MM-dd 기준) ───────────────────────── */

function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function hour_() { return Number(Utilities.formatDate(new Date(), TZ, 'H')); }
function dt_(s) { const a = s.split('-').map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2])); }
function ds_(d) { return d.toISOString().slice(0, 10); }
function addDays_(s, n) { const d = dt_(s); d.setUTCDate(d.getUTCDate() + n); return ds_(d); }
function isWorkday_(s) { const w = dt_(s).getUTCDay(); return w > 0 && w < 6; }
function workdays_(from, to) {
  let n = 0;
  for (let s = from; s <= to; s = addDays_(s, 1)) if (isWorkday_(s)) n++;
  return n;
}
function isDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)); }
function monthOf_(s) { return String(s).slice(0, 7); }
function addMonths_(m, n) {
  const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)) - 1 + n;
  const d = new Date(Date.UTC(y, mo, 1));
  return d.toISOString().slice(0, 7);
}
function monthEnd_(m) { return addDays_(addMonths_(m, 1) + '-01', -1); }

/** 기간 종류와 기준일로 시작일·종료일을 정합니다 (주: 월~일, 월: 1일~말일, 분기: 분기 첫날~끝날) */
function periodRange_(period, base) {
  if (period === '주') {
    const w = dt_(base).getUTCDay();
    const start = addDays_(base, w === 0 ? -6 : 1 - w);
    return { start: start, end: addDays_(start, 6) };
  }
  if (period === '월') return { start: monthOf_(base) + '-01', end: monthEnd_(monthOf_(base)) };
  const y = base.slice(0, 4), q = Math.floor((Number(base.slice(5, 7)) - 1) / 3);
  const sm = y + '-' + ('0' + (q * 3 + 1)).slice(-2);
  return { start: sm + '-01', end: monthEnd_(addMonths_(sm, 2)) };
}

/* ───────────────────────── 사용자·권한 ───────────────────────── */

function members_() {
  return rows_('팀원').filter(function (r) { return r['사용'] !== 'N' && r['이메일']; }).map(function (r) {
    return {
      email: low_(r['이메일']), name: String(r['이름'] || r['이메일']),
      role: r['역할'] === '팀장' ? 'lead' : 'member', manager: String(r['담당자명'] || r['이름'] || ''),
      code: String(r['알림코드'] || ''),
    };
  });
}

function me_() {
  const email = low_(Session.getActiveUser().getEmail());
  if (!email) throw new Error('로그인 정보를 확인할 수 없습니다. 회사 구글 계정으로 로그인한 뒤 다시 열어주세요.');
  const m = members_().find(function (r) { return r.email === email; });
  if (!m) throw new Error(email + ' 계정은 원보드 팀원 명단에 없습니다. 팀장에게 등록을 요청하세요.');
  return m;
}

function isLead_(me) { return me.role === 'lead'; }
function needLead_(me) { if (!isLead_(me)) throw new Error('팀장만 할 수 있는 작업입니다.'); }
function nameOf_(email) {
  const m = members_().find(function (r) { return r.email === low_(email); });
  return m ? m.name : email;
}
/** 팀원은 항상 본인, 팀장은 지정한 사람(없으면 전원) */
function scopeEmails_(me, email) {
  if (!isLead_(me)) return [me.email];
  if (email) return [low_(email)];
  return members_().map(function (m) { return m.email; });
}

/* ───────────────────────── 요청 처리 ───────────────────────── */

const ACTIONS = {
  bootstrap: function (me) {
    const mem = members_();
    return {
      me: { email: me.email, name: me.name, role: me.role, manager: me.manager },
      members: mem.map(function (m) { return { email: m.email, name: m.name, role: m.role, manager: m.manager }; }),
      tabs: TABS.filter(function (t) { return !t.lead || isLead_(me); }),
      today: today_(),
      options: {
        noticeTypes: NOTICE_TYPES, goalPeriods: GOAL_PERIODS, goalCategories: GOAL_CATEGORIES,
        eventTypes: EVENT_TYPES, guideSections: GUIDE_SECTIONS,
        leadStates: LEAD_STATES, callResults: CALL_RESULTS, taskKinds: TASK_KINDS, taskRepeats: TASK_REPEATS, weekdays: WEEKDAYS,
      },
      badges: badges_(me),
    };
  },

  badges: function (me) { return badges_(me); },

  /* 공지사항 */
  noticeList: function (me) {
    const acks = rows_('공지확인');
    const mem = members_();
    return rows_('공지').sort(function (a, b) { return a['작성일'] < b['작성일'] ? 1 : -1; }).map(function (n) {
      const mine = acks.find(function (a) { return a['공지id'] === n.id && low_(a['이메일']) === me.email; });
      const o = {
        id: n.id, type: n['구분'], title: n['제목'], body: n['내용'], important: n['중요'] === 'Y',
        author: n['작성자'], at: n['작성일'], read: !!mine, readAt: mine ? mine['확인시각'] : '',
      };
      if (isLead_(me)) {
        o.readers = mem.map(function (m) {
          const a = acks.find(function (x) { return x['공지id'] === n.id && low_(x['이메일']) === m.email; });
          return { name: m.name, read: !!a, at: a ? a['확인시각'] : '' };
        });
      }
      return o;
    });
  },

  noticeSave: function (me, p) {
    needLead_(me);
    const rec = {
      '구분': NOTICE_TYPES.indexOf(p.type) >= 0 ? p.type : NOTICE_TYPES[0],
      '제목': text_(p.title, 200), '내용': text_(p.body, 5000), '중요': p.important ? 'Y' : '',
    };
    if (!rec['제목']) throw new Error('제목을 입력하세요.');
    return locked_(function () {
      if (p.id) {
        update_('공지', 'id', p.id, rec);
        if (p.resetRead) remove_('공지확인', function (a) { return a['공지id'] === p.id; });
        return p.id;
      }
      const id = uid_();
      rec.id = id; rec['작성자'] = me.name; rec['작성일'] = now_();
      insert_('공지', rec);
      insert_('공지확인', { '공지id': id, '이메일': me.email, '확인시각': now_() });
      return id;
    });
  },

  noticeDelete: function (me, p) {
    needLead_(me);
    return locked_(function () {
      remove_('공지', function (n) { return n.id === p.id; });
      remove_('공지확인', function (a) { return a['공지id'] === p.id; });
      return true;
    });
  },

  /** MP AI 매체 공지: 최근 60일 게시분 + 신청 마감이 남은 것 */
  mediaNoticeList: function (me) {
    const s = settings_(), acks = rows_('공지확인'), mem = members_();
    const from = addDays_(today_(), -60), day = today_();
    return mediaNotices_().filter(function (n) { return n['게시일'] >= from || n['마감일'] >= day; })
      .sort(function (a, b) { return a['게시일'] < b['게시일'] ? 1 : -1; }).map(function (n) {
        const id = 'm:' + n.id, need = needsAck_(n, s);
        const mine = acks.find(function (a) { return a['공지id'] === id && low_(a['이메일']) === me.email; });
        const o = {
          id: id, media: n['매체'], title: n['제목'], summary: n['요약'], sales: n['영업포인트'], url: n['링크'],
          published: n['게시일'], impact: n['중요도'], type: n['유형'], product: n['상품'], deadline: n['마감일'],
          period: n['기간'], needAck: need, read: !!mine, readAt: mine ? mine['확인시각'] : '',
        };
        if (need && isLead_(me)) {
          o.readers = mem.map(function (m) {
            const a = acks.find(function (x) { return x['공지id'] === id && low_(x['이메일']) === m.email; });
            return { name: m.name, read: !!a, at: a ? a['확인시각'] : '' };
          });
        }
        return o;
      });
  },

  noticeAck: function (me, p) {
    return locked_(function () {
      const ids = [].concat(p.ids || p.id || []);
      const acks = rows_('공지확인');
      ids.forEach(function (id) {
        if (!acks.some(function (a) { return a['공지id'] === id && low_(a['이메일']) === me.email; })) {
          insert_('공지확인', { '공지id': id, '이메일': me.email, '확인시각': now_() });
        }
      });
      return badges_(me);
    });
  },

  /* 액션플랜 */
  goalList: function (me, p) {
    const emails = scopeEmails_(me, p.email);
    const checks = rows_('일일체크');
    const day = today_();
    return rows_('목표').filter(function (g) { return emails.indexOf(low_(g['이메일'])) >= 0; })
      .map(function (g) { return goalView_(g, checks, day); })
      .sort(function (a, b) {
        const rank = { '대기': 0, '반려': 1, '승인': 2, '완료': 3 };
        return (rank[a.status] - rank[b.status]) || (a.end < b.end ? -1 : 1);
      });
  },

  goalSave: function (me, p) {
    const period = GOAL_PERIODS.indexOf(p.period) >= 0 ? p.period : '주';
    const base = isDate_(p.base) ? p.base : today_();
    const range = periodRange_(period, base);
    const target = num_(p.target);
    const rec = {
      '기간': period, '시작일': range.start, '종료일': range.end,
      '분류': GOAL_CATEGORIES.indexOf(p.category) >= 0 ? p.category : '기타',
      '제목': text_(p.title, 200), '목표수치': target, '단위': text_(p.unit, 20) || '건',
      '실행계획': text_(p.plan, 3000),
    };
    if (!rec['제목']) throw new Error('목표 이름을 입력하세요.');
    if (!(target > 0)) throw new Error('목표 수치는 0보다 커야 합니다.');
    if (!rec['실행계획']) throw new Error('달성하려면 무엇을 할지 실행 계획을 적어주세요.');
    return locked_(function () {
      if (p.id) {
        const g = rows_('목표').find(function (x) { return x.id === p.id; });
        if (!g) throw new Error('목표를 찾을 수 없습니다.');
        if (!isLead_(me) && low_(g['이메일']) !== me.email) throw new Error('본인 목표만 고칠 수 있습니다.');
        // 팀원이 고치면 다시 팀장 승인을 받아야 합니다
        if (!isLead_(me)) { rec['상태'] = '대기'; rec['검토의견'] = ''; rec['검토자'] = ''; rec['검토일'] = ''; }
        update_('목표', 'id', p.id, rec);
        return p.id;
      }
      const owner = isLead_(me) && p.email ? low_(p.email) : me.email;
      rec.id = uid_(); rec['이메일'] = owner; rec['작성일'] = now_();
      // 팀장이 직접 만든 목표는 바로 승인 상태로 시작합니다
      rec['상태'] = isLead_(me) ? '승인' : '대기';
      if (isLead_(me)) { rec['검토자'] = me.name; rec['검토일'] = now_(); }
      insert_('목표', rec);
      return rec.id;
    });
  },

  goalReview: function (me, p) {
    needLead_(me);
    const decision = ['승인', '반려', '완료', '대기'].indexOf(p.decision) >= 0 ? p.decision : null;
    if (!decision) throw new Error('승인 또는 반려를 선택하세요.');
    if (decision === '반려' && !text_(p.comment)) throw new Error('반려 사유를 적어주세요.');
    return locked_(function () {
      update_('목표', 'id', p.id, { '상태': decision, '검토의견': text_(p.comment, 1000), '검토자': me.name, '검토일': now_() });
      return true;
    });
  },

  goalDelete: function (me, p) {
    return locked_(function () {
      const g = rows_('목표').find(function (x) { return x.id === p.id; });
      if (!g) return true;
      const own = low_(g['이메일']) === me.email;
      if (!isLead_(me) && !(own && g['상태'] !== '승인')) throw new Error('승인된 목표는 팀장만 지울 수 있습니다.');
      remove_('목표', function (x) { return x.id === p.id; });
      remove_('일일체크', function (c) { return c['목표id'] === p.id; });
      return true;
    });
  },

  checkSave: function (me, p) {
    const date = isDate_(p.date) ? p.date : today_();
    if (date > today_()) throw new Error('미래 날짜는 체크할 수 없습니다.');
    const result = p.result === '실패' ? '실패' : '달성';
    const reason = text_(p.reason, 1000);
    if (result === '실패' && !reason) throw new Error('실패 사유를 적어주세요. 팀장과 소통할 때 쓰입니다.');
    return locked_(function () {
      const g = rows_('목표').find(function (x) { return x.id === p.goalId; });
      if (!g) throw new Error('목표를 찾을 수 없습니다.');
      if (low_(g['이메일']) !== me.email) throw new Error('본인 목표만 체크할 수 있습니다.');
      if (g['상태'] !== '승인') throw new Error('팀장 승인 후에 체크할 수 있습니다.');
      if (date < g['시작일'] || date > g['종료일']) throw new Error('목표 기간 밖의 날짜입니다.');
      const rec = {
        '결과': result, '실적': num_(p.amount), '메모': text_(p.memo, 1000), '실패사유': result === '실패' ? reason : '',
        '기록시각': now_(),
      };
      const prev = rows_('일일체크').find(function (c) { return c['목표id'] === g.id && c['날짜'] === date; });
      if (prev) {
        // 실패 → 달성으로 바뀌면 소통 기록도 지웁니다
        if (result === '달성') { rec['소통완료'] = ''; rec['소통메모'] = ''; rec['소통시각'] = ''; }
        update_('일일체크', 'id', prev.id, rec);
        return prev.id;
      }
      rec.id = uid_(); rec['목표id'] = g.id; rec['이메일'] = me.email; rec['날짜'] = date;
      insert_('일일체크', rec);
      return rec.id;
    });
  },

  checkUndo: function (me, p) {
    return locked_(function () {
      remove_('일일체크', function (c) {
        return c.id === p.id && low_(c['이메일']) === me.email && c['소통완료'] !== 'Y';
      });
      return true;
    });
  },

  /** 팀장: 실패 사유를 듣고 소통을 마쳤다고 체크 */
  checkTalked: function (me, p) {
    needLead_(me);
    return locked_(function () {
      update_('일일체크', 'id', p.id, p.done === false
        ? { '소통완료': '', '소통메모': '', '소통시각': '' }
        : { '소통완료': 'Y', '소통메모': text_(p.memo, 1000), '소통시각': now_() });
      return true;
    });
  },

  failureList: function (me, p) {
    const emails = scopeEmails_(me, p.email);
    const goals = rows_('목표');
    return rows_('일일체크').filter(function (c) {
      return c['결과'] === '실패' && emails.indexOf(low_(c['이메일'])) >= 0 && (p.all || c['소통완료'] !== 'Y');
    }).map(function (c) {
      const g = goals.find(function (x) { return x.id === c['목표id']; }) || {};
      return checkView_(c, g);
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  },

  /* 캘린더 */
  calendar: function (me, p) {
    const month = /^\d{4}-\d{2}$/.test(p.month || '') ? p.month : monthOf_(today_());
    const from = month + '-01', to = monthEnd_(month);
    const emails = scopeEmails_(me, p.email);
    const events = rows_('일정').filter(function (e) {
      if (e['종료일'] < from || e['시작일'] > to) return false;
      if (e['유형'] !== '개인') return true;
      return isLead_(me) ? (!p.email || low_(e['대상']) === low_(p.email)) : low_(e['대상']) === me.email;
    }).map(function (e) {
      return {
        id: e.id, type: e['유형'], title: e['제목'], start: e['시작일'], end: e['종료일'] || e['시작일'],
        time: e['시간'], who: e['대상'] ? nameOf_(e['대상']) : '', author: e['작성자'], memo: e['메모'],
        mine: e['작성자'] === me.name || low_(e['대상']) === me.email, intra: e['작성자'] === '인트라넷',
      };
    });
    const goals = rows_('목표');
    const checks = rows_('일일체크').filter(function (c) {
      return c['날짜'] >= from && c['날짜'] <= to && emails.indexOf(low_(c['이메일'])) >= 0;
    }).map(function (c) { return checkView_(c, goals.find(function (g) { return g.id === c['목표id']; }) || {}); });
    const deadlines = goals.filter(function (g) {
      return g['상태'] === '승인' && g['종료일'] >= from && g['종료일'] <= to && emails.indexOf(low_(g['이메일'])) >= 0;
    }).map(function (g) { return { date: g['종료일'], title: g['제목'], period: g['기간'], who: nameOf_(g['이메일']) }; });
    // 이미 지난 신청 마감은 보여주지 않습니다(오늘 이후만)
    const mediaDeadlines = mediaNotices_().filter(function (n) {
      return n['마감일'] >= from && n['마감일'] <= to && n['마감일'] >= today_() && (n['중요도'] === '조치필요' || n['중요도'] === '영업기회');
    }).map(function (n) { return { date: n['마감일'], media: n['매체'], title: n['제목'], impact: n['중요도'], url: n['링크'] }; });
    const calls = rows_('가망건').filter(function (r) {
      const d = String(r['다음연락'] || '').slice(0, 10);
      return d >= from && d <= to && LEAD_OPEN.indexOf(r['상태']) >= 0 && emails.indexOf(low_(r['이메일'])) >= 0;
    }).map(function (r) { return { id: r.id, date: String(r['다음연락']).slice(0, 10), time: String(r['다음연락']).slice(11, 16), company: r['업체명'], who: nameOf_(r['이메일']) }; });
    return { month: month, events: events, checks: checks, deadlines: deadlines, mediaDeadlines: mediaDeadlines, calls: calls };
  },

  eventSave: function (me, p) {
    const rec = {
      '유형': EVENT_TYPES.indexOf(p.type) >= 0 ? p.type : '팀', '제목': text_(p.title, 200),
      '시작일': isDate_(p.start) ? p.start : today_(), '시간': text_(p.time, 40), '메모': text_(p.memo, 2000),
    };
    rec['종료일'] = isDate_(p.end) && p.end >= rec['시작일'] ? p.end : rec['시작일'];
    if (!rec['제목']) throw new Error('일정 제목을 입력하세요.');
    rec['대상'] = rec['유형'] === '개인' ? (isLead_(me) && p.who ? low_(p.who) : me.email) : '';
    return locked_(function () {
      if (p.id) {
        const e = rows_('일정').find(function (x) { return x.id === p.id; });
        if (!e) throw new Error('일정을 찾을 수 없습니다.');
        if (!isLead_(me) && e['작성자'] !== me.name) throw new Error('본인이 만든 일정만 고칠 수 있습니다.');
        update_('일정', 'id', p.id, rec);
        return p.id;
      }
      rec.id = uid_(); rec['작성자'] = me.name;
      insert_('일정', rec);
      return rec.id;
    });
  },

  eventDelete: function (me, p) {
    return locked_(function () {
      remove_('일정', function (e) { return e.id === p.id && e['작성자'] !== '인트라넷' && (isLead_(me) || e['작성자'] === me.name); });
      return true;
    });
  },

  /* 솔루션 (구글 드라이브 폴더) */
  solutions: function (me) {
    const id = settings_()['솔루션폴더ID'];
    if (!id) return { configured: false };
    const folder = DriveApp.getFolderById(id.replace(/.*folders\//, '').replace(/[?#].*$/, ''));
    const groups = {};
    function add(key, f) {
      (groups[key] = groups[key] || []).push({
        id: f.getId(), name: f.getName(), updated: Utilities.formatDate(f.getLastUpdated(), TZ, 'yyyy-MM-dd HH:mm'),
        size: f.getSize(), url: f.getUrl(), desc: f.getDescription() || '',
        download: 'https://drive.google.com/uc?export=download&id=' + f.getId(),
      });
    }
    const files = folder.getFiles();
    while (files.hasNext()) { const f = files.next(); add(baseName_(f.getName()), f); }
    const subs = folder.getFolders();
    while (subs.hasNext()) {
      const sub = subs.next();
      const fs = sub.getFiles();
      while (fs.hasNext()) add(sub.getName(), fs.next());
    }
    const list = Object.keys(groups).map(function (k) {
      const v = groups[k].sort(function (a, b) { return a.updated < b.updated ? 1 : -1; });
      return { name: k, latest: v[0], older: v.slice(1) };
    }).sort(function (a, b) { return a.latest.updated < b.latest.updated ? 1 : -1; });
    return { configured: true, folderUrl: folder.getUrl(), list: list };
  },

  /* 매체별 가이드 */
  guideList: function () {
    return rows_('가이드').map(function (g) {
      return {
        id: g.id, media: g['매체'], section: g['구분'], title: g['제목'], body: g['내용'], link: g['링크'],
        order: num_(g['순서']), updated: g['수정일'],
      };
    }).sort(function (a, b) { return a.order - b.order; });
  },

  guideSave: function (me, p) {
    needLead_(me);
    const rec = {
      '매체': text_(p.media, 60), '구분': GUIDE_SECTIONS.indexOf(p.section) >= 0 ? p.section : GUIDE_SECTIONS[0],
      '제목': text_(p.title, 200), '내용': text_(p.body, 8000), '링크': text_(p.link, 500),
      '순서': num_(p.order) || 100, '수정일': today_(),
    };
    if (!rec['매체'] || !rec['제목']) throw new Error('매체와 제목을 입력하세요.');
    return locked_(function () {
      if (p.id) { update_('가이드', 'id', p.id, rec); return p.id; }
      rec.id = uid_(); insert_('가이드', rec); return rec.id;
    });
  },

  guideDelete: function (me, p) {
    needLead_(me);
    return locked_(function () { remove_('가이드', function (g) { return g.id === p.id; }); return true; });
  },

  /* 계정별 실적 */
  perf: function (me, p) { return perf_(me, p); },

  /* 팀 현황 (팀장) */
  teamStats: function (me, p) {
    needLead_(me);
    const month = /^\d{4}-\d{2}$/.test(p.month || '') ? p.month : monthOf_(today_());
    const goals = rows_('목표');
    const checks = rows_('일일체크');
    return {
      month: month,
      members: members_().map(function (m) {
        const mc = checks.filter(function (c) { return low_(c['이메일']) === m.email && monthOf_(c['날짜']) === month; });
        const ok = mc.filter(function (c) { return c['결과'] === '달성'; }).length;
        const fail = mc.length - ok;
        const mg = goals.filter(function (g) { return low_(g['이메일']) === m.email; });
        const unread = unreadAll_(m.email).length;
        return {
          email: m.email, name: m.name, role: m.role, ok: ok, fail: fail,
          rate: mc.length ? Math.round(ok / mc.length * 1000) / 10 : null,
          talkPending: mc.filter(function (c) { return c['결과'] === '실패' && c['소통완료'] !== 'Y'; }).length,
          pending: mg.filter(function (g) { return g['상태'] === '대기'; }).length,
          active: mg.filter(function (g) { return g['상태'] === '승인' && g['종료일'] >= today_(); }).length,
          unread: unread,
          lastCheck: mc.map(function (c) { return c['날짜']; }).sort().pop() || '',
          hasAlert: !!m.code,
        };
      }),
    };
  },

  /** 월별 평가자료 (엑셀로 내려받기 위한 데이터). 팀원은 본인 것만 */
  evaluation: function (me, p) {
    const email = isLead_(me) && p.email ? low_(p.email) : me.email;
    const month = /^\d{4}-\d{2}$/.test(p.month || '') ? p.month : monthOf_(today_());
    const from = month + '-01', to = monthEnd_(month);
    const member = members_().find(function (m) { return m.email === email; });
    if (!member) throw new Error('팀원을 찾을 수 없습니다.');
    const checks = rows_('일일체크');
    const goals = rows_('목표').filter(function (g) {
      return low_(g['이메일']) === email && g['상태'] !== '반려' && g['종료일'] >= from && g['시작일'] <= to;
    });
    const asOf = to < today_() ? to : today_();
    const goalRows = goals.map(function (g) { return goalView_(g, checks, asOf); });
    const monthChecks = checks.filter(function (c) {
      return low_(c['이메일']) === email && c['날짜'] >= from && c['날짜'] <= to;
    }).map(function (c) { return checkView_(c, goals.find(function (g) { return g.id === c['목표id']; }) || {}); })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    const sales = monthSales_(ids_(member), month);
    const leads = rows_('가망건').filter(function (r) { return low_(r['이메일']) === email; });
    const calls = rows_('통화기록').filter(function (c) {
      const d = String(c['시각']).slice(0, 10); return low_(c['이메일']) === email && d >= from && d <= to;
    }).map(function (c) {
      const l = leads.find(function (r) { return r.id === c['가망건id']; }) || {};
      return { at: c['시각'], company: l['업체명'] || '', result: c['결과'], memo: c['메모'], next: c['다음연락'] };
    }).sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    return {
      member: { name: member.name, email: member.email, manager: member.manager },
      month: month, generatedAt: now_(), goals: goalRows, checks: monthChecks, sales: sales,
      salesNote: salesSummary_(email, from, asOf), calls: calls,
      tasks: taskRate_(rows_('할일'), rows_('할일완료'), email, from, asOf),
      usage: usageSummary_(usageRows_(from, asOf)[email]), noticeDelay: noticeDelay_(email, member.name, month),
      workdays: workdays_(from, asOf),
    };
  },

  /** 알리미(크롬 확장) 연결 코드 발급 */
  alertCode: function (me, p) {
    return locked_(function () {
      let code = me.code;
      if (!code || p.renew) {
        code = Utilities.getUuid().replace(/-/g, '');
        update_('팀원', '이메일', me.email, { '알림코드': code });
      }
      const s = settings_();
      const url = s['알림주소'] || s['보드주소'] || ScriptApp.getService().getUrl();
      return { code: code, url: url, connect: url + '#' + code };
    });
  },
};

/* ───────────────────────── 계산 도우미 ───────────────────────── */

function badges_(me) {
  const b = todayBundle_(me);
  const out = {
    unread: unreadAll_(me.email).length,
    todo: b.goals.filter(function (t) { return !t.checked; }).length + b.tasks.length,
    calls: b.calls.length,
  };
  if (isLead_(me)) {
    out.pending = rows_('목표').filter(function (g) { return g['상태'] === '대기'; }).length;
    out.talk = rows_('일일체크').filter(function (c) { return c['결과'] === '실패' && c['소통완료'] !== 'Y'; }).length;
  }
  return out;
}

/** 오늘 체크해야 할 승인 목표 */
function todo_(me) {
  const day = today_();
  const checks = rows_('일일체크');
  return rows_('목표').filter(function (g) {
    return low_(g['이메일']) === me.email && g['상태'] === '승인' && g['시작일'] <= day && g['종료일'] >= day;
  }).map(function (g) {
    const v = goalView_(g, checks, day);
    return { id: v.id, title: v.title, period: v.period, daily: v.daily, unit: v.unit, checked: !!v.todayCheck };
  });
}

function goalView_(g, checks, day) {
  const mine = checks.filter(function (c) { return c['목표id'] === g.id; });
  const target = num_(g['목표수치']);
  const done = mine.reduce(function (s, c) { return s + num_(c['실적']); }, 0);
  const total = workdays_(g['시작일'], g['종료일']) || 1;
  const until = day < g['시작일'] ? null : (day > g['종료일'] ? g['종료일'] : day);
  const elapsed = until ? workdays_(g['시작일'], until) : 0;
  const expected = target * elapsed / total;
  const ok = mine.filter(function (c) { return c['결과'] === '달성'; }).length;
  const fail = mine.filter(function (c) { return c['결과'] === '실패'; }).length;
  const today = mine.find(function (c) { return c['날짜'] === day; });
  return {
    id: g.id, email: low_(g['이메일']), who: nameOf_(g['이메일']), period: g['기간'], start: g['시작일'], end: g['종료일'],
    category: g['분류'], title: g['제목'], target: target, unit: g['단위'], plan: g['실행계획'], status: g['상태'],
    comment: g['검토의견'], reviewer: g['검토자'], reviewedAt: g['검토일'], createdAt: g['작성일'],
    achieved: done, rate: target ? Math.round(done / target * 1000) / 10 : 0,
    daily: roundAmt_(target / total, target), workdays: total, elapsed: elapsed,
    expected: roundAmt_(expected, target), pace: until ? Math.round((done - expected) * 10) / 10 : 0,
    ok: ok, fail: fail, talkPending: mine.filter(function (c) { return c['결과'] === '실패' && c['소통완료'] !== 'Y'; }).length,
    todayCheck: today ? checkView_(today, g) : null,
    active: g['상태'] === '승인' && g['시작일'] <= day && g['종료일'] >= day,
  };
}

function checkView_(c, g) {
  return {
    id: c.id, goalId: c['목표id'], goalTitle: g['제목'] || '(삭제된 목표)', unit: g['단위'] || '',
    email: low_(c['이메일']), who: nameOf_(c['이메일']), date: c['날짜'], result: c['결과'], amount: num_(c['실적']),
    memo: c['메모'], reason: c['실패사유'], talked: c['소통완료'] === 'Y', talkMemo: c['소통메모'], talkedAt: c['소통시각'],
    at: c['기록시각'],
  };
}

function roundAmt_(x, target) {
  if (!(x > 0)) return 0;
  if (target >= 10000) return Math.ceil(x / 1000) * 1000;
  if (Number.isInteger(Number(target))) return Math.ceil(x * 10) / 10;
  return Math.round(x * 100) / 100;
}

function baseName_(name) {
  return String(name).replace(/\.[^.]+$/, '')
    .replace(/[\s_\-()]*(\d{6,8}|\d{4}-\d{2}-\d{2})\)?$/, '')
    .replace(/[\s_\-(]*(v|ver\.?|버전)?\s*\d+(\.\d+)*\)?$/i, '')
    .trim() || name;
}

/* ───────────────────────── 실적 · AHI ───────────────────────── */

/**
 * 담당자 기준으로 실적을 읽습니다. 인트라넷 행은 '인트라넷보충매체'에 있는 매체만 쓰고,
 * 같은 기간·같은 매체를 MP AI가 이미 주고 있으면 빼서(MP AI 우선) 두 번 세지 않습니다.
 */
function salesRows_(managers) {
  const set = {};
  managers.forEach(function (m) { if (m) set[low_(m)] = true; });
  const pick = function (r) { return set[low_(r['담당자'])]; };
  const supplement = salesRules_().supplement;
  const migrated = {};
  function clean(all, keyCol, len) {
    const mpai = {};
    all.forEach(function (r) {
      if (String(r['출처']) === '인트라넷') return;
      const mk = mediaKey_(r['매체']);
      mpai[String(r[keyCol]).slice(0, len) + '|' + mk] = true;
      if (supplement.indexOf(mk) >= 0 && num_(r['매출']) > 0) migrated[mk] = true;
    });
    return all.filter(function (r) {
      if (String(r['출처']) !== '인트라넷') return true;
      const mk = mediaKey_(r['매체']);
      return supplement.indexOf(mk) >= 0 && !mpai[String(r[keyCol]).slice(0, len) + '|' + mk];
    });
  }
  const conv = function (r, keyCol, len, outKey) {
    const o = { media: String(r['매체']), id: String(r['광고주ID']), name: String(r['광고주명']),
      mgr: String(r['담당자']), amt: num_(r['매출']), src: String(r['출처'] || 'MP AI') };
    o[outKey] = String(r[keyCol]).slice(0, len);
    return o;
  };
  return {
    daily: clean(rows_('실적_일별'), '날짜', 10).filter(pick).map(function (r) { return conv(r, '날짜', 10, 'date'); }),
    monthly: clean(rows_('실적_월별'), '월', 7).filter(pick).map(function (r) { return conv(r, '월', 7, 'month'); }),
    migrated: Object.keys(migrated),
  };
}

/** 실적의 '담당자'는 MP AI 담당자 이메일(또는 예전 방식의 이름)이라 둘 다로 찾습니다 */
function ids_(m) { return [m.email, m.manager].filter(String); }
function managersFor_(me, p) {
  if (!isLead_(me)) return ids_(me);
  if (p.email) {
    const m = members_().find(function (x) { return x.email === low_(p.email); });
    return m ? ids_(m) : [];
  }
  return [].concat.apply([], members_().map(ids_));
}

/** 광고주(매체+ID) × 월 매출. 월별 시트를 우선 쓰고, 없는 달은 일별 시트로 채웁니다 */
function monthMatrix_(data) {
  const byMonth = {};
  data.monthly.forEach(function (r) {
    const k = r.media + '|' + r.id;
    (byMonth[r.month] = byMonth[r.month] || {})[k] = ((byMonth[r.month] || {})[k] || 0) + r.amt;
  });
  const fromDaily = {};
  data.daily.forEach(function (r) {
    const m = monthOf_(r.date);
    if (byMonth[m]) return;
    const k = r.media + '|' + r.id;
    (fromDaily[m] = fromDaily[m] || {})[k] = ((fromDaily[m] || {})[k] || 0) + r.amt;
  });
  Object.keys(fromDaily).forEach(function (m) { byMonth[m] = fromDaily[m]; });
  return byMonth;
}

function monthSales_(ids, month) {
  const data = salesRows_(ids);
  const mat = monthMatrix_(data);
  const cur = mat[month] || {};
  const prev = mat[addMonths_(month, -1)] || {};
  const names = {};
  data.monthly.concat(data.daily).forEach(function (r) { names[r.media + '|' + r.id] = r.name; });
  const media = {};
  Object.keys(cur).concat(Object.keys(prev)).forEach(function (k) {
    const md = k.split('|')[0];
    media[md] = media[md] || { media: md, cur: 0, prev: 0 };
  });
  Object.keys(cur).forEach(function (k) { media[k.split('|')[0]].cur += cur[k]; });
  Object.keys(prev).forEach(function (k) { media[k.split('|')[0]].prev += prev[k]; });
  const keys = {};
  Object.keys(cur).concat(Object.keys(prev)).forEach(function (k) { keys[k] = true; });
  const accounts = Object.keys(keys).map(function (k) {
    return { media: k.split('|')[0], id: k.split('|')[1], name: names[k] || '', cur: cur[k] || 0, prev: prev[k] || 0 };
  }).sort(function (a, b) { return b.cur - a.cur; });
  const sum = function (o) { return Object.keys(o).reduce(function (s, k) { return s + o[k]; }, 0); };
  return {
    hasData: Object.keys(mat).length > 0, total: sum(cur), prevTotal: sum(prev),
    media: Object.keys(media).map(function (k) { return media[k]; }).sort(function (a, b) { return b.cur - a.cur; }),
    accounts: accounts,
  };
}

function perf_(me, p) {
  const managers = managersFor_(me, p);
  const data = salesRows_(managers);
  const s = settings_();
  if (!data.daily.length && !data.monthly.length) {
    return { empty: true, managers: managers };
  }
  const names = {};
  data.monthly.concat(data.daily).forEach(function (r) { names[r.media + '|' + r.id] = r.name; });

  const out = { empty: false, managers: managers, migrated: data.migrated, supplement: list_(s['인트라넷보충매체']) };
  if (data.daily.length) {
    const latest = data.daily.reduce(function (m, r) { return r.date > m ? r.date : m; }, '');
    const cm = monthOf_(latest), day = latest.slice(8, 10);
    const pm = addMonths_(cm, -1);
    const pmTo = pm + '-' + day <= monthEnd_(pm) ? pm + '-' + day : monthEnd_(pm);
    const hasPrevDaily = data.daily.some(function (r) { return monthOf_(r.date) === pm; });
    const d7 = addDays_(latest, -7);
    const media = {}, acc = {};
    const trend = {};
    data.daily.forEach(function (r) {
      const k = r.media + '|' + r.id;
      const a = acc[k] = acc[k] || { media: r.media, id: r.id, name: r.name, mtd: 0, prevMtd: 0, last: 0, avg7: 0 };
      const md = media[r.media] = media[r.media] || { media: r.media, mtd: 0, prevMtd: 0, last: 0, avg7: 0 };
      if (monthOf_(r.date) === cm && r.date <= latest) { a.mtd += r.amt; md.mtd += r.amt; }
      if (r.date >= pm + '-01' && r.date <= pmTo) { a.prevMtd += r.amt; md.prevMtd += r.amt; }
      if (r.date === latest) { a.last += r.amt; md.last += r.amt; }
      if (r.date >= d7 && r.date < latest) { a.avg7 += r.amt / 7; md.avg7 += r.amt / 7; }
      if (r.date > addDays_(latest, -30)) trend[r.date] = (trend[r.date] || 0) + r.amt;
    });
    const drop = num_(s['경고_계정하락'] || 30) / 100;
    const accounts = Object.keys(acc).map(function (k) {
      const a = acc[k];
      a.status = '';
      if (a.avg7 >= 10000 && a.last === 0) a.status = '소진중단';
      else if (a.avg7 >= 10000 && a.last < a.avg7 * (1 - drop)) a.status = '하락';
      return a;
    });
    const sum = function (arr, f) { return arr.reduce(function (t, x) { return t + x[f]; }, 0); };
    const mediaList = Object.keys(media).map(function (k) { return media[k]; }).sort(function (a, b) { return b.mtd - a.mtd; });
    const trendList = [];
    for (let d = addDays_(latest, -29); d <= latest; d = addDays_(d, 1)) trendList.push({ date: d, amt: trend[d] || 0 });
    out.daily = {
      latest: latest, month: cm, prevMonth: pm, prevTo: pmTo, hasPrev: hasPrevDaily,
      mtd: sum(mediaList, 'mtd'), prevMtd: sum(mediaList, 'prevMtd'), last: sum(mediaList, 'last'), avg7: sum(mediaList, 'avg7'),
      media: mediaList,
      accounts: accounts.sort(function (a, b) { return (b.mtd - b.prevMtd) - (a.mtd - a.prevMtd); }),
      alerts: accounts.filter(function (a) { return a.status; }).sort(function (a, b) { return b.avg7 - a.avg7; }),
      trend: trendList,
    };
  }
  out.ahi = ahi_(monthMatrix_(data), names, data.daily, s);
  return out;
}

/**
 * AHI 원재료 지표. 점수 구간표 없이 "전월보다 얼마나 나빠졌나"로만 경고합니다.
 * 기준 달(M) = 마지막으로 끝난 달, 비교 달(P) = 그 전 달.
 */
function ahi_(mat, names, daily, s) {
  const months = Object.keys(mat).sort();
  if (!months.length) return null;
  let last = months[months.length - 1];
  const latestDay = daily.reduce(function (m, r) { return r.date > m ? r.date : m; }, '');
  if (latestDay && monthOf_(latestDay) === last && latestDay < monthEnd_(last)) last = addMonths_(last, -1);
  const M = last, P = addMonths_(M, -1);
  const firstMonth = {};
  months.forEach(function (m) {
    Object.keys(mat[m]).forEach(function (k) { if (mat[m][k] > 0 && !firstMonth[k]) firstMonth[k] = m; });
  });
  const dataStart = months[0];
  const active = function (m) {
    const o = mat[m] || {};
    return Object.keys(o).filter(function (k) { return o[k] > 0; });
  };
  const rev = function (m, k) { return (mat[m] || {})[k] || 0; };

  function calc(m) {
    const m3 = addMonths_(m, -3), m1 = addMonths_(m, -1);
    const enough3 = dataStart <= m3, enough6 = dataStart <= addMonths_(m, -6);
    const aNow = active(m), a3 = active(m3), a1 = active(m1);
    const inNow = {}; aNow.forEach(function (k) { inNow[k] = true; });
    const kept = a3.filter(function (k) { return inNow[k]; });
    const total = aNow.reduce(function (t, k) { return t + rev(m, k); }, 0);
    // 신규 정착률: 최근(3~5개월 전) 처음 집행한 광고주 중 3개월 뒤에도 살아있는 비율
    const cohort = Object.keys(firstMonth).filter(function (k) {
      return firstMonth[k] >= addMonths_(m, -5) && firstMonth[k] <= m3 && firstMonth[k] > dataStart;
    });
    const settled = cohort.filter(function (k) { return rev(addMonths_(firstMonth[k], 3), k) > 0; });
    const newRev = aNow.filter(function (k) { return firstMonth[k] >= addMonths_(m, -5) && firstMonth[k] > dataStart; })
      .reduce(function (t, k) { return t + rev(m, k); }, 0);
    const hhi = aNow.reduce(function (t, k) { const sh = rev(m, k) / (total || 1); return t + sh * sh; }, 0);
    const tenure = aNow.reduce(function (t, k) {
      const age = monthsBetween_(firstMonth[k], m) + 1;
      return t + rev(m, k) * Math.min(12, age);
    }, 0) / (total || 1);
    return {
      retention: enough3 && a3.length ? kept.length / a3.length * 100 : null,
      growth: enough3 && kept.length ? (kept.reduce(function (t, k) { return t + rev(m, k); }, 0) /
        (kept.reduce(function (t, k) { return t + rev(m3, k); }, 0) || 1) - 1) * 100 : null,
      dormancy: a1.length && dataStart <= m1 ? a1.filter(function (k) { return !inNow[k]; }).length / a1.length * 100 : null,
      settle: cohort.length >= 3 ? settled.length / cohort.length * 100 : null,
      settleN: cohort.length,
      newShare: enough6 && total ? newRev / total * 100 : null,
      effective: total ? 1 / hhi : null,
      tenure: total && enough6 ? tenure : null,
      active: aNow.length, total: total,
    };
  }

  const cur = calc(M), prev = calc(P);
  const t = {
    rate: num_(s['경고_비율하락'] || 5), growth: num_(s['경고_성장률하락'] || 5),
    dorm: num_(s['경고_휴면상승'] || 3), eff: num_(s['경고_유효광고주감소'] || 10),
  };
  const defs = [
    { key: 'settle', axis: '신규', weight: 30, label: '신규 정착률', unit: '%', good: 'up', th: t.rate,
      hint: '최근 새로 시작한 광고주가 3개월 뒤에도 집행 중인 비율' },
    { key: 'newShare', axis: '신규', weight: 30, label: '신규 매출 비중', unit: '%', good: 'up', th: t.rate,
      hint: '이번 달 매출 중 최근 6개월 안에 시작한 광고주 몫' },
    { key: 'retention', axis: '유지', weight: 25, label: '3개월 유지율', unit: '%', good: 'up', th: t.rate,
      hint: '3개월 전 집행 광고주 중 지금도 집행 중인 비율' },
    { key: 'growth', axis: '성장', weight: 25, label: '동일 광고주 성장률', unit: '%', good: 'up', th: t.growth,
      hint: '계속 담당한 광고주의 매출이 3개월 전보다 늘었나' },
    { key: 'dormancy', axis: '리스크', weight: 15, label: '휴면 전환율', unit: '%', good: 'down', th: t.dorm,
      hint: '지난달 집행 광고주 중 이번 달 집행이 멈춘 비율' },
    { key: 'effective', axis: '리스크', weight: 15, label: '유효 광고주 수', unit: '곳', good: 'up', th: t.eff, relative: true,
      hint: '매출이 실제로 몇 곳에 나뉘어 있나(쏠림이 클수록 작아짐)' },
    { key: 'tenure', axis: '지속', weight: 5, label: '평균 거래 기간', unit: '개월', good: 'up', th: null,
      hint: '매출 가중 평균 거래 기간(최대 12개월)' },
  ];
  const metrics = defs.map(function (d) {
    const c = cur[d.key], pv = prev[d.key];
    let delta = null, warn = false;
    if (c !== null && pv !== null) {
      delta = d.relative ? (pv ? (c / pv - 1) * 100 : 0) : c - pv;
      const worse = d.good === 'up' ? -delta : delta;
      warn = d.th !== null && worse >= d.th;
    }
    return {
      key: d.key, axis: d.axis, weight: d.weight, label: d.label, unit: d.unit, good: d.good, hint: d.hint,
      cur: c === null ? null : Math.round(c * 10) / 10, prev: pv === null ? null : Math.round(pv * 10) / 10,
      delta: delta === null ? null : Math.round(delta * 10) / 10, deltaUnit: d.relative ? '%' : (d.unit === '%' ? '%p' : d.unit),
      warn: warn, note: d.key === 'settle' && c === null ? '판정할 신규가 3곳 미만이거나 이력이 부족합니다' : '',
    };
  });
  // 경고는 비중이 큰 축부터 보여줍니다
  metrics.sort(function (a, b) { return (b.warn - a.warn) || (b.weight - a.weight); });
  return {
    month: M, prevMonth: P, dataStart: dataStart, metrics: metrics, active: cur.active, total: cur.total,
    lost: active(P).filter(function (k) { return !(mat[M] || {})[k]; }).map(function (k) {
      return { media: k.split('|')[0], id: k.split('|')[1], name: names[k] || '', prev: rev(P, k) };
    }).sort(function (a, b) { return b.prev - a.prev; }).slice(0, 10),
  };
}

function monthsBetween_(a, b) {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}

/* ───────────────────────── 알리미(크롬 확장)용 ───────────────────────── */

function alerts_(code) {
  if (!code || code.length < 16) return { ok: false, error: '연결 코드가 없습니다.' };
  const m = members_().find(function (x) { return x.code && x.code === code; });
  if (!m) return { ok: false, error: '연결 코드가 맞지 않습니다. 보드에서 새 코드를 받아 다시 연결하세요.' };
  const unread = unreadAll_(m.email);
  const s = settings_();
  const out = {
    ok: true, name: m.name, role: m.role, today: today_(), hour: hour_(),
    morningHour: num_(s['아침알림시각'] || 9), board: s['보드주소'] || ScriptApp.getService().getUrl(),
    unread: unread, todo: todo_(m),
  };
  // 영업노트 연락 알림: 오늘 연락할 가망건(시각 포함)과 오늘 할일
  const b = todayBundle_(m);
  out.calls = b.calls;
  out.tasks = b.tasks.map(function (t) { return { id: t.id, kind: t.kind, title: t.title, time: t.time }; });
  out.now = now_();
  useMark_(m.email, '알리미');
  if (m.role === 'lead') {
    out.pending = rows_('목표').filter(function (g) { return g['상태'] === '대기'; }).length;
    out.talk = rows_('일일체크').filter(function (c) { return c['결과'] === '실패' && c['소통완료'] !== 'Y'; }).length;
    out.syncHour = num_(s['수집시각'] || 11);
    out.lastSync = s['마지막수집'] || '';
  }
  return out;
}

/* ───────────────────────── 영업노트 · 할일 · 오늘 · 이용 기록 ───────────────────────── */

const LEAD_STATES = ['첫 통화', '점검권한 대기', '제안', '계약', '보류', '실패'];
const LEAD_OPEN = ['첫 통화', '점검권한 대기', '제안'];
const CALL_RESULTS = ['통화함', '부재', '콜백 요청', '제안 발송', '점검권한 받음', '계약', '보류', '실패'];
/** 통화 결과를 고르면 상태를 이렇게 바꿉니다(직접 고르면 그게 우선) */
const RESULT_STATE = { '점검권한 받음': '점검권한 대기', '제안 발송': '제안', '계약': '계약', '보류': '보류', '실패': '실패' };
const TASK_KINDS = ['관리', '영업'];
const TASK_REPEATS = ['없음', '매일', '평일', '매주', '매월'];
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 'yyyy-MM-dd HH:mm' 로 맞춤. 날짜만 오면 오전 10시, 알 수 없으면 '' */
function dtText_(v) {
  const s = String(v || '').trim().replace('T', ' ').slice(0, 16);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return s;
  if (isDate_(s.slice(0, 10)) && s.length === 10) return s + ' 10:00';
  return '';
}
function short_(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }

/** 가망건 한 건: 담당 마케터 본인 또는 팀장만 */
function leadOwned_(me, id) {
  const r = rows_('가망건').find(function (x) { return x.id === id; });
  if (!r) throw new Error('가망건을 찾을 수 없습니다.');
  if (!isLead_(me) && low_(r['이메일']) !== me.email) throw new Error('본인 가망건만 볼 수 있습니다.');
  return r;
}

function leadView_(r, day, nowS) {
  const next = String(r['다음연락'] || '');
  const open = LEAD_OPEN.indexOf(r['상태']) >= 0;
  return {
    id: r.id, email: low_(r['이메일']), who: nameOf_(r['이메일']), company: r['업체명'], store: r['스토어주소'],
    media: r['매체'], person: r['담당자'], phone: r['연락처'], status: r['상태'], memo: r['메모'], next: next,
    created: r['등록일'], updated: r['수정일'], contractAt: r['계약일'], open: open,
    due: open && !!next && next.slice(0, 10) <= day, overdue: open && !!next && next < nowS,
  };
}

/** 할일이 그 날짜에 해야 하는 날인지 */
function occurs_(t, day) {
  if (t['상태'] === '보관') return false;
  const start = String(t['시작일'] || '').slice(0, 10);
  if (start && day < start) return false;
  const rep = t['반복'] || '없음', w = dt_(day).getUTCDay();
  if (rep === '매일') return true;
  if (rep === '평일') return w > 0 && w < 6;
  if (rep === '매주') return String(t['반복값'] || '').split(',').indexOf(WEEKDAYS[w]) >= 0;
  if (rep === '매월') {
    const want = Number(t['반복값']) || 1, last = Number(monthEnd_(monthOf_(day)).slice(8));
    return Number(day.slice(8)) === Math.min(want, last);
  }
  return String(t['기한']) === day;
}

function taskView_(t, done, day) {
  const rep = t['반복'] || '없음';
  const mine = done.filter(function (d) { return d['할일id'] === t.id; });
  const doneEver = mine.length > 0;
  const doneToday = mine.some(function (d) { return d['날짜'] === day; });
  const once = rep === '없음';
  const today = once ? (!doneEver && String(t['기한'] || '') <= day && !!t['기한']) || (doneEver && mine.some(function (d) { return d['날짜'] === day; }))
    : occurs_(t, day);
  return {
    id: t.id, email: low_(t['이메일']), who: nameOf_(t['이메일']), kind: t['분류'], title: t['제목'], memo: t['메모'],
    repeat: rep, repeatValue: t['반복값'], due: t['기한'], time: t['시간'], archived: t['상태'] === '보관',
    today: today, done: once ? doneEver : doneToday, overdue: once && !doneEver && !!t['기한'] && t['기한'] < day,
    lastDone: mine.map(function (d) { return d['날짜']; }).sort().pop() || '',
  };
}

/** 기간 안에 해야 했던 할일 횟수와 완료 횟수 */
function taskRate_(tasks, done, email, from, to) {
  let need = 0, ok = 0;
  tasks.filter(function (t) { return low_(t['이메일']) === email; }).forEach(function (t) {
    const mine = done.filter(function (d) { return d['할일id'] === t.id; });
    if ((t['반복'] || '없음') === '없음') {
      if (t['기한'] && t['기한'] >= from && t['기한'] <= to) { need++; if (mine.length) ok++; }
      return;
    }
    for (let d = from; d <= to; d = addDays_(d, 1)) {
      if (!occurs_(t, d)) continue;
      need++;
      if (mine.some(function (x) { return x['날짜'] === d; })) ok++;
    }
  });
  return { need: need, ok: ok, rate: need ? Math.round(ok / need * 1000) / 10 : null };
}

/** 오늘 묶음: 오늘(또는 밀린) 연락할 가망건 + 오늘 할일 + 오늘 목표 */
function todayBundle_(m) {
  const day = today_(), nowS = now_();
  const calls = rows_('가망건').filter(function (r) {
    return low_(r['이메일']) === m.email && LEAD_OPEN.indexOf(r['상태']) >= 0 && r['다음연락'] && String(r['다음연락']).slice(0, 10) <= day;
  }).map(function (r) {
    return { id: r.id, company: r['업체명'], at: String(r['다음연락']), memo: short_(r['메모'], 60), phone: r['연락처'],
      overdue: String(r['다음연락']) < nowS };
  }).sort(function (a, b) { return a.at < b.at ? -1 : 1; });
  const done = rows_('할일완료');
  const tasks = rows_('할일').filter(function (t) { return low_(t['이메일']) === m.email; })
    .map(function (t) { return taskView_(t, done, day); })
    .filter(function (t) { return t.today && !t.done && !t.archived; });
  return { calls: calls, tasks: tasks, goals: todo_(m) };
}

/* ── 이용 기록: 스크립트 저장소에 하루치를 모았다가, 다음 날 첫 요청 때 '이용기록' 시트에 한 번에 씀 ── */
const USAGE_TAB_ = {
  bootstrap: '접속', perf: '실적', goalList: '액션플랜', leadList: '영업노트', noticeList: '공지', solutions: '솔루션',
  guideList: '가이드', calendar: '캘린더', teamStats: '팀현황',
};

function useMark_(email, key) {
  try {
    const props = PropertiesService.getScriptProperties();
    const day = today_(), k = 'U|' + day + '|' + email, t = now_().slice(11);
    const o = JSON.parse(props.getProperty(k) || '{}');
    if (key === '알리미') o.al = t;
    else { if (!o.f) o.f = t; o.l = t; }
    o[key] = (o[key] || 0) + 1;
    props.setProperty(k, JSON.stringify(o));
    flushUsage_(props, day);
  } catch (e) { /* 기록 실패는 화면 동작에 영향 주지 않음 */ }
}

function flushUsage_(props, day) {
  if (props.getProperty('U|flushed') === day) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) return;
  try {
    if (props.getProperty('U|flushed') === day) return;
    const all = props.getProperties(), rows = [];
    Object.keys(all).forEach(function (k) {
      const p = k.split('|');
      if (p[0] === 'U' && p.length === 3 && p[1] < day) { rows.push([p[1], p[2], all[k]]); props.deleteProperty(k); }
    });
    if (rows.length) appendRows_('이용기록', rows);
    props.setProperty('U|flushed', day);
  } finally { lock.releaseLock(); }
}

/** 여러 줄을 한 번에 추가 */
function appendRows_(name, rows) {
  forget_(name);
  const sh = sheet_(name);
  const start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, rows[0].length).setNumberFormat('@').setValues(rows);
}

/** 이용 기록 읽기: 시트(지난 날) + 저장소(오늘) → {email: {날짜: 기록}} */
function usageRows_(from, to) {
  const out = {};
  const put = function (day, email, o) { (out[low_(email)] = out[low_(email)] || {})[day] = o; };
  rows_('이용기록').forEach(function (r) {
    const d = String(r['날짜']).slice(0, 10);
    if (d >= from && d <= to) { try { put(d, r['이메일'], JSON.parse(r['기록'])); } catch (e) { /* 깨진 줄 무시 */ } }
  });
  const all = PropertiesService.getScriptProperties().getProperties();
  Object.keys(all).forEach(function (k) {
    const p = k.split('|');
    if (p[0] === 'U' && p.length === 3 && p[1] >= from && p[1] <= to) { try { put(p[1], p[2], JSON.parse(all[k])); } catch (e) { /* 무시 */ } }
  });
  return out;
}

function usageSummary_(byDay) {
  const days = Object.keys(byDay || {}).sort();
  const sum = { days: 0, opens: 0, tabs: {}, popups: 0, downloads: 0, last: '', alerter: '' };
  days.forEach(function (d) {
    const o = byDay[d];
    if (o['접속'] || o.f) sum.days++;
    sum.opens += o['접속'] || 0;
    Object.keys(USAGE_TAB_).forEach(function (a) { const k = USAGE_TAB_[a]; if (k !== '접속' && o[k]) sum.tabs[k] = (sum.tabs[k] || 0) + o[k]; });
    sum.popups += o['공지팝업'] || 0;
    sum.downloads += o['다운로드'] || 0;
    if (o.l) sum.last = d + ' ' + o.l;
    if (o.al) sum.alerter = d + ' ' + o.al;
  });
  return sum;
}

/** 공지 확인까지 걸린 평균 시간(분): 그 달에 올라온 남의 공지 기준 */
function noticeDelay_(email, name, month) {
  const notices = rows_('공지').filter(function (n) { return monthOf_(n['작성일']) === month; });
  const acks = rows_('공지확인');
  const mins = [];
  notices.forEach(function (n) {
    const a = acks.find(function (x) { return x['공지id'] === n.id && low_(x['이메일']) === email; });
    if (!a || n['작성자'] === name) return; // 본인이 쓴 공지는 제외
    const diff = (new Date(String(a['확인시각']).replace(' ', 'T') + ':00+09:00') - new Date(String(n['작성일']).replace(' ', 'T') + ':00+09:00')) / 60000;
    if (diff >= 0 && diff < 60 * 24 * 31) mins.push(diff);
  });
  return mins.length ? Math.round(mins.reduce(function (s, x) { return s + x; }, 0) / mins.length) : null;
}

/** 영업노트 한 달 요약 */
function salesSummary_(email, from, to) {
  const leads = rows_('가망건').filter(function (r) { return low_(r['이메일']) === email; });
  const calls = rows_('통화기록').filter(function (c) { return low_(c['이메일']) === email && String(c['시각']).slice(0, 10) >= from && String(c['시각']).slice(0, 10) <= to; });
  const nowS = now_();
  return {
    open: leads.filter(function (r) { return LEAD_OPEN.indexOf(r['상태']) >= 0; }).length,
    added: leads.filter(function (r) { const d = String(r['등록일']).slice(0, 10); return d >= from && d <= to; }).length,
    contracts: leads.filter(function (r) { const d = String(r['계약일']).slice(0, 10); return r['상태'] === '계약' && d >= from && d <= to; }).length,
    calls: calls.length,
    overdue: leads.filter(function (r) { return LEAD_OPEN.indexOf(r['상태']) >= 0 && r['다음연락'] && String(r['다음연락']) < nowS; }).length,
  };
}

const SALES_ACTIONS = {
  leadList: function (me, p) {
    const emails = scopeEmails_(me, p.email);
    const day = today_(), nowS = now_();
    return rows_('가망건').filter(function (r) { return emails.indexOf(low_(r['이메일'])) >= 0; })
      .map(function (r) { return leadView_(r, day, nowS); })
      .sort(function (a, b) {
        if (a.open !== b.open) return a.open ? -1 : 1;
        if (a.open && (a.next || 'z') !== (b.next || 'z')) return (a.next || 'z') < (b.next || 'z') ? -1 : 1;
        return a.updated < b.updated ? 1 : -1;
      });
  },

  leadSave: function (me, p) {
    const rec = {
      '업체명': text_(p.company, 100), '스토어주소': text_(p.store, 500), '매체': text_(p.media, 40),
      '담당자': text_(p.person, 40), '연락처': text_(p.phone, 40), '메모': text_(p.memo, 3000),
      '상태': LEAD_STATES.indexOf(p.status) >= 0 ? p.status : '첫 통화', '다음연락': dtText_(p.next), '수정일': now_(),
    };
    if (!rec['업체명']) throw new Error('업체명을 입력하세요.');
    return locked_(function () {
      if (p.id) {
        const r = leadOwned_(me, p.id);
        if (rec['상태'] === '계약' && r['상태'] !== '계약') rec['계약일'] = now_();
        update_('가망건', 'id', p.id, rec);
        return p.id;
      }
      rec.id = uid_(); rec['이메일'] = isLead_(me) && p.email ? low_(p.email) : me.email; rec['등록일'] = now_();
      if (rec['상태'] === '계약') rec['계약일'] = now_();
      insert_('가망건', rec);
      return rec.id;
    });
  },

  /** 통화 결과 기록 → 상태·다음 연락 갱신 (알리미가 다음 알림을 다시 잡음) */
  leadLog: function (me, p) {
    const result = CALL_RESULTS.indexOf(p.result) >= 0 ? p.result : '통화함';
    return locked_(function () {
      const r = leadOwned_(me, p.id);
      const status = LEAD_STATES.indexOf(p.status) >= 0 ? p.status : (RESULT_STATE[result] || r['상태']);
      const next = LEAD_OPEN.indexOf(status) >= 0 ? dtText_(p.next) : '';
      insert_('통화기록', {
        id: uid_(), '가망건id': r.id, '이메일': low_(r['이메일']), '시각': now_(), '결과': result,
        '메모': text_(p.memo, 3000), '다음연락': next, '기록자': me.name,
      });
      const patch = { '상태': status, '다음연락': next, '수정일': now_() };
      if (text_(p.memo)) patch['메모'] = text_(p.memo, 3000);
      if (status === '계약' && r['상태'] !== '계약') patch['계약일'] = now_();
      update_('가망건', 'id', r.id, patch);
      return { status: status, next: next };
    });
  },

  leadHistory: function (me, p) {
    const r = leadOwned_(me, p.id);
    return rows_('통화기록').filter(function (c) { return c['가망건id'] === r.id; })
      .map(function (c) { return { at: c['시각'], result: c['결과'], memo: c['메모'], next: c['다음연락'], by: c['기록자'] }; })
      .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  },

  leadDelete: function (me, p) {
    return locked_(function () {
      const r = leadOwned_(me, p.id);
      remove_('가망건', function (x) { return x.id === r.id; });
      remove_('통화기록', function (x) { return x['가망건id'] === r.id; });
      return true;
    });
  },

  taskList: function (me, p) {
    const emails = scopeEmails_(me, p.email);
    const day = today_();
    const done = rows_('할일완료');
    return rows_('할일').filter(function (t) { return emails.indexOf(low_(t['이메일'])) >= 0 && t['상태'] !== '보관'; })
      .map(function (t) { return taskView_(t, done, day); })
      .sort(function (a, b) { return (b.today - a.today) || (a.done - b.done) || ((a.time || '99') < (b.time || '99') ? -1 : 1); });
  },

  taskSave: function (me, p) {
    const rep = TASK_REPEATS.indexOf(p.repeat) >= 0 ? p.repeat : '없음';
    const rec = {
      '분류': TASK_KINDS.indexOf(p.kind) >= 0 ? p.kind : '관리', '제목': text_(p.title, 200), '메모': text_(p.memo, 2000),
      '반복': rep, '반복값': rep === '매주' ? text_(p.repeatValue, 20) : rep === '매월' ? String(Math.min(31, Math.max(1, num_(p.repeatValue) || 1))) : '',
      '기한': rep === '없음' ? (isDate_(p.due) ? p.due : today_()) : '', '시간': /^\d{2}:\d{2}$/.test(p.time || '') ? p.time : '',
    };
    if (!rec['제목']) throw new Error('할일을 입력하세요.');
    if (rep === '매주' && !rec['반복값']) throw new Error('반복할 요일을 고르세요.');
    return locked_(function () {
      if (p.id) {
        const t = rows_('할일').find(function (x) { return x.id === p.id; });
        if (!t) throw new Error('할일을 찾을 수 없습니다.');
        if (!isLead_(me) && low_(t['이메일']) !== me.email) throw new Error('본인 할일만 고칠 수 있습니다.');
        update_('할일', 'id', p.id, rec);
        return p.id;
      }
      rec.id = uid_(); rec['이메일'] = isLead_(me) && p.email ? low_(p.email) : me.email;
      rec['시작일'] = today_(); rec['상태'] = '사용'; rec['작성일'] = now_();
      insert_('할일', rec);
      return rec.id;
    });
  },

  /** 삭제 대신 보관: 지난 완료 기록(완료율)은 남깁니다 */
  taskDelete: function (me, p) {
    return locked_(function () {
      const t = rows_('할일').find(function (x) { return x.id === p.id; });
      if (!t) return true;
      if (!isLead_(me) && low_(t['이메일']) !== me.email) throw new Error('본인 할일만 지울 수 있습니다.');
      update_('할일', 'id', p.id, { '상태': '보관' });
      return true;
    });
  },

  taskDone: function (me, p) {
    const day = isDate_(p.date) ? p.date : today_();
    return locked_(function () {
      const t = rows_('할일').find(function (x) { return x.id === p.id; });
      if (!t) throw new Error('할일을 찾을 수 없습니다.');
      if (low_(t['이메일']) !== me.email) throw new Error('본인 할일만 체크할 수 있습니다.');
      remove_('할일완료', function (d) { return d['할일id'] === t.id && d['날짜'] === day; });
      if (p.done !== false) insert_('할일완료', { id: uid_(), '할일id': t.id, '이메일': me.email, '날짜': day, '완료시각': now_() });
      return true;
    });
  },

  today: function (me) { return todayBundle_(me); },

  /** 화면에서만 알 수 있는 이용 기록(공지 팝업, 솔루션 다운로드) */
  track: function (me, p) {
    const k = { popup: '공지팝업', download: '다운로드' }[p.kind];
    if (k) useMark_(me.email, k);
    return true;
  },

  /** 팀장: 팀원별 이용 현황 */
  usageStats: function (me, p) {
    needLead_(me);
    const month = /^\d{4}-\d{2}$/.test(p.month || '') ? p.month : monthOf_(today_());
    const from = month + '-01', to = monthEnd_(month) < today_() ? monthEnd_(month) : today_();
    const use = usageRows_(from, to);
    const tasks = rows_('할일'), done = rows_('할일완료');
    const workdays = workdays_(from, to);
    return {
      month: month, workdays: workdays,
      members: members_().map(function (m) {
        const u = usageSummary_(use[m.email]);
        return {
          email: m.email, name: m.name, role: m.role, usage: u,
          noticeDelay: noticeDelay_(m.email, m.name, month), tasks: taskRate_(tasks, done, m.email, from, to),
          sales: salesSummary_(m.email, from, to),
        };
      }),
    };
  },
};
Object.keys(SALES_ACTIONS).forEach(function (k) { ACTIONS[k] = SALES_ACTIONS[k]; });


/* ───────────────────────── 오늘 점검 (6팀 일일점검 흡수) ─────────────────────────
 * 일일점검 결과(네이버 SA 점검)와 그 화면 틀(dashboard.html), 인트라 점검을 드라이브 파일로 보관합니다.
 * 시트 칸(5만 자)보다 커서 파일로 둡니다. 파일 ID는 스크립트 저장소에 기억합니다.
 */
function blobWrite_(key, text) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('F|' + key);
  let f = null;
  if (id) { try { f = DriveApp.getFileById(id); } catch (e) { f = null; } }
  if (f) f.setContent(text);
  else {
    f = DriveApp.createFile('원보드_' + key + '.json', text, 'application/json');
    props.setProperty('F|' + key, f.getId());
  }
}

function blobRead_(key) {
  const id = PropertiesService.getScriptProperties().getProperty('F|' + key);
  if (!id) return '';
  try { return DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'); } catch (e) { return ''; }
}

/** 팀원 화면: 일일점검의 '팀원별 파일'과 같은 방식으로 그 팀원 계정만 남김 */
function personalSa_(data, names) {
  const has = function (owners) { return (owners || []).some(function (o) { return names.indexOf(o) >= 0; }); };
  const accs = (data.accounts || []).filter(function (a) { return has(a.owners); });
  const me = names.find(function (n) { return accs.some(function (a) { return (a.owners || []).indexOf(n) >= 0; }); }) || names[0];
  const out = {};
  Object.keys(data).forEach(function (k) { out[k] = data[k]; });
  out.personal = me; out.errors = []; out.accounts = accs;
  out.disconnected = (data.disconnected || []).filter(function (d) { return has(d.owners); });
  if (data.gfa) { out.gfa = {}; Object.keys(data.gfa).forEach(function (k) { out.gfa[k] = data.gfa[k]; }); out.gfa.rows = (data.gfa.rows || []).filter(function (r) { return names.indexOf(r.owner) >= 0; }); }
  if (data.mpai) { out.mpai = {}; Object.keys(data.mpai).forEach(function (k) { out.mpai[k] = data.mpai[k]; }); out.mpai.scopes = (data.mpai.scopes || []).filter(function (s) { return names.indexOf(s.owner) >= 0; }); }
  if (data.saGoals && data.saGoals[me]) out.saGoal = data.saGoals[me]; else delete out.saGoal;
  return out;
}

ACTIONS.checkView = function (me, p) {
  let names = null;
  if (!isLead_(me)) names = [me.manager, me.name];
  else if (p.email) {
    const m = members_().find(function (x) { return x.email === low_(p.email); });
    if (m) names = [m.manager, m.name];
  }
  const intra = JSON.parse(blobRead_('intra') || 'null');
  const pick = function (list) { return (list || []).filter(function (r) { return !names || names.indexOf(String(r['담당자'] || '').trim()) >= 0; }); };
  const intraOut = intra ? { date: intra.date, transfers: pick(intra.transfers), missing: pick(intra.missing), fees: pick(intra.fees) } : null;
  const raw = blobRead_('sa'), tpl = blobRead_('sadash');
  if (!raw || !tpl) return { empty: true, intra: intraOut };
  let data = JSON.parse(raw);
  if (names) data = personalSa_(data, names.filter(String));
  return { empty: false, template: tpl, data: data, intra: intraOut, updatedAt: settings_()['마지막SA수집'] || '' };
};
USAGE_TAB_.checkView = '오늘점검';


/* ───────────────────────── 가이드 초안 ───────────────────────── */

function seedGuides_() {
  const T = '※ 팀장 검수 전 초안입니다. 실제 메뉴 이름과 절차를 확인한 뒤 고쳐주세요.';
  const rows = [
    ['네이버 검색광고', '맵핑 방법', '광고주 계정을 우리 관리 계정에 연결하기',
      T + '\n- 광고주 광고 계정 번호(customerId)를 받는다\n- 우리 매니저 계정에서 광고주 계정 관리 권한을 요청한다\n- 광고주가 승인했는지 확인한다\n- 인트라넷·MP AI에 광고주 정보(담당자, 연락처, 사업자번호)를 입력한다\n- 다음 날 MP AI에 매출이 잡히는지 확인한다',
      'https://searchad.naver.com', 10],
    ['네이버 검색광고', '세팅 방법', '파워링크 기본 세팅 점검표',
      T + '\n- 캠페인: 목적별로 나누기(브랜드 / 일반 / 경쟁)\n- 일 예산과 노출 기간 확인\n- 그룹: 키워드 성격별 분리, 기본 입찰가 설정\n- 키워드: 대표·세부·시즌 키워드, 제외 키워드 등록\n- 소재: 그룹당 2개 이상, 확장 소재 등록\n- 전환 추적(프리미엄 로그분석) 설치 여부 확인', '', 20],
    ['네이버 쇼핑검색광고', '세팅 방법', '쇼핑검색광고 기본 세팅 점검표',
      T + '\n- 쇼핑몰(스마트스토어) 연동 상태 확인\n- 상품 그룹: 주력·시즌·저효율 상품 분리\n- 상품별 입찰가와 노출 상태 확인\n- 제외 검색어 정기 점검(월 1회 이상)', '', 30],
    ['네이버 브랜드검색', '세팅 방법', '브랜드검색 집행 전 확인',
      T + '\n- 2026-06-01 개편: 템플릿이 PC 3종·모바일 4종으로 줄었고 소재는 최대 8개까지 등록\n- 성별 소재를 쓰더라도 기본 소재는 반드시 등록\n- 템플릿별 이미지 규격은 광고주센터 제작가이드 원문으로 확인(추정 수치로 제작 금지)', '', 40],
    ['네이버 GFA', '세팅 방법', 'GFA 이미지 소재 규격(주요)',
      T + '\n- 모바일 메인(이미지형) 1250×560, JPG/PNG 50~250KB\n- 피드 가로 1200×628, JPG 500KB 이하\n- 피드 정사각 1200×1200, JPG 800KB 이하\n- 피드 세로 1200×1800, JPG 1200KB 이하 · 흰/검/회색 단색 배경 금지 · 글자 면적 20% 초과 시 집행 불가\n- 출처: 네이버 이미지형 DA 소재 제작가이드(2025-04-08 개정)', '', 50],
    ['네이버 검색광고', '문의 경로', '네이버 광고 고객센터',
      T + '\n- 네이버 광고 고객센터 전화·채팅 상담(운영 시간 확인 필요)\n- 검수 반려, 결제·환불, 계정 권한 문제는 고객센터로\n- 우리 회사 네이버 담당자(대행사 전담 매니저) 연락처를 여기에 적어두세요',
      'https://ads.naver.com/help', 60],
    ['네이버 GFA', '문의 경로', 'GFA 문의',
      T + '\n- GFA 문의 창구와 운영 시간을 여기에 적어주세요\n- 소재 반려 시 반려 사유 캡처를 함께 남기기', '', 70],
  ];
  rows.forEach(function (r) {
    insert_('가이드', { id: uid_(), '매체': r[0], '구분': r[1], '제목': r[2], '내용': r[3], '링크': r[4], '순서': r[5], '수정일': today_() });
  });
}
