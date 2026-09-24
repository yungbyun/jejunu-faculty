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
    LABELS: ['확', '긍', '중', '모', '부', '비'],
    NAMES: { '확': '확실', '긍': '긍정', '중': '보통', '모': '모름', '부': '부정', '비': '연구년 등으로 제외' },
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
  if (parts[0] === 'letters') return { view: 'letters' };
  if (parts[0] === 'outreach') return { view: 'outreach' };
  if (parts[0] === 'manual') return { view: 'manual' };
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
  } else if (r.view === 'letters') {
    renderLetters();
    closeDrawer(false);
  } else if (r.view === 'outreach') {
    renderOutreach();
    closeDrawer(false);
  } else if (r.view === 'manual') {
    renderManual();
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



/* ---------- 화면: 원고 (회차를 눈으로 보며 고친다) ----------
 * 왼쪽에서 고치면 오른쪽 미리보기가 바로 바뀝니다. 입력 중에는 화면을 다시 그리지 않습니다
 * (다시 그리면 커서가 날아갑니다). 저장은 입력이 멎으면 알아서 합니다. */
const LET = { ep: 1, dept: '전체', ch: '메일', seg: 'B', prof: '' };
let letTimer = null, letDirty = false;

/* 미리보기에 쓸 교수 한 명 */
function letProf() {
  if (LET.prof) { const p = state.rows.find(x => rKey(x) === LET.prof); if (p) return p; }
  if (LET.dept !== '전체') return (state.depts.find(d => d.id === LET.dept) || { profs: [] }).profs[0];
  return state.rows.find(p => segOf(p) === LET.seg) || state.rows[0];
}
/* 지금 고치고 있는 원고 (대상이 학과면 그 학과 것) */
function letSrc() {
  const ep = epOf(LET.ep); if (!ep) return '';
  const f = CH_FIELD[LET.ch];
  if (LET.dept !== '전체') return (((epov(LET.ep).dept || {})[LET.dept]) || {})[f] || '';
  return f === 'kakao' ? (ep.kakao || '') : (ep[f] || '');
}
function letSave(text) {
  const ep = epOf(LET.ep); if (!ep) return;
  if (LET.dept !== '전체') epSetOv(LET.ep, 'dept', LET.dept, LET.ch, text);
  else { ep[CH_FIELD[LET.ch]] = text; epSave(); }
}
/* 입력이 멎으면 저장. 화면은 다시 그리지 않는다 */
function letTouch(fn) {
  letDirty = true; letMark('저장 중…');
  clearTimeout(letTimer);
  letTimer = setTimeout(() => { fn(); letDirty = false; letMark('저장됨 ✓'); }, 700);
}
function letMark(t) { const el = $app.querySelector('[data-letsave]'); if (el) el.textContent = t; }

function letPreview() {
  const p = letProf(); if (!p) return '';
  const ep = epOf(LET.ep); if (!ep) return '';
  const f = CH_FIELD[LET.ch];
  const src = $app.querySelector('.let-src');
  const raw = src ? src.value : letSrc();
  const line = (ep.dept || {})[p.dept_id] || (ep.seg || {})[segOf(p)] || '';
  const ins = insCache.get(p.dept_id);
  const one = ins ? insLine(p, ins) : '';
  const base = raw || (f === 'kakao' ? (ep.kakao || ep.sms || ep.body) : (ep[f] || ep.body));
  return epFill(base, p, epFill(line, p, '', one), one).replace(/\n{3,}/g, '\n\n').trim();
}

function renderLetters() {
  if (!state.rows.length) return;
  const nos = epNos();
  if (!nos.includes(LET.ep)) LET.ep = nos[0] || 0;
  const ep = epOf(LET.ep);

  const list = nos.map(n => {
    const e = epOf(n), sent = state.rows.filter(p => epDone(p, n)).length;
    const st = epStatus(n);
    return `<button type="button" class="let-row ${LET.ep === n ? 'on' : ''}" data-letep="${n}">
      <span class="let-row__n">${n}</span>
      <span class="let-row__t">${esc(e.name || '(이름 없음)')}</span>
      <span class="let-row__s let-row__s--${st === '비어 있음' ? 'empty' : st === '작성 중' ? 'draft' : 'sent'}">${esc(st)}</span>
      <span class="let-row__d">${esc(e.planAt || '날짜 미정')}</span>
      <span class="let-row__p">${sent}/${state.rows.length}</span>
    </button>`;
  }).join('');

  if (!ep) {
    $app.innerHTML = `<div class="view letters"><div class="crumbs"><a href="#/">학과 목록</a><span class="sep">/</span><span>원고</span></div>
      <div class="empty"><strong>회차가 없습니다</strong></div></div>`;
    return;
  }

  const p = letProf();
  const targets = LET.dept === '전체'
    ? SEG_KEYS.map(k => `<button type="button" class="chip" data-letseg="${k}" aria-pressed="${LET.seg === k && !LET.prof}">${esc(SEG[k].name)}</button>`).join('')
    : (state.depts.find(d => d.id === LET.dept) || { profs: [] }).profs.map(x =>
        `<button type="button" class="chip" data-letprof="${esc(rKey(x))}" aria-pressed="${p && rKey(p) === rKey(x)}">${esc(x.name)}</button>`).join('');

  const segs = LET.dept === '전체' ? `<div class="let-segs">${SEG_KEYS.map(k =>
    `<label class="ep-seg"><span>${esc(SEG[k].name)} <i>${state.rows.filter(x => segOf(x) === k).length}명</i></span>
      <textarea rows="2" data-letseg-t="${k}">${esc((ep.seg || {})[k] || '')}</textarea></label>`).join('')}</div>` : '';

  const deptLine = LET.dept !== '전체'
    ? `<label class="ep-f"><span>이 학과 개인화 한 줄 <i>비우면 갈래 문장을 씁니다</i></span>
        <input type="text" data-letdline value="${esc((ep.dept || {})[LET.dept] || '')}"></label>` : '';

  $app.innerHTML = `
    <div class="view letters">
      <div class="crumbs"><a href="#/">학과 목록</a><span class="sep">/</span><span>원고</span></div>

      <div class="let-list">${list}
        <button type="button" class="let-row let-row--add" data-letadd>+ 회차 추가</button>
      </div>

      <div class="let-edit">
        <div class="let-meta">
          <label><span>이름</span><input type="text" data-letf="name" value="${esc(ep.name || '')}" placeholder="예: 연락처만 주십시오"></label>
          <label><span>보낼 때</span><input type="date" data-letf="planAt" value="${esc(ep.planAt || '')}"></label>
          <span class="let-save" data-letsave>저장됨 ✓</span>
        </div>
        <label class="ep-f"><span>제목</span><input type="text" data-letf="subject" value="${esc(ep.subject || '')}"></label>

        <div class="let-bar">
          <span class="ot-f__l">대상</span>
          <select data-letdept>
            <option value="전체"${LET.dept === '전체' ? ' selected' : ''}>전체 (${state.rows.length}명)</option>
            ${state.depts.map(d => `<option value="${esc(d.id)}"${LET.dept === d.id ? ' selected' : ''}>${esc(d.name)} (${d.profs.length}명)</option>`).join('')}
          </select>
          <span class="ot-f__l">채널</span>
          <div class="filters filters--ch">${CHANNELS.map(c =>
            `<button type="button" class="chip" data-letch="${esc(c)}" aria-pressed="${LET.ch === c}">${esc(c)}</button>`).join('')}</div>
        </div>

        ${deptLine}

        <div class="let-2col">
          <div class="let-pane">
            <div class="let-pane__h">원고 ${LET.dept === '전체' ? '<i>전체</i>' : `<i>${esc((state.depts.find(d => d.id === LET.dept) || {}).name || '')} 전용</i>`}</div>
            <textarea class="let-src" rows="20" placeholder="${LET.dept === '전체' ? '여기에 쓰십시오. {이름} {학과} {개인화} {연구} 를 쓰면 사람마다 바뀝니다.' : '비워 두면 전체 원고가 그대로 나갑니다.'}">${esc(letSrc())}</textarea>
          </div>
          <div class="let-pane">
            <div class="let-pane__h">미리보기 <i>${p ? esc(p.name + ' ' + p.rank) : ''}</i></div>
            <div class="filters let-targets">${targets}</div>
            <div class="let-prev" data-letprev></div>
          </div>
        </div>

        ${segs}

        <div class="ep-ai">
          <input type="text" class="ep-how" data-how placeholder="AI에게 줄 주문 (비우면 자연스럽게 다듬기)">
          <button type="button" class="btn" data-letai>AI로 다시 쓰기</button>
          ${LET.dept !== '전체' ? `<button type="button" class="btn" data-letcopy>전체 원고 가져오기</button>` : ''}
          <span class="st-note" data-aimsg></span>
        </div>
      </div>
    </div>`;

  const prev = $app.querySelector('[data-letprev]');
  if (prev) prev.textContent = letPreview();
  if (p) loadInsights(p.dept_id).then(() => { const el = $app.querySelector('[data-letprev]'); if (el) el.textContent = letPreview(); });
  bindLetters();
}

function bindLetters() {
  const prev = () => { const el = $app.querySelector('[data-letprev]'); if (el) el.textContent = letPreview(); };
  $app.querySelectorAll('[data-letep]').forEach(b => b.addEventListener('click', () => { LET.ep = Number(b.dataset.letep); LET.prof = ''; renderLetters(); }));
  $app.querySelector('[data-letadd]')?.addEventListener('click', () => { epAdd(true); renderLetters(); });
  $app.querySelectorAll('[data-letch]').forEach(b => b.addEventListener('click', () => { LET.ch = b.dataset.letch; renderLetters(); }));
  $app.querySelectorAll('[data-letseg]').forEach(b => b.addEventListener('click', () => { LET.seg = b.dataset.letseg; LET.prof = ''; renderLetters(); }));
  $app.querySelectorAll('[data-letprof]').forEach(b => b.addEventListener('click', () => { LET.prof = b.dataset.letprof; renderLetters(); }));
  $app.querySelector('[data-letdept]')?.addEventListener('change', e => { LET.dept = e.target.value; LET.prof = ''; renderLetters(); });

  const src = $app.querySelector('.let-src');
  src?.addEventListener('input', () => { prev(); letTouch(() => letSave(src.value)); });

  $app.querySelectorAll('[data-letf]').forEach(el => el.addEventListener('input', () => {
    letTouch(() => { const ep = epOf(LET.ep); if (ep) { ep[el.dataset.letf] = el.value; epSave(); } });
  }));
  $app.querySelectorAll('[data-letseg-t]').forEach(el => el.addEventListener('input', () => {
    prev();
    letTouch(() => { const ep = epOf(LET.ep); if (ep) { ep.seg = ep.seg || {}; ep.seg[el.dataset.letsegT] = el.value; epSave(); } });
  }));
  $app.querySelector('[data-letdline]')?.addEventListener('input', e => {
    prev();
    letTouch(() => { const ep = epOf(LET.ep); if (!ep) return; ep.dept = ep.dept || {};
      e.target.value.trim() ? ep.dept[LET.dept] = e.target.value.trim() : delete ep.dept[LET.dept]; epSave(); });
  });
  $app.querySelector('[data-letcopy]')?.addEventListener('click', () => {
    const ep = epOf(LET.ep), f = CH_FIELD[LET.ch];
    const t = f === 'kakao' ? (ep.kakao || ep.sms || ep.body) : (ep[f] || ep.body);
    $app.querySelector('.let-src').value = t; prev(); letTouch(() => letSave(t));
  });
  $app.querySelector('[data-letai]')?.addEventListener('click', async e => {
    const btn = e.target, msg = t => { const el = $app.querySelector('[data-aimsg]'); if (el) el.textContent = t; };
    btn.disabled = true; msg('다시 쓰는 중…');
    try {
      const ep = epOf(LET.ep), f = CH_FIELD[LET.ch];
      const cur = $app.querySelector('.let-src').value.trim() || (f === 'kakao' ? (ep.kakao || ep.sms || ep.body) : (ep[f] || ep.body));
      const how = $app.querySelector('[data-how]').value.trim() || '자연스럽게 다듬어 주십시오.';
      const who = LET.dept === '전체' ? '제주대학교 공과대학 교수님들 전체' : whoDept(LET.dept);
      const t = await aiRewrite(cur, who, how);
      $app.querySelector('.let-src').value = t; prev(); letTouch(() => letSave(t));
      msg('다 됐습니다. 확인하십시오 — 저장은 알아서 됩니다.');
    } catch (err) { msg(err.message); }
    btn.disabled = false;
  });
}

/* ---------- 화면: 접촉 (지지 요청 메시지 만들고 관리하기) ----------
 * 교수마다 성향(연·강·둘)을 달아 두고, 그 성향과 data/insights 의 "AI 융합 방향"을 끼워
 * 메일·문자·카톡 초안을 그 자리에서 조립한다. 초안은 만들고 복사할 뿐, 이 앱이 보내지는 않는다. */
const CHANNELS = ['메일', '문자', '카톡'];   // 원고 탭에서 채널별 원고를 쓰는 데 쓴다
const ME = { name: '변영철', dept: '컴퓨터공학과', room: '공과대학 4호관 D407', email: 'ycb@jejunu.ac.kr' };

/* 그 교수 연구에 AI 가 어떻게 붙는지 한 줄. insights 의 결론 문장을 그대로 쓴다. */
function insLine(p, data) {
  const v = data && data.profs && data.profs[p.slug];
  if (!v) return '';
  const it = ((v.ai || {}).items || [])[0];
  return (it && it.concl) || (v.ai || {}).sum || '';
}



/* ---------- 회차 (지지 요청 메일을 여러 번 나눠 보내기) ----------
 * 12월 투표일까지 열 번 넘게 보내므로, 한 통에 다 담지 않고 회차마다 이야기 하나씩 전한다.
 * 회차 = 공통 본문 + 갈래별 한 줄. 갈래는 학과로 자동으로 갈린다(손으로 태깅하지 않는다).
 * 저장은 settings 탭의 eps / epsent 키이므로 서버는 고치지 않는다. */
const EPS_KEY = 'jnu-eps', EPSENT_KEY = 'jnu-epsent';

/* 부트캠프 참여 정도에 따라 학과를 다섯 갈래로 나눈다 (2026-09 명단 기준) */
const SEG = {
  A: { name: '전자·통신', depts: ['comdol', 'telecom'] },
  B: { name: '참여 학과', depts: ['mse', 'nuclear', 'foodse', 'civil', 'elec'] },
  C: { name: '미참여 학과', depts: ['chemeng', 'archidesign', 'archieng'] },
  D: { name: '컴퓨터공학과', depts: ['ce'] },
  E: { name: '인공지능학과', depts: ['ai'] },
};
const SEG_KEYS = Object.keys(SEG);
const segOf = p => SEG_KEYS.find(k => SEG[k].depts.includes(p.dept_id)) || 'B';

let epsMap = null, epsentMap = null;
function eps() { if (!epsMap) { epsMap = loadObj(EPS_KEY); if (!Object.keys(epsMap).length) { epsMap = epSeed(); } } return epsMap; }
function epsent() { if (!epsentMap) epsentMap = loadObj(EPSENT_KEY); return epsentMap; }
const epNos = () => Object.keys(eps()).map(Number).sort((a, b) => a - b);
const epOf = n => eps()[String(n)] || null;

function epSave() { saveObj(EPS_KEY, eps(), SET_EP); }

/* ---------- 전체 → 학과 → 교수 3단 원고 ----------
 * 회차 본문이 바탕이고, 학과나 교수 단계에 글이 있으면 그것이 이깁니다.
 * 비워 두면 위 단계를 그대로 씁니다. 그래서 필요한 곳만 채우면 됩니다.
 * 회차마다 키를 따로 쓰는 이유: 시트 칸 하나가 5만 자라 한 키에 다 넣으면 넘칩니다. */
const EPOV_PRE = 'epov';
const epovLKey = n => 'jnu-epov' + n;
let epovMap = {};
function epov(n) { n = String(n); if (!epovMap[n]) epovMap[n] = loadObj(epovLKey(n)); return epovMap[n]; }
function epovSave(n) { saveObj(epovLKey(n), epov(n), EPOV_PRE + n); }
const CH_FIELD = { '메일': 'body', '문자': 'sms', '카톡': 'kakao' };

/* 그 사람에게 실제로 쓰일 원고(자리표시자는 아직 그대로) */
function epRaw(n, p, ch) {
  const ep = epOf(n); if (!ep) return '';
  const f = CH_FIELD[ch] || 'body', ov = epov(n);
  const pr = (ov.prof || {})[rKey(p)] || {};
  const dp = (ov.dept || {})[p.dept_id] || {};
  if (pr[f]) return pr[f];
  if (dp[f]) return dp[f];
  return f === 'kakao' ? (ep.kakao || ep.sms || ep.body) : (ep[f] || ep.body);
}
function epSetOv(n, kind, id, ch, text) {
  const ov = epov(n), f = CH_FIELD[ch] || 'body';
  ov[kind] = ov[kind] || {};
  const box = ov[kind][id] = ov[kind][id] || {};
  if (text && text.trim()) box[f] = text; else delete box[f];
  if (!Object.keys(box).length) delete ov[kind][id];
  if (!Object.keys(ov[kind]).length) delete ov[kind];
  epovSave(n);
}
/* 자리표시자까지 채운 최종 글 */
const epFinal = (n, p, ch, one) => {
  const ep = epOf(n); if (!ep) return '';
  const line = (ep.dept || {})[p.dept_id] || (ep.seg || {})[segOf(p)] || '';
  return epFill(epRaw(n, p, ch), p, epFill(line, p, '', one), one).replace(/\n{3,}/g, '\n\n').trim();
};

/* AI 로 다시 쓰기 — 서버(Apps Script)가 Claude 를 부른다 */
async function aiRewrite(text, who, how) {
  const r = await ratingsApi('rewrite', { text, who, how });
  if (r && r.error === 'bad action') throw new Error('Apps Script 를 다시 배포해야 합니다');
  if (!r || !r.ok) throw new Error((r && r.error) || '다시 쓰지 못했습니다');
  return r.text;
}
const whoDept = id => {
  const d = state.depts.find(x => x.id === id);
  return d ? `제주대학교 공과대학 ${d.name} 교수님들` : '';
};
const whoProf = p => `제주대학교 공과대학 ${p.dept_name} ${p.name} ${p.rank}. 전공 키워드: ${(p.tags || []).join(', ')}`;
function epAdd(silent) {
  const n = String((epNos().pop() || 0) + 1);
  eps()[n] = { name: '', planAt: '', subject: `${n}회차 — 컴퓨터공학과 변영철`, body: '', sms: '', kakao: '', seg: {}, dept: {} };
  epSave(); OUT.ep = Number(n); LET.ep = Number(n);
  if (!silent) renderOutreach();
  return Number(n);
}
/* 회차가 지금 어느 단계인지 — 따로 저장하지 않고 내용과 발송 기록으로 판단한다 */
function epStatus(n) {
  const ep = epOf(n); if (!ep) return '없음';
  const sent = state.rows.filter(p => epDone(p, n)).length;
  if (sent >= state.rows.length && state.rows.length) return '발송 완료';
  if (sent) return '발송 중';
  return (ep.body || '').trim() ? '작성 중' : '비어 있음';
}
function epDel(n) {
  delete eps()[String(n)]; epSave();
  OUT.ep = epNos()[0] || 0; renderOutreach();
}
/* 이 사람에게 이 회차가 나갔는지 */
const epDone = (p, n) => (epsent()[rKey(p)] || []).includes(Number(n));
function epMark(p, n, on) {
  const m = epsent(), k = rKey(p);
  const arr = new Set(m[k] || []);
  on ? arr.add(Number(n)) : arr.delete(Number(n));
  arr.size ? m[k] = [...arr].sort((a, b) => a - b) : delete m[k];
  saveObj(EPSENT_KEY, m, SET_EPS);
}

/* 공통 본문 + 그 사람 갈래 문장을 합쳐 실제로 보낼 글을 만든다.
 * {이름} {학과} 는 어디서나 치환되고, {개인화} 자리에 갈래 문장이 들어간다.
 * 학과별 문장(dept)이 있으면 갈래 문장보다 먼저 쓴다. */
function epFill(txt, p, line, one) {
  return String(txt || '')
    .replace(/\{개인화\}/g, line || '')
    .replace(/\{연구\}/g, one || '')
    .replace(/\{이름\}/g, p.name)
    .replace(/\{학과\}/g, p.dept_name);
}
/* one = 그 교수 insights 의 "AI 융합 방향" 한 줄. 본문이나 갈래 문장에서 {연구} 로 쓴다. */
function epBody(ep, p, ch, one) {
  if (!ep) return '';
  const line = (ep.dept || {})[p.dept_id] || (ep.seg || {})[segOf(p)] || '';
  const base = ch === '메일' ? ep.body
    : ch === '카톡' ? (ep.kakao || ep.sms || ep.body)
    : (ep.sms || ep.body);                       // 문자는 길면 안 읽히므로 따로 둔다
  return epFill(base, p, epFill(line, p, '', one), one).replace(/\n{3,}/g, '\n\n').trim();
}


/* 회차 열 개를 이름만 채워 둔다. 내용은 앱에서 직접 쓰신다.
 * 앱에서 고치면 settings 에 저장되어 그쪽이 이긴다 — 여기 값은 처음 한 번의 기본값일 뿐이다. */
const EP_NAMES = ['출마의 변', '연락처만 주십시오', 'AI 구독료 지원', '내 수업에 특강',
  '논문 쓰는 일 자체를', '나를 아는 에이전트', 'AI 툴박스', '인턴십',
  '국책과제와 데이터 센터', '계승·위원회·공간'];
function epSeed() {
  const m = { '1': Object.assign({ name: EP_NAMES[0], planAt: '' }, EP1), '2': EP2 };
  for (let i = 3; i <= 10; i++) {
    m[String(i)] = { name: EP_NAMES[i - 1], planAt: '', subject: '', body: '', sms: '', kakao: '', seg: {}, dept: {} };
  }
  return m;
}

/* 2회차 — 찾아가는 연구실 AX 지원 */
const EP2 = {
  name: EP_NAMES[1],
  planAt: '',
  subject: '교수님은 연락처만 주시면 됩니다 — 컴퓨터공학과 변영철',
  body: [
    '{이름} 교수님께', '',
    '지난번에 여름 부트캠프 이야기를 드렸습니다. 오늘은 겨울에 할 일을 말씀드리려 합니다.', '',
    '여름에 해 보고 알게 된 것이 하나 있습니다. 학생이 이미 문제를 알고 있을 때 가장 빨랐습니다. 기업에서 받아 온 문제를 처음 보는 학생보다, 자기 연구실에서 몇 달째 붙들고 있던 학생이 훨씬 멀리 갔습니다.', '',
    '그래서 겨울방학에는 연구실로 찾아가려 합니다.', '',
    '교수님이 하실 일은 하나입니다. 연구실 학생 연락처만 알려 주십시오. 학생에게 연구 미션을 주시는 데까지가 교수님 몫이고, 나머지는 저희가 합니다.', '',
    '· 연구에 AI를 어떻게 붙일지 (원하실 때만)',
    '· 연구를 돌려 볼 시뮬레이터, 결과를 보는 대시보드',
    '· AI로 LaTeX 논문 쓰는 법',
    '· 논문에 들어갈 그림과 다이어그램을 빠르게 그리는 법', '',
    '{개인화}', '',
    '긴 답장은 필요 없습니다. 학생 이름과 연락처 한 줄이면 됩니다.', '',
    '변영철 드림', '컴퓨터공학과 · 공과대학 4호관 D407 · ycb@jejunu.ac.kr',
  ].join('\n'),
  sms: [
    '{이름} 교수님, 컴퓨터공학과 변영철입니다.', '',
    '여름 부트캠프에서 알게 된 것이 있습니다. 학생이 이미 문제를 알고 있을 때 가장 빨랐습니다. 그래서 겨울방학에는 연구실로 찾아가려 합니다.',
    '교수님은 연구 미션만 주시고, 학생 연락처만 알려 주십시오. AI 활용법부터 시뮬레이터·대시보드, 논문 그림까지 저희가 붙어서 돕겠습니다.', '',
    '{개인화}', '',
    '긴 답장은 필요 없습니다. 학생 이름과 연락처 한 줄이면 됩니다. — 변영철',
  ].join('\n'),
  kakao: '',
  seg: {
    A: '교수님 학과는 캡스톤 과목으로 이미 함께하고 있습니다. 연구실 단위로도 이어 가면 좋겠습니다.',
    B: '여름에 {학과} 학생이 왔습니다. 겨울에는 교수님 연구실 학생이면 좋겠습니다.',
    C: '{학과}는 이번 여름에 참여가 없었습니다. 겨울에 첫 연구실이 되어 주시면 좋겠습니다.',
    D: '저희 학과야 말할 것도 없습니다만, 연구실 단위로는 아직 해 본 적이 없습니다. 같이 해 보시지요.',
    E: '이 일은 인공지능학과 교수님들 없이는 못 합니다. 받는 쪽으로도, 지원하는 쪽으로도 함께해 주시면 좋겠습니다.',
  },
  dept: {},
};

/* 1회차 기본값 — 대화로 합의한 내용을 넣어 둔다. 앱에서 그대로 고칠 수 있다. */
const EP1 = {
  subject: '요즘 학생들이 "컴송합니다"라고 합니다 — 컴퓨터공학과 변영철',
  body: [
    '{이름} 교수님께', '',
    '컴퓨터공학과 변영철입니다. 이번 공과대학 학장 선거에 나서게 되어 인사드립니다.', '',
    '예전에는 학생들이 "문송(문과라서 죄송)합니다"라고 했습니다. 요즘은 "컴송합니다"라고 합니다. 컴퓨터공학과라서 죄송하다는 뜻입니다. SW 개발이 저희 학과의 핵심인데 이제 AI가 훨씬 잘하니, 굳이 컴퓨터공학과 학생을 뽑을 이유가 줄었습니다. 컴퓨터공학이 가장 먼저 흔들리고 있습니다.', '',
    'AI가 보편적인 도구가 되면서, 대학 교육에도 가볍게 넘길 수 없는 걱정이 생겼습니다. 요즘 학생 과제를 받아 보시면 아실 겁니다. 문제를 내주면 학생이 그대로 AI에 넣고, 나온 것을 이해하지도 않은 채 문서로 만들어 제출합니다. 학생이 배달부가 되어 버렸고, 그 사이에 막히면서 배울 수 있었던 것들이 통째로 날아갑니다.', '',
    '이 부트캠프는 제주대학교 AI융합원의 AI 부트캠프사업단이 맡고 있습니다. 공과대학 학생을 포함해 우리 대학 누구나 참여할 수 있고, 에너지·우주·바이오·관광·해양·스마트시티·스마트팜 같은 제주 특화산업에 쓸 AX(AI 전환) 인재를 양성합니다(방학 중 집중 캠프로).', '',
    '지난 여름 부트캠프에서는 순서를 바꿔 봤습니다. 30개가 넘는 제주 기업에서 실제 문제를 받아 오고, 학생이 자기 전공에 맞는 문제를 직접 골랐습니다. 구글과 업스테이지 전문가가 AI 쓰는 법을 도왔고, 나온 답은 학생이 직접 분석하고 이해해서 마지막 판단까지 했습니다. 참여 학생의 70%가 컴퓨터·AI 전공이 아니었습니다. 전기·전자·통신처럼 전공이 제각각인 학생들이 각자 기업의 문제를 풀어 내는 것을 보면서, AI가 이렇게 쉽게 도움이 되는구나 싶었습니다.', '',
    '보고 나서 생각이 정리됐습니다. 학생이 손으로 하던 일은 AI가 하고, 교수가 하던 일—문제를 정의하고 판단하는 일—을 학생이 하게 됩니다. 공대가 지금 붙들어야 할 담론이 여기 있다고 봤고, 그래서 나섰습니다.', '',
    '{개인화}', '',
    '앞으로 투표일까지 이런 이야기를 가끔 전해 드리겠습니다. 답장은 안 하셔도 됩니다.', '',
    '변영철 드림', '컴퓨터공학과 · 공과대학 4호관 D407 · ycb@jejunu.ac.kr',
  ].join('\n'),
  /* 문자: 장문(LMS)이라도 짧을수록 읽힌다. 사업단 소개는 빼고 이야기만 남긴다. */
  sms: [
    '{이름} 교수님, 컴퓨터공학과 변영철입니다. 이번 공과대학 학장 선거에 나섰습니다.', '',
    '요즘 학생들은 "문송(문과라서 죄송)" 대신 "컴송(컴퓨터공학과라서 죄송)"이라고 합니다. SW 개발은 이제 AI가 훨씬 잘하니까요.',
    '더 걱정스러운 건 학생이 과제를 이해도 못 한 채 AI에 돌려 내는 일입니다. 학생이 배달부가 되어 버렸습니다.', '',
    '지난 여름 부트캠프에서는 순서를 바꿔, 30개가 넘는 제주 기업의 실제 문제를 학생이 고르고 AI가 낸 답을 직접 분석해 마지막 판단까지 하게 했습니다. 공대가 붙들어야 할 담론이 여기 있다고 보고 나섰습니다.', '',
    '{개인화}', '',
    '답장은 안 하셔도 됩니다. — 변영철',
  ].join('\n'),
  /* 카톡: 길이 제한이 없으니 메일에 가깝게 */
  kakao: [
    '{이름} 교수님, 컴퓨터공학과 변영철입니다. 이번 공과대학 학장 선거에 나섰습니다.', '',
    '요즘 학생들은 "문송(문과라서 죄송)합니다" 대신 "컴송(컴퓨터공학과라서 죄송)합니다"라고 합니다. SW 개발은 이제 AI가 훨씬 잘하니까요. 컴퓨터공학이 먼저 흔들리고 있습니다.',
    '더 걱정스러운 건 학생이 과제를 이해도 못 한 채 AI에 돌려 내는 일입니다. 학생이 배달부가 되어 버렸습니다.', '',
    '이 부트캠프는 제주대 AI융합원이 맡고 있습니다. 우리 대학 모든 학생이 참여할 수 있고, 제주 특화산업에 쓸 AX(AI 전환) 인재를 양성합니다(방학 중 집중 캠프로).', '',
    '지난 여름 부트캠프에서는 30개가 넘는 제주 기업에서 실제 문제를 받아 와, 학생이 문제를 고르고 AI가 낸 답을 직접 분석해 마지막 판단까지 하게 했습니다. 전기·전자·통신처럼 전공이 제각각인 학생들이 각자 기업의 문제를 풀어 내는 것을 보면서, AI가 이렇게 쉽게 도움이 되는구나 싶었습니다. 공대가 붙들어야 할 담론이 여기 있다고 보고 나섰습니다.', '',
    '{개인화}', '',
    '답장은 안 하셔도 됩니다. — 변영철',
  ].join('\n'),
  seg: {
    A: '교수님 학과는 이미 깊이 들어와 있습니다. 여름 부트캠프뿐 아니라 캡스톤디자인 과목으로도 함께했습니다.',
    B: '이번 여름에 {학과} 학생도 왔습니다.',
    C: '이번에는 {학과} 학생이 없었습니다. 겨울에는 꼭 왔으면 합니다.',
    D: '교수님께는 굳이 설명드릴 필요가 없는 이야기일 겁니다. 저희 학과가 제일 먼저 겪고 있으니까요. 그래서 밖에다 이 이야기를 꺼내는 일은 저희가 해야 한다고 생각했습니다.',
    E: '오해하실까 봐 한 줄 덧붙입니다. 각 학과가 중심이고 AI가 거기 붙어 돕는 구조로 가자는 말은, 인공지능학과의 몫이 줄어든다는 뜻이 아닙니다. 붙어 줄 사람이 필요해지는 곳이 학과 하나에서 공대 열두 개로 늘어난다는 뜻입니다. 공대의 AX는 인공지능학과 교수님들 없이는 시작도 못 합니다.',
  },
  dept: {
    comdol: '교수님 학과는 이미 깊이 들어와 있습니다. 여름 부트캠프뿐 아니라 캡스톤디자인 과목으로 30명이 함께했습니다.',
    telecom: '교수님 학과는 이미 깊이 들어와 있습니다. 여름 부트캠프뿐 아니라 캡스톤디자인 과목으로 10명이 함께했습니다.',
  },
};

/* ---------- 예약 발송 ----------
 * 이 앱은 예약만 쌓는다. 실제 발송은 Apps Script 의 시간 트리거(sendDue)가 하고,
 * 서버에서 outboxStart() 를 실행하기 전에는 한 통도 나가지 않는다. */
const OB = { rows: new Map(), on: false, dry: false, sms: false, quota: null, loaded: false, needDeploy: false };
/* 같은 교수라도 메일 예약과 문자 예약은 따로 잡힌다 */
const obKey = (p, ch) => `${rKey(p)}::${ch === '문자' ? 'sms' : 'mail'}`;
const obOf = (p, ch) => OB.rows.get(obKey(p, ch || '문자')) || null;
const obCount = () => [...OB.rows.values()].filter(x => x.status === 'queued').length;

async function obLoad(force) {
  if (!CONFIG.RATINGS.API_URL || !state.session) return;
  if (OB.loaded && !force) return;
  try {
    const r = await ratingsApi('outbox');
    if (r && r.error === 'bad action') { OB.needDeploy = true; OB.loaded = true; if (route().view === 'outreach') renderOutreach(); return; }
    if (!r || !r.ok) return;
    const m = new Map();
    (r.rows || []).forEach(x => {
      if (x.status === 'canceled' || !x.key) return;
      const k = `${x.key}::${x.channel === 'sms' ? 'sms' : 'mail'}`;
      const prev = m.get(k);
      if (!prev || new Date(x.sendAt) > new Date(prev.sendAt)) m.set(k, x);
    });
    Object.assign(OB, { rows: m, on: !!r.on, dry: !!r.dry, sms: !!r.sms, quota: r.quota, loaded: true, needDeploy: false });
    if (route().view === 'outreach') renderOutreach();
  } catch (e) { console.warn('예약 목록을 읽지 못했습니다:', e.message); }
}

async function obQueue(p, subject, body, whenLocal, ch) {
  const at = new Date(whenLocal);
  if (isNaN(at.getTime())) { flashStatus('보낼 시각을 확인해 주세요', true); return; }
  const sms = (ch || '문자') === '문자';
  const to = sms ? mobileOf(p) : p.email;
  if (!to) { flashStatus(sms ? '이 교수님은 핸드폰 번호가 없습니다' : '이 교수님은 메일 주소가 없습니다', true); return; }
  try {
    const r = await ratingsApi('queue', { to, key: rKey(p), subject: sms ? '' : subject, body, sendAt: at.toISOString(), channel: sms ? 'sms' : 'mail' });
    if (!r || !r.ok) throw new Error((r && r.error) || '예약 실패');
    await obLoad(true);
    flashStatus(`${p.name} 교수님 ${sms ? '문자' : '메일'}를 ${fmtWhen(at)}에 보내도록 예약했습니다`);
  } catch (e) { flashStatus('예약하지 못했습니다 — ' + e.message, true); }
}

async function obCancel(p, id) {
  try {
    const r = await ratingsApi('unqueue', { id });
    if (!r || !r.ok) throw new Error((r && r.error) || '취소 실패');
    await obLoad(true);
    flashStatus('예약을 취소했습니다');
  } catch (e) { flashStatus('취소하지 못했습니다 — ' + e.message, true); }
}

const pad2 = n => String(n).padStart(2, '0');
const fmtWhen = d => `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const dtLocal = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
/* 기본값은 내일 오전 9시 — 평일 아침이 가장 열어 볼 만한 시간이다 */
function nextMorning() { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }

/* 예약 발송이 지금 어떤 상태인지 한 줄로 알려 준다 */
function obNotice() {
  if (!CONFIG.RATINGS.API_URL || !state.session) return '';
  if (!OB.loaded) return '';
  const nq = obCount();
  /* 예약한 것이 없으면 아무 말도 하지 않는다. 쓰지도 않는 기능이 '켜짐' 이라고 떠 있으면
   * 메일이 나갈 것처럼 읽혀 불안하다. 재배포 안내는 실제로 예약을 걸려 할 때 초안 안에서 뜬다. */
  if (!nq) return '';
  if (OB.needDeploy) return `<p class="ot-warn">예약 ${nq}건이 있지만 Apps Script 를 다시 배포해야 나갑니다 — 편집기에서 <b>배포 → 배포 관리 → 새 버전</b>.</p>`;
  if (!OB.on) return `<p class="ot-warn">예약 <b>${nq}건</b>이 쌓여 있지만 서버에서 보내기가 <b>꺼져 있습니다</b> — 보내려면 Apps Script 편집기에서 <b>outboxStart()</b> 를 실행하십시오.</p>`;
  if (OB.dry) return `<p class="ot-warn">예약 <b>${nq}건</b> · <b>연습 모드</b> — 보낸 것으로 표시만 하고 실제로는 나가지 않습니다.</p>`;
  return `<p class="ot-ok">예약 <b>${nq}건</b>${OB.quota != null ? ` · 오늘 남은 발송 한도 ${OB.quota}통` : ''} — 때가 되면 5분 안에 나갑니다.</p>`;
}

/* ---------- 직접 보낸 기록 ----------
 * 앱이 보내는 것과는 아무 상관이 없다. 폰으로 손수 문자를 보낸 뒤, 누구에게 보냈는지 날짜별로
 * 찍어 두는 곳이다. 회차 발송 기록과도 섞지 않는다 — 손으로 보낸 것은 회차와 안 맞을 수 있다.
 * 저장은 선호도·항시 제외와 같은 길(비공개 시트)이라 폰에서 찍고 PC 에서 봐도 그대로다. */
const MSEND_KEY = 'jnu-msend';
let msendMap = null;
function msends() { if (!msendMap) msendMap = loadObj(MSEND_KEY); return msendMap; }
function msSave() { saveObj(MSEND_KEY, msends(), SET_MS); }
/* 최근 날짜가 위로 */
const msList = () => Object.entries(msends())
  .map(([id, v]) => ({ id, date: v.date || '', memo: v.memo || '',
    who: Array.isArray(v.who) ? v.who : [], na: Array.isArray(v.na) ? v.na : [] }))
  .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id));
function msAdd() {
  const id = String(Date.now()).slice(-9);
  const d = new Date();
  msends()[id] = { date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, memo: '', who: [], na: [] };
  msSave();
  return id;
}
function msDel(id) { delete msends()[id]; msSave(); }
/* 세 번 돌아간다: 아무것도 아님 → 보냄 → 따로 안 보내도 됨 → 아무것도 아님.
 * 두 번째 상태는 '이미 만나서 얘기했다' 처럼 문자를 굳이 안 보내도 되는 사람을 적어 두는 자리다. */
const MS_NONE = '', MS_SENT = 'sent', MS_SKIP = 'skip';
function msStateOf(r, k) {
  if (!r) return MS_NONE;
  if ((r.who || []).includes(k)) return MS_SENT;
  if ((r.na || []).includes(k)) return MS_SKIP;
  return MS_NONE;
}
function msToggle(id, k) {
  const r = msends()[id];
  if (!r) return MS_NONE;
  const w = new Set(r.who || []), n = new Set(r.na || []);
  const cur = msStateOf(r, k);
  w.delete(k); n.delete(k);
  const next = cur === MS_NONE ? MS_SENT : cur === MS_SENT ? MS_SKIP : MS_NONE;
  if (next === MS_SENT) w.add(k);
  if (next === MS_SKIP) n.add(k);
  r.who = [...w]; r.na = [...n];
  msSave();
  return next;
}
const MS_DAYS = ['일', '월', '화', '수', '목', '금', '토'];
/* 2026-09-25 → 2026-09-25 (금). 날짜에서 뽑으니 틀릴 일이 없다 */
function msWhen(v) {
  const d = new Date(String(v || '') + 'T00:00:00');
  return isNaN(d.getTime()) ? String(v || '') : `${v} (${MS_DAYS[d.getDay()]})`;
}

let MS_OPEN = '';   // 지금 펼쳐 놓은 기록

function renderManual() {
  const list = msList();
  const open = list.find(r => r.id === MS_OPEN);

  $app.innerHTML = `
    <div class="view">
      <div class="crumbs"><a href="#/outreach">접촉</a><span>/</span><span>직접 보낸 기록</span></div>
      <div class="hero"><div class="eyebrow">직접 보낸 기록</div>
        <h1>손으로 보낸 문자</h1>
        <p>폰으로 직접 보내신 뒤 여기에 찍어 두십시오. 앱이 보내는 것과는 따로 셉니다.</p></div>

      <div class="ms-acts"><button type="button" class="btn btn--go" data-msadd>+ 새 문자 전송 기록</button></div>

      ${list.length ? `<div class="ms-list">${list.map(r => `
        <div class="ms-row${r.id === MS_OPEN ? ' on' : ''}">
          <button type="button" class="ms-row__h" data-msopen="${esc(r.id)}" aria-expanded="${r.id === MS_OPEN}">
            <span class="ms-row__d">${esc(msWhen(r.date))}</span>
            <span class="ms-row__n"><b>${r.who.length}</b>명${r.na.length ? ` · 생략 ${r.na.length}` : ''}</span>
            <span class="ms-row__m">${esc(r.memo || '')}</span>
            <span class="ms-row__x">${r.id === MS_OPEN ? '접기' : '펼치기'}</span>
          </button>
          ${r.id === MS_OPEN ? msEdit(r) : ''}
        </div>`).join('')}</div>`
        : `<div class="empty"><strong>아직 기록이 없습니다</strong>위 단추를 눌러 오늘 보낸 것부터 남겨 보세요.</div>`}
    </div>`;
  bindManual();
}

/* 펼친 기록 한 건 — 날짜·메모와 선호도별 이름 칩 */
function msEdit(r) {
  const picked = new Set(r.who), skipped = new Set(r.na);
  return `<div class="ms-edit">
    <div class="ms-f">
      <label><span>보낸 날짜</span><input type="date" data-msdate value="${esc(r.date)}"></label>
      <span class="ms-day">${esc(msWhen(r.date).replace(r.date, '').trim())}</span>
      <label class="ms-f__memo"><span>메모</span><input type="text" data-msmemo value="${esc(r.memo)}" placeholder="예) 1회차 문자, 학과장님들 먼저"></label>
      <button type="button" class="btn ms-del" data-msdel>이 기록 지우기</button>
    </div>
    <p class="st-note">이름을 누를 때마다 <b class="ms-lg ms-lg--on">보냄</b> → <b class="ms-lg ms-lg--na">따로 안 보내도 됨</b> → 해제 순으로 바뀝니다.</p>
    <div class="ms-lists">
      ${RLABELS().map(g => {
        const ps = state.rows.filter(p => (getRating(p) || '미지정') === g);
        if (!ps.length) return '';
        const n = ps.filter(p => picked.has(rKey(p))).length;
        const nn = ps.filter(p => skipped.has(rKey(p))).length;
        return `<div class="ms-g">
          <h3><i class="sw sw--${rcls(g)}"></i>${esc(g)} <span class="n">${n}/${ps.length}${nn ? ` · 생략 ${nn}` : ''}</span></h3>
          <div class="ms-chips">${ps.map(p => {
            const k = rKey(p), st = msStateOf(r, k);
            return `<button type="button" class="ms-c${st === MS_SENT ? ' on' : st === MS_SKIP ? ' na' : ''}" data-mstoggle="${esc(k)}"
              style="--rc:${esc(RCOLOR[g] || '#6b7280')}" aria-pressed="${st === MS_SENT}"
              title="${esc(p.dept_name)} · ${esc(p.rank)} — 누를 때마다 보냄 → 따로 안 보내도 됨 → 해제">${esc(p.name)}</button>`;
          }).join('')}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="ms-foot">
      <button type="button" class="btn" data-msall>전원 표시</button>
      <button type="button" class="btn" data-msnone>모두 풀기</button>
      <span class="st-note">보냄 <b data-mscount>${r.who.length}</b>명${r.na.length ? ` · 따로 안 보내도 됨 <b data-mscountna>${r.na.length}</b>명` : ''}</span>
    </div>
  </div>`;
}

function bindManual() {
  const $ = s => $app.querySelector(s);
  $('[data-msadd]')?.addEventListener('click', () => { MS_OPEN = msAdd(); renderManual(); });
  $app.querySelectorAll('[data-msopen]').forEach(b => b.addEventListener('click', () => {
    MS_OPEN = MS_OPEN === b.dataset.msopen ? '' : b.dataset.msopen;
    renderManual();
  }));
  $('[data-msdate]')?.addEventListener('change', e => {
    const r = msends()[MS_OPEN]; if (!r) return;
    r.date = e.target.value; msSave(); renderManual();
  });
  /* 메모는 쓰는 동안 다시 그리지 않는다 — 커서가 튄다 */
  const memo = $('[data-msmemo]');
  memo?.addEventListener('input', () => { const r = msends()[MS_OPEN]; if (r) { r.memo = memo.value; msSave(); } });
  $('[data-msdel]')?.addEventListener('click', () => {
    const r = msends()[MS_OPEN]; if (!r) return;
    if (!confirm(`${msWhen(r.date)} 기록(${(r.who || []).length}명)을 지울까요?`)) return;
    msDel(MS_OPEN); MS_OPEN = ''; flashStatus('기록을 지웠습니다'); renderManual();
  });
  /* 이름 하나를 누르는 일은 잦다. 화면을 통째로 다시 그리지 않고 그 칩만 바꾼다. */
  $app.querySelectorAll('[data-mstoggle]').forEach(b => b.addEventListener('click', () => {
    const st = msToggle(MS_OPEN, b.dataset.mstoggle);
    b.classList.toggle('on', st === MS_SENT);
    b.classList.toggle('na', st === MS_SKIP);
    b.setAttribute('aria-pressed', String(st === MS_SENT));
    msRefreshCounts();
  }));
  $('[data-msall]')?.addEventListener('click', () => {
    const r = msends()[MS_OPEN]; if (!r) return;
    r.who = state.rows.filter(p => !(r.na || []).includes(rKey(p))).map(rKey); msSave(); renderManual();
  });
  $('[data-msnone]')?.addEventListener('click', () => {
    const r = msends()[MS_OPEN]; if (!r) return;
    r.who = []; r.na = []; msSave(); renderManual();
  });
}

/* 칩만 바꿔 놓고 숫자들을 맞춘다 */
function msRefreshCounts() {
  const r = msends()[MS_OPEN]; if (!r) return;
  const tot = $app.querySelector('[data-mscount]');
  if (tot) tot.textContent = String(r.who.length);
  const totNa = $app.querySelector('[data-mscountna]');
  if (totNa) totNa.textContent = String((r.na || []).length);
  $app.querySelectorAll('.ms-g').forEach(g => {
    const bs = [...g.querySelectorAll('[data-mstoggle]')];
    const on = bs.filter(b => b.classList.contains('on')).length;
    const na = bs.filter(b => b.classList.contains('na')).length;
    const n = g.querySelector('h3 .n');
    if (n) n.textContent = `${on}/${bs.length}${na ? ` · 생략 ${na}` : ''}`;
  });
  const head = $app.querySelector(`[data-msopen="${CSS.escape(MS_OPEN)}"] .ms-row__n`);
  if (head) head.innerHTML = `<b>${r.who.length}</b>명${(r.na || []).length ? ` · 생략 ${(r.na || []).length}` : ''}`;
}

/* ---------- 화면: 접촉 (문자 보내기) ----------
 * 예전에는 회차 원고를 사람마다 펼쳐 보며 AI 로 고쳐 쓰는 화면이었다. 지금은 그 반대다 —
 * 본문 하나를 직접 쓰고, 보낼 사람을 골라, 한 번에 예약한다.
 * 원고를 다듬는 일은 원고 탭이 맡는다. */
const OUT = { ep: 1, depts: new Set(), off: new Set(), text: '', at: '' };

/* 카톡은 자동으로 보낼 길이 없어 한 사람씩 손으로 붙여넣어야 한다. 어디까지 했는지만 적어 둔다.
 * 이 기기에만 둔다 — 보냈다는 기록이 아니라 작업 중인 표시일 뿐이다. */
/* 항시 제외 — 연구년·퇴임 예정 등 아예 보내지 않을 분. 관심 교수와 같은 길로 저장해
 * 다른 기기에서도 그대로 보인다. 받을 분에서 기본으로 빠진다. */
const NOSEND_KEY = 'jnu-nosend';
let noSendSet = null;
function noSend() {
  if (!noSendSet) {
    noSendSet = new Set();
    try { const v = JSON.parse(localStorage.getItem(NOSEND_KEY) || '[]'); if (Array.isArray(v)) noSendSet = new Set(v); } catch {}
  }
  return noSendSet;
}
const isNoSend = p => noSend().has(rKey(p));
function noSendSave() {
  try { const n = noSend(); n.size ? localStorage.setItem(NOSEND_KEY, JSON.stringify([...n])) : localStorage.removeItem(NOSEND_KEY); } catch {}
  saveSetting(SET_NS, settingValue(SET_NS));
}
function noSendToggle(p) {
  const n = noSend(), k = rKey(p);
  n.has(k) ? n.delete(k) : n.add(k);
  noSendSave();
  return n.has(k);
}

const COPIED_KEY = 'jnu-copied';
let copiedSet = null;
function copied() {
  if (!copiedSet) {
    copiedSet = new Set();
    try { const v = JSON.parse(localStorage.getItem(COPIED_KEY) || '[]'); if (Array.isArray(v)) copiedSet = new Set(v); } catch {}
  }
  return copiedSet;
}
function copyMark(k, on) {
  const c = copied();
  on ? c.add(k) : c.delete(k);
  try { c.size ? localStorage.setItem(COPIED_KEY, JSON.stringify([...c])) : localStorage.removeItem(COPIED_KEY); } catch {}
}
const copiedCount = () => outPicked().filter(p => copied().has(rKey(p))).length;

/* 지금 화면에 보이는 대상 (학과를 고르지 않았으면 전원) */
const outTargets = () => state.rows.filter(p => !OUT.depts.size || OUT.depts.has(p.dept_id));
/* 그중 실제로 나갈 사람 — 번호가 있고 해제하지 않은 사람 */
/* 아예 못 보내는 이유. 없으면 빈 문자열 — 그때만 고를 수 있다.
 * 비참여(선호도 '비')는 연구년 등으로 이번 선거에서 빠지는 분이라 과반 계산에서도 빠진다. */
const outSkip = p => isNoSend(p) ? '항시 제외'
  : getRating(p) === '비' ? '비참여'
  : !mobileOf(p) ? '번호 없음' : '';
const outPicked = () => outTargets().filter(p => !outSkip(p) && !OUT.off.has(rKey(p)));
/* 사람마다 이름·학과를 넣어 완성한 문장 */
const outBody = (p, t) => String(t == null ? OUT.text : t)
  .replace(/\{이름\}/g, p.name)
  .replace(/\{학과\}/g, p.dept_name);
const outLenNote = n => `${n}자${n > 45 ? ' — 45자를 넘어 장문(LMS)으로 나갑니다' : ''}`;
const OUT_SAMPLE = { name: '○○○', dept_name: '○○학과' };

function renderOutreach() {
  obLoad();
  const targets = outTargets();
  const picked = outPicked();
  const why = {};
  targets.forEach(p => { const r = outSkip(p); if (r) why[r] = (why[r] || 0) + 1; });
  const skipNote = Object.keys(why).map(r => `${r} ${why[r]}명`).join(' · ');
  const first = picked[0];

  $app.innerHTML = `
    <div class="view">
      <div class="crumbs"><a href="#/">학과 목록</a><span>/</span><span>접촉</span></div>
      <div class="ot-top"><a class="chip" href="#/manual">손으로 보낸 문자 기록하기 →</a></div>

      <section class="ot-sec">
        <div class="ot-sec__h"><h2>① 문자 쓰기</h2>
          <a class="chip ep-tab" href="#/letters" title="원고 탭에서 회차를 보고 고칩니다">원고 탭 ↗</a>
          <span class="st-note">{이름} 과 {학과} 는 사람마다 바뀝니다</span></div>
        <textarea class="ot-msg" data-sms rows="7" placeholder="보낼 문자를 쓰십시오.">${esc(OUT.text)}</textarea>
        <div class="ot-msg__b">
          <span class="st-note" data-len>${esc(outLenNote(outBody(first || OUT_SAMPLE).length))}</span>
          ${epNos().length ? `<span class="ot-load">
            <select data-epsel aria-label="불러올 회차">${epNos().map(n =>
              `<option value="${n}"${n === OUT.ep ? ' selected' : ''}>${n}회차 ${esc((epOf(n) || {}).name || '')}</option>`).join('')}</select>
            <button type="button" class="btn" data-epload="sms">문자 원고</button>
            <button type="button" class="btn" data-epload="kakao">카톡 원고</button></span>` : ''}
        </div>
      </section>

      <section class="ot-sec">
        <div class="ot-sec__h"><h2>② 보낼 학과</h2>
          <span class="st-note">여러 학과를 함께 고를 수 있습니다</span></div>
        <div class="filters">
          <button type="button" class="chip" data-dall aria-pressed="${!OUT.depts.size}">전체</button>
          ${state.depts.map(d => `<button type="button" class="chip" data-dept="${esc(d.id)}" aria-pressed="${OUT.depts.has(d.id)}">${esc(d.name)} ${d.profs.length}</button>`).join('')}
        </div>
      </section>

      <section class="ot-sec">
        <div class="ot-sec__h"><h2>③ 받을 분</h2>
          <span class="st-note"><b data-nsel>${picked.length}</b>명 선택됨${skipNote ? ` · 빠짐: ${esc(skipNote)}` : ''}
            · 카톡 복사 <b data-ncopy>${copiedCount()}</b>/${picked.length}</span></div>
        <div class="ot-acts">
          <button type="button" class="btn" data-allon>전체 선택</button>
          <button type="button" class="btn" data-alloff>전체 해제</button>
          ${copied().size ? `<button type="button" class="btn" data-copyclr>복사 표시 지우기</button>` : ''}
        </div>
        ${targets.length ? `<div class="ot-people">${targets.map(p => {
          const k = rKey(p), skip = outSkip(p), no = isNoSend(p);
          const on = !skip && !OUT.off.has(k);
          return `<div class="ot-p${skip ? ' ot-p--no' : ''}${no ? ' ot-p--ban' : ''}">
            <label class="ot-p__c"><input type="checkbox" data-pick="${esc(k)}"${on ? ' checked' : ''}${skip ? ' disabled' : ''}></label>
            <button type="button" class="ot-p__n" data-prof="${esc(k)}" title="${esc(p.name)} 교수 상세 보기">${esc(p.name)}</button>
            <span class="ot-p__d">${esc(p.dept_name)}</span>
            ${skip ? `<span class="ot-p__m">${esc(skip)}</span>`
              : `<button type="button" class="ot-p__m ot-p__m--go" data-num="${esc(mobileOf(p))}" title="번호를 복사합니다">${esc(mobileOf(p))}</button>`}
            ${skip ? '' : `<button type="button" class="ot-p__c2${copied().has(k) ? ' on' : ''}" data-copy="${esc(k)}" title="${copied().has(k) ? '다시 누르면 복사 표시를 지웁니다' : esc(p.name) + ' 교수님께 보낼 글을 복사합니다 — 카톡에 붙여넣으십시오'}">${copied().has(k) ? '✓ 복사함' : '복사'}</button>`}
            <button type="button" class="ot-p__ban${no ? ' on' : ''}" data-ban="${esc(k)}" title="${no ? '항시 제외에서 빼기' : '항시 제외에 넣기 — 앞으로 받을 분에 안 들어갑니다'}">${no ? '되돌리기' : '항시 제외'}</button>
          </div>`; }).join('')}</div>` : `<div class="empty"><strong>고른 학과에 교수가 없습니다</strong></div>`}
      </section>

      <section class="ot-sec">
        <div class="ot-sec__h"><h2>④ 보내기</h2></div>
        <div class="ot-prev"><span class="ot-prev__h">${first ? `${esc(first.name)} 교수님께 이렇게 나갑니다` : '받을 분을 고르면 미리보기가 나옵니다'}</span>
          <div class="ot-prev__b" data-prev>${esc(first ? outBody(first) : '')}</div></div>
        <div class="ot-send">
          <label class="ot-when"><span>보낼 시각</span>
            <input type="datetime-local" data-at value="${esc(OUT.at || dtLocal(nextMorning()))}"></label>
          <button type="button" class="btn btn--go" data-send${picked.length && OUT.text.trim() ? '' : ' disabled'}>${picked.length}명에게 보내기</button>
        </div>
        ${obNotice()}
        <p class="st-note">예약해 두면 5분마다 도는 트리거가 조금씩 내보냅니다. 잘못 보냈다 싶으면 Apps Script 에서 <b>outboxStop()</b> 으로 남은 것을 막을 수 있습니다.</p>
      </section>

      <p class="st-note ot-foot">보내는 것은 서버가 합니다. 이 화면은 예약만 겁니다.</p>
      <div class="ot-imp">
        <button type="button" class="btn" data-impopen>핸드폰 번호 한 번에 가져오기</button>
        <span class="st-note">지금 <b data-impn>${mobileCount()}</b>명 저장돼 있습니다 — 비공개 시트에만 있습니다${mobileStale() ? ` · <b data-impold>명단에 없는 번호 ${mobileStale()}건</b> <button type="button" class="ot-imp__x" data-impclean title="명단에 없는 번호를 지웁니다">지우기</button>` : ''}</span>
      </div>
      <div class="ot-impwrap" hidden></div>
    </div>`;
  bindOutreach();
}

/* 고른 사람들에게 한 번에 예약한다 */
async function outSend() {
  const picked = outPicked();
  const text = OUT.text.trim();
  if (!picked.length || !text) return;
  const at = new Date(OUT.at || dtLocal(nextMorning()));
  if (isNaN(at.getTime())) { flashStatus('보낼 시각을 확인해 주세요', true); return; }
  const f = picked[0], sample = outBody(f);
  const ask = `${picked.length}명에게 ${fmtWhen(at)} 에 문자를 보냅니다.\n\n`
    + `첫 대상: ${f.name} (${f.dept_name})\n\n`
    + sample.slice(0, 120) + (sample.length > 120 ? '…' : '') + '\n\n보낼까요?';
  if (!confirm(ask)) return;
  try {
    const items = picked.map(p => ({ to: mobileOf(p), key: rKey(p), body: outBody(p) }));
    const r = await ratingsApi('queueMany', { items, sendAt: at.toISOString(), channel: 'sms' });
    if (!r || !r.ok) throw new Error((r && r.error) === 'bad action'
      ? 'Apps Script 를 다시 배포해야 합니다' : ((r && r.error) || '예약 실패'));
    await obLoad(true);
    flashStatus(`${r.n}명에게 예약했습니다${r.skip ? ` (건너뜀 ${r.skip})` : ''}`);
    renderOutreach();
  } catch (e) { flashStatus('예약하지 못했습니다 — ' + e.message, true); }
}

function bindOutreach() {
  const $ = s => $app.querySelector(s);
  /* 글을 쓰는 동안 화면을 다시 그리지 않는다 — 다시 그리면 커서가 튄다. 숫자만 고쳐 준다. */
  const draw = () => {
    const picked = outPicked(), first = picked[0];
    const el = $('[data-len]');
    if (el) el.textContent = outLenNote(outBody(first || OUT_SAMPLE).length);
    const pv = $('[data-prev]');
    if (pv) pv.textContent = first ? outBody(first) : '';
    const n = $('[data-nsel]');
    if (n) n.textContent = String(picked.length);
    const go = $('[data-send]');
    if (go) { go.textContent = `${picked.length}명에게 보내기`; go.disabled = !(picked.length && OUT.text.trim()); }
  };

  const ta = $('[data-sms]');
  ta?.addEventListener('input', () => { OUT.text = ta.value; draw(); });
  $('[data-at]')?.addEventListener('change', e => { OUT.at = e.target.value; });

  $app.querySelectorAll('[data-epload]').forEach(b => b.addEventListener('click', () => {
    const n = Number($('[data-epsel]').value), ep = epOf(n), kind = b.dataset.epload;
    if (!ep) return;
    const name = kind === 'kakao' ? '카톡' : '문자';
    if (OUT.text.trim() && !confirm(`${n}회차 ${name} 원고를 불러옵니다. 지금 쓰신 내용은 지워집니다.`)) return;
    OUT.ep = n;
    OUT.text = kind === 'kakao' ? (ep.kakao || ep.sms || ep.body || '') : (ep.sms || ep.body || '');
    renderOutreach();
  }));

  $('[data-dall]')?.addEventListener('click', () => { OUT.depts.clear(); renderOutreach(); });
  $app.querySelectorAll('[data-dept]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.dept;
    OUT.depts.has(id) ? OUT.depts.delete(id) : OUT.depts.add(id);
    renderOutreach();
  }));

  $('[data-allon]')?.addEventListener('click', () => { outTargets().forEach(p => OUT.off.delete(rKey(p))); renderOutreach(); });
  $('[data-alloff]')?.addEventListener('click', () => { outTargets().forEach(p => OUT.off.add(rKey(p))); renderOutreach(); });
  $app.querySelectorAll('[data-pick]').forEach(c => c.addEventListener('change', () => {
    c.checked ? OUT.off.delete(c.dataset.pick) : OUT.off.add(c.dataset.pick);
    draw();
  }));

  /* 이름을 누르면 상세를 띄운다. 주소는 그대로 둬서 닫으면 보던 목록으로 돌아온다. */
  $app.querySelectorAll('[data-prof]').forEach(b => b.addEventListener('click', () => {
    const p = state.rows.find(x => rKey(x) === b.dataset.prof);
    const d = p && state.depts.find(x => x.id === p.dept_id);
    if (p && d) openDrawer(p, d);
  }));

  /* 카톡용 복사 — 그 사람 이름이 들어간 완성된 글을 클립보드에 담는다.
   * 화면을 다시 그리지 않는다. 69명을 훑는 중에 목록이 맨 위로 튀면 못 쓴다. */
  $app.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    const k = b.dataset.copy, p = state.rows.find(x => rKey(x) === k);
    if (!p) return;
    const bump = () => { const n = $('[data-ncopy]'); if (n) n.textContent = String(copiedCount()); };
    /* 이미 복사함이면 표시를 되돌린다 — 잘못 눌렀을 때 되돌릴 길이 있어야 한다 */
    if (copied().has(k)) {
      copyMark(k, false);
      b.classList.remove('on');
      b.textContent = '복사';
      bump();
      flashStatus(`${p.name} 교수님 복사 표시를 지웠습니다`);
      return;
    }
    if (!OUT.text.trim()) { flashStatus('먼저 보낼 글을 쓰십시오', true); return; }
    try {
      await navigator.clipboard.writeText(outBody(p));
      copyMark(k, true);
      b.classList.add('on');
      b.textContent = '✓ 복사함';
      bump();
      flashStatus(`${p.name} 교수님께 보낼 글을 복사했습니다 — 카톡에 붙여넣으십시오`);
    } catch (e) { flashStatus('복사하지 못했습니다 — ' + e.message, true); }
  }));
  /* 번호를 누르면 클립보드에 담는다 — 카톡에서 사람을 찾을 때 번호로 검색하게 된다 */
  $app.querySelectorAll('[data-num]').forEach(b => b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.num);
      const old = b.textContent;
      b.textContent = '✓ 복사';
      setTimeout(() => { b.textContent = old; }, 1200);
      flashStatus(`${b.dataset.num} 을(를) 복사했습니다`);
    } catch (e) { flashStatus('복사하지 못했습니다 — ' + e.message, true); }
  }));
  $app.querySelectorAll('[data-ban]').forEach(b => b.addEventListener('click', () => {
    const p = state.rows.find(x => rKey(x) === b.dataset.ban);
    if (!p) return;
    const on = noSendToggle(p);
    flashStatus(on ? `${p.name} 교수님을 항시 제외에 넣었습니다` : `${p.name} 교수님을 항시 제외에서 뺐습니다`);
    renderOutreach();
  }));
  $('[data-copyclr]')?.addEventListener('click', () => {
    if (!confirm('복사 표시를 모두 지울까요? 보낸 기록이 아니라 어디까지 복사했는지 표시일 뿐입니다.')) return;
    copiedSet = new Set();
    try { localStorage.removeItem(COPIED_KEY); } catch {}
    renderOutreach();
  });

  $('[data-send]')?.addEventListener('click', outSend);

  $('[data-impclean]')?.addEventListener('click', () => {
    const n = mobileStale();
    if (!n) return;
    if (!confirm(`명단에 없는 번호 ${n}건을 지울까요? 퇴직 등으로 명단에서 빠진 교수의 번호입니다.`)) return;
    flashStatus(`명단에 없는 번호 ${mobilePrune()}건을 지웠습니다`);
    renderOutreach();
  });
  $('[data-impopen]')?.addEventListener('click', e => {
    const wrap = $('.ot-impwrap');
    if (!wrap) return;
    e.target.disabled = true;
    wrap.hidden = false;
    wrap.innerHTML = `<div class="ot-impbox">
      <p class="st-note">번호가 든 <code>.json</code> 파일을 고르십시오.
      파일은 이 브라우저 안에서만 열립니다 — <b>공개 저장소에는 저장되지 않습니다.</b></p>
      <div class="ep-acts">
        <label class="btn imp-file">파일 선택<input type="file" accept=".json,.txt,application/json" data-impfile hidden></label>
        <span class="st-note" data-impname></span>
      </div>
      <p class="st-note" data-impmsg></p></div>`;
    const msg = wrap.querySelector('[data-impmsg]');
    const take = text => {
      const r = mobileImport(text);
      if (r.err) { msg.textContent = r.err; msg.classList.add('bad'); return; }
      msg.classList.toggle('bad', r.n === 0);
      const cut = a => a.slice(0, 8).join(', ') + (a.length > 8 ? ' 외 ' + (a.length - 8) + '명' : '');
      const parts = [`${r.total}개 중 ${r.n}명 반영했습니다${r.del ? ` (${r.del}명 지움)` : ''}`];
      if (r.unknown.length) parts.push(`명단에 없는 이름 ${r.unknown.length}개 — ${cut(r.unknown)}`);
      if (r.badnum.length) parts.push(`번호 모양이 이상함 ${r.badnum.length}개 — ${cut(r.badnum)}`);
      if (mobileStale()) parts.push(`명단에 없는 번호 ${mobileStale()}건이 남아 있습니다 (퇴직 등)`);
      msg.textContent = parts.join(' / ');
      const nEl = $('[data-impn]');
      if (nEl) nEl.textContent = String(mobileCount());
      if (r.n) flashStatus(`핸드폰 ${r.n}명 가져왔습니다`);
    };
    wrap.querySelector('[data-impfile]').addEventListener('change', ev => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      wrap.querySelector('[data-impname]').textContent = f.name;
      const rd = new FileReader();
      rd.onload = () => take(String(rd.result || ''));
      rd.onerror = () => { msg.textContent = '파일을 읽지 못했습니다'; msg.classList.add('bad'); };
      rd.readAsText(f, 'utf-8');
    });
  });
}

/* ---------- 화면: 분석 (선호도 시각화) ---------- */
const SCORE = { '확': 4, '긍': 3, '중': 2, '모': 1, '부': -1 }; // 비(평가제외)는 점수 없음 → 평균·키워드 분석에서 제외
const hasScore = p => SCORE[getRating(p)] != null;
const RLABELS = () => [...CONFIG.RATINGS.LABELS, '미지정'];
const rcls = r => r === '미지정' ? 'none' : rClass(r);

/* ---------- 선호도 원그래프 ----------
 * '비'(평가제외)는 애초에 평가 대상이 아니므로 뺀다. 색은 화면 곳곳에서 쓰는 선호도 색과 같게 맞춘다. */
const RCOLOR = { '확': '#38831c', '긍': '#0d8a6a', '중': '#0a7ab0', '모': '#6b7280', '부': '#c0392b', '비': '#7c5cbf', '미지정': '#b9c0cc' };
const PIE_LABELS = () => RLABELS().filter(r => r !== '비');

function donut(profs) {
  const c = dist(profs);
  const items = PIE_LABELS().map(r => ({ r, n: c[r] })).filter(x => x.n > 0);
  const total = items.reduce((a, b) => a + b.n, 0);
  if (!total) return '';
  const sure = c['확'] || 0, pos = c['긍'] || 0, base = sure + pos;
  const pct = n => Math.round(n / total * 100);
  /* 기준선은 모수의 절반(올림)이다. 66명이면 33명 — 이것은 '절반' 이지 '과반' 이 아니다.
   * 과반(절반을 넘음)은 34명부터이고, 33 대 33 이면 동수라 이기지 못한다. 그래도 눈에 익은
   * 숫자가 절반이어서 기준을 절반에 두고, 말도 절반이라고 쓴다.
   * 모수는 평가제외(비)를 뺀 인원이고, 더 끌어올 수 있는 사람은 중·모다. 부(부정)는 세지
   * 않는다 — 돌려세우는 것은 다른 일이다. */
  const midlow = (c['중'] || 0) + (c['모'] || 0), none = c['미지정'] || 0;
  const half = Math.ceil(total / 2);   // 66명이면 33명 (홀수면 올림 — 65명도 33명)
  const need = half - base;
  /* 아직 선호도를 안 매긴 사람도 끌어올 수 있는 사람이다. 숫자를 섞지는 않고 옆에 같이 적는다 */
  const pool = none ? `중·모 ${midlow}명 · 미지정 ${none}명 중에서` : `중·모 ${midlow}명 중에서`;
  const R = 72, W = 24, CX = 100, CY = 112;
  const HALF = Math.PI * R, FULL = 2 * Math.PI * R;
  let off = 0;
  /* 조각 한가운데 좌표. 파선은 9시에서 시작해 위로 도는 반원이므로, 시작점에서 잰 호 길이를
   * 각도로 바꿔 놓으면 된다(θ = 길이 / 반지름). */
  const midXY = (a, b) => {
    const t = (a + b / 2) / R;
    return [CX - R * Math.cos(t), CY - R * Math.sin(t)];
  };
  const arcs = items.map(({ r, n }) => {
    const len = n / total * HALF, seg = Math.max(0, len - (items.length > 1 ? 1.5 : 0));
    const [tx, ty] = midXY(off, len);
    const a = `<g class="pie__hit" data-rs="${esc(r)}" role="button" tabindex="0"
      aria-label="${esc(r)} ${n}명 — 아래 선호도별 교수 목록으로">
      <circle class="pie__seg" r="${R}" cx="${CX}" cy="${CY}" fill="none" stroke="${RCOLOR[r]}" stroke-width="${W}"
        stroke-dasharray="${seg.toFixed(2)} ${(FULL - seg).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"
        transform="rotate(180 ${CX} ${CY})"><title>${esc(r)} ${n}명 (${Math.round(n / total * 100)}%) — 눌러서 명단 보기</title></circle>
      ${len >= 13 ? `<text class="pie__sn" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}">${n}</text>` : ''}
    </g>`;
    off += len;
    return a;
  }).join('');
  return `
    <div class="pie">
      <svg class="pie__svg" viewBox="0 0 200 138" role="img"
        aria-label="선호도 분포 — 확 ${sure}명으로 ${pct(sure)}%, 확과 긍을 합하면 ${base}명으로 ${pct(base)}%. ${items.map(x => `${x.r} ${x.n}명`).join(', ')} (평가제외 빼고 합계 ${total}명)">
        <circle r="${R}" cx="${CX}" cy="${CY}" fill="none" stroke="var(--surface-2)" stroke-width="${W}"
          stroke-dasharray="${HALF.toFixed(1)} ${HALF.toFixed(1)}" transform="rotate(180 ${CX} ${CY})"></circle>
        ${arcs}
        <text class="pie__n" x="100" y="100">${pct(sure)}%</text>
        <text class="pie__u" x="100" y="122">확(확실) · ${sure}명 / ${total}명</text>
      </svg>
      <div class="pie__kpi">
        <div class="pie__k pie__k--pos"><span class="pie__kl">확+긍(지지 기반)</span><b>${pct(base)}%</b><span class="pie__kn">${base}명 / ${total}명</span></div>
        ${need > 0
          ? `<div class="pie__k pie__k--goal"><span class="pie__kl">절반까지</span><b>${need}명</b><span class="pie__kn">${pool}</span></div>`
          : need === 0
          ? `<div class="pie__k pie__k--over"><span class="pie__kl">절반 딱 맞음</span><b>${base}명</b><span class="pie__kn">절반 ${half}명 기준</span></div>`
          : `<div class="pie__k pie__k--over"><span class="pie__kl">절반 넘음</span><b>+${-need}명</b><span class="pie__kn">절반 ${half}명 기준</span></div>`}
      </div>
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
            <div class="st-list" data-rslist="${esc(r)}"><h3><i class="sw sw--${rcls(r)}"></i>${esc(r)} <span class="n">${ps.length}</span></h3>
              ${ps.length ? `<ul>${ps.map(p => { const met = getMet(p); return `<li><a href="#/dept/${encodeURIComponent(p.dept_id)}/prof/${encodeURIComponent(p.slug)}" title="${esc(p.dept_name)} · ${esc(p.rank)}${met ? ` · 만남 ${met}회` : ''}">${esc(p.name)}${met ? `<i class="metlit" style="--lit:${esc(RCOLOR[r] || '#22c55e')}" role="img" aria-label="만난 적 있음 ${met}회"></i>` : ''}</a></li>`; }).join('')}</ul>` : `<div class="muted st-small">없음</div>`}
            </div>`; }).join('')}
        </div>
      </section>
    </div>`;

  $app.querySelectorAll('[data-go]').forEach(el => {
    const go = () => { state.ratingFilter = el.dataset.rating; state._keepRating = true; location.hash = `#/dept/${encodeURIComponent(el.dataset.go)}`; };
    el.addEventListener('click', go);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  /* 도넛 조각 → 아래 명단의 그 줄로. 화면을 옮기지 않고 같은 페이지 안에서 내려간다. */
  $app.querySelectorAll('[data-rs]').forEach(el => {
    const go = () => {
      const box = $app.querySelector(`[data-rslist="${CSS.escape(el.dataset.rs)}"]`);
      if (!box) return;
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      box.classList.remove('st-list--hit');
      void box.offsetWidth;                       // 같은 곳을 다시 눌러도 다시 번쩍이게
      box.classList.add('st-list--hit');
    };
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
            <span class="favc__t"><b>${esc(p.name)}</b><small>${esc(p.dept_name)} · ${esc(p.rank)}</small>${loc ? `<small class="favc__loc"><svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>${esc(shortLoc(loc))}</small>` : ''}</span>
            ${r ? `<i class="rs rs--${rcls(r)}">${esc(r)}</i>` : ''}
            </a>
            ${meetCounter(p)}
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

  bindNotes($app);        // 관심 카드의 만남 카운터
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
/* 관심 카드처럼 자리가 좁은 곳에서는 건물 이름을 줄여 쓴다.
 * 공과대학 → 공대, 해양과학대학 → 해대. (공대 명단 원본도 '해대' 로 적고 있다) */
const shortLoc = v => String(v || '')
  .replace(/^해양과학대학\s*/, '해대 ')
  .replace(/^공과대학\s*/, '공대 ');

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
        ${chickBadge(p)}
      </div>
      <div class="prof__body">
        <div class="prof__head">
          <div class="prof__rank">${esc(p.rank)}${showDept ? ` · ${esc(p.dept_name)}` : ''}</div>
          <h3 class="prof__name">${esc(p.name)}<span class="prof__sub"><small>${esc(p.name_en || '')}</small>${lab ? `<i class="prof__lab">${esc(lab)}</i>` : ''}</span></h3>
          ${favBtn(p)}
        </div>
        <div class="prof__tags">${p.tags.slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        <div class="prof__bottom">
        ${loc || p.phone || mobileOf(p) ? `<div class="prof__office">
          ${loc ? `<span class="po__room"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg><span class="po__t">${esc(loc)}</span></span>` : ''}
          ${p.phone ? `<a class="po__tel" href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}" aria-label="${esc(p.name)} 전화 ${esc(p.phone)}"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.57 3.6a1 1 0 0 1-.25 1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>${esc(p.phone)}</a>` : ''}
          ${mobileOf(p) ? `<a class="po__tel po__mob" href="tel:${esc(mobileOf(p).replace(/[^\d+]/g, ''))}" aria-label="${esc(p.name)} 핸드폰 ${esc(mobileOf(p))}"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 18.6h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>${esc(mobileOf(p))}</a>` : ''}
        </div>` : ''}
        <div class="prof__foot"><span class="prof__note">${noteBadge(entryOf(rKey(p)))}</span>${rateChips(p)}${meetCounter(p)}</div>
        </div>
      </div>
    </div>`;
}

/* ---------- 선호도 ---------- */
const rKey = p => `${p.dept_id}/${p.slug}`;
/* 카드에 붙는 작은 표시: 만남 N회 · 메모 있음 */
const noteBadge = e => e.memo ? `<span class="nb nb--memo" title="${esc(memoPlain(e.memo))}">메모</span>` : '';
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
const rClass = r => ({ '확': 'high', '긍': 'pos', '중': 'mid', '모': 'low', '부': 'neg', '비': 'na' }[r] || '');
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

/* ---------- 메일 보낸 횟수 ----------
 * 관심 교수와 같은 길(settings 탭)로 저장한다. 값이 배열이 아니라 객체라는 점만 다르고,
 * 서버(Code.gs)는 키 이름을 가리지 않으므로 고칠 것이 없다.
 *   mailcnt {"<dept>/<slug>": 2}
 * (성향 태그와 접촉 상태는 2026-09-21 에 뺐다 — 회차 갈래가 그 일을 맡는다) */
const MAIL_KEY = 'jnu-mailcnt', MOBILE_KEY = 'jnu-mobile';

let mailMap = null, mobileMap = null;
function loadObj(k) {
  try { const v = JSON.parse(localStorage.getItem(k) || 'null'); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch {}
  return {};
}
function saveObj(k, m, setKey) {
  try { Object.keys(m).length ? localStorage.setItem(k, JSON.stringify(m)) : localStorage.removeItem(k); } catch {}
  saveSetting(setKey, m);
}
function mails() { if (!mailMap) mailMap = loadObj(MAIL_KEY); return mailMap; }

/* ---------- 핸드폰 번호 ----------
 * 저장소는 공개이고 data/professors.json 은 누구나 내려받을 수 있다. 그래서 개인 휴대폰 번호는
 * 그쪽에 절대 넣지 않고, 선호도·메모와 같은 길로 비공개 시트(settings 탭)에만 둔다.
 * 로그인한 본인에게만 보인다. */
function mobiles() { if (!mobileMap) mobileMap = loadObj(MOBILE_KEY); return mobileMap; }
/* 지금 명단에 있는 교수 중 번호가 있는 사람 수. 저장된 항목을 그냥 세면, 퇴직 등으로 명단에서
 * 빠진 교수의 번호까지 세어 숫자가 부풀려진다. */
const mobileCount = () => state.rows.filter(p => mobileOf(p)).length;
/* 명단에 없는데 남아 있는 번호 (퇴직·소속 변경) */
const mobileStale = () => Object.keys(mobiles()).length - mobileCount();
/* 그 번호들을 지운다. 가져오기는 명단에 없는 이름을 건너뛰므로 이 길이 없으면 지울 수 없다. */
function mobilePrune() {
  const m = mobiles(), live = new Set(state.rows.map(rKey));
  let n = 0;
  for (const k of Object.keys(m)) if (!live.has(k)) { delete m[k]; n++; }
  if (n) saveObj(MOBILE_KEY, m, SET_MB);
  return n;
}
const mobileOf = p => mobiles()[rKey(p)] || '';
/* 010-0000-0000 꼴로 맞춘다. 자릿수가 안 맞으면 빈 문자열 */
function fmtMobile(v) {
  const d = String(v == null ? '' : v).replace(/[^\d]/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  if (d.length === 10) return d.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  return '';
}
/* 한 사람 번호를 넣거나(값) 지운다(빈 값) */
function setMobile(p, v) {
  const m = mobiles(), k = rKey(p), f = fmtMobile(v);
  f ? m[k] = f : delete m[k];
  saveObj(MOBILE_KEY, m, SET_MB);
  return f;
}
/* 한 번에 가져오기 — 키는 "<학과>/<이름>", "<학과>/<slug>", 또는 이름만 (겹치지 않을 때).
 * 어느 쪽으로 줘도 받는다. 못 받은 것은 세어서 돌려주고, 화면이 그대로 보여 준다. */
function mobileImport(text) {
  let v;
  try { v = JSON.parse(String(text || '').trim()); }
  catch {
    const t = String(text || '').trim();
    if (/^[A-Za-z]:[\/]|^[\/]{2}|\.(json|txt)$/i.test(t) && t.indexOf('{') < 0)
      return { err: '파일 안의 내용이 아니라 파일이 있는 자리(경로)입니다. [파일 선택] 을 눌러 그 파일을 고르십시오' };
    return { err: 'JSON 형식이 아닙니다 — { "컴퓨터공학과/홍길동": "010-0000-0000" } 꼴이어야 합니다' };
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { err: '객체가 아닙니다' };

  const by = new Map(), dupe = new Set();
  for (const p of state.rows) {
    by.set(rKey(p), p);
    by.set(`${p.dept_id}/${p.name}`, p);
    by.set(`${p.dept_name}/${p.name}`, p);
    if (by.has(p.name)) dupe.add(p.name); else by.set(p.name, p);
  }
  dupe.forEach(n => by.delete(n));          // 동명이인은 학과를 붙여야만 받는다

  const m = mobiles(), unknown = [], badnum = [];
  let n = 0, del = 0;
  for (const [k0, raw] of Object.entries(v)) {
    const k = String(k0).trim();
    const p = by.get(k) || by.get(k.replace(/\s+/g, ''));
    if (!p) { unknown.push(k); continue; }
    if (String(raw == null ? '' : raw).trim() === '') {   // 빈 값이면 지운다
      if (m[rKey(p)]) del++;
      delete m[rKey(p)];
      continue;
    }
    const f = fmtMobile(raw);
    if (!f) { badnum.push(k); continue; }
    m[rKey(p)] = f;
    n++;
  }
  saveObj(MOBILE_KEY, m, SET_MB);
  return { n, del, skip: unknown.length + badnum.length, unknown, badnum, total: Object.keys(v).length };
}

/* 메일을 몇 번 보냈는지. 학과 화면의 방문 카운터와 같은 모양이지만 저장 자리는 다르다
 * (방문은 ratings 탭의 met 열, 이쪽은 settings 탭의 mailcnt 키 — 서버를 고치지 않으려고). */
const mailOf = p => mails()[rKey(p)] || 0;
function setMail(p, n) {
  const m = mails(), k = rKey(p);
  n = Math.max(0, Math.min(99, Math.round(n) || 0));
  if (n) m[k] = n; else delete m[k];
  saveObj(MAIL_KEY, m, SET_MC);
}


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

/* 상세 화면용 — 카드보다 큼직한 선호도 줄. 고르는 동작은 bindRates 가 그대로 맡는다
 * (`.rate[data-key]` 만 있으면 눌러도 되고 저장·갱신도 알아서 된다). */
function rateWide(p) {
  const cur = getRating(p);
  return `<div class="rate rate--wide" data-key="${esc(rKey(p))}" role="group" aria-label="${esc(p.name)} 선호도">
    ${CONFIG.RATINGS.LABELS.map(r => `<button type="button" class="rate__b rate__b--${rClass(r)}" data-val="${esc(r)}" aria-pressed="${cur === r}" title="${esc(CONFIG.RATINGS.NAMES[r] || '')}" aria-label="${esc(r)} (${esc(CONFIG.RATINGS.NAMES[r] || '')})">${esc(r)}</button>`).join('')}
  </div>`;
}

function bindRates(root) {
  root.querySelectorAll('.rate').forEach(g => g.addEventListener('click', e => {
    const b = e.target.closest('.rate__b'); if (!b) return;
    e.stopPropagation(); e.preventDefault();
    const key = g.dataset.key, val = b.dataset.val;
    setRating(key, getRatingByKey(key) === val ? '' : val);
    b.blur();   // 누른 뒤 테두리가 남지 않게
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
  root.querySelectorAll('.memo[contenteditable]').forEach(t => {
    const box = t.closest('.memo-box');
    /* 글 쓰는 동안 innerHTML 을 다시 그리지 않는다 — 다시 그리면 한글 입력기에서 커서가 튄다 */
    const typed = () => {
      scheduleMemo(t.dataset.key, memoRead(t));
      const st = box && box.querySelector('.memo__st');
      if (st) st.textContent = '입력 중…';
    };
    t.addEventListener('input', typed);
    t.addEventListener('blur', () => commitMemo(t.dataset.key, memoRead(t)));
    /* 붙여넣기는 글자만 받는다 — 남의 서식이 딸려 들어오면 읽을 수 없는 메모가 된다 */
    t.addEventListener('paste', ev => {
      ev.preventDefault();
      const txt = (ev.clipboardData || window.clipboardData).getData('text');
      document.execCommand('insertText', false, String(txt || ''));
    });
    const run = cmd => {
      t.focus();
      try { document.execCommand('styleWithCSS', false, false); } catch {}
      document.execCommand(cmd, false, null);
      typed();
    };
    t.addEventListener('keydown', ev => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      const m = MEMO_MARKS.find(x => x.key === String(ev.key).toLowerCase());
      if (!m) return;
      ev.preventDefault();
      run(m.cmd);
    });
    box && box.querySelectorAll('[data-cmd]').forEach(btn =>
      btn.addEventListener('mousedown', ev => ev.preventDefault()));   // 누를 때 고른 글자가 풀리지 않게
    box && box.querySelectorAll('[data-cmd]').forEach(btn =>
      btn.addEventListener('click', () => run(btn.dataset.cmd)));
  });
}

function ratingsCacheKey() { return 'jnu-ratings:' + (state.session ? state.session.email : 'local'); }
function notesCacheKey() { return 'jnu-notes:' + (state.session ? state.session.email : 'local'); }

/* 교수별 개인 기록: 선호도(state.ratings) + 만남 횟수·메모(state.notes) */
/* ---------- 메모 꾸미기 ----------
 * 시트의 memo 열과 CSV 는 평문이라야 사람이 읽을 수 있다. 그래서 **굵게** __밑줄__ *기울임*
 * 처럼 표시만 해 두고, 보여 줄 때만 꾸민다. 저장 형식은 그대로이므로 서버는 손댈 것이 없다.
 * ** 를 먼저 처리해야 * 와 섞이지 않는다. */
const MEMO_MARKS = [
  { mk: '**', tag: 'b', name: '굵게', key: 'b', cmd: 'bold' },
  { mk: '__', tag: 'u', name: '밑줄', key: 'u', cmd: 'underline' },
  { mk: '*',  tag: 'i', name: '기울임', key: 'i', cmd: 'italic' },
];
const memoHtml = s => esc(String(s || ''))
  .replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>')
  .replace(/__([\s\S]+?)__/g, '<u>$1</u>')
  .replace(/\*([^*\n]+?)\*/g, '<i>$1</i>')
  .replace(/\n/g, '<br>');
const memoPlain = s => String(s || '')
  .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
  .replace(/__([\s\S]+?)__/g, '$1')
  .replace(/\*([^*\n]+?)\*/g, '$1');
const memoFancy = s => /\*\*|__|\*/.test(String(s || ''));

/* 편집기 안(꾸며진 DOM)을 저장용 평문으로 바꾼다 */
function memoFromDom(node) {
  if (node.nodeType === 3) return node.nodeValue.replace(/\u00a0/g, ' ');
  if (node.nodeName === 'BR') return '\n';
  let inner = '';
  node.childNodes.forEach(c => { inner += memoFromDom(c); });
  const t = node.nodeName;
  if (!inner.trim()) return inner;                       // 빈 껍데기는 표시를 붙이지 않는다
  if (t === 'B' || t === 'STRONG') return '**' + inner + '**';
  if (t === 'U') return '__' + inner + '__';
  if (t === 'I' || t === 'EM') return '*' + inner + '*';
  if (t === 'DIV' || t === 'P') return inner + '\n';
  return inner;
}
const memoRead = el => memoFromDom(el).replace(/\n+$/, '');

/* ---------- 올해 부임한 교수 ----------
 * professors.json 의 joined_year 가 이 해와 같으면 사진에 병아리를 단다.
 * 해가 바뀌면 이 값을 고치면 된다(자동으로 올리지 않는 것은, 그 해 부임자를 다 확인한 뒤에
 * 켜야 빠진 사람 없이 맞기 때문이다). */
const NEW_YEAR = '2026';
const isNewProf = p => String(p.joined_year || '') === NEW_YEAR;
const CHICK = `<svg viewBox="0 0 32 32" width="19" height="19" aria-hidden="true">
  <path d="M16 4.4c1 .5 1.4 1.4 1.2 2.5" stroke="#e0a800" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <ellipse cx="16" cy="20.2" rx="9.3" ry="8.2" fill="#f7c948"/>
  <ellipse cx="11.6" cy="21.4" rx="3.2" ry="2.3" fill="#e6ad06" transform="rotate(-18 11.6 21.4)"/>
  <circle cx="16" cy="12.4" r="6.9" fill="#ffd95e"/>
  <circle cx="13.5" cy="11.9" r="1.25" fill="#43371a"/>
  <circle cx="18.5" cy="11.9" r="1.25" fill="#43371a"/>
  <path d="M16 13.9l2.4 1.6-2.4 1.5-2.4-1.5z" fill="#fb923c"/>
</svg>`;
const chickBadge = p => isNewProf(p)
  ? `<span class="newp" title="${esc(NEW_YEAR)}년 부임한 신임 교수" aria-label="${esc(NEW_YEAR)}년 부임한 신임 교수">${CHICK}</span>`
  : '';

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
const SET_QD = 'quiz-depts', SET_QX = 'quiz-ex', SET_FAV = 'fav', SET_MC = 'mailcnt', SET_MB = 'mobile', SET_NS = 'nosend', SET_MS = 'msend';
const SET_EP = 'eps', SET_EPS = 'epsent';
const SET_KEYS = [SET_QD, SET_QX, SET_FAV, SET_MC, SET_MB, SET_NS, SET_MS, SET_EP, SET_EPS];
/* 회차 덮어쓰기(epov1, epov2 …)는 회차 수만큼 늘어나므로 그때그때 만들어 붙인다 */
const setKeys = () => SET_KEYS.concat(epNos().map(n => EPOV_PRE + n));
const isEpov = k => k.indexOf(EPOV_PRE) === 0;
const SET_OBJ = [SET_MC, SET_MB, SET_MS, SET_EP, SET_EPS];   // 값이 배열이 아니라 객체인 키
const SET_LABEL = { [SET_QD]: '퀴즈 설정', [SET_QX]: '퀴즈 설정', [SET_FAV]: '관심 교수', [SET_MC]: '메일 보낸 횟수', [SET_MB]: '핸드폰 번호', [SET_NS]: '항시 제외', [SET_MS]: '직접 보낸 기록', [SET_EP]: '회차 원고', [SET_EPS]: '회차 발송 기록' };
const setDirtyKey = () => 'jnu-settings-dirty:' + (state.session ? state.session.email : 'local');
function loadSetDirty() { try { sync.dirtyS = new Map(Object.entries(JSON.parse(localStorage.getItem(setDirtyKey()) || '{}'))); } catch { sync.dirtyS = new Map(); } }
function saveSetDirty() { try { sync.dirtyS.size ? localStorage.setItem(setDirtyKey(), JSON.stringify(Object.fromEntries(sync.dirtyS))) : localStorage.removeItem(setDirtyKey()); } catch {} }

/* 지금 이 기기의 설정 값 (정렬해 두어 비교가 안정적이도록) */
function settingValue(key) {
  if (key === SET_QD) return [...quizDepts()].sort();
  if (key === SET_QX) return [...quizEx()].sort();
  if (key === SET_FAV) return [...favs()];   // 정렬하지 않는다: 고른 순서를 그대로 쓴다
  if (key === SET_NS) return [...noSend()];
  if (key === SET_MC) return mails();
  if (key === SET_MB) return mobiles();
  if (key === SET_MS) return msends();
  if (key === SET_EP) return eps();
  if (key === SET_EPS) return epsent();
  if (isEpov(key)) return epov(key.slice(EPOV_PRE.length));
  return null;
}
/* 서버에서 받은 값을 이 기기에 적용 (되돌려 올리지 않도록 localStorage에 직접 씀) */
function settingApplyLocal(key, v) {
  try {
    if (key === SET_QD) { quiz.depts = new Set(v); localStorage.setItem(QUIZ_DEPTS_KEY, JSON.stringify(v)); }
    if (key === SET_QX) { quiz.ex = new Set(v); v.length ? localStorage.setItem(QUIZ_EX_KEY, JSON.stringify(v)) : localStorage.removeItem(QUIZ_EX_KEY); }
    if (key === SET_FAV) { favSet = new Set(v); v.length ? localStorage.setItem(FAV_KEY, JSON.stringify(v)) : localStorage.removeItem(FAV_KEY); }
    if (key === SET_NS) { noSendSet = new Set(v); v.length ? localStorage.setItem(NOSEND_KEY, JSON.stringify(v)) : localStorage.removeItem(NOSEND_KEY); }
    if (key === SET_MC) { mailMap = v; Object.keys(v).length ? localStorage.setItem(MAIL_KEY, JSON.stringify(v)) : localStorage.removeItem(MAIL_KEY); }
    if (key === SET_MB) { mobileMap = v; Object.keys(v).length ? localStorage.setItem(MOBILE_KEY, JSON.stringify(v)) : localStorage.removeItem(MOBILE_KEY); }
    if (key === SET_MS) { msendMap = v; Object.keys(v).length ? localStorage.setItem(MSEND_KEY, JSON.stringify(v)) : localStorage.removeItem(MSEND_KEY); }
    if (key === SET_EP) { epsMap = v; Object.keys(v).length ? localStorage.setItem(EPS_KEY, JSON.stringify(v)) : localStorage.removeItem(EPS_KEY); }
    if (key === SET_EPS) { epsentMap = v; Object.keys(v).length ? localStorage.setItem(EPSENT_KEY, JSON.stringify(v)) : localStorage.removeItem(EPSENT_KEY); }
    if (isEpov(key)) { const n = key.slice(EPOV_PRE.length); epovMap[n] = v; Object.keys(v).length ? localStorage.setItem(epovLKey(n), JSON.stringify(v)) : localStorage.removeItem(epovLKey(n)); }
  } catch {}
}
const SET_LOCAL_KEY = { [SET_QD]: QUIZ_DEPTS_KEY, [SET_QX]: QUIZ_EX_KEY, [SET_FAV]: FAV_KEY, [SET_MC]: MAIL_KEY, [SET_MB]: MOBILE_KEY, [SET_NS]: NOSEND_KEY, [SET_MS]: MSEND_KEY, [SET_EP]: EPS_KEY, [SET_EPS]: EPSENT_KEY };
const setLocalKey = key => isEpov(key) ? epovLKey(key.slice(EPOV_PRE.length)) : SET_LOCAL_KEY[key];
const setStored = key => { try { return localStorage.getItem(setLocalKey(key)) != null; } catch { return false; } };

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
      else { sync.dirtyS.set(key, v); saveSetDirty(); flashStatus((SET_LABEL[key] || '회차 원고') + '을(를) 시트에 저장하지 못했습니다 — 연결되면 다시 시도합니다', true); break; }
    }
  } finally { sync.busyS.delete(key); updateSaveBar(); }
}

/* 서버 설정을 화면에 반영. 서버에 아직 없고 이 기기에만 있으면 올린다 */
function applySettings(m) {
  const changed = [];
  for (const key of setKeys()) {
    if (sync.pendS.has(key) || sync.busyS.has(key) || sync.dirtyS.has(key)) continue;
    const raw = m ? m[key] : '';
    if (raw == null || raw === '') { if (setStored(key)) saveSetting(key, settingValue(key)); continue; }
    let v; try { v = JSON.parse(raw); } catch { continue; }
    const isObj = SET_OBJ.includes(key) || isEpov(key);
    if (isObj ? (!v || typeof v !== 'object' || Array.isArray(v)) : !Array.isArray(v)) continue;
    const cur = settingValue(key) || (isObj ? {} : []);
    const canon = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
    const same = isObj ? canon(cur) === canon(v)
               : (key === SET_FAV || key === SET_NS) ? JSON.stringify(cur) === JSON.stringify(v)
                                 : JSON.stringify(cur) === JSON.stringify([...v].sort());
    if (same) continue;
    settingApplyLocal(key, v); changed.push(key);
  }
  if (changed.length) {
    if (changed.includes(SET_QD) || changed.includes(SET_QX)) quizStart();   // 퀴즈 설정이 바뀐 때만 새로 시작
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
  document.querySelectorAll('.memo[contenteditable][data-key]').forEach(t => {
    const v = memoRead(t);
    if (memoTimers.has(t.dataset.key) || getNote(t.dataset.key).memo !== normMemo(v)) commitMemo(t.dataset.key, v);
  });
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
  document.querySelectorAll(`.memo[contenteditable][data-key="${CSS.escape(key)}"]`).forEach(t => {
    if (document.activeElement !== t && !memoTimers.has(key) && memoRead(t) !== note.memo) t.innerHTML = memoHtml(note.memo);
  });
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
      <a class="dept-pill" href="#/dept/${encodeURIComponent(d.id)}" title="${esc(d.name)} 교수 목록으로" aria-label="${esc(d.name)} 교수 목록으로">${esc(d.name)}</a>
      <button class="iconbtn" type="button" data-close aria-label="닫기"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>
    <div class="d-body">
      <div class="d-profile">
        <div class="d-photo"><div class="avatar" aria-hidden="true">${esc(initial(p.name))}</div>${p.photo ? `<img src="${esc(p.photo)}" data-alt="${esc(p.photo_alt)}" alt="${esc(p.name)} 사진" onerror="photoErr(this,'remove')">` : ''}${chickBadge(p)}</div>
        <div>
          <div class="d-top"><span class="d-rank">${esc(p.rank)}</span></div>
          <h2 class="d-name" id="drawerTitle">${esc(p.name)}</h2>
          <div class="d-en">${esc(p.name_en || '')}</div>
          <div class="d-tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        </div>
      </div>

      <div class="d-section"><h3>선호도</h3>
        ${rateWide(p)}
      </div>

      <div class="d-section"><h3>만난 횟수</h3>
        ${meetCounter(p)}
      </div>

      <div class="d-section"><h3>메모</h3>
        <div class="memo-box" data-key="${esc(rKey(p))}">
          <div class="memo" contenteditable="true" role="textbox" aria-multiline="true" data-key="${esc(rKey(p))}" data-ph="이 교수에 대한 메모 — 입력하면 자동으로 시트에 저장됩니다" aria-label="${esc(p.name)} 메모">${memoHtml(getMemo(p))}</div>
          <div class="memo__bar">
            ${MEMO_MARKS.map(m => `<button type="button" class="memo__b memo__b--${m.tag}" data-cmd="${esc(m.cmd)}" title="고른 글자를 ${esc(m.name)} (Ctrl+${m.key.toUpperCase()})" aria-label="고른 글자를 ${esc(m.name)}"><${m.tag}>가</${m.tag}></button>`).join('')}
          </div>
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
    <button type="button" class="user__out" id="logoutBtn" title="로그아웃" aria-label="로그아웃"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 8l4 4-4 4M20 12H10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
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
