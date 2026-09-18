/**
 * 제주대 교수진 안내 — 선호도 저장 API (Google Apps Script, 시트에 바인딩된 스크립트)
 *
 * 설치: 데이터 시트 열기 → 확장 프로그램 → Apps Script → 이 코드 붙여넣기 → 저장
 *       배포 → 새 배포 → 유형 "웹 앱" → 실행 사용자 "나", 액세스 권한 "모든 사용자" → 배포
 *       나온 웹 앱 URL(…/exec)을 app.js 의 CONFIG.RATINGS.API_URL 에 넣습니다.
 *
 * 시트에 'ratings' 탭이 없으면 자동으로 만듭니다. (열: email, dept_id, slug, name, rating, updated_at, met, memo)
 * 예전 6열 시트에는 met, memo 열을 자동으로 덧붙입니다.
 * 요청마다 Google ID 토큰을 검증하므로, 로그인한 본인의 행만 읽고 쓸 수 있습니다.
 */

// app.js 의 CONFIG.AUTH.CLIENT_ID 와 같은 값
const CLIENT_ID = '626785532501-v1u8fi2n26sgti0ir43stlm9vnnj6ru9.apps.googleusercontent.com';
const SHEET_NAME = 'ratings';
const SET_SHEET = 'settings';                     // 퀴즈 학과·교수 선택 등 개인 설정
const SET_HEADER = ['email', 'key', 'value', 'updated_at'];
const HEADER = ['email', 'dept_id', 'slug', 'name', 'rating', 'updated_at', 'met', 'memo']; // met: 만난 횟수, memo: 메모 (열이 없으면 자동 추가)
// 선호도 값: 확(확실) · 중(보통) · 모(모름) · 부(부정) · 비(비해당 — 연구년 등으로 평가 제외)
const RATINGS = ['확', '중', '모', '부', '비'];
// 예전 값(상/하)이 시트에 남아 있어도 새 값으로 읽습니다
const LEGACY = { '상': '확', '하': '모' };
const norm = v => { v = String(v || ''); return LEGACY[v] || (RATINGS.indexOf(v) >= 0 ? v : ''); };

/* ---------- 앱 세션 토큰 ----------
 * 구글 ID 토큰은 1시간이면 만료되는데, 브라우저 추적 방지 때문에 조용한 재발급이 자주 막힙니다.
 * 그래서 구글 로그인을 한 번 확인한 뒤에는 이 스크립트가 직접 서명한 토큰(기본 90일)을 발급해 쓰고,
 * 만료 전에는 그 토큰만으로 갱신할 수 있게 합니다. 서명 키는 스크립트 속성에만 저장됩니다. */
const APP_TOKEN_DAYS = 90;

function appSecret() {
  const props = PropertiesService.getScriptProperties();
  let k = props.getProperty('APP_SECRET');
  if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('APP_SECRET', k); }
  return k;
}
function appSign(email, exp) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(email + '|' + exp, appSecret()));
}
function makeAppToken(email) {
  const exp = Date.now() + APP_TOKEN_DAYS * 86400000;
  return { token: 'a1.' + Utilities.base64EncodeWebSafe(email) + '.' + exp + '.' + appSign(email, exp), exp: exp };
}
function verifyAppToken(t) {
  if (!t || String(t).indexOf('a1.') !== 0) return null;
  const parts = String(t).split('.');
  if (parts.length !== 4) return null;
  try {
    const email = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString();
    const exp = Number(parts[2]);
    if (!(exp > Date.now())) return null;
    if (appSign(email, exp) !== parts[3]) return null;
    return email;
  } catch (err) { return null; }
}

function doGet() {
  return out({ ok: true, service: 'jejunu-faculty ratings' });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { return out({ error: 'bad json' }); }
  const email = verifyToken(body.token);
  if (!email) return out({ error: 'unauthorized' });

  if (body.action === 'session') { const t = makeAppToken(email); return out({ ok: true, token: t.token, exp: t.exp, email: email }); }
  if (body.action === 'list') return out({ email, ratings: listRatings(email), settings: listSettings(email) });
  if (body.action === 'setting') {
    if (!body.key) return out({ error: 'missing key' });
    upsertSetting(email, String(body.key), String(body.value == null ? '' : body.value));
    return out({ ok: true });
  }
  if (body.action === 'set') {
    if (!body.dept_id || !body.slug) return out({ error: 'missing key' });
    // 보낸 필드만 바꿉니다: rating(선호도) / met(만남 횟수) / memo(메모)
    const fields = {};
    if (body.rating !== undefined) { const raw = String(body.rating || ''); const rating = norm(raw); if (raw && !rating) return out({ error: 'bad rating' }); fields.rating = rating; }
    if (body.met !== undefined) fields.met = Math.max(0, Math.min(999, Math.round(Number(body.met) || 0)));
    if (body.memo !== undefined) fields.memo = String(body.memo == null ? '' : body.memo).slice(0, 2000);
    upsert(email, String(body.dept_id), String(body.slug), String(body.name || ''), fields);
    return out({ ok: true });
  }
  return out({ error: 'bad action' });
}

/* 토큰 → 이메일. 앱 토큰을 먼저 보고, 아니면 구글 ID 토큰으로 검증 */
function verifyToken(token) {
  if (!token) return null;
  const mine = verifyAppToken(token);
  if (mine) return mine;
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
  } else if (sh.getLastColumn() < HEADER.length) { // 예전 시트: 빠진 열(met, memo) 머리글 추가
    const have = sh.getLastColumn();
    sh.getRange(1, have + 1, 1, HEADER.length - have).setValues([HEADER.slice(have)]);
  }
  return sh;
}

function listRatings(email) {
  const sh = sheet();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, HEADER.length).getValues();
  return rows
    .filter(r => String(r[0]).toLowerCase() === email && (norm(r[4]) || Number(r[6]) > 0 || String(r[7] || '')))
    .map(r => ({ dept_id: String(r[1]), slug: String(r[2]), name: String(r[3]), rating: norm(r[4]), updated_at: r[5] ? new Date(r[5]).toISOString() : '', met: Number(r[6]) || 0, memo: String(r[7] == null ? '' : r[7]) }));
}

function upsert(email, deptId, slug, name, fields) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet();
    const last = sh.getLastRow();
    const now = new Date();
    const merge = cur => ({
      rating: fields.rating !== undefined ? fields.rating : norm(cur[4]),
      met: fields.met !== undefined ? fields.met : (Number(cur[6]) || 0),
      memo: fields.memo !== undefined ? fields.memo : String(cur[7] == null ? '' : cur[7]),
    });
    if (last >= 2) {
      const rows = sh.getRange(2, 1, last - 1, HEADER.length).getValues();
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0]).toLowerCase() === email && String(rows[i][1]) === deptId && String(rows[i][2]) === slug) {
          const rowIdx = i + 2, m = merge(rows[i]);
          if (m.rating || m.met || m.memo) sh.getRange(rowIdx, 4, 1, 5).setValues([[name, m.rating, now, m.met, m.memo]]);
          else sh.deleteRow(rowIdx); // 아무 기록도 안 남으면 행 삭제
          return;
        }
      }
    }
    const m = merge([]);
    if (m.rating || m.met || m.memo) sh.appendRow([email, deptId, slug, name, m.rating, now, m.met, m.memo]);
  } finally {
    lock.releaseLock();
  }
}

/* ---------- 개인 설정 (settings 탭) ---------- */
function setSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SET_SHEET);
  if (!sh) { sh = ss.insertSheet(SET_SHEET); sh.appendRow(SET_HEADER); sh.setFrozenRows(1); }
  return sh;
}

function listSettings(email) {
  const sh = setSheet(), last = sh.getLastRow();
  const outObj = {};
  if (last < 2) return outObj;
  sh.getRange(2, 1, last - 1, SET_HEADER.length).getValues()
    .filter(r => String(r[0]).toLowerCase() === email && r[1])
    .forEach(r => { outObj[String(r[1])] = String(r[2] == null ? '' : r[2]); });
  return outObj;
}

function upsertSetting(email, key, value) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = setSheet(), last = sh.getLastRow(), now = new Date();
    if (last >= 2) {
      const rows = sh.getRange(2, 1, last - 1, 2).getValues();
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0]).toLowerCase() === email && String(rows[i][1]) === key) {
          sh.getRange(i + 2, 3, 1, 2).setValues([[value, now]]);
          return;
        }
      }
    }
    sh.appendRow([email, key, value, now]);
  } finally { lock.releaseLock(); }
}

/* 시트에 남아 있는 예전 값(상→확, 하→모)을 한 번에 새 값으로 바꿉니다. (편집기에서 직접 실행)
 * 실행: 편집기 상단 함수 선택 → migrateRatings → ▶ 실행 */
function migrateRatings() {
  const sh = sheet();
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const rng = sh.getRange(2, 5, last - 1, 1);
  const vals = rng.getValues();
  let n = 0;
  const next = vals.map(([v]) => { const s = String(v || ''); if (LEGACY[s]) { n++; return [LEGACY[s]]; } return [v]; });
  if (n) rng.setValues(next);
  Logger.log('변환한 행: ' + n);
  return n;
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
