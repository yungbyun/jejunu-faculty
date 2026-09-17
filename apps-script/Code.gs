/**
 * 제주대 교수진 안내 — 선호도 저장 API (Google Apps Script, 시트에 바인딩된 스크립트)
 *
 * 설치: 데이터 시트 열기 → 확장 프로그램 → Apps Script → 이 코드 붙여넣기 → 저장
 *       배포 → 새 배포 → 유형 "웹 앱" → 실행 사용자 "나", 액세스 권한 "모든 사용자" → 배포
 *       나온 웹 앱 URL(…/exec)을 app.js 의 CONFIG.RATINGS.API_URL 에 넣습니다.
 *
 * 시트에 'ratings' 탭이 없으면 자동으로 만듭니다. (열: email, dept_id, slug, name, rating, updated_at)
 * 요청마다 Google ID 토큰을 검증하므로, 로그인한 본인의 행만 읽고 쓸 수 있습니다.
 */

// app.js 의 CONFIG.AUTH.CLIENT_ID 와 같은 값
const CLIENT_ID = '626785532501-v1u8fi2n26sgti0ir43stlm9vnnj6ru9.apps.googleusercontent.com';
const SHEET_NAME = 'ratings';
const HEADER = ['email', 'dept_id', 'slug', 'name', 'rating', 'updated_at'];
const RATINGS = ['상', '중', '하', '부'];

function doGet() {
  return out({ ok: true, service: 'jejunu-faculty ratings' });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { return out({ error: 'bad json' }); }
  const email = verifyToken(body.token);
  if (!email) return out({ error: 'unauthorized' });

  if (body.action === 'list') return out({ email, ratings: listRatings(email) });
  if (body.action === 'set') {
    const rating = String(body.rating || '');
    if (rating && RATINGS.indexOf(rating) < 0) return out({ error: 'bad rating' });
    if (!body.dept_id || !body.slug) return out({ error: 'missing key' });
    upsert(email, String(body.dept_id), String(body.slug), String(body.name || ''), rating);
    return out({ ok: true });
  }
  return out({ error: 'bad action' });
}

/* Google ID 토큰 검증 → 이메일 */
function verifyToken(token) {
  if (!token) return null;
  try {
    const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const p = JSON.parse(res.getContentText());
    if (p.aud !== CLIENT_ID) return null;
    if (String(p.email_verified) !== 'true') return null;
    return String(p.email).toLowerCase();
  } catch (err) { return null; }
}

function sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
  }
  return sh;
}

function listRatings(email) {
  const sh = sheet();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, HEADER.length).getValues();
  return rows
    .filter(r => String(r[0]).toLowerCase() === email && r[4])
    .map(r => ({ dept_id: String(r[1]), slug: String(r[2]), name: String(r[3]), rating: String(r[4]) }));
}

function upsert(email, deptId, slug, name, rating) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet();
    const last = sh.getLastRow();
    const now = new Date();
    if (last >= 2) {
      const rows = sh.getRange(2, 1, last - 1, 3).getValues();
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0]).toLowerCase() === email && String(rows[i][1]) === deptId && String(rows[i][2]) === slug) {
          const rowIdx = i + 2;
          if (rating) sh.getRange(rowIdx, 4, 1, 3).setValues([[name, rating, now]]);
          else sh.deleteRow(rowIdx);
          return;
        }
      }
    }
    if (rating) sh.appendRow([email, deptId, slug, name, rating, now]);
  } finally {
    lock.releaseLock();
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}


/* ==========================================================
 * 교수 데이터 가져오기 (편집기에서 직접 실행)
 * GitHub Pages에 올라간 data/professors.json 을 읽어 첫 번째 시트에
 * (dept_id, name) 기준으로 추가/갱신합니다. 시트에 없는 열은 무시하고,
 * 시트에서 직접 고친 값은 덮어쓰지 않으려면 OVERWRITE 를 false 로 두세요.
 * 실행: 편집기 상단 함수 선택 → importProfessorsFromGitHub → ▶ 실행
 * ========================================================== */
const PROFESSORS_JSON_URL = 'https://yungbyun.github.io/jejunu-faculty/data/professors.json';
const OVERWRITE = false; // true 면 이미 있는 교수의 빈 칸이 아닌 값도 JSON 값으로 덮어씀

function importProfessorsFromGitHub() {
  const res = UrlFetchApp.fetch(PROFESSORS_JSON_URL + '?t=' + Date.now(), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('JSON을 읽지 못했습니다: HTTP ' + res.getResponseCode());
  const rows = JSON.parse(res.getContentText());
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheets()[0];
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const col = name => header.indexOf(name);
  if (col('dept_id') < 0 || col('name') < 0) throw new Error('첫 번째 시트에 dept_id, name 열이 없습니다');
  const last = sh.getLastRow();
  const existing = new Map();
  if (last >= 2) {
    const vals = sh.getRange(2, 1, last - 1, header.length).getValues();
    vals.forEach((r, i) => existing.set(r[col('dept_id')] + '|' + r[col('name')], i + 2));
  }
  let added = 0, updated = 0;
  const toAppend = [];
  rows.forEach(p => {
    const key = p.dept_id + '|' + p.name;
    const line = header.map(h => (p[h] == null ? '' : String(p[h])));
    if (existing.has(key)) {
      const rowIdx = existing.get(key);
      const cur = sh.getRange(rowIdx, 1, 1, header.length).getValues()[0];
      let changed = false;
      const merged = cur.map((v, i) => {
        const nv = line[i];
        if (nv === '' || header[i] === 'photo') return v;           // 빈 값·photo 열은 유지
        if (String(v) === '' || OVERWRITE) { if (String(v) !== nv) changed = true; return nv; }
        return v;
      });
      if (changed) { sh.getRange(rowIdx, 1, 1, header.length).setValues([merged]); updated++; }
    } else { toAppend.push(line); added++; }
  });
  if (toAppend.length) sh.getRange(last + 1, 1, toAppend.length, header.length).setValues(toAppend);
  Logger.log('추가 ' + added + '명, 갱신 ' + updated + '명, 총 ' + (last - 1 + added) + '명');
  return { added, updated };
}
