/* ==========================================================
   제주대학교 교수진 안내 — 순수 JS 단일 페이지 앱
   데이터: Google Sheets(공개 시트) → CSV → 객체 배열
   라우팅: #/  |  #/dept/<dept_id>  |  #/dept/<dept_id>/prof/<slug>
   ========================================================== */
'use strict';

/* ---------- 설정 ---------- */
const CONFIG = {
  // Google 스프레드시트 ID (URL의 /d/ 와 /edit 사이 부분)
  SHEET_ID: '1YhXtXKg0SufowUr28Vx3y2bwSA5hP2FHIYg1ZPeJu6U',
  // 시트(탭) 이름. 비워 두면 첫 번째 탭을 읽습니다.
  SHEET_NAME: '',
  // 시트를 읽지 못할 때 사용할 로컬 백업 데이터
  FALLBACK_URL: 'data/professors.json',
  // 브라우저 캐시 시간(분). 시트를 고친 뒤 바로 확인하려면 새로고침 시 ?nocache=1
  CACHE_MINUTES: 30,
  // 리포지토리에 저장된 사진 목록(data/photos/manifest.json). 있으면 시트의 photo URL보다 우선 사용
  PHOTO_MANIFEST: 'data/photos/manifest.json',
  PHOTO_DIR: 'data/photos/',
  // ---- Google 로그인 (비워 두면 로그인 없이 동작) ----
  AUTH: {
    // Google Cloud 콘솔 > API 및 서비스 > 사용자 인증 정보 > OAuth 클라이언트 ID(웹 애플리케이션)
    CLIENT_ID: '626785532501-v1u8fi2n26sgti0ir43stlm9vnnj6ru9.apps.googleusercontent.com',
    // 허용할 이메일(정확히 일치) — 예: ['yungcheolbyun@gmail.com']
    ALLOWED_EMAILS: ['yungcheolbyun@gmail.com'],
    // 허용할 도메인 — 예: ['jejunu.ac.kr'] (이 도메인 메일은 모두 통과). 둘 다 비우면 구글 로그인만 하면 통과
    ALLOWED_DOMAINS: ['jejunu.ac.kr'],
    // 로그인 유지 시간(시간)
    SESSION_HOURS: 24 * 365, // 앱을 열 때마다 이 기간만큼 다시 연장되므로 사실상 계속 유지
  },
  // ---- 선호도 저장 (Apps Script 웹 앱 URL. 비워 두면 브라우저에만 저장) ----
  RATINGS: {
    API_URL: 'https://script.google.com/macros/s/AKfycbxZ8o3y0cEJEC_GrrS_Pyor-CRtwEs3KTrtyfLrKG0qi6n2HA1DTgZ75Q0S3YIwii9-/exec',
    // 선호도 값과 뜻. 비(평가제외)는 연구년 등으로 이번 평가에서 빠지는 경우
    LABELS: ['확', '중', '모', '부', '비'],
    NAMES: { '확': '확실', '중': '보통', '모': '모름', '부': '부정', '비': '연구년 등으로 제외' },
    // 예전에 저장된 값(상/하)은 자동으로 새 값으로 읽음
    LEGACY: { '상': '확', '하': '모' },
    // 다른 기기에서 바꾼 선호도를 다시 읽는 주기(초). 화면이 보일 때만 동작
    SYNC_SEC: 60,
  },
};

/* ---------- 상태 ---------- */
const state = { rows: [], depts: [], source: '', query: '', rankFilter: '전체', ratingFilter: '전체', favOnly: false, localPhotos: new Set(), ratings: new Map(), notes: new Map(), aiEdits: new Map(), session: null };
const $app = document.getElementById('app');
const $status = document.getElementById('dataStatus');
const $q = document.getElementById('q');
const $drawer = document.getElementById('drawer');
const $panel = $drawer.querySelector('.drawer__panel');

/* ---------- 유틸 ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slugify = s => String(s).toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
const splitList = s => String(s ?? '').split(/[;,]\s*|\n/).map(x => x.trim()).filter(Boolean);
const RANK_ORDER = { '교수': 0, '부교수': 1, '조교수': 2 };
const initial = name => String(name || '?').trim().charAt(0);

/* RFC4180 호환 간이 CSV 파서 (따옴표 안의 줄바꿈·쉼표 처리) */
function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && n === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = (rows.shift() || []).map(h => h.trim());
  return rows.filter(r => r.some(v => v && v.trim()))
             .map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/* 원시 행 → 정규화된 교수 객체 */
function normalize(rows) {
  return rows
    .filter(r => r.name && r.dept_id)
    .map(r => {
      const slug = slugify(r.name_en || r.name);
      const key = `${r.dept_id}/${slug}`;
      const local = state.localPhotos.has(key) ? `${CONFIG.PHOTO_DIR}${key}.jpg` : '';
      return {
      ...r,
      slug,
      // 로컬 사진이 있으면 먼저 쓰고, 실패하면 시트의 photo URL로 대체
      photo: local || r.photo,
      photo_alt: local && r.photo && r.photo !== local ? r.photo : '',
      order: Number(r.order) || 999,
      tags: splitList(r.tags),
      papers: [r.paper1, r.paper2, r.paper3, r.paper4, r.paper5]
        .filter(Boolean)
        .map(p => { const [t, j, y] = p.split('|').map(s => s.trim()); return { t, j, y }; }),
    }; });
}

/* 사진 로딩 실패 시: 대체 URL이 있으면 한 번 바꿔 보고, 없으면 mode에 따라 처리 */
function photoErr(img, mode) {
  const alt = img.dataset.alt;
  if (alt) { img.dataset.alt = ''; img.src = alt; return; }
  if (mode === 'initial') img.parentNode.textContent = img.dataset.initial || '?';
  else img.remove();
}

async function loadPhotoManifest() {
  if (state.localPhotos.size) return;
  try {
    const res = await fetch(CONFIG.PHOTO_MANIFEST, { cache: 'no-store' });
    if (res.ok) state.localPhotos = new Set(await res.json());
  } catch {}
}

function buildDepts(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.dept_id)) {
      map.set(r.dept_id, { id: r.dept_id, name: r.dept_name, en: r.dept_name_en, url: r.dept_url, color: r.dept_color || '#1f8a5b', profs: [], tagCount: new Map() });
    }
    const d = map.get(r.dept_id);
    d.profs.push(r);
    r.tags.forEach(t => d.tagCount.set(t, (d.tagCount.get(t) || 0) + 1));
  }
  for (const d of map.values()) {
    d.profs.sort((a, b) => (RANK_ORDER[a.rank] ?? 9) - (RANK_ORDER[b.rank] ?? 9) || a.order - b.order);
    d.topTags = [...d.tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0]);
  }
  return [...map.values()];
}

/* ---------- 데이터 로딩 ---------- */
async function fetchSheet() {
  const base = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}`;
  const sheetQ = CONFIG.SHEET_NAME ? `&sheet=${encodeURIComponent(CONFIG.SHEET_NAME)}` : '';
  const urls = [
    `${base}/gviz/tq?tqx=out:csv${sheetQ}&_=${Date.now()}`,
    `${base}/export?format=csv&_=${Date.now()}`,
  ];
  let lastErr;
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (/<html/i.test(text.slice(0, 200))) throw new Error('시트가 공개되지 않았습니다');
      const rows = parseCSV(text);
      if (!rows.length || !('name' in rows[0])) throw new Error('시트 형식이 올바르지 않습니다');
      return rows;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function loadData() {
  await loadPhotoManifest();
  const nocache = new URLSearchParams(location.search).has('nocache');
  const key = 'jnu-faculty-cache';
  if (!nocache) {
    try {
      const c = JSON.parse(localStorage.getItem(key) || 'null');
      if (c && Date.now() - c.t < CONFIG.CACHE_MINUTES * 60e3 && Array.isArray(c.rows) && c.rows.length) {
        apply(c.rows, 'cache');
        refreshInBackground(key);
        return;
      }
    } catch {}
  }
  try {
    const rows = await fetchSheet();
    apply(rows, 'sheet');
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), rows })); } catch {}
  } catch (e) {
    console.warn('Google Sheet 로딩 실패:', e.message);
    try {
      const res = await fetch(CONFIG.FALLBACK_URL, { cache: 'no-store' });
      apply(await res.json(), 'fallback');
    } catch (e2) {
      state.rows = []; state.depts = []; state.source = 'error';
      setStatus('error');
      render();
    }
  }
}

async function refreshInBackground(key) {
  try {
    const rows = await fetchSheet();
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), rows }));
    if (JSON.stringify(rows) !== JSON.stringify(state.rawRows)) apply(rows, 'sheet');
    else setStatus('sheet');
  } catch {}
}

function apply(rawRows, source) {
  state.rawRows = rawRows;
  state.rows = normalize(rawRows);
  state.depts = buildDepts(state.rows);
  state.source = source;
  setStatus(source);
  render();
}

/* 새로 고침 버튼: 캐시를 지우고 시트에서 다시 읽음 */
const refreshBtn = document.getElementById('refreshBtn');
async function refreshNow() {
  refreshBtn?.classList.add('busy');
  setStatus('loading');
  try { localStorage.removeItem('jnu-faculty-cache'); } catch {}
  try {
    const rows = await fetchSheet();
    apply(rows, 'sheet');
    try { localStorage.setItem('jnu-faculty-cache', JSON.stringify({ t: Date.now(), rows })); } catch {}
    loadRatings(); // 선호도도 시트에서 다시 읽어 합침
    flashStatus(`새로 고침 완료 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`);
  } catch (e) {
    if (state.rows.length) { setStatus(state.source === 'sheet' ? 'sheet' : 'fallback'); flashStatus('시트를 읽지 못했습니다 — 공개 설정을 확인하세요', true); }
    else loadData();
  } finally {
    setTimeout(() => refreshBtn?.classList.remove('busy'), 400);
  }
}
refreshBtn?.addEventListener('click', refreshNow);

/* 좌상단 로고(J) 클릭: 첫 화면으로 돌아가면서 시트에서 데이터 새로 고침 */
document.querySelector('.brand').addEventListener('click', e => {
  e.preventDefault();
  $q.value = ''; state.query = ''; state.rankFilter = '전체';
  if (location.hash && location.hash !== '#/') location.hash = '#/'; else render();
  refreshNow();
});

let flashTimer;
function flashStatus(msg, warn = false) {
  clearTimeout(flashTimer);
  const prevCls = $status.className, prevMsg = $status.textContent;
  $status.className = 'foot__status ' + (warn ? 'warn' : 'ok');
  $status.textContent = msg;
  flashTimer = setTimeout(() => { $status.className = prevCls; $status.textContent = prevMsg; }, 3000);
}

function setStatus(src) {
  const map = {
    loading: ['', '시트에서 최신 데이터 불러오는 중…'],
    sheet: ['ok', `Google 시트에서 불러옴 · 교수 ${state.rows.length}명`],
    cache: ['ok', `최근 데이터 표시 중 · 교수 ${state.rows.length}명 (백그라운드 갱신)`],
    fallback: ['warn', `시트를 읽지 못해 백업 데이터를 표시합니다 · 교수 ${state.rows.length}명`],
    error: ['warn', '데이터를 불러오지 못했습니다'],
  };
  const [cls, msg] = map[src] || ['', ''];
  $status.className = 'foot__status ' + cls;
  $status.textContent = msg;
}

/* ---------- 라우팅 ---------- */
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'dept' && parts[1]) {
    return { view: 'dept', dept: decodeURIComponent(parts[1]), prof: parts[2] === 'prof' && parts[3] ? decodeURIComponent(parts[3]) : null };
  }
  if (parts[0] === 'stats') return { view: 'stats' };
  if (parts[0] === 'quiz') return { view: 'quiz' };
  return { view: 'home' };
}

function render() {
  const r = route();
  document.body.classList.toggle('is-home', r.view === 'home' && !state.query.trim()); // 첫 화면에서는 새로고침 아이콘 숨김(J 로고가 대신함)
  if (!state.rows.length && state.source !== 'error') { renderSkeleton(r); return; }
  if (r.view === 'dept') {
    const d = state.depts.find(x => x.id === r.dept);
    if (!d) { location.hash = '#/'; return; }
    renderDept(d);
    const p = r.prof ? d.profs.find(x => x.slug === r.prof) : null;
    p ? openDrawer(p, d) : closeDrawer(false);
  } else if (r.view === 'stats') {
    renderStats();
    closeDrawer(false);
  } else if (r.view === 'quiz') {
    renderQuiz();
    closeDrawer(false);
  } else {
    renderHome();
    closeDrawer(false);
  }
  document.querySelectorAll('[data-nav]').forEach(a => a.setAttribute('aria-current', a.dataset.nav === r.view ? 'page' : 'false'));
  window.scrollTo({ top: 0 });
}

/* ---------- 화면: 이름 맞히기 퀴즈 ----------
 * 사진을 보고 이름을 맞힙니다. 힌트를 누를 때마다 학과 → 성 → 이름 첫 글자 → 두 번째 글자… 순으로 열립니다.
 * 점수: 정답 100점에서 힌트 1개당 25점, 오답 1회당 10점을 빼고 최소 10점. 정답을 보면 0점. */
const QUIZ_BASE = 100, QUIZ_HINT = 25, QUIZ_WRONG = 10, QUIZ_MIN = 10;
const QUIZ_DEPTS_KEY = 'jnu-quiz-depts2', QUIZ_EX_KEY = 'jnu-quiz-ex';
const QUIZ_OFF_DEPTS = ['ce']; // 기본으로 꺼 두는 학과(본인 학과라 굳이 외울 필요 없음). 칩을 누르면 켤 수 있다
const quiz = { depts: null, ex: null, deck: [], res: [], i: 0, hints: 0, wrong: 0, state: 'ask', score: 0, correct: 0, hintTotal: 0, picking: false, pickingP: false };

function quizDepts() {
  if (quiz.depts) return quiz.depts;
  try { const v = JSON.parse(localStorage.getItem(QUIZ_DEPTS_KEY) || 'null'); if (Array.isArray(v)) quiz.depts = new Set(v); } catch {}
  if (!quiz.depts) {
    quiz.depts = new Set(state.depts.map(d => d.id).filter(id => !QUIZ_OFF_DEPTS.includes(id)));
    try { localStorage.removeItem('jnu-quiz-depts'); } catch {} // 예전 키 정리
  }
  return quiz.depts;
}
function quizSaveDepts() { try { localStorage.setItem(QUIZ_DEPTS_KEY, JSON.stringify([...quizDepts()])); } catch {} saveSetting(SET_QD, settingValue(SET_QD)); }
/* 학과 안에서 개별로 뺀 교수들 (제외 방식이라 학과를 새로 켜면 그 학과 교수는 모두 포함된 상태로 시작) */
function quizEx() {
  if (quiz.ex) return quiz.ex;
  try { const v = JSON.parse(localStorage.getItem(QUIZ_EX_KEY) || 'null'); if (Array.isArray(v)) quiz.ex = new Set(v); } catch {}
  if (!quiz.ex) quiz.ex = new Set();
  return quiz.ex;
}
function quizSaveEx() { try { const e = quizEx(); e.size ? localStorage.setItem(QUIZ_EX_KEY, JSON.stringify([...e])) : localStorage.removeItem(QUIZ_EX_KEY); } catch {} saveSetting(SET_QX, settingValue(SET_QX)); }
/* 학과가 켜져 있고 사진이 있는 교수 = 선택 후보 */
function quizCandidates() {
  const sel = quizDepts();
  return state.rows.filter(p => p.photo && sel.has(p.dept_id));
}
function quizPool() {
  const ex = quizEx();
  return quizCandidates().filter(p => !ex.has(rKey(p)));
}
function quizStart() {
  speechStop(); quiz.heard = ''; quiz.micErr = '';
  const pool = quizPool().slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  Object.assign(quiz, { deck: pool, res: [], i: 0, hints: 0, wrong: 0, state: 'ask', score: 0, correct: 0, hintTotal: 0 });
}
const quizCur = () => quiz.deck[quiz.i];
/* 앞뒤로 이동. 지금 문제의 상태를 quiz.res 에 넣어 두고 가려는 문제의 상태를 꺼내 온다.
 * 이미 맞힌 문제로 되돌아가도 폼이 잠겨 있어 점수가 두 번 오르지 않고,
 * 건너뛴 문제로 돌아가면 다시 풀 수 있다. */
function quizSnap() {
  if (quiz.i < quiz.deck.length)
    quiz.res[quiz.i] = { hints: quiz.hints, wrong: quiz.wrong, state: quiz.state, gained: quiz.gained, heard: quiz.heard };
}
function quizGo(step) {
  speechStop(); quizSnap();
  quiz.i = Math.max(0, Math.min(quiz.deck.length, quiz.i + step));
  const r = quiz.res[quiz.i];
  Object.assign(quiz, r ? { ...r } : { hints: 0, wrong: 0, state: 'ask', gained: 0, heard: '' });
  quiz.micErr = '';
  renderQuiz();
}
/* 답을 맞히지 않고 넘기면 그 문제는 점수 없이 지나간다 */
const quizNext = () => quizGo(1);
const quizPrev = () => quizGo(-1);
const quizStateAt = i => (i === quiz.i ? quiz.state : (quiz.res[i] || {}).state || 'ask');
const quizMaxHints = p => 1 + p.name.length;              // 1: 학과, 그다음 한 글자씩
const quizQScore = () => Math.max(QUIZ_MIN, QUIZ_BASE - quiz.hints * QUIZ_HINT - quiz.wrong * QUIZ_WRONG);
const quizNorm = v => String(v || '').replace(/[\s,·.]/g, '').toLowerCase();
/* 힌트로 열린 글자. 사진 밑 네모 칸은 없앴고(2026-09-20) 힌트 줄에 글로 보여 준다.
 * 힌트 1은 학과, 그다음부터 한 글자씩 열린다. 아직 안 열린 자리는 ○. */
function quizLetters(p, hints) {
  const k = Math.max(0, Math.min(hints - 1, p.name.length));
  return k ? p.name.split('').map((c, i) => i < k ? esc(c) : '○').join('') : '';
}

/* ---------- 음성으로 이름 맞히기 ----------
 * 브라우저 내장 음성 인식(Web Speech API)을 씁니다. 크롬·사파리에서 동작하고 파이어폭스는 지원하지 않습니다.
 * 한국어 이름은 잘못 들리는 일이 잦아서, 후보를 여러 개 받아 자모 단위로 한 글자 차이까지 정답으로 봅니다.
 * 잘못 들었을 때는 오답으로 치지 않고 들은 말을 입력칸에 넣어 주기만 합니다. */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechOK = () => !!SR;
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ', JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
function jamo(str) {
  let o = '';
  for (const c of String(str)) {
    const k = c.charCodeAt(0) - 0xAC00;
    if (k >= 0 && k < 11172) { o += CHO[Math.floor(k / 588)] + JUNG[Math.floor((k % 588) / 28)] + (JONG[k % 28] || '').trim(); }
    else o += c;
  }
  return o;
}
function lev(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/* 들은 말이 이름과 같다고 볼 수 있는가 — 글자 수가 같고 자모 차이가 1 이하 */
function nameHeard(said, name) {
  const a = quizNorm(said), b = quizNorm(name);
  if (!a) return false;
  if (a === b) return true;
  if ([...a].length !== [...b].length) return false;
  return lev(jamo(a), jamo(b)) <= 1;
}

let rec = null, recGen = 0, recTimer = null;

function speechStop() {
  recGen++;                                   // 이 뒤에 도착하는 결과는 무시
  clearTimeout(recTimer); recTimer = null;
  const r = rec; rec = null; quiz.listening = false;
  if (r) { r.onresult = r.onerror = r.onend = null; try { r.abort ? r.abort() : r.stop(); } catch {} }
}

function speechStart() {
  if (!SR || quiz.listening) return;
  const p = quizCur();
  if (!p || quiz.state !== 'ask') return;
  let r;
  try { r = new SR(); } catch { quiz.micErr = '이 브라우저에서는 음성 인식을 쓸 수 없습니다'; renderQuiz(); return; }
  const gen = ++recGen;
  const stale = () => gen !== recGen;
  /* 어떤 핸들러에서 예외가 나도 '듣는 중'에 갇히지 않도록 전부 감싼다 */
  const guard = fn => (...a) => { try { fn(...a); } catch (e) { console.warn('음성 인식 처리 오류:', e); if (!stale()) { speechStop(); quiz.micErr = '음성 인식 처리 중 문제가 생겼습니다'; renderQuiz(); } } };

  r.lang = 'ko-KR'; r.interimResults = false; r.maxAlternatives = 5; r.continuous = false;

  r.onresult = guard(e => {
    if (stale()) return;
    // SpeechRecognitionResult는 이터러블이 아니라 length + 인덱스로만 읽어야 한다
    const res = e.results && e.results[0];
    const alts = [];
    for (let i = 0; res && i < res.length; i++) {
      const t = res[i] && res[i].transcript;
      if (t && String(t).trim()) alts.push(String(t).trim());
    }
    speechStop();
    quiz.micErr = '';
    const hit = alts.find(t => nameHeard(t, p.name));
    if (hit) { quiz.gained = quizQScore(); quiz.score += quiz.gained; quiz.correct++; quiz.state = 'ok'; quiz.heard = hit; }
    else { quiz.heard = alts[0] || ''; if (!quiz.heard) quiz.micErr = '알아듣지 못했습니다 — 다시 말해 보세요'; } // 잘못 들어도 오답으로 치지 않는다
    if (quiz.state === 'ask') { const i = $app.querySelector('#qzIn'); if (i) { i.value = quiz.heard; i.focus(); } }
    renderQuiz();
  });

  r.onerror = guard(ev => {
    if (stale()) return;
    const code = ev && ev.error;
    if (code === 'aborted') { speechStop(); renderQuiz(); return; }   // 사용자가 중지한 경우
    speechStop();
    quiz.micErr = code === 'not-allowed' || code === 'service-not-allowed' ? '마이크 권한이 거부되었습니다 — 주소창의 자물쇠에서 허용해 주세요'
      : code === 'no-speech' ? '소리가 들리지 않았습니다'
      : code === 'audio-capture' ? '마이크를 찾지 못했습니다'
      : code === 'network' ? '네트워크 문제로 음성 인식에 실패했습니다'
      : '음성 인식에 실패했습니다';
    renderQuiz();
  });

  r.onend = guard(() => { if (stale() || !quiz.listening) return; speechStop(); renderQuiz(); });

  // 시작을 먼저 하고(사용자 제스처 안에서) 그다음 화면을 그린다
  try { r.start(); } catch (e) { console.warn('음성 인식 시작 실패:', e); quiz.micErr = '음성 인식을 시작하지 못했습니다'; renderQuiz(); return; }
  rec = r; quiz.listening = true; quiz.heard = ''; quiz.micErr = '';
  recTimer = setTimeout(() => { if (!stale() && quiz.listening) { speechStop(); quiz.micErr = '시간이 지나 중지했습니다 — 다시 눌러 주세요'; renderQuiz(); } }, 12000);
  renderQuiz();
}

/* 사진(카드)을 옆으로 미는 동작. 왼쪽으로 밀면 다음 문제, 오른쪽으로 밀면 이전 문제.
 * 세로로 움직이면 평소대로 화면이 스크롤된다 */
let swipeGuard = false;
function bindSwipe(card) {
  if (!card) return;
  const photo = card.querySelector('.qz-photo') || card;
  let x0 = null, y0 = null, dir = 0;   // dir: 0 미정, 1 가로, 2 세로
  const reset = () => { card.style.transition = 'transform .18s var(--ease)'; card.style.transform = ''; x0 = y0 = null; dir = 0; };
  photo.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dir = 0;
    card.style.transition = 'none';
  }, { passive: true });
  photo.addEventListener('touchmove', e => {
    if (x0 === null) return;
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    if (!dir && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) dir = Math.abs(dx) > Math.abs(dy) ? 1 : 2;
    if (dir !== 1) return;
    e.preventDefault();                                   // 가로로 밀 때만 스크롤을 막는다
    card.style.transform = `translateX(${dx > 0 && quiz.i === 0 ? dx * 0.25 : dx}px)`;   // 첫 문제에서 오른쪽은 갈 곳이 없으므로 덜 끌린다
  }, { passive: false });
  photo.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = (e.changedTouches[0] || {}).clientX - x0;
    const go = dir !== 1 || Math.abs(dx) <= 60 ? 0 : dx < 0 ? 1 : quiz.i > 0 ? -1 : 0;
    reset();
    if (go) { swipeGuard = true; setTimeout(() => { swipeGuard = false; }, 500); quizGo(go); }
  });
  photo.addEventListener('touchcancel', reset);
}

function renderQuiz() {
  if (!state.rows.length) return;
  const pool = quizPool();
  const sel = quizDepts();
  const ex = quizEx();
  const cand = quizCandidates();
  const caret = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const byDept = state.depts.filter(d => sel.has(d.id)).map(d => [d, cand.filter(p => p.dept_id === d.id)]).filter(([, ps]) => ps.length);
  const picker = `
    <div class="qz-picker ${quiz.picking ? 'open' : ''}">
      <button type="button" class="qz-picker__t" id="qzPick" aria-expanded="${quiz.picking}">
        학과 선택 <b>${sel.size}/${state.depts.length}</b>${caret}
      </button>
      ${quiz.picking ? `<div class="qz-picker__b">
        <div class="qz-dchips">
          ${state.depts.map(d => `<button type="button" class="qz-dchip" data-d="${esc(d.id)}" aria-pressed="${sel.has(d.id)}" style="--dept-color:${esc(d.color)}">${esc(d.name)}<span class="n">${d.profs.length}</span></button>`).join('')}
        </div>
        <div class="qz-dacts"><button type="button" class="btn" data-dall>전체 선택</button><button type="button" class="btn" data-dnone>전체 해제</button></div>
        <p class="st-note">학과를 바꾸면 게임이 새로 시작됩니다. 학과를 켜면 그 학과 교수는 모두 포함됩니다.</p>
      </div>` : ''}
    </div>
    <div class="qz-picker ${quiz.pickingP ? 'open' : ''}">
      <button type="button" class="qz-picker__t" id="qzPickP" aria-expanded="${quiz.pickingP}">
        교수 <b>${pool.length}</b>/${cand.length}명${caret}
      </button>
      ${quiz.pickingP ? (byDept.length ? `<div class="qz-picker__b">
        ${byDept.map(([d, ps]) => {
          const on = ps.filter(p => !ex.has(rKey(p))).length;
          return `<div class="qz-pgroup" style="--dept-color:${esc(d.color)}">
            <div class="qz-pgroup__h"><b>${esc(d.name)}</b><span class="n">${on}/${ps.length}</span>
              <button type="button" class="qz-mini" data-pall="${esc(d.id)}">모두</button><button type="button" class="qz-mini" data-pnone="${esc(d.id)}">해제</button></div>
            <div class="qz-pchips">${ps.map(p => `<button type="button" class="qz-pchip" data-p="${esc(rKey(p))}" aria-pressed="${!ex.has(rKey(p))}">${esc(p.name)}</button>`).join('')}</div>
          </div>`;
        }).join('')}
        <div class="qz-dacts"><button type="button" class="btn" data-pallall>전체 선택</button><button type="button" class="btn" data-pnoneall>전체 해제</button></div>
        <p class="st-note">개별로 뺀 교수는 다음에도 기억됩니다.</p>
      </div>` : `<div class="qz-picker__b"><p class="st-note">먼저 학과를 선택해 주세요.</p></div>`) : ''}
    </div>`;

  if (!pool.length) {
    $app.innerHTML = `<div class="view quiz"><div class="crumbs"><a href="#/">학과 목록</a><span class="sep">/</span><span>이름 맞히기</span></div>
      <div class="empty"><strong>출제할 교수가 없습니다</strong>학과를 하나 이상 선택하고, 교수 목록에서 최소 한 명은 켜 주세요.</div>
      ${picker}</div>`;
    bindQuiz(); return;
  }
  if (!quiz.deck.length || quiz.deck.some(p => !sel.has(p.dept_id) || ex.has(rKey(p)))) quizStart();

  const done = quiz.i >= quiz.deck.length;
  const p = done ? null : quizCur();
  const d = p ? state.depts.find(x => x.id === p.dept_id) : null;
  const max = p ? quizMaxHints(p) : 0;
  const asked = quiz.deck.reduce((n, _, i) => n + (quizStateAt(i) === 'ask' ? 0 : 1), 0);
  const head = `
    <div class="qz-score">
      <div class="qz-score__n">${quiz.score}<small>점</small></div>
      <div class="qz-score__m">
        <span>맞힘 <b>${quiz.correct}</b>/${asked}</span>
        <span>힌트 <b>${quiz.hintTotal}</b>개</span>
        <span>진행 <b>${Math.min(quiz.i + 1, quiz.deck.length)}</b>/${quiz.deck.length}</span>
      </div>
      <div class="meter" aria-label="진행률"><span style="width:${Math.round(quiz.i / quiz.deck.length * 100)}%"></span></div>
    </div>`;

  const body = done ? `
    <div class="qz-end">
      <div class="qz-end__n">${quiz.score}<small>점</small></div>
      <p>${quiz.deck.length}명 중 <b>${quiz.correct}명</b>을 맞혔습니다 · 힌트 ${quiz.hintTotal}개 사용 · 평균 ${Math.round(quiz.score / quiz.deck.length)}점</p>
      <button type="button" class="qz-btn qz-btn--go" data-restart>다시 하기</button>
    </div>` : `
    <div class="qz-card" style="--dept-color:${esc(d ? d.color : '#1f8a5b')}">
      <div class="qz-photo ${quiz.state === 'ask' && quiz.hints < max ? 'qz-photo--tap' : ''}"${quiz.state === 'ask' && quiz.hints < max ? ' data-hint role="button" tabindex="0" title="사진을 누르면 힌트가 하나 열립니다" aria-label="힌트 열기"' : ''}>
        <div class="avatar" aria-hidden="true">?</div>
        <img src="${esc(p.photo)}" data-alt="${esc(p.photo_alt)}" alt="교수 사진" onload="this.classList.add('loaded')" onerror="photoErr(this,'remove')">
      </div>
      <div class="qz-main">
        <div class="qz-hintline" aria-live="polite">${
          quiz.state !== 'ask' ? `${esc(p.dept_name)} · ${esc(p.rank)}`
          : quiz.hints >= 1 ? [esc(p.dept_name), quizLetters(p, quiz.hints)].filter(Boolean).join(' · ')
          : ''}</div>
        <form class="qz-form" id="qzForm" autocomplete="off">
          <input type="text" id="qzIn" class="qz-in" placeholder="이름을 입력하세요" aria-label="이름 입력" autocomplete="off" autocapitalize="off" spellcheck="false"
            ${quiz.state === 'ask' ? '' : `value="${esc(p.name)}" disabled`}>
          ${speechOK() ? `<button type="button" class="qz-mic ${quiz.listening ? 'on' : ''}" data-mic ${quiz.state === 'ask' ? '' : 'disabled'} aria-label="${quiz.listening ? '듣는 중 — 눌러서 중지' : '음성으로 답하기'}" title="음성으로 답하기">
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>` : ''}
          <button type="submit" class="qz-btn qz-btn--go" ${quiz.state === 'ask' ? '' : 'disabled'}>확인</button>
        </form>

        <div class="qz-msg ${quiz.state === 'ok' ? 'ok' : quiz.state === 'give' ? 'warn' : quiz.listening ? 'live' : quiz.micErr || quiz.wrong ? 'warn' : ''}">${
          quiz.state === 'ok' ? `정답입니다 · +${quiz.gained}점${quiz.heard ? ` <span class="muted">(음성: ${esc(quiz.heard)})</span>` : ''}`
          : quiz.state === 'give' ? '정답을 공개했습니다 · 0점'
          : quiz.listening ? '듣는 중… 이름을 말해 보세요'
          : quiz.micErr ? esc(quiz.micErr)
          : quiz.heard ? `들은 말: <b>${esc(quiz.heard)}</b> — 맞으면 확인을 누르세요`
          : quiz.wrong ? `틀렸습니다 · ${quiz.wrong}회 · 이 문제 현재 ${quizQScore()}점` : `맞히면 ${quizQScore()}점`}</div>

        <div class="qz-acts">
          <button type="button" class="qz-btn" data-hint ${quiz.state !== 'ask' || quiz.hints >= max ? 'disabled' : ''}>힌트 (${quiz.hints}/${max})</button>
          ${quiz.state === 'ask'
            ? `<button type="button" class="qz-btn qz-btn--ghost" data-give>정답 보기</button>`
            : `<a class="qz-btn qz-btn--ghost" href="#/dept/${encodeURIComponent(p.dept_id)}/prof/${encodeURIComponent(p.slug)}">상세 보기</a>`}
          <button type="button" class="qz-btn qz-btn--ghost" data-prev ${quiz.i === 0 ? 'disabled' : ''} title="이전 문제로 돌아갑니다 (사진을 오른쪽으로 밀어도 됩니다)">← 이전</button>
          <button type="button" class="qz-btn ${quiz.state === 'ask' ? 'qz-btn--ghost' : 'qz-btn--go'}" data-skip title="${quiz.state === 'ask' ? '이 교수는 건너뜁니다 (사진을 왼쪽으로 밀어도 됩니다)' : '다음 문제'}">${quiz.state === 'ask' ? '다음 →' : quiz.i + 1 >= quiz.deck.length ? '결과 보기' : '다음 문제'}</button>
        </div>
      </div>
    </div>`;

  $app.innerHTML = `
    <div class="view quiz">
      <div class="crumbs"><a href="#/">학과 목록</a><span class="sep">/</span><span>이름 맞히기</span></div>
      ${body}
      ${head}
      ${picker}
      <div class="qz-foot"><button type="button" class="btn" data-restart>처음부터 다시</button></div>
    </div>`;
  bindQuiz();
  const inp = $app.querySelector('#qzIn');
  if (inp && !inp.disabled && !('ontouchstart' in window)) inp.focus();
}

function bindQuiz() {
  $app.querySelector('#qzPick')?.addEventListener('click', () => { quiz.picking = !quiz.picking; renderQuiz(); });
  $app.querySelector('#qzPickP')?.addEventListener('click', () => { quiz.pickingP = !quiz.pickingP; renderQuiz(); });
  const exApply = fn => { fn(quizEx()); quizSaveEx(); quizStart(); renderQuiz(); };
  $app.querySelectorAll('.qz-pchip').forEach(b => b.addEventListener('click', () => {
    exApply(e => { const k = b.dataset.p; e.has(k) ? e.delete(k) : e.add(k); });
  }));
  $app.querySelectorAll('[data-pall]').forEach(b => b.addEventListener('click', () =>
    exApply(e => quizCandidates().filter(p => p.dept_id === b.dataset.pall).forEach(p => e.delete(rKey(p))))));
  $app.querySelectorAll('[data-pnone]').forEach(b => b.addEventListener('click', () =>
    exApply(e => quizCandidates().filter(p => p.dept_id === b.dataset.pnone).forEach(p => e.add(rKey(p))))));
  $app.querySelector('[data-pallall]')?.addEventListener('click', () => exApply(e => quizCandidates().forEach(p => e.delete(rKey(p)))));
  $app.querySelector('[data-pnoneall]')?.addEventListener('click', () => exApply(e => quizCandidates().forEach(p => e.add(rKey(p)))));
  $app.querySelectorAll('.qz-dchip').forEach(b => b.addEventListener('click', () => {
    const s = quizDepts(), id = b.dataset.d;
    if (s.has(id)) s.delete(id);
    else { s.add(id); const e = quizEx(); state.rows.filter(p => p.dept_id === id).forEach(p => e.delete(rKey(p))); quizSaveEx(); }
    quizSaveDepts(); quizStart(); renderQuiz();
  }));
  $app.querySelector('[data-dall]')?.addEventListener('click', () => { quiz.depts = new Set(state.depts.map(d => d.id)); quiz.ex = new Set(); quizSaveDepts(); quizSaveEx(); quizStart(); renderQuiz(); });
  $app.querySelector('[data-dnone]')?.addEventListener('click', () => { quiz.depts = new Set(); quizSaveDepts(); quizStart(); renderQuiz(); });
  $app.querySelectorAll('[data-restart]').forEach(b => b.addEventListener('click', () => { speechStop(); quizStart(); renderQuiz(); }));
  bindSwipe($app.querySelector('.qz-card'));
  const takeHint = () => {
    if (swipeGuard) return;                       // 방금 민 동작이면 힌트로 치지 않는다
    const p = quizCur(); if (!p || quiz.state !== 'ask' || quiz.hints >= quizMaxHints(p)) return;
    quiz.hints++; quiz.hintTotal++;
    if (quiz.hints >= quizMaxHints(p)) { quiz.state = 'give'; quiz.gained = 0; } // 이름이 다 열리면 정답 공개
    renderQuiz();
  };
  $app.querySelectorAll('[data-hint]').forEach(el => {
    el.addEventListener('click', takeHint);
    if (el.tagName !== 'BUTTON') el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); takeHint(); } });
  });
  $app.querySelector('[data-give]')?.addEventListener('click', () => { speechStop(); quiz.heard = ''; quiz.state = 'give'; quiz.gained = 0; renderQuiz(); });
  $app.querySelector('[data-skip]')?.addEventListener('click', quizNext);
  $app.querySelector('[data-prev]')?.addEventListener('click', quizPrev);
  $app.querySelector('[data-mic]')?.addEventListener('click', () => { quiz.micErr = ''; quiz.listening ? speechStop() : speechStart(); });
  $app.querySelector('#qzForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const p = quizCur(), inp = $app.querySelector('#qzIn'), v = quizNorm(inp.value);
    if (!v) return;
    speechStop(); quiz.micErr = ''; quiz.heard = '';
    if (v === quizNorm(p.name) || (p.name_en && v === quizNorm(p.name_en))) {
      quiz.gained = quizQScore(); quiz.score += quiz.gained; quiz.correct++; quiz.state = 'ok';
    } else { quiz.wrong++; inp.value = ''; }
    renderQuiz();
  });
}

/* ---------- 화면: 분석 (선호도 시각화) ---------- */
const SCORE = { '확': 3, '중': 2, '모': 1, '부': -1 }; // 비(평가제외)는 점수 없음 → 평균·키워드 분석에서 제외
const hasScore = p => SCORE[getRating(p)] != null;
const RLABELS = () => [...CONFIG.RATINGS.LABELS, '미지정'];
const rcls = r => r === '미지정' ? 'none' : rClass(r);

/* ---------- 선호도 원그래프 ----------
 * '비'(평가제외)는 애초에 평가 대상이 아니므로 뺀다. 색은 화면 곳곳에서 쓰는 선호도 색과 같게 맞춘다. */
const RCOLOR = { '확': '#38831c', '중': '#0a7ab0', '모': '#6b7280', '부': '#c0392b', '미지정': '#b9c0cc' };
const PIE_LABELS = () => RLABELS().filter(r => r !== '비');

function donut(profs) {
  const c = dist(profs);
  const items = PIE_LABELS().map(r => ({ r, n: c[r] })).filter(x => x.n > 0);
  const total = items.reduce((a, b) => a + b.n, 0);
  if (!total) return '';
  const sure = c['확'] || 0, pct = Math.round(sure / total * 100);
  const R = 72, W = 24, CX = 100, CY = 112;
  const HALF = Math.PI * R, FULL = 2 * Math.PI * R;
  let off = 0;
  const arcs = items.map(({ r, n }) => {
    const len = n / total * HALF, seg = Math.max(0, len - (items.length > 1 ? 1.5 : 0));
    const a = `<circle class="pie__seg" r="${R}" cx="${CX}" cy="${CY}" fill="none" stroke="${RCOLOR[r]}" stroke-width="${W}"
      stroke-dasharray="${seg.toFixed(2)} ${(FULL - seg).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"
      transform="rotate(180 ${CX} ${CY})"><title>${esc(r)} ${n}명 (${Math.round(n / total * 100)}%)</title></circle>`;
    off += len;
    return a;
  }).join('');
  return `
    <div class="pie">
      <svg class="pie__svg" viewBox="0 0 200 138" role="img"
        aria-label="선호도 분포 — 확 ${sure}명으로 ${pct}%. ${items.map(x => `${x.r} ${x.n}명`).join(', ')} (평가제외 빼고 합계 ${total}명)">
        <circle r="${R}" cx="${CX}" cy="${CY}" fill="none" stroke="var(--surface-2)" stroke-width="${W}"
          stroke-dasharray="${HALF.toFixed(1)} ${HALF.toFixed(1)}" transform="rotate(180 ${CX} ${CY})"></circle>
        ${arcs}
        <text class="pie__n" x="100" y="100">${pct}%</text>
        <text class="pie__u" x="100" y="122">확(확실) · ${sure}명 / ${total}명</text>
      </svg>
      <div class="pie__legend">
        ${items.map(({ r, n }) => `<span class="pie__li"><i class="sw sw--${rcls(r)}"></i>${esc(r)} <b>${n}</b> <em>${Math.round(n / total * 100)}%</em></span>`).join('')}
      </div>
    </div>`;
}

function dist(profs) {
  const c = Object.fromEntries(RLABELS().map(r => [r, 0]));
  profs.forEach(p => { c[getRating(p) || '미지정']++; });
  return c;
}
function avgScore(profs) {
  const rated = profs.filter(hasScore);
  if (!rated.length) return null;
  return rated.reduce((a, p) => a + SCORE[getRating(p)], 0) / rated.length;
}
const fmt1 = n => n == null ? '–' : (Math.round(n * 100) / 100).toFixed(2);
/* 확(확실) 비율: 평가제외(연구년 등) 교수를 모수에서 뺀 뒤 계산 */
function sureRate(profs) {
  const pool = profs.filter(p => getRating(p) !== '비');
  const sure = pool.filter(p => getRating(p) === '확').length;
  // 50%가 되려면 확이 몇 명 더 필요한지 (모수는 그대로 두고 확만 늘어난다고 가정). 음수면 그만큼 여유
  const need = Math.ceil(pool.length / 2) - sure;
  return { pool: pool.length, sure, na: profs.length - pool.length, pct: pool.length ? Math.round(sure / pool.length * 1000) / 10 : null, need, rest: pool.length - sure };
}
const fmtPct = v => v == null ? '–' : (Number.isInteger(v) ? v : v.toFixed(1)) + '%';

/* opts.max 를 주면 막대 전체 길이를 '가장 큰 학과 = 100%' 기준으로 줄인다.
 * 그래야 학과별 규모 차이가 길이로 드러난다(예전에는 모두 100%를 채워 규모가 안 보였다). */
function stackBar(profs, opts = {}) {
  const c = dist(profs), total = profs.length || 1;
  const width = opts.max ? total / opts.max * 100 : 100;
  return `<div class="sbar" role="img" style="width:${width.toFixed(2)}%" aria-label="${esc(profs.length)}명 — ${esc(RLABELS().filter(r => c[r]).map(r => `${r} ${c[r]}`).join(', '))}">
    ${RLABELS().filter(r => c[r]).map(r => {
      const pct = c[r] / total * 100;          // 막대 안에서의 비율
      const abs = c[r] / (opts.max || total) * 100;   // 화면 전체 폭에서 차지하는 비율
      const link = opts.deptId ? ` data-go="${esc(opts.deptId)}" data-rating="${esc(r)}" tabindex="0" role="link"` : '';
      return `<span class="sbar__seg sbar__seg--${rcls(r)}" style="flex:${c[r]} 0 0"${link} title="${esc(r)} ${c[r]}명 (${Math.round(pct)}%)">${abs >= 4 ? c[r] : ''}</span>`;
    }).join('')}
  </div>`;
}

function tagStats() {
  const m = new Map(); // tag -> {scores:[], n}
  state.rows.filter(hasScore).forEach(p => p.tags.forEach(t => {
    if (!m.has(t)) m.set(t, []);
    m.get(t).push(SCORE[getRating(p)]);
  }));
  let list = [...m.entries()].map(([tag, arr]) => ({ tag, n: arr.length, avg: arr.reduce((a, b) => a + b, 0) / arr.length }));
  const minN = list.some(x => x.n >= 2) ? 2 : 1;
  list = list.filter(x => x.n >= minN).sort((a, b) => b.avg - a.avg || b.n - a.n);
  return { list, minN };
}

function renderStats() {
  const all = state.rows, rated = all.filter(getRating);
  const c = dist(all);
  const pct = all.length ? Math.round(rated.length / all.length * 100) : 0;
  const maxProfs = Math.max(1, ...state.depts.map(d => d.profs.length));   // 가장 큰 학과를 100% 로
  const legend = `<div class="legend" aria-label="범례">${RLABELS().map(r => `<span class="legend__i"><i class="sw sw--${rcls(r)}"></i>${esc(r)}</span>`).join('')}</div>`;

  $app.innerHTML = `
    <div class="view stats">
      <div class="crumbs"><a href="#/">학과 목록</a><span class="sep">/</span><span>분석</span></div>
      <div class="hero">
        <div class="legend legend--names" aria-label="선호도 뜻">${CONFIG.RATINGS.LABELS.map(r => {
          const txt = r === '비' ? `연구년 등으로 ${c[r]}명 제외` : CONFIG.RATINGS.NAMES[r];   // '비'만 실제 인원을 함께
          return `<span class="legend__i"><i class="sw sw--${rcls(r)}"></i><b>${esc(r)}</b> ${esc(txt)}</span>`;
        }).join('')}</div></div>

      ${!rated.length ? `<div class="empty"><strong>아직 선택한 선호도가 없습니다</strong>학과 화면에서 교수 카드의 ${CONFIG.RATINGS.LABELS.join('·')} 칩을 눌러 보세요. <a href="#/">학과 목록으로 →</a></div>` : ''}

      <section class="st-sec">
        ${donut(all)}
      </section>

      <section class="st-sec">
        <div class="st-head"><h2>학과별 분포</h2><span class="muted st-small">막대의 구간을 누르면 해당 학과가 그 선호도 필터로 열립니다</span>${legend}</div>
        <div class="st-rows">
          ${state.depts.map(d => `
            <div class="st-row" style="--dept-color:${esc(d.color)}">
              <div class="st-row__lbl"><a href="#/dept/${encodeURIComponent(d.id)}">${esc(d.name)}</a><small>(${d.profs.length}명)</small></div>
              ${stackBar(d.profs, { deptId: d.id, max: maxProfs })}
            </div>`).join('')}
        </div>
      </section>

      <section class="st-sec">
        <div class="st-head"><h2>선호도별 교수 목록</h2><button class="btn" type="button" id="csvBtn">CSV 내보내기</button></div>
        <div class="st-lists">
          ${CONFIG.RATINGS.LABELS.map(r => { const ps = all.filter(p => getRating(p) === r); return `
            <div class="st-list"><h3><i class="sw sw--${rcls(r)}"></i>${esc(r)} <span class="n">${ps.length}</span></h3>
              ${ps.length ? `<ul>${ps.map(p => `<li><a href="#/dept/${encodeURIComponent(p.dept_id)}/prof/${encodeURIComponent(p.slug)}">${esc(p.name)}<small>${esc(p.dept_name)} · ${esc(p.rank)}</small></a></li>`).join('')}</ul>` : `<div class="muted st-small">없음</div>`}
            </div>`; }).join('')}
        </div>
      </section>
    </div>`;

  $app.querySelectorAll('[data-go]').forEach(el => {
    const go = () => { state.ratingFilter = el.dataset.rating; state._keepRating = true; location.hash = `#/dept/${encodeURIComponent(el.dataset.go)}`; };
    el.addEventListener('click', go);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  $app.querySelector('#csvBtn')?.addEventListener('click', exportCsv);
}

function exportCsv() {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const head = ['학과', '이름', '영문명', '직급', '연구실', '전공 키워드', '선호도', '뜻', '점수', '만남 횟수', '메모'];
  const lines = [head.map(q).join(',')];
  state.rows.forEach(p => { const r = getRating(p); lines.push([p.dept_name, p.name, p.name_en, p.rank, p.office, p.tags.join('; '), r || '', r ? CONFIG.RATINGS.NAMES[r] || '' : '', SCORE[r] != null ? SCORE[r] : '', getMet(p) || '', getMemo(p)].map(q).join(',')); });
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `교수진_선호도_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- 화면: 스켈레톤 ---------- */
function renderSkeleton(r) {
  const n = r.view === 'dept' ? 6 : 2;
  const cls = r.view === 'dept' ? 'sk-prof' : 'sk-dept';
  $app.innerHTML = `<div class="view"><div class="hero"><div class="skeleton" style="height:36px;width:320px;margin-bottom:10px"></div><div class="skeleton" style="height:18px;width:480px"></div></div>
    <div class="${r.view === 'dept' ? 'prof-grid' : 'dept-grid'}">${Array.from({ length: n }, () => `<div class="skeleton ${cls}"></div>`).join('')}</div></div>`;
}

/* ---------- 화면: 홈(학과 목록 / 검색 결과) ---------- */
/* 첫 화면의 관심 교수 명단 — 사진·이름·학과·선호도를 한 줄 카드로. 누르면 상세로 간다. */
function favSection() {
  const list = state.rows.filter(isFav);
  if (!list.length) return '';
  const order = new Map([...favs()].map((k, i) => [k, i]));   // 관심으로 고른 순서
  list.sort((a, b) => order.get(rKey(a)) - order.get(rKey(b)));
  return `
    <section class="favsec">
      <div class="favsec__head">
        <h2><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20 6.5L9.2 17.3 4 12.1" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>관심 교수 <b>${list.length}</b>명</span></h2>
      </div>
      <div class="favsec__list">
        ${list.map(p => {
          const d = state.depts.find(x => x.id === p.dept_id);
          const r = getRating(p);
          const { loc } = officeParts(p.office);
          return `<div class="favw" style="--dept-color:${esc(d ? d.color : '#1f8a5b')}">
            <a class="favc" href="#/dept/${encodeURIComponent(p.dept_id)}/prof/${encodeURIComponent(p.slug)}">
            <span class="favc__ph">${p.photo
              ? `<img src="${esc(p.photo)}" data-alt="${esc(p.photo_alt)}" data-initial="${esc(initial(p.name))}" alt="" loading="lazy" onerror="photoErr(this,'initial')">`
              : esc(initial(p.name))}</span>
            <span class="favc__t"><b>${esc(p.name)}</b><small>${esc(p.dept_name)} · ${esc(p.rank)}</small>${loc ? `<small class="favc__loc"><svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>${esc(loc)}</small>` : ''}</span>
            ${r ? `<i class="rs rs--${rcls(r)}">${esc(r)}</i>` : ''}
            </a>
            <button type="button" class="favx" data-key="${esc(rKey(p))}" title="관심 해제" aria-label="${esc(p.name)} 관심 교수 해제">
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          </div>`;
        }).join('')}
      </div>
    </section>`;
}

function renderHome() {
  const q = state.query.trim().toLowerCase();
  if (q) return renderSearch(q);
  const total = state.rows.length;
  $app.innerHTML = `
    <div class="view home">
      <div class="hero hero--sum">
        <p>${state.depts.length}개 학과 · 전임교원 ${total}명${(() => { const na = state.rows.filter(p => getRating(p) === '비').length; return na ? ` · 비참여 ${na}명` : ''; })()}</p>
      </div>
      ${state.source === 'error' ? `<div class="empty"><strong>데이터를 불러오지 못했습니다</strong>Google 시트 공개 설정과 네트워크 연결을 확인해 주세요.</div>` : ''}
      ${favSection()}
      <div class="dept-list">
        ${state.depts.map(d => `
          <a class="drow" href="#/dept/${encodeURIComponent(d.id)}" style="--dept-color:${esc(d.color)}">
            <div class="drow__num">${d.profs.length}<small>명</small></div>
            <div class="drow__main">
              <h2 class="drow__name">${esc(d.name)}</h2>
              <div class="drow__tags">${d.topTags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
              ${ratingSummary(d)}
            </div>
            <div class="drow__avs" aria-hidden="true">
              ${d.profs.slice(0, 7).map(p => { const f = isFav(p) ? ' av--fav' : ''; return p.photo
                ? `<i class="av${f}"><img src="${esc(p.photo)}" data-alt="${esc(p.photo_alt)}" data-initial="${esc(initial(p.name))}" alt="" loading="lazy" onerror="photoErr(this,'initial')"></i>`
                : `<i class="av${f}">${esc(initial(p.name))}</i>`; }).join('')}
              ${d.profs.length > 7 ? `<i class="av av--more">+${d.profs.length - 7}</i>` : ''}
            </div>
            <span class="drow__arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </a>`).join('')}
      </div>
    </div>`;

  $app.querySelectorAll('.favx').forEach(b => b.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    const p = state.rows.find(x => rKey(x) === b.dataset.key);
    if (!p) return;
    toggleFav(p);
    renderHome();           // 명단·학과별 표시를 한 번에 다시 그린다
    flashStatus(`${p.name} 교수를 관심에서 해제했습니다`);
  }));
}

function matches(p, q) {
  const hay = [p.name, p.name_en, p.rank, p.tags.join(' '), p.summary, p.office, p.dept_name, p.papers.map(x => x.t).join(' ')].join(' ').toLowerCase();
  return q.split(/\s+/).every(w => hay.includes(w));
}

function renderSearch(q) {
  const hits = state.rows.filter(p => matches(p, q));
  $app.innerHTML = `
    <div class="view">
      <div class="crumbs"><a href="#/" data-clear>← 학과 목록</a></div>
      <div class="hero"><div class="eyebrow">검색 결과</div><h1>“${esc(state.query.trim())}”</h1><p>${hits.length}명의 교수가 검색되었습니다.</p></div>
      ${hits.length ? `<div class="prof-grid">${hits.map(p => profCard(p, state.depts.find(d => d.id === p.dept_id), true)).join('')}</div>`
                    : `<div class="empty"><strong>검색 결과가 없습니다</strong>교수명, 전공 키워드, 연구실 위치로 검색해 보세요.</div>`}
    </div>`;
  bindCards();
}

/* ---------- 화면: 학과 교수 목록 ---------- */
function renderDept(d) {
  const ranks = ['전체', ...Object.keys(RANK_ORDER).filter(r => d.profs.some(p => p.rank === r))];
  const list = d.profs.filter(p => (state.rankFilter === '전체' || p.rank === state.rankFilter) && matchRating(p) && (!state.favOnly || isFav(p)));
  const rf = ['전체', ...CONFIG.RATINGS.LABELS, '미지정'];
  $app.innerHTML = `
    <div class="view" style="--dept-color:${esc(d.color)}">
      <div class="crumbs"><a href="#/">학과 목록</a><span class="sep">/</span><span>${esc(d.name)}</span></div>
      <div class="dept-hero">
        <div>
          <div class="eyebrow">${esc(d.en || 'Department')}</div>
          <h1>${esc(d.name)}</h1>
          <div class="sub">전임교원 ${d.profs.length}명${d.url ? ` · <a href="${esc(d.url)}" target="_blank" rel="noopener">학과 홈페이지 ↗</a>` : ''}</div>
        </div>
        <div class="filters-wrap">
          <div class="filters" role="group" aria-label="직위 필터">
            ${ranks.map(r => `<button class="chip" type="button" data-rank="${esc(r)}" aria-pressed="${state.rankFilter === r}">${esc(r)}<span class="n">${r === '전체' ? d.profs.length : d.profs.filter(p => p.rank === r).length}</span></button>`).join('')}
          </div>
          <div class="filters filters--rate" role="group" aria-label="선호도 필터">
            ${rf.map(r => `<button class="chip chip--rate" type="button" data-rating="${esc(r)}" data-val="${esc(r)}" aria-pressed="${state.ratingFilter === r}">${esc(r)}<span class="n">${countRating(d, r)}</span></button>`).join('')}
            <button class="chip chip--fav" type="button" data-favfilter aria-pressed="${state.favOnly}" title="관심 교수만 보기">${FAV_SVG}관심<span class="n">${favCount(d)}</span></button>
          </div>
        </div>
      </div>
      ${list.length ? `<div class="prof-grid">${list.map(p => profCard(p, d)).join('')}</div>` : `<div class="empty"><strong>조건에 맞는 교수가 없습니다</strong></div>`}
    </div>`;
  $app.querySelectorAll('.chip[data-rank]').forEach(b => b.addEventListener('click', () => { state.rankFilter = b.dataset.rank; renderDept(d); }));
  $app.querySelectorAll('.chip[data-rating]').forEach(b => b.addEventListener('click', () => { state.ratingFilter = b.dataset.rating; renderDept(d); }));
  $app.querySelector('.chip[data-favfilter]')?.addEventListener('click', () => { state.favOnly = !state.favOnly; renderDept(d); });
  bindCards();
}

/* 연구실 칸은 "연구실 이름 (건물 호실)" 형태가 섞여 있다.
 * 이름은 영문명 옆에, 위치만 호실 줄에 넣으려고 둘을 갈라 둔다. */
const OFFICE_RE = /^\s*(.+?)\s*[（(]\s*(.+?)\s*[）)]\s*$/;
function officeParts(o) {
  const t = String(o || '').trim();
  if (!t) return { lab: '', loc: '' };
  const m = OFFICE_RE.exec(t);
  if (m) return { lab: m[1], loc: m[2] };
  if (/(연구실|실험실|랩)$/.test(t) && !/\d/.test(t)) return { lab: t, loc: '' };  // 호실 없이 연구실 이름만 적힌 경우
  return { lab: '', loc: t };
}

function profCard(p, d, showDept = false) {
  const color = d ? d.color : '#1f8a5b';
  const { lab, loc } = officeParts(p.office);
  return `
    <div class="prof" role="button" tabindex="0" data-dept="${esc(p.dept_id)}" data-slug="${esc(p.slug)}" data-rating="${esc(getRating(p))}" data-fav="${isFav(p) ? '1' : ''}" style="--dept-color:${esc(color)}" aria-label="${esc(p.name)} ${esc(p.rank)} 상세 보기">
      <div class="prof__photo">
        <div class="avatar" aria-hidden="true">${esc(initial(p.name))}</div>
        ${p.photo ? `<img src="${esc(p.photo)}" data-alt="${esc(p.photo_alt)}" alt="" loading="lazy" onload="this.classList.add('loaded')" onerror="photoErr(this,'remove')">` : ''}
      </div>
      <div class="prof__body">
        <div class="prof__head">
          <div class="prof__rank">${esc(p.rank)}${showDept ? ` · ${esc(p.dept_name)}` : ''}</div>
          <h3 class="prof__name">${esc(p.name)}<span class="prof__sub"><small>${esc(p.name_en || '')}</small>${lab ? `<i class="prof__lab">${esc(lab)}</i>` : ''}</span></h3>
          ${favBtn(p)}
        </div>
        <div class="prof__tags">${p.tags.slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        <div class="prof__bottom">
        ${loc || p.phone ? `<div class="prof__office">
          ${loc ? `<span class="po__room"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg><span class="po__t">${esc(loc)}</span></span>` : ''}
          ${p.phone ? `<a class="po__tel" href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}" aria-label="${esc(p.name)} 전화 ${esc(p.phone)}"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.57 3.6a1 1 0 0 1-.25 1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>${esc(p.phone)}</a>` : ''}
        </div>` : ''}
        <div class="prof__foot"><span class="prof__note">${noteBadge(entryOf(rKey(p)))}</span>${rateChips(p)}${meetCounter(p)}</div>
        </div>
      </div>
    </div>`;
}

/* ---------- 선호도 ---------- */
const rKey = p => `${p.dept_id}/${p.slug}`;
/* 카드에 붙는 작은 표시: 만남 N회 · 메모 있음 */
const noteBadge = e => e.memo ? `<span class="nb nb--memo" title="${esc(e.memo)}">메모</span>` : '';
const getRating = p => state.ratings.get(rKey(p)) || '';
const matchRating = p => state.ratingFilter === '전체' || (state.ratingFilter === '미지정' ? !getRating(p) : getRating(p) === state.ratingFilter);
const countRating = (d, r) => r === '전체' ? d.profs.length : d.profs.filter(p => r === '미지정' ? !getRating(p) : getRating(p) === r).length;

function ratingSummary(d) {
  const parts = CONFIG.RATINGS.LABELS.map(r => [r, countRating(d, r)]).filter(([, n]) => n);
  const nf = favCount(d);
  const fav = nf ? `<span class="rs rs--fav" title="관심 교수 ${nf}명">${FAV_SVG}${nf}</span>` : '';
  if (!parts.length && !fav) return '';
  return `<div class="drow__rates">${parts.map(([r, n]) => `<span class="rs rs--${rClass(r)}">${esc(r)} ${n}</span>`).join('')}${fav}</div>`;
}
const rClass = r => ({ '확': 'high', '중': 'mid', '모': 'low', '부': 'neg', '비': 'na' }[r] || '');
/* 저장된 값을 현재 라벨로 정규화 (예전 값 상→확, 하→모; 모르는 값은 버림) */
const normRating = v => { v = String(v || ''); return CONFIG.RATINGS.LEGACY[v] || (CONFIG.RATINGS.LABELS.includes(v) ? v : ''); };

/* ---------- 관심 교수 ----------
 * 카드 왼쪽 위의 동그란 버튼으로 켜고 끕니다. 퀴즈 설정과 같은 길(settings 탭)로 저장되므로
 * 서버(Code.gs)는 고칠 것이 없고, 다른 기기에서도 그대로 따라옵니다. */
const FAV_KEY = 'jnu-fav';
let favSet = null;
function favs() {
  if (favSet) return favSet;
  try { const v = JSON.parse(localStorage.getItem(FAV_KEY) || 'null'); if (Array.isArray(v)) favSet = new Set(v); } catch {}
  if (!favSet) favSet = new Set();
  return favSet;
}
const isFav = p => favs().has(rKey(p));
const favCount = d => d.profs.filter(isFav).length;
function favSave() {
  try { const f = favs(); f.size ? localStorage.setItem(FAV_KEY, JSON.stringify([...f])) : localStorage.removeItem(FAV_KEY); } catch {}
  saveSetting(SET_FAV, settingValue(SET_FAV));
}
function toggleFav(p) { const f = favs(), k = rKey(p); f.has(k) ? f.delete(k) : f.add(k); favSave(); return f.has(k); }

const FAV_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M20 6.5L9.2 17.3 4 12.1" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const favBtn = p => `<button type="button" class="fav" data-key="${esc(rKey(p))}" aria-pressed="${isFav(p)}" title="관심 교수" aria-label="${esc(p.name)} 관심 교수 ${isFav(p) ? '해제' : '표시'}">${FAV_SVG}</button>`;

function bindFavs(root) {
  root.querySelectorAll('.fav').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); e.preventDefault();
    const p = state.rows.find(x => rKey(x) === b.dataset.key); if (!p) return;
    const on = toggleFav(p);
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', `${p.name} 관심 교수 ${on ? '해제' : '표시'}`);
    const card = b.closest('.prof'); if (card) card.dataset.fav = on ? '1' : '';
    const chip = $app.querySelector('.chip--fav .n');
    if (chip) { const d = state.depts.find(x => x.id === p.dept_id); if (d) chip.textContent = favCount(d); }
  }));
}

function rateChips(p, big = false) {
  const cur = getRating(p);
  return `<div class="rate ${big ? 'rate--big' : ''}" data-key="${esc(rKey(p))}" role="group" aria-label="${esc(p.name)} 선호도">
    ${CONFIG.RATINGS.LABELS.map(r => `<button type="button" class="rate__b rate__b--${rClass(r)}" data-val="${esc(r)}" aria-pressed="${cur === r}" title="${esc(r)} · ${esc(CONFIG.RATINGS.NAMES[r] || '')}" aria-label="${esc(r)} (${esc(CONFIG.RATINGS.NAMES[r] || '')})">${esc(r)}</button>`).join('')}
  </div>`;
}

function bindRates(root) {
  root.querySelectorAll('.rate').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('.rate__b'); if (!b) return;
    e.stopPropagation(); e.preventDefault();
    const key = g.dataset.key, val = b.dataset.val;
    setRating(key, getRatingByKey(key) === val ? '' : val);
  }));
}
const getRatingByKey = k => state.ratings.get(k) || '';

/* 만남 횟수 −/+ */
function meetCounter(p) {
  const n = getMet(p);
  return `<div class="counter ${n ? '' : 'counter--zero'}" data-key="${esc(rKey(p))}" role="group" aria-label="${esc(p.name)} 만난 횟수">
    <button type="button" class="counter__b" data-dec aria-label="1회 줄이기">−</button>
    <span class="counter__n" aria-live="polite">${n}</span>
    <button type="button" class="counter__b" data-inc aria-label="1회 늘리기">+</button>
  </div>`;
}
function bindNotes(root) {
  root.querySelectorAll('.counter').forEach(c => c.addEventListener('click', e => {
    const b = e.target.closest('.counter__b'); if (!b) return;
    e.stopPropagation(); e.preventDefault();
    const key = c.dataset.key, cur = getNote(key).met || 0;
    setMet(key, cur + (b.hasAttribute('data-inc') ? 1 : -1));
  }));
  root.querySelectorAll('textarea.memo').forEach(t => {
    t.addEventListener('input', () => { scheduleMemo(t.dataset.key, t.value); const st = t.parentElement.querySelector('.memo__st'); if (st) st.textContent = '입력 중…'; });
    t.addEventListener('blur', () => commitMemo(t.dataset.key, t.value));
  });
}

function ratingsCacheKey() { return 'jnu-ratings:' + (state.session ? state.session.email : 'local'); }
function notesCacheKey() { return 'jnu-notes:' + (state.session ? state.session.email : 'local'); }

/* 교수별 개인 기록: 선호도(state.ratings) + 만남 횟수·메모(state.notes) */
const getNote = key => state.notes.get(key) || { met: 0, memo: '' };
const getMet = p => getNote(rKey(p)).met || 0;
const getMemo = p => getNote(rKey(p)).memo || '';
const normMet = v => Math.max(0, Math.min(999, Math.round(Number(v) || 0)));
const normMemo = v => String(v == null ? '' : v).slice(0, 2000);
/* 한 교수의 로컬 기록 전체 {rating, met, memo} */
const entryOf = key => ({ rating: state.ratings.get(key) || '', ...getNote(key) });
const entryEmpty = e => !e.rating && !e.met && !e.memo;
const entryEq = (a, b) => a.rating === b.rating && (a.met || 0) === (b.met || 0) && (a.memo || '') === (b.memo || '');
function applyEntry(key, e) {
  if (e.rating !== undefined) { if (e.rating) state.ratings.set(key, e.rating); else state.ratings.delete(key); }
  if (e.met !== undefined || e.memo !== undefined) {
    const n = { ...getNote(key) };
    if (e.met !== undefined) n.met = normMet(e.met);
    if (e.memo !== undefined) n.memo = normMemo(e.memo);
    if (!n.met && !n.memo) state.notes.delete(key); else state.notes.set(key, n);
  }
}

function loadRatingsCache() {
  try {
    const m = JSON.parse(localStorage.getItem(ratingsCacheKey()) || '{}');
    state.ratings = new Map(Object.entries(m).map(([k, v]) => [k, normRating(v)]).filter(([, v]) => v));
    // 로그인 기능이 켜지기 전(계정 구분 없이) 이 기기에 저장된 선호도가 있으면 현재 계정으로 합친다
    if (state.session) {
      const legacy = JSON.parse(localStorage.getItem('jnu-ratings:local') || 'null');
      if (legacy && typeof legacy === 'object') {
        let n = 0;
        for (const [k, v] of Object.entries(legacy)) { const nv = normRating(v); if (nv && !state.ratings.has(k)) { state.ratings.set(k, nv); n++; } }
        localStorage.removeItem('jnu-ratings:local');
        if (n) saveRatingsCache();
      }
    }
  } catch { state.ratings = new Map(); }
  try {
    const m = JSON.parse(localStorage.getItem(notesCacheKey()) || '{}');
    state.notes = new Map(Object.entries(m).map(([k, v]) => [k, { met: normMet(v && v.met), memo: normMemo(v && v.memo) }]).filter(([, v]) => v.met || v.memo));
  } catch { state.notes = new Map(); }
}
function saveRatingsCache() {
  try { localStorage.setItem(ratingsCacheKey(), JSON.stringify(Object.fromEntries(state.ratings))); } catch {}
  try { localStorage.setItem(notesCacheKey(), JSON.stringify(Object.fromEntries(state.notes))); } catch {}
}

/* ---------- 여러 기기 동기화 ----------
 * 시트(서버)가 기준입니다. 처음 들어올 때, 화면이 다시 보일 때(탭 전환·잠금 해제), 창에 포커스가 올 때,
 * 그리고 화면이 보이는 동안 SYNC_SEC 마다 시트를 다시 읽어 다른 기기에서 바꾼 값을 반영합니다.
 * 저장이 진행 중이거나 실패한 항목(pending/dirty)은 서버 값으로 덮어쓰지 않고 다시 올립니다.
 * 저장 단위는 교수 1명의 일부 필드({rating}, {met}, {memo} 또는 그 조합)입니다. */
const sync = { pending: new Map(), dirty: new Map(), queue: new Map(), running: false, timer: null, last: 0, savedAt: 0, pendS: new Map(), busyS: new Set(), dirtyS: new Map() };
const dirtyKey = () => 'jnu-ratings-dirty:' + (state.session ? state.session.email : 'local');
function loadDirty() {
  try {
    const raw = JSON.parse(localStorage.getItem(dirtyKey()) || '{}');
    sync.dirty = new Map(Object.entries(raw).map(([k, v]) => [k, typeof v === 'object' && v ? v : { rating: normRating(v) }])); // 예전 형식(문자열)도 읽음
  } catch { sync.dirty = new Map(); }
}
function saveDirty() { try { if (sync.dirty.size) localStorage.setItem(dirtyKey(), JSON.stringify(Object.fromEntries(sync.dirty))); else localStorage.removeItem(dirtyKey()); } catch {} }

async function loadRatings() {
  loadRatingsCache();
  loadDirty();
  loadSetDirty();
  await syncRatings({ initial: true });
  startSyncLoop();
}

function startSyncLoop() {
  if (sync.timer || !CONFIG.RATINGS.API_URL || !state.session) return;
  const sec = Math.max(15, Number(CONFIG.RATINGS.SYNC_SEC) || 60);
  sync.timer = setInterval(() => { if (document.visibilityState === 'visible') { syncRatings(); keepTokenFresh(); } }, sec * 1000);
  updateSaveBar();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { keepTokenFresh(); syncRatings(); } else flushMemo(); });
  window.addEventListener('focus', () => syncRatings());
  window.addEventListener('online', () => syncRatings());
  window.addEventListener('pageshow', e => { if (e.persisted) syncRatings(); });
  window.addEventListener('pagehide', flushMemo);
  // 같은 기기의 다른 탭에서 바꾼 값도 바로 반영
  window.addEventListener('storage', e => { if (e.key === ratingsCacheKey() || e.key === notesCacheKey()) { loadRatingsCache(); render(); } });
}

async function syncRatings({ initial = false } = {}) {
  if (!CONFIG.RATINGS.API_URL || !state.session) return;
  if (sync.running) return;
  if (!initial && Date.now() - sync.last < 5000) return; // 연속 호출 방지
  sync.running = true;
  try {
    // 1) 저장에 실패했던 항목 먼저 다시 올림
    for (const [k, v] of [...sync.dirtyS]) { if (await pushSetting(k, v)) { sync.dirtyS.delete(k); saveSetDirty(); } }
    for (const [key, fields] of [...sync.dirty]) {
      if (await pushEntry(key, fields)) { sync.dirty.delete(key); saveDirty(); }
    }
    updateSaveBar();
    // 2) 시트에서 내 기록 전체를 읽음
    const r = await ratingsApi('list', {});
    if (!r || !Array.isArray(r.ratings)) throw new Error((r && r.error) || '응답 오류');
    applySettings(r.settings);
    applyAiEdits(r.airewrites);
    const server = new Map();
    r.ratings.forEach(x => { const e = { rating: normRating(x.rating), met: normMet(x.met), memo: normMemo(x.memo) }; if (!entryEmpty(e)) server.set(`${x.dept_id}/${x.slug}`, e); });
    const locked = k => sync.pending.has(k) || sync.dirty.has(k) || sync.queue.has(k);
    // 3) 이 기기에만 있는 기록(시트 연동 전에 적은 것 등)은 시트로 올림
    const keys = new Set([...state.ratings.keys(), ...state.notes.keys()]);
    const localOnly = [...keys].filter(k => !server.has(k) && !locked(k)).map(k => [k, entryOf(k)]);
    // 4) 서버 값을 기준으로 화면 갱신 (저장 중/실패한 항목은 로컬 값 유지)
    const changed = [];
    for (const [k, e] of server) if (!locked(k) && !entryEq(entryOf(k), e)) { applyEntry(k, e); changed.push(k); }
    for (const k of keys) if (!server.has(k) && !locked(k) && !localOnly.some(([lk]) => lk === k)) { applyEntry(k, { rating: '', met: 0, memo: '' }); changed.push(k); }
    saveRatingsCache();
    sync.last = Date.now();
    if (initial) render();
    else if (changed.length) { const v = route().view; if (v === 'dept') changed.forEach(k => refreshRatingUI(k, state.ratings.get(k) || '')); else if (v !== 'quiz') render(); flashStatus(`다른 기기의 기록 ${changed.length}건을 반영했습니다`); }
    let n = 0;
    for (const [key, e] of localOnly) if (await pushEntry(key, e)) n++;
    if (n) { saveRatingsCache(); flashStatus(`이 기기의 기록 ${n}건을 시트로 동기화했습니다`); }
  } catch (e) {
    console.warn('동기화 실패:', e.message);
    if (initial) flashStatus('선호도 동기화 실패 — 시트 연결을 확인하세요', true);
  } finally { sync.running = false; }
}

/* ---------- 개인 설정 동기화 (퀴즈 학과·교수 선택) ----------
 * 선호도와 같은 경로로 시트의 settings 탭에 저장되고, 다른 기기에서 바꾸면 다음 동기화 때 그대로 따라옵니다. */
const SET_QD = 'quiz-depts', SET_QX = 'quiz-ex', SET_FAV = 'fav', SET_KEYS = [SET_QD, SET_QX, SET_FAV];
const setDirtyKey = () => 'jnu-settings-dirty:' + (state.session ? state.session.email : 'local');
function loadSetDirty() { try { sync.dirtyS = new Map(Object.entries(JSON.parse(localStorage.getItem(setDirtyKey()) || '{}'))); } catch { sync.dirtyS = new Map(); } }
function saveSetDirty() { try { sync.dirtyS.size ? localStorage.setItem(setDirtyKey(), JSON.stringify(Object.fromEntries(sync.dirtyS))) : localStorage.removeItem(setDirtyKey()); } catch {} }

/* 지금 이 기기의 설정 값 (정렬해 두어 비교가 안정적이도록) */
function settingValue(key) {
  if (key === SET_QD) return [...quizDepts()].sort();
  if (key === SET_QX) return [...quizEx()].sort();
  if (key === SET_FAV) return [...favs()];   // 정렬하지 않는다: 고른 순서를 그대로 쓴다
  return null;
}
/* 서버에서 받은 값을 이 기기에 적용 (되돌려 올리지 않도록 localStorage에 직접 씀) */
function settingApplyLocal(key, v) {
  try {
    if (key === SET_QD) { quiz.depts = new Set(v); localStorage.setItem(QUIZ_DEPTS_KEY, JSON.stringify(v)); }
    if (key === SET_QX) { quiz.ex = new Set(v); v.length ? localStorage.setItem(QUIZ_EX_KEY, JSON.stringify(v)) : localStorage.removeItem(QUIZ_EX_KEY); }
    if (key === SET_FAV) { favSet = new Set(v); v.length ? localStorage.setItem(FAV_KEY, JSON.stringify(v)) : localStorage.removeItem(FAV_KEY); }
  } catch {}
}
const SET_LOCAL_KEY = { [SET_QD]: QUIZ_DEPTS_KEY, [SET_QX]: QUIZ_EX_KEY, [SET_FAV]: FAV_KEY };
const setStored = key => { try { return localStorage.getItem(SET_LOCAL_KEY[key]) != null; } catch { return false; } };

async function pushSetting(key, value) {
  try {
    const r = await ratingsApi('setting', { key, value: JSON.stringify(value) });
    if (!r || !r.ok) throw new Error((r && r.error) || '저장 실패');
    sync.savedAt = Date.now();
    return true;
  } catch (e) { console.warn('설정 저장 실패:', key, e.message); sync.lastError = e.message; return false; }
}

/* 설정 저장 — 같은 키를 연달아 바꾸면 마지막 값만 보내고, 실패하면 이 기기에 남겼다가 다음 동기화 때 다시 올림 */
async function saveSetting(key, value) {
  if (!CONFIG.RATINGS.API_URL || !state.session) return;
  sync.pendS.set(key, value);
  if (sync.busyS.has(key)) return;
  sync.busyS.add(key); updateSaveBar();
  try {
    while (sync.pendS.has(key)) {
      const v = sync.pendS.get(key);
      let ok = false;
      for (const wait of [0, 1000, 3000]) {
        if (wait) await new Promise(r => setTimeout(r, wait));
        ok = await pushSetting(key, v);
        if (ok || sync.pendS.get(key) !== v) break;
      }
      if (sync.pendS.get(key) === v) sync.pendS.delete(key);
      if (ok) { sync.dirtyS.delete(key); saveSetDirty(); }
      else { sync.dirtyS.set(key, v); saveSetDirty(); flashStatus((key === SET_FAV ? '관심 교수' : '퀴즈 설정') + '을(를) 시트에 저장하지 못했습니다 — 연결되면 다시 시도합니다', true); break; }
    }
  } finally { sync.busyS.delete(key); updateSaveBar(); }
}

/* 서버 설정을 화면에 반영. 서버에 아직 없고 이 기기에만 있으면 올린다 */
function applySettings(m) {
  let changed = false;
  for (const key of SET_KEYS) {
    if (sync.pendS.has(key) || sync.busyS.has(key) || sync.dirtyS.has(key)) continue;
    const raw = m ? m[key] : '';
    if (raw == null || raw === '') { if (setStored(key)) saveSetting(key, settingValue(key)); continue; }
    let v; try { v = JSON.parse(raw); } catch { continue; }
    if (!Array.isArray(v)) continue;
    const cur = settingValue(key) || [];
    const same = key === SET_FAV ? JSON.stringify(cur) === JSON.stringify(v)
                                 : JSON.stringify(cur) === JSON.stringify([...v].sort());
    if (same) continue;
    settingApplyLocal(key, v); changed = true;
  }
  if (changed) {
    quizStart();
    route().view === 'quiz' ? renderQuiz() : render();
    flashStatus('다른 기기에서 바꾼 설정을 반영했습니다');
  }
}

/* 한 교수의 일부 필드를 시트에 저장. 성공하면 true (재시도 없음 — 호출 쪽에서 처리) */
async function pushEntry(key, fields) {
  const [dept_id, slug] = key.split('/');
  const p = state.rows.find(x => x.dept_id === dept_id && x.slug === slug);
  if (!p) return true; // 목록에 없는 교수(삭제됨)면 건너뜀
  sync.pending.set(key, fields);
  try {
    const r = await ratingsApi('set', { dept_id, slug, name: p.name, ...fields });
    if (!r || !r.ok) throw new Error((r && r.error) || '저장 실패');
    sync.savedAt = Date.now();
    return true;
  } catch (e) {
    console.warn('저장 실패:', key, e.message);
    sync.lastError = e.message;
    return false;
  } finally { if (sync.pending.get(key) === fields) sync.pending.delete(key); }
}

/* 값을 바꾸면 화면은 즉시 바뀌고, 같은 순간에 시트로 저장을 보냅니다.
 * 같은 교수를 연달아 바꾸면 바뀐 필드를 합쳐 순서대로 보내고(꼬임 방지), 실패하면 1초·3초·8초 뒤 다시 시도한 뒤
 * 그래도 안 되면 이 기기에 '미저장'으로 남겨 두었다가 연결·로그인이 회복되는 즉시 자동으로 올립니다. */
async function saveEntry(key, fields) {
  applyEntry(key, fields);
  saveRatingsCache();
  refreshRatingUI(key, state.ratings.get(key) || '');
  if (!CONFIG.RATINGS.API_URL || !state.session) return;
  const d = sync.dirty.get(key);
  if (d) { sync.dirty.delete(key); saveDirty(); fields = { ...d, ...fields }; } // 미저장분과 합쳐 보냄
  const q = sync.queue.get(key);
  if (q) { q.next = { ...(q.next || {}), ...fields }; return; } // 이미 보내는 중이면 끝난 뒤 합쳐서 보냄
  sync.queue.set(key, { next: undefined });
  markSaving(key, 'saving'); updateSaveBar();
  let cur = fields;
  try {
    for (;;) {
      let ok = false;
      for (const wait of [0, 1000, 3000, 8000]) {
        if (wait) await new Promise(r => setTimeout(r, wait));
        if (sync.queue.get(key).next !== undefined) break; // 새 값이 들어왔으면 합쳐서 그것부터
        ok = await pushEntry(key, cur);
        if (ok) break;
      }
      const nx = sync.queue.get(key).next;
      if (nx !== undefined) { sync.queue.set(key, { next: undefined }); cur = ok ? nx : { ...cur, ...nx }; continue; }
      if (!ok) { sync.dirty.set(key, { ...(sync.dirty.get(key) || {}), ...cur }); saveDirty(); markSaving(key, 'error'); flashStatus('시트에 저장하지 못했습니다 — ' + (sync.lastError || '') + ' (연결되면 자동으로 다시 저장)', true); }
      else markSaving(key, 'saved');
      break;
    }
  } finally { sync.queue.delete(key); updateSaveBar(); }
}
const setRating = (key, val) => saveEntry(key, { rating: val });
const setMet = (key, n) => saveEntry(key, { met: normMet(n) });

/* 메모: 입력을 멈추고 0.8초 뒤 저장, 창을 닫거나 화면을 떠날 때는 즉시 저장 */
const memoTimers = new Map();
function scheduleMemo(key, text) {
  clearTimeout(memoTimers.get(key));
  memoTimers.set(key, setTimeout(() => { memoTimers.delete(key); commitMemo(key, text); }, 800));
}
function commitMemo(key, text) {
  text = normMemo(text);
  if (getNote(key).memo === text && !memoTimers.has(key)) return;
  clearTimeout(memoTimers.get(key)); memoTimers.delete(key);
  saveEntry(key, { memo: text });
}
function flushMemo() {
  document.querySelectorAll('textarea.memo[data-key]').forEach(t => { if (memoTimers.has(t.dataset.key) || getNote(t.dataset.key).memo !== normMemo(t.value)) commitMemo(t.dataset.key, t.value); });
}

/* 카드·드로어의 칩 묶음·메모칸에 저장 상태 표시 (saving → saved/error) */
function markSaving(key, st) {
  document.querySelectorAll(`.rate[data-key="${CSS.escape(key)}"], .memo-box[data-key="${CSS.escape(key)}"], .counter[data-key="${CSS.escape(key)}"]`).forEach(g => {
    g.dataset.save = st;
    if (st === 'saved') setTimeout(() => { if (g.dataset.save === 'saved') delete g.dataset.save; }, 1500);
  });
  document.querySelectorAll(`.memo-box[data-key="${CSS.escape(key)}"] .memo__st`).forEach(el => { el.textContent = st === 'saving' ? '저장 중…' : st === 'saved' ? '저장됨 ✓' : st === 'error' ? '미저장 — 연결되면 자동 저장' : ''; });
}

/* 하단 상태줄: 저장 중 / 저장됨 / 미저장 N건 */
let $saveBar = null;
function updateSaveBar() {
  if (!$saveBar) { $saveBar = document.createElement('div'); $saveBar.className = 'savebar'; $saveBar.hidden = true; document.body.appendChild($saveBar); }
  const saving = sync.queue.size + sync.busyS.size, dirty = sync.dirty.size + sync.dirtyS.size;
  if (sync.authNeeded && !sync.authHidden) {
    if ($saveBar.dataset.mode !== 'auth') {
      $saveBar.className = 'savebar savebar--warn savebar--auth'; $saveBar.dataset.mode = 'auth';
      $saveBar.innerHTML = `<span>${dirty ? `미저장 ${dirty}건 · ` : ''}저장을 계속하려면 Google 로그인을 한 번 확인해 주세요</span><span id="reloginBtn"></span><button type="button" class="savebar__btn" id="authLater">나중에</button>`;
      $saveBar.hidden = false;
      $saveBar.querySelector('#authLater').addEventListener('click', () => { sync.authHidden = true; delete $saveBar.dataset.mode; updateSaveBar(); });
      ensureGis().then(() => google.accounts.id.renderButton(document.getElementById('reloginBtn'), { theme: 'filled_blue', size: 'medium', text: 'continue_with', shape: 'pill', locale: 'ko' })).catch(() => {});
    }
    return;
  }
  delete $saveBar.dataset.mode;
  if (saving) { $saveBar.className = 'savebar savebar--busy'; $saveBar.textContent = `시트에 저장 중… (${saving}건)`; $saveBar.hidden = false; }
  else if (dirty) { $saveBar.className = 'savebar savebar--warn'; $saveBar.innerHTML = `미저장 ${dirty}건 — ${esc(sync.lastError || '연결 실패')} <button type="button" class="savebar__btn" id="retrySave">지금 다시 저장</button>`; $saveBar.hidden = false; $saveBar.querySelector('#retrySave').addEventListener('click', () => { sync.last = 0; syncRatings(); }); }
  else if (sync.savedAt) { $saveBar.className = 'savebar savebar--ok'; $saveBar.textContent = `시트에 저장됨 ✓ ${new Date(sync.savedAt).toLocaleTimeString('ko-KR')}`; $saveBar.hidden = false; clearTimeout($saveBar._t); $saveBar._t = setTimeout(() => { if (!sync.queue.size && !sync.dirty.size) $saveBar.hidden = true; }, 2500); }
  else $saveBar.hidden = true;
}

/* 새 버전이 배포됐는지 확인 (index.html의 로더가 붙인 ?v= 와 version.json 비교). 다르면 새로고침 안내 */
const APP_V = (() => { try { const m = (document.currentScript && document.currentScript.src || '').match(/[?&]v=([^&]+)/); return m ? m[1] : ''; } catch { return ''; } })();
/* 캐시를 건너뛰고 다시 불러온다. 아이폰 홈 화면 앱은 location.reload()로도 캐시가 남는 일이 있어
 * 주소에 값을 붙여 새 주소로 이동시킨다. */
function hardReload() {
  try { flushMemo(); } catch {}
  const u = location.pathname + '?r=' + Date.now() + location.hash;
  setTimeout(() => { try { location.replace(u); } catch { location.reload(); } }, 250);
}

async function checkVersion() {
  if (!APP_V || document.visibilityState !== 'visible') return;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (!j || !j.v || String(j.v) === APP_V) return;
    if (sync.queue.size || sync.dirty.size) return;          // 저장 중이면 나중에
    updateSaveBar();                                          // $saveBar 준비
    if (!$saveBar) return;
    $saveBar.className = 'savebar savebar--busy'; $saveBar.dataset.mode = 'ver';
    $saveBar.innerHTML = `새 버전이 있습니다 <button type="button" class="savebar__btn" id="reloadNew">새로고침</button>`;
    $saveBar.hidden = false;
    $saveBar.querySelector('#reloadNew').addEventListener('click', hardReload);
  } catch {}
}

/* 버전 감시는 로그인·시트 연동과 무관하게 항상 돈다 */
function startVersionWatch() {
  checkVersion();
  setInterval(checkVersion, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
  window.addEventListener('focus', checkVersion);
  window.addEventListener('pageshow', e => { if (e.persisted) checkVersion(); });
  document.getElementById('footReload')?.addEventListener('click', hardReload);
}

/* 앱 토큰 만료가 가까우면 화면이 보이는 동안 미리 갱신해 둔다 (구글 창을 띄우지 않는다) */
async function keepTokenFresh() {
  const s = state.session;
  if (!s || !CONFIG.RATINGS.API_URL || tokenWaiter) return;
  if (s.appToken && s.appExp - Date.now() > APP_TOK_RENEW) return;
  try { await authToken(); } catch (e) { console.warn('토큰 갱신 실패:', e.message); }
}

/* 화면 전체를 다시 그리지 않고 해당 교수의 칩·카드·필터 숫자만 갱신 */
function refreshRatingUI(key, val) {
  document.querySelectorAll(`.rate[data-key="${CSS.escape(key)}"] .rate__b`).forEach(b => b.setAttribute('aria-pressed', b.dataset.val === val));
  const note = getNote(key);
  document.querySelectorAll(`.counter[data-key="${CSS.escape(key)}"] .counter__n`).forEach(el => { el.textContent = note.met; });
  document.querySelectorAll(`.counter[data-key="${CSS.escape(key)}"]`).forEach(el => el.classList.toggle('counter--zero', !note.met));
  document.querySelectorAll(`textarea.memo[data-key="${CSS.escape(key)}"]`).forEach(t => { if (document.activeElement !== t && !memoTimers.has(key) && t.value !== note.memo) t.value = note.memo; });
  document.querySelectorAll(`.prof[data-dept="${CSS.escape(key.split('/')[0])}"][data-slug="${CSS.escape(key.split('/')[1])}"] .prof__note`).forEach(el => { el.innerHTML = noteBadge(entryOf(key)); });
  document.querySelectorAll(`.prof[data-dept="${CSS.escape(key.split('/')[0])}"][data-slug="${CSS.escape(key.split('/')[1])}"]`).forEach(c => c.dataset.rating = val);
  const r = route();
  if (r.view === 'dept') {
    const d = state.depts.find(x => x.id === r.dept);
    if (d) {
      $app.querySelectorAll('.chip[data-rating]').forEach(b => { const n = b.querySelector('.n'); if (n) n.textContent = countRating(d, b.dataset.rating); });
      if (state.ratingFilter !== '전체') renderDept(d); // 필터 중이면 목록이 바뀌므로 다시 그림
    }
  }
}

/* Apps Script 호출 */
async function apiPost(payload) {
  const res = await fetch(CONFIG.RATINGS.API_URL, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow', keepalive: payload.action === 'set' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
async function ratingsApi(action, payload) {
  const token = await authToken();
  return apiPost({ action, token, ...payload });
}

/* 서버에 보낼 토큰.
 * 구글 ID 토큰은 1시간이면 만료되고 브라우저가 조용한 재발급을 자주 막습니다. 그래서 로그인을 한 번 확인한 뒤에는
 * 스크립트가 발급한 앱 토큰(기본 90일)을 받아 쓰고, 만료가 가까워지면 그 토큰만으로 조용히 갱신합니다. */
const APP_TOK_RENEW = 7 * 86400e3;   // 만료 7일 전부터 갱신
async function authToken() {
  const s = state.session;
  if (!s) throw new Error('로그인 필요');
  if (s.appToken && s.appExp - Date.now() > APP_TOK_RENEW) return s.appToken;
  const base = (s.appToken && s.appExp - Date.now() > 60e3) ? s.appToken : await getFreshToken();
  try {
    const r = await apiPost({ action: 'session', token: base });
    if (r && r.ok && r.token) {
      s.appToken = r.token; s.appExp = Number(r.exp) || 0;
      persistSession();
      sync.authNeeded = false;
      return s.appToken;
    }
  } catch (e) { console.warn('앱 토큰 발급 실패:', e.message); }
  return base;   // 스크립트가 아직 옛 버전이면 구글 토큰을 그대로 씀
}
function persistSession() { try { localStorage.setItem(AUTH_KEY, JSON.stringify(state.session)); } catch {} }

function bindCards() {
  const open = b => { location.hash = `#/dept/${encodeURIComponent(b.dataset.dept)}/prof/${encodeURIComponent(b.dataset.slug)}`; };
  $app.querySelectorAll('.prof').forEach(b => {
    b.addEventListener('click', e => { if (e.target.closest('.rate, .fav, .counter, .po__tel')) return; open(b); });
    b.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.rate, .fav, .counter, .po__tel')) { e.preventDefault(); open(b); } });
  });
  bindRates($app);
  bindFavs($app);
  bindNotes($app);
  $app.querySelector('[data-clear]')?.addEventListener('click', () => { $q.value = ''; state.query = ''; });
}

/* ---------- 검색 결과 (data/insights/<학과>.json) ----------
 * GitHub Pages는 정적 호스팅이라 브라우저에서 검색 API를 부를 수 없어, 미리 모아 둔 파일을 읽어 보여줍니다.
 * 상세 창을 열 때 해당 학과 파일만 가져오므로 첫 화면 로딩에는 영향이 없습니다. */
const insCache = new Map(), insWait = new Map();
function loadInsights(deptId) {
  if (insCache.has(deptId)) return Promise.resolve(insCache.get(deptId));
  if (insWait.has(deptId)) return insWait.get(deptId);
  const pr = fetch(`data/insights/${encodeURIComponent(deptId)}.json?v=${encodeURIComponent(APP_V || '1')}`)
    .then(r => r.ok ? r.json() : null).catch(() => null)
    .then(d => { insCache.set(deptId, d); insWait.delete(deptId); return d; });
  insWait.set(deptId, pr);
  return pr;
}

const K_LABEL = { news: '보도', notice: '학내', academic: '연구', activity: '대외' };

/* 직접 더 찾아보기 버튼 — 이름만으로는 동명이인이 섞이므로 소속을 붙여 검색 */
function insSearchRow(p) {
  const q = encodeURIComponent(`"${p.name}" 제주대`);
  const scholar = p.scholar || `https://scholar.google.com/scholar?q=${encodeURIComponent((p.name_en || p.name) + ' Jeju National University')}`;
  return `<div class="ins__search">
    <a class="lnk" href="https://search.naver.com/search.naver?where=news&query=${q}" target="_blank" rel="noopener">네이버뉴스 ↗</a>
    <a class="lnk" href="https://www.google.com/search?tbm=nws&q=${q}" target="_blank" rel="noopener">구글뉴스 ↗</a>
    <a class="lnk" href="${esc(scholar)}" target="_blank" rel="noopener">Scholar ↗</a>
  </div>`;
}

function insItemHtml(x) {
  return `<li class="ins__i ins__i--${esc(x.k || 'news')}">
    <a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)}</a>
    <div class="ins__meta"><span class="ins__k">${esc(K_LABEL[x.k] || '기타')}</span>${x.s ? `<span>${esc(x.s)}</span>` : ''}${x.d ? `<span>${esc(x.d)}</span>` : ''}</div>
  </li>`;
}

/* 제주대 임용 시기. 학과 홈페이지 약력에 적힌 것만 넣었고, 확인 못 한 교수는 줄 자체를 띄우지 않는다. */
function joinedHtml(e) {
  const j = e && e.joined;
  if (!j || !j.text) return '';
  const body = `<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>${esc(j.text)}${j.memo ? `<i class="ins__memo">${esc(j.memo)}</i>` : ''}</span>`;
  return j.src
    ? `<a class="ins__joined" href="${esc(j.src)}" target="_blank" rel="noopener" title="${esc(j.src_name || '출처')}">${body}</a>`
    : `<div class="ins__joined">${body}</div>`;
}

function insightsHtml(p, d, data) {
  if (data === undefined) return `<div class="ins__skel">불러오는 중…</div>`;
  const e = data && data.profs && data.profs[p.slug];
  if (e && e.self) return `<p class="ins__empty">본인입니다.</p>`;
  if (!e || (!e.items?.length && !e.highlights?.length)) {
    return `${joinedHtml(e)}<p class="ins__empty">아직 모아 둔 자료가 없습니다. 아래에서 직접 찾아보세요.</p>${insSearchRow(p)}`;
  }
  const items = e.items || [], head = items.slice(0, 5), rest = items.slice(5);
  return `
    ${joinedHtml(e)}
    ${e.highlights?.length ? `<div class="ins__hl">${e.highlights.map(h => `<span class="ins__chip">${esc(h)}</span>`).join('')}</div>` : ''}
    ${head.length ? `<ul class="ins__list">${head.map(insItemHtml).join('')}</ul>` : ''}
    ${rest.length ? `<details class="ins__more"><summary>나머지 ${rest.length}개 보기</summary><ul class="ins__list">${rest.map(insItemHtml).join('')}</ul></details>` : ''}
    ${e.note ? `<p class="ins__note">${esc(e.note)}</p>` : ''}
    <p class="ins__foot">${esc(data.updated || '')} 기준 · 공개된 보도·공지·학술 자료</p>
    ${insSearchRow(p)}`;
}

/* ---------- 다시 쓴 항목 (airewrites 시트) ----------
 * 원본 data/insights/*.json 은 그대로 두고, 내 계정이 다시 쓴 항목만 그 위에 덮어 그린다. */
const aiKey = (deptId, slug, i) => `${deptId}/${slug}/${i}`;
const aiEditOf = (deptId, slug, i) => state.aiEdits.get(aiKey(deptId, slug, i)) || null;

function applyAiEdits(m) {
  if (!m || typeof m !== 'object') return;
  const next = new Map();
  for (const k of Object.keys(m)) {
    const v = m[k];
    if (v && (v.title || v.concl)) next.set(k, { title: String(v.title || ''), term: String(v.term || ''), concl: String(v.concl || ''), hint: String(v.hint || ''), updated_at: String(v.updated_at || '') });
  }
  // 다시 쓰는 중인 항목은 건드리지 않는다
  for (const [k, v] of state.aiEdits) if (aiBusy.has(k)) next.set(k, v);
  let changed = next.size !== state.aiEdits.size;
  if (!changed) for (const [k, v] of next) { const o = state.aiEdits.get(k); if (!o || o.title !== v.title || o.term !== v.term || o.concl !== v.concl) { changed = true; break; } }
  state.aiEdits = next;
  if (changed) refreshOpenAix();
}

/* 상세 창이 열려 있으면 AI 융합 방향만 다시 그린다 (다른 부분은 건드리지 않음) */
function refreshOpenAix() {
  if ($drawer.hidden) return;
  const box = $panel.querySelector('.aix[data-slug]');
  if (!box) return;
  const slug = box.dataset.slug, deptId = box.dataset.dept;
  const p = state.rows.find(x => x.slug === slug && x.dept_id === deptId);
  const d = state.depts.find(x => x.id === deptId);
  if (!p || !d) return;
  redrawAix(box, p, d);
}

/* 원본 항목을 term / concl 두 칸으로 읽는다.
 * 예전 형식(설명이 d 한 덩어리)도 "따라서"를 기준으로 갈라 그대로 표시된다. */
/* ---------- 강조 표시 ----------
 * 두 가지를 굵게 만든다: 모델이 **…** 로 보낸 부분과, 학과 파일에 적어 둔 핵심 키워드.
 * 키워드는 한 글에서 처음 나온 자리 한 번만 칠하고, 이미 강조된 자리 안에서는 다시 칠하지 않는다.
 * 원문은 그대로 두고 화면에서만 칠하므로 구글 시트의 세부 전공도 건드리지 않는다.
 * HTML 은 맨 마지막에 esc() 로 막으므로 태그가 주입될 여지가 없다. */
const MK_A = '\u0001', MK_B = '\u0002';

function aiRich(str, kws) {
  const raw = String(str ?? '').replace(/[\u0001\u0002]/g, '');
  // 1) **…** → 표시 조각으로
  let parts = [];
  let last = 0;
  raw.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, (m, inner, at) => {
    if (at > last) parts.push({ mark: false, s: raw.slice(last, at) });
    parts.push({ mark: true, s: inner });
    last = at + m.length;
    return m;
  });
  if (last < raw.length) parts.push({ mark: false, s: raw.slice(last) });
  if (!parts.length) parts = [{ mark: false, s: raw }];

  // 2) 키워드를 아직 강조되지 않은 조각에서 처음 한 번만
  for (const kw of (kws || [])) {
    if (!kw || kw.length < 2) continue;
    let done = false;
    for (let i = 0; i < parts.length && !done; i++) {
      if (parts[i].mark) continue;
      const at = parts[i].s.indexOf(kw);
      if (at < 0) continue;
      const before = parts[i].s.slice(0, at), after = parts[i].s.slice(at + kw.length);
      const mid = [{ mark: true, s: kw }];
      if (before) mid.unshift({ mark: false, s: before });
      if (after) mid.push({ mark: false, s: after });
      parts.splice(i, 1, ...mid);
      done = true;
    }
  }
  return parts.map(p => p.mark ? `<strong>${esc(p.s)}</strong>` : esc(p.s)).join('');
}

function aiParts(x) {
  let term = x.term, concl = x.concl;
  if (concl == null) {
    const t = String(x.d || '').trim(), k = t.lastIndexOf('따라서 ');
    if (k >= 0) { term = t.slice(0, k).trim(); concl = t.slice(k + 4).trim(); }
    else { term = ''; concl = t; }
  }
  return { title: String(x.t || ''), term: String(term || ''), concl: String(concl || '') };
}

const aiBusy = new Set();   // 다시 쓰는 중인 항목 키

function aiItemHtml(x, i, p, d, kw) {
  const key = aiKey(d.id, p.slug, i);
  const src = aiParts(x);
  const ed = aiEditOf(d.id, p.slug, i);
  const v = ed ? { title: ed.title || src.title, term: ed.term, concl: ed.concl } : src;
  const busy = aiBusy.has(key);
  return `<li data-air="${esc(String(i))}" class="${busy ? 'is-busy' : ''}">
    <div class="aix__top">
      <span class="aix__num" aria-hidden="true">${i + 1}</span>
      <div class="aix__txt">
        <b>${esc(v.title)}${ed ? `<span class="aix__badge" title="${esc(ed.hint || '')}">고쳐 씀</span>` : ''}</b>
        <p class="aix__concl">${aiRich(v.concl, kw)}</p>
      </div>
    </div>
    ${v.term ? `<details class="aix__more"><summary><svg class="aix__chev" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="aix__lc">여기 나오는 말 풀이</span><span class="aix__lo">접기</span></summary><div class="aix__term">${aiRich(v.term, kw)}</div></details>` : ''}
    <div class="aix__foot">
      <button type="button" class="aix__redo" data-air-open="${esc(String(i))}" ${busy ? 'disabled' : ''}>다시 작성하기</button>
      ${ed ? `<button type="button" class="aix__undo" data-air-undo="${esc(String(i))}" ${busy ? 'disabled' : ''}>원래대로</button>` : ''}
      <span class="aix__wait" aria-live="polite">${busy ? '다시 쓰는 중… 10초쯤 걸립니다' : ''}</span>
    </div>
    <div class="aix__form" data-air-form="${esc(String(i))}" hidden>
      <label class="aix__lbl" for="airH${esc(String(i))}">어떻게 고칠까요?</label>
      <textarea id="airH${esc(String(i))}" class="aix__ta" rows="3" maxlength="1000"
        placeholder="예: 과전압이 뭔지 더 풀어 주세요 / 제주 상황을 예로 들어 주세요 / 두 문장으로 줄여 주세요"></textarea>
      <div class="aix__btns">
        <button type="button" class="aix__go" data-air-go="${esc(String(i))}">다시 쓰기</button>
        <button type="button" class="aix__cancel" data-air-cancel="${esc(String(i))}">취소</button>
      </div>
      <p class="aix__err" role="alert" hidden></p>
    </div>
  </li>`;
}

/* 세부 전공: 학과 파일의 키워드가 있으면 굵게 칠해 보여 준다 (원문은 그대로) */
function summaryHtml(p, d) {
  const data = insCache.get(d.id);
  const kw = (data && data.profs && data.profs[p.slug] && data.profs[p.slug].kw) || [];
  return aiRich(p.summary, kw);
}

function aiHtml(p, d, data) {
  if (data === undefined) return `<div class="ins__skel">불러오는 중…</div>`;
  const e = data && data.profs && data.profs[p.slug], a = e && e.ai;
  if (e && e.self) return `<p class="ins__empty">본인입니다.</p>`;
  if (!a || !a.items || !a.items.length) return `<p class="ins__empty">아직 정리된 내용이 없습니다.</p>`;
  return `
    ${a.sum ? `<p class="aix__sum">${aiRich(a.sum, e.kw || [])}</p>` : ''}
    <ul class="aix__list">${a.items.map((x, i) => aiItemHtml(x, i, p, d, e.kw || [])).join('')}</ul>
    <p class="ins__foot">세부 전공·대표 논문을 바탕으로 정리한 제안입니다.</p>`;
}

/* 다시 작성하기 버튼·입력칸 동작. 상세 창을 그릴 때마다 다시 매단다. */
function bindAix(root, p, d) {
  const box = root.querySelector('.aix[data-slug]');
  if (!box || box.dataset.airBound === '1') return;
  box.dataset.airBound = '1';

  const li = i => box.querySelector(`li[data-air="${CSS.escape(String(i))}"]`);
  const form = i => box.querySelector(`[data-air-form="${CSS.escape(String(i))}"]`);
  const showErr = (i, msg) => {
    const el = form(i)?.querySelector('.aix__err');
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  };

  box.addEventListener('click', async e => {
    const open = e.target.closest('[data-air-open]');
    if (open) {
      const i = open.dataset.airOpen, f = form(i);
      if (!f) return;
      f.hidden = false;
      showErr(i, '');
      f.querySelector('.aix__ta')?.focus();
      return;
    }
    const cancel = e.target.closest('[data-air-cancel]');
    if (cancel) { const f = form(cancel.dataset.airCancel); if (f) { f.hidden = true; showErr(cancel.dataset.airCancel, ''); } return; }

    const undo = e.target.closest('[data-air-undo]');
    if (undo) {
      const i = Number(undo.dataset.airUndo);
      if (!confirm('이 항목을 원래 내용으로 되돌릴까요? 고쳐 쓴 내용은 지워집니다.')) return;
      undo.disabled = true;
      try {
        await ratingsApi('airewrite_reset', { dept_id: d.id, slug: p.slug, idx: i });
        state.aiEdits.delete(aiKey(d.id, p.slug, i));
        redrawAix(box, p, d);
      } catch (err) {
        undo.disabled = false;
        flashStatus('되돌리지 못했습니다 — ' + err.message, true);
      }
      return;
    }

    const go = e.target.closest('[data-air-go]');
    if (!go) return;
    const i = Number(go.dataset.airGo), key = aiKey(d.id, p.slug, i);
    const f = form(i), ta = f?.querySelector('.aix__ta');
    const hint = String(ta?.value || '').trim();
    if (!hint) { showErr(i, '어떻게 고칠지 한 줄이라도 적어 주세요.'); ta?.focus(); return; }
    if (!state.session) { showErr(i, '로그인이 필요합니다.'); return; }
    if (aiBusy.has(key)) return;

    // 원문(또는 지금 보이는 내용)을 모델에 그대로 넘긴다
    const data = insCache.get(d.id);
    const item = data?.profs?.[p.slug]?.ai?.items?.[i];
    if (!item) { showErr(i, '원본 내용을 찾지 못했습니다.'); return; }
    const ed = aiEditOf(d.id, p.slug, i), src = aiParts(item);
    const cur = ed ? { title: ed.title || src.title, term: ed.term, concl: ed.concl } : src;

    aiBusy.add(key);
    if (f) f.hidden = true;
    redrawAix(box, p, d);
    try {
      const r = await ratingsApi('airewrite', { dept_id: d.id, slug: p.slug, idx: i, hint, title: cur.title, term: cur.term, concl: cur.concl });
      if (!r || !r.ok || !r.item) throw new Error((r && r.error) || '응답 오류');
      state.aiEdits.set(key, { title: String(r.item.title || ''), term: String(r.item.term || ''), concl: String(r.item.concl || ''), hint: String(r.item.hint || hint), updated_at: String(r.item.updated_at || '') });
      aiBusy.delete(key);
      redrawAix(box, p, d);
      li(i)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (err) {
      // 실패해도 원래 내용은 그대로 두고, 적어 둔 지시문도 남겨 둔다
      aiBusy.delete(key);
      redrawAix(box, p, d);
      const f2 = form(i);
      if (f2) { f2.hidden = false; const t2 = f2.querySelector('.aix__ta'); if (t2) t2.value = hint; }
      showErr(i, '다시 쓰지 못했습니다 — ' + err.message);
    }
  });
}

/* AI 융합 방향 칸만 다시 그리고 이벤트를 다시 맨다 */
function redrawAix(box, p, d) {
  // box 자체는 그대로 두고 안쪽만 갈아 끼운다 — 위임해 둔 클릭 리스너가 계속 살아 있다
  box.innerHTML = aiHtml(p, d, insCache.has(d.id) ? insCache.get(d.id) : undefined);
}

/* ---------- 상세 드로어 ---------- */
function openDrawer(p, d) {
  const links = [
    p.homepage && { href: p.homepage, label: '홈페이지', primary: true },
    p.scholar && { href: p.scholar, label: 'Google Scholar' },
    p.email && { href: 'mailto:' + p.email, label: '이메일' },
  ].filter(Boolean);
  $panel.style.setProperty('--dept-color', d.color);
  $panel.innerHTML = `
    <div class="d-head">
      <span class="dept-pill">${esc(d.name)}</span>
      <button class="iconbtn" type="button" data-close aria-label="닫기"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
    <div class="d-body">
      <div class="d-profile">
        <div class="d-photo"><div class="avatar" aria-hidden="true">${esc(initial(p.name))}</div>${p.photo ? `<img src="${esc(p.photo)}" data-alt="${esc(p.photo_alt)}" alt="${esc(p.name)} 사진" onerror="photoErr(this,'remove')">` : ''}</div>
        <div>
          <div class="d-top"><span class="d-rank">${esc(p.rank)}</span></div>
          <h2 class="d-name" id="drawerTitle">${esc(p.name)}</h2>
          <div class="d-en">${esc(p.name_en || '')}</div>
          <div class="d-tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        </div>
      </div>

      <div class="d-section"><h3>메모</h3>
        <div class="memo-box" data-key="${esc(rKey(p))}">
          <textarea class="memo" data-key="${esc(rKey(p))}" rows="3" maxlength="2000" placeholder="이 교수에 대한 메모 — 입력하면 자동으로 시트에 저장됩니다" aria-label="${esc(p.name)} 메모">${esc(getMemo(p))}</textarea>
          <div class="memo__st" aria-live="polite"></div>
        </div>
      </div>

      <div class="d-section d-ins"><h3>검색 결과</h3><div class="ins" data-slug="${esc(p.slug)}">${insightsHtml(p, d, insCache.has(d.id) ? insCache.get(d.id) : undefined)}</div></div>

      ${p.summary ? `<div class="d-section"><h3>세부 전공</h3><p class="d-summary" data-slug="${esc(p.slug)}">${summaryHtml(p, d)}</p></div>` : ''}

      <div class="d-section d-aix"><h3>AI 융합 방향</h3><div class="aix" data-slug="${esc(p.slug)}" data-dept="${esc(d.id)}">${aiHtml(p, d, insCache.has(d.id) ? insCache.get(d.id) : undefined)}</div></div>

      ${links.length ? `<div class="d-section"><h3>바로가기</h3><div class="d-links">${links.map(l => `<a class="lnk ${l.primary ? 'primary' : ''}" href="${esc(l.href)}" ${l.href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${esc(l.label)} ↗</a>`).join('')}</div></div>` : ''}
    </div>`;
  bindRates($panel);
  bindNotes($panel);
  bindAix($panel, p, d);
  if (!insCache.has(d.id)) loadInsights(d.id).then(data => {
    const box = $panel.querySelector(`.ins[data-slug="${CSS.escape(p.slug)}"]`);
    if (box) box.innerHTML = insightsHtml(p, d, data);
    const abox = $panel.querySelector(`.aix[data-slug="${CSS.escape(p.slug)}"]`);
    if (abox) abox.innerHTML = aiHtml(p, d, data);
    const sbox = $panel.querySelector(`.d-summary[data-slug="${CSS.escape(p.slug)}"]`);
    if (sbox) sbox.innerHTML = summaryHtml(p, d);
  });
  $drawer.hidden = false;
  document.body.style.overflow = 'hidden';
  $panel.querySelector('[data-close]').focus();
}

function closeDrawer(navigate = true) {
  if ($drawer.hidden) return;
  flushMemo(); // 쓰다 만 메모를 바로 저장
  $drawer.hidden = true;
  document.body.style.overflow = '';
  if (navigate) {
    const r = route();
    if (r.view === 'dept') history.replaceState(null, '', `#/dept/${encodeURIComponent(r.dept)}`);
  }
}
$drawer.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDrawer(true); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(true); });

/* ---------- 검색 · 테마 ---------- */
let qTimer;
$q.addEventListener('input', () => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => {
    state.query = $q.value;
    if (location.hash && location.hash !== '#/' && $q.value.trim()) location.hash = '#/';
    else render();
  }, 160);
});

const themeBtn = document.getElementById('themeBtn');
try { const t = localStorage.getItem('jnu-theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('jnu-theme', next); } catch {}
});

/* ---------- Google 로그인 ---------- */
const AUTH_KEY = 'jnu-auth';
const $gate = document.getElementById('gate');
const $user = document.getElementById('userBox');

function authEnabled() { return !!(CONFIG.AUTH && CONFIG.AUTH.CLIENT_ID); }

function decodeJwt(token) {
  try {
    let b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    b += '='.repeat((4 - b.length % 4) % 4);
    return JSON.parse(decodeURIComponent(atob(b).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
  } catch { return null; }
}

function isAllowed(email) {
  const e = String(email || '').toLowerCase();
  const { ALLOWED_EMAILS = [], ALLOWED_DOMAINS = [] } = CONFIG.AUTH;
  if (!ALLOWED_EMAILS.length && !ALLOWED_DOMAINS.length) return true;
  if (ALLOWED_EMAILS.map(x => x.toLowerCase()).includes(e)) return true;
  const dom = e.split('@')[1] || '';
  return ALLOWED_DOMAINS.some(d => dom === d.toLowerCase() || dom.endsWith('.' + d.toLowerCase()));
}

function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    if (s && s.exp > Date.now() && s.aud === CONFIG.AUTH.CLIENT_ID && isAllowed(s.email)) return s;
  } catch {}
  return null;
}

function saveSession(p, credential) {
  const s = { email: p.email, name: p.name || '', picture: p.picture || '', aud: p.aud, exp: Date.now() + CONFIG.AUTH.SESSION_HOURS * 3600e3, credential: credential || '', tokExp: (p.exp || 0) * 1000 };
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(s)); } catch {}
  return s;
}

function gateMessage(msg, warn = false) {
  const el = $gate.querySelector('.gate__msg');
  el.textContent = msg; el.classList.toggle('warn', warn);
}

let tokenWaiter = null, gisReady = false;
function onCredential(resp) {
  const p = decodeJwt(resp.credential);
  if (!p || p.aud !== CONFIG.AUTH.CLIENT_ID || !p.email_verified) { if (tokenWaiter) { tokenWaiter.reject(new Error('토큰 확인 실패')); tokenWaiter = null; } gateMessage('로그인 정보를 확인할 수 없습니다. 다시 시도해 주세요.', true); return; }
  if (!isAllowed(p.email)) { if (tokenWaiter) { tokenWaiter.reject(new Error('허용되지 않은 계정')); tokenWaiter = null; } gateMessage(`${p.email} 계정은 접근이 허용되지 않았습니다.`, true); return; }
  const s = saveSession(p, resp.credential);
  if (state.session) { // 이미 앱 안에 있음: 토큰만 갈아 끼우고 밀린 저장을 바로 올림
    if (state.session.email !== s.email) { if (tokenWaiter) { tokenWaiter.reject(new Error('다른 계정으로 로그인됨')); tokenWaiter = null; } location.reload(); return; }
    state.session = s;
    sync.authNeeded = false; sync.authHidden = false;
    if (CONFIG.RATINGS.API_URL) authToken().catch(() => {});   // 새 로그인 직후 장기 토큰 확보
    if (tokenWaiter) { const w = tokenWaiter; tokenWaiter = null; w.resolve(s.credential); }
    else { sync.last = 0; syncRatings(); }
    updateSaveBar();
    return;
  }
  enterApp(s);
}

function ensureGis() {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const init = () => {
      if (!window.google || !google.accounts) { if (tries++ < 50) return setTimeout(init, 200); return reject(new Error('Google 로그인 스크립트 없음')); }
      if (!gisReady) { google.accounts.id.initialize({ client_id: CONFIG.AUTH.CLIENT_ID, callback: onCredential, auto_select: true, ux_mode: 'popup', itp_support: true }); gisReady = true; }
      resolve();
    };
    init();
  });
}

/* 저장 API에 보낼 ID 토큰. 만료(약 1시간)됐으면 Google에 조용히 재발급 요청 */
async function getFreshToken() {
  const s = state.session;
  if (!s) throw new Error('로그인 필요');
  if (s.credential && s.tokExp - Date.now() > 60e3) return s.credential;
  if (sync.authNeeded) throw new Error('로그인 확인 필요'); // 이미 버튼을 띄워 둔 상태면 조용한 갱신을 반복하지 않음
  await ensureGis();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { if (tokenWaiter) { tokenWaiter = null; reject(authError()); } }, 15000);
    const done = fn => v => { clearTimeout(timer); fn(v); };
    tokenWaiter = { resolve: done(resolve), reject: done(reject) };
    google.accounts.id.prompt(n => { if (n.isNotDisplayed && n.isNotDisplayed() || n.isSkippedMoment && n.isSkippedMoment()) { if (tokenWaiter) { tokenWaiter.reject(authError()); tokenWaiter = null; } } });
  });
}

/* 조용한 갱신이 안 될 때: 로그아웃시키지 않고 하단 막대에 Google 버튼을 띄워 한 번만 누르게 함 */
function authError() { sync.authNeeded = true; sync.authHidden = false; updateSaveBar(); return new Error('로그인 확인 필요'); }

function renderUser(s) {
  if (!$user) return;
  $user.hidden = false;
  $user.innerHTML = `
    ${s.picture ? `<img src="${esc(s.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="user__initial">${esc(initial(s.name || s.email))}</span>`}
    <span class="user__email">${esc(s.email)}</span>
    <button type="button" class="user__out" id="logoutBtn">로그아웃</button>`;
  document.getElementById('logoutBtn').addEventListener('click', logout);
}

function logout() {
  try { localStorage.removeItem(AUTH_KEY); } catch {}
  try { google.accounts.id.disableAutoSelect(); } catch {}
  location.reload();
}

function enterApp(session) {
  state.session = session;
  // 구글 자격이 아직 살아 있는 동안 장기 토큰을 미리 받아 둔다 (만료된 뒤에는 발급할 수 없다)
  if (session && CONFIG.RATINGS.API_URL && !session.appToken && session.credential && session.tokExp - Date.now() > 60e3) {
    authToken().catch(e => console.warn('앱 토큰 선발급 실패:', e.message));
  }
  if (session) { session.exp = Date.now() + CONFIG.AUTH.SESSION_HOURS * 3600e3; try { localStorage.setItem(AUTH_KEY, JSON.stringify(session)); } catch {} } // 열 때마다 로그인 유지 기간 연장
  document.body.classList.add('authed');
  $gate.hidden = true;
  if (session) renderUser(session);
  loadRatingsCache();
  render();
  loadData().then(loadRatings);
}

function showGate() {
  document.body.classList.remove('authed');
  $gate.hidden = false;
  const btn = $gate.querySelector('.gate__btn');
  let tries = 0;
  ensureGis().then(() => {
    google.accounts.id.renderButton(btn, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 280, locale: 'ko' });
    google.accounts.id.prompt();
  }).catch(() => gateMessage('Google 로그인 스크립트를 불러오지 못했습니다. 네트워크를 확인해 주세요.', true));
}

/* ---------- 시작 ---------- */
startVersionWatch();
window.addEventListener('hashchange', () => { state.rankFilter = '전체'; state.favOnly = false; if (!state._keepRating) state.ratingFilter = '전체'; state._keepRating = false; render(); });
if (!authEnabled()) {
  enterApp(null);
} else {
  const s = loadSession();
  s ? enterApp(s) : showGate();
}
