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
// 선호도 값: 확(확실) · 중(보통) · 모(모름) · 부(부정) · 비(평가제외 — 연구년 등)
const RATINGS = ['확', '중', '모', '부', '비'];
// 예전 값(상/하)이 시트에 남아 있어도 새 값으로 읽습니다
const LEGACY = { '상': '확', '하': '모' };
const norm = v => { v = String(v || ''); return LEGACY[v] || (RATINGS.indexOf(v) >= 0 ? v : ''); };

/* ---------- AI 융합 방향 다시 쓰기 (airewrites 탭) ----------
 * 항목 하나를 사용자의 추가 지시에 따라 다시 쓴 결과를 계정별로 보관합니다.
 * 원본 data/insights/*.json 은 건드리지 않고, 화면에서 이 값이 있으면 덮어 그립니다. */
const AIR_SHEET = 'airewrites';
const AIR_HEADER = ['email', 'dept_id', 'slug', 'idx', 'title', 'term', 'concl', 'hint', 'updated_at'];
const AIR_MODEL = 'claude-sonnet-4-5';
const AIR_MAX_ITEMS = 12;          // 교수 한 명당 항목 수 상한 (idx 범위 검사용)
const AIR_MIN_GAP_MS = 3000;       // 같은 사람이 연달아 부르는 것을 막는 최소 간격

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
  if (body.action === 'list') return out({ email, ratings: listRatings(email), settings: listSettings(email), airewrites: airList(email) });
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
  if (body.action === 'airewrite') return airewrite(email, body);
  if (body.action === 'airewrite_reset') {
    if (!body.dept_id || !body.slug) return out({ error: 'missing key' });
    airDelete(email, String(body.dept_id), String(body.slug), Number(body.idx));
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

/* ==========================================================
 * AI 융합 방향 — 항목 하나 다시 쓰기
 * ========================================================== */

function airSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(AIR_SHEET);
  if (!sh) { sh = ss.insertSheet(AIR_SHEET); sh.appendRow(AIR_HEADER); sh.setFrozenRows(1); }
  return sh;
}

/* 내 계정이 다시 쓴 항목 전부. 키는 "dept_id/slug/idx" */
function airList(email) {
  const sh = airSheet(), last = sh.getLastRow();
  const o = {};
  if (last < 2) return o;
  sh.getRange(2, 1, last - 1, AIR_HEADER.length).getValues()
    .filter(r => String(r[0]).toLowerCase() === email && r[1] && r[2])
    .forEach(r => {
      o[String(r[1]) + '/' + String(r[2]) + '/' + (Number(r[3]) || 0)] = {
        title: String(r[4] == null ? '' : r[4]),
        term: String(r[5] == null ? '' : r[5]),
        concl: String(r[6] == null ? '' : r[6]),
        hint: String(r[7] == null ? '' : r[7]),
        updated_at: r[8] ? new Date(r[8]).toISOString() : '',
      };
    });
  return o;
}

function airFindRow(sh, email, deptId, slug, idx) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const rows = sh.getRange(2, 1, last - 1, 4).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === email && String(rows[i][1]) === deptId
      && String(rows[i][2]) === slug && (Number(rows[i][3]) || 0) === idx) return i + 2;
  }
  return 0;
}

function airSave(email, deptId, slug, idx, v) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = airSheet(), now = new Date();
    const row = [email, deptId, slug, idx, v.title, v.term, v.concl, v.hint, now];
    const at = airFindRow(sh, email, deptId, slug, idx);
    if (at) sh.getRange(at, 1, 1, AIR_HEADER.length).setValues([row]);
    else sh.appendRow(row);
  } finally { lock.releaseLock(); }
}

/* 되돌리기: 그 줄을 지우면 화면은 원본 JSON 으로 돌아갑니다 */
function airDelete(email, deptId, slug, idx) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = airSheet();
    const at = airFindRow(sh, email, deptId, slug, Number(idx) || 0);
    if (at) sh.deleteRow(at);
  } finally { lock.releaseLock(); }
}

/* 사람마다 최소 간격을 두어, 실수로 연타했을 때 호출이 겹치지 않게 합니다 */
function airThrottle(email) {
  const cache = CacheService.getScriptCache();
  const k = 'air:' + email;
  const prev = Number(cache.get(k) || 0);
  const now = Date.now();
  if (prev && now - prev < AIR_MIN_GAP_MS) return false;
  cache.put(k, String(now), 60);
  return true;
}

/* 글의 결을 유지하기 위한 작성 규칙. data/insights 를 만들 때 쓴 것과 같은 기준입니다. */
function airRules() {
  return [
    '당신은 제주대 공과대학 교수진 안내 앱의 "AI 융합 방향" 문안을 다듬는 편집자입니다.',
    '',
    '읽는 사람은 변영철 교수(컴퓨터공학·인공지능 전공)입니다. 다른 학과 교수를 만나 대화할 때 쓸 실마리로 읽습니다.',
    'AI 쪽은 전문가이므로 AI 용어는 설명할 필요가 없고, 상대 교수 전공의 용어를 푸는 데 지면을 씁니다.',
    '',
    '항목은 세 칸으로 되어 있습니다.',
    '- title: 짧은 제목 (14자 이내)',
    '- term: 용어 풀이. 낯선 말이 무엇을 가리키는지 풀고, 그래서 지금은 무엇을 사람 손으로 하고 있으며 왜 그럴 수밖에 없는지까지 씁니다. 160~280자.',
    '- concl: 결론. "~하는 대신, ~해 줍니다" 꼴의 한두 문장. 40~120자. 문장을 "따라서"로 시작하지 않습니다.',
    '',
    '지켜야 할 것:',
    '- 아이디어를 새로 만들지 말고, 원문이 말하는 그 아이디어를 더 알기 쉽게 다듬기만 합니다.',
    '- 상대 전공의 용어는 피하지 말고 한 번 언급한 뒤 곧바로 풉니다. 용어를 통째로 빼면 면담에서 그 단어를 쓸 수 없습니다.',
    '- AI 기법 이름(PINN, GNN, 확산모델, 베이즈 최적화, RAG, 트랜스포머 등)은 쓰지 말고 하는 일로 풀어 씁니다.',
    '- 금지 표현: 혁신적, 획기적, 패러다임, 극대화, 인사이트, 솔루션.',
    '- 단정("~한다")보다 여지를 두는 말투("~해 볼 수 있습니다", "~하는 쪽입니다")를 씁니다.',
    '- 확실하지 않은 수치나 사실을 지어내지 않습니다. 모르는 대목은 두루뭉술하게 둡니다.',
    '- 꼭 짚어야 할 말은 **굵게** 로 감싸 강조할 수 있습니다. 한 항목에 많아야 두세 군데만 쓰고, 문장 전체를 감싸지 않습니다.',
    '- 그 밖의 마크다운(제목 #, 목록 -, 기울임 *, 링크, 코드블록)은 쓰지 않습니다. 줄바꿈 없이 이어지는 문단으로 씁니다.',
    '',
    '출력은 JSON 객체 하나뿐입니다. 설명 문장, 코드펜스, 그 밖의 어떤 글도 덧붙이지 마세요.',
    '{"title":"...","term":"...","concl":"..."}'
  ].join('\n');
}

function airPrompt(b) {
  return [
    '## 지금 들어 있는 항목',
    '제목: ' + b.title,
    '용어 풀이: ' + b.term,
    '결론: ' + b.concl,
    '',
    '## 교수님이 요청한 수정 방향',
    b.hint,
    '',
    '위 요청을 반영해 이 항목을 다시 써 주세요. JSON 객체만 출력합니다.'
  ].join('\n');
}

/* Claude API 호출. 키는 스크립트 속성 ANTHROPIC_KEY 에 둡니다. */
function airCallClaude(sys, user) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');
  if (!key) return { error: 'API 키가 설정되지 않았습니다 (스크립트 속성 ANTHROPIC_KEY)' };
  let res;
  try {
    res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: AIR_MODEL,
        max_tokens: 1200,
        system: sys,
        messages: [{ role: 'user', content: user }],
      }),
      muteHttpExceptions: true,
    });
  } catch (err) {
    return { error: '모델을 부르지 못했습니다: ' + err.message };
  }
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code === 401 || code === 403) return { error: 'API 키가 거부되었습니다 (' + code + ')' };
  if (code === 429) return { error: '요청이 몰렸습니다. 잠시 뒤 다시 눌러 주세요' };
  if (code !== 200) return { error: '모델 응답 오류 (' + code + ')' };
  let body;
  try { body = JSON.parse(text); } catch (err) { return { error: '모델 응답을 읽지 못했습니다' }; }
  const parts = body && body.content;
  let outText = '';
  if (parts && parts.length) {
    for (let i = 0; i < parts.length; i++) if (parts[i] && parts[i].type === 'text') outText += parts[i].text;
  }
  if (!outText) return { error: '모델이 빈 응답을 보냈습니다' };
  return { text: outText };
}

/* 모델이 코드펜스를 붙이거나 앞뒤로 말을 덧붙여도 JSON 만 건져 냅니다 */
function airParse(t) {
  let s = String(t || '').trim();
  s = s.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let o;
  try { o = JSON.parse(s.slice(a, b + 1)); } catch (err) { return null; }
  const title = String(o.title == null ? '' : o.title).trim();
  const term = String(o.term == null ? '' : o.term).trim();
  const concl = String(o.concl == null ? '' : o.concl).trim();
  if (!title || !concl) return null;
  return { title: title.slice(0, 40), term: term.slice(0, 1200), concl: concl.slice(0, 400) };
}

function airewrite(email, body) {
  const deptId = String(body.dept_id || ''), slug = String(body.slug || '');
  const idx = Math.round(Number(body.idx) || 0);
  const hint = String(body.hint == null ? '' : body.hint).trim().slice(0, 1000);
  if (!deptId || !slug) return out({ error: 'missing key' });
  if (!(idx >= 0 && idx < AIR_MAX_ITEMS)) return out({ error: 'bad idx' });
  if (!hint) return out({ error: '어떻게 고칠지 적어 주세요' });
  if (!airThrottle(email)) return out({ error: '조금 전에 보낸 요청을 처리하는 중입니다. 잠시 뒤 다시 눌러 주세요' });

  const src = {
    title: String(body.title || '').slice(0, 200),
    term: String(body.term || '').slice(0, 2000),
    concl: String(body.concl || '').slice(0, 800),
    hint: hint,
  };
  const r = airCallClaude(airRules(), airPrompt(src));
  if (r.error) return out({ error: r.error });
  const v = airParse(r.text);
  if (!v) return out({ error: '모델이 형식에 맞지 않는 답을 보냈습니다. 다시 눌러 주세요' });

  v.hint = hint;
  airSave(email, deptId, slug, idx, v);
  return out({ ok: true, item: { title: v.title, term: v.term, concl: v.concl, hint: hint, updated_at: new Date().toISOString() } });
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
