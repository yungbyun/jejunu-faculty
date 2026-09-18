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
    // 선호도 값과 뜻. 비(비해당)는 연구년 등으로 이번 평가에서 제외되는 경우
    LABELS: ['확', '중', '모', '부', '비'],
    NAMES: { '확': '확실', '중': '보통', '모': '모름', '부': '부정', '비': '비해당 (연구년 등 평가 제외)' },
    // 예전에 저장된 값(상/하)은 자동으로 새 값으로 읽음
    LEGACY: { '상': '확', '하': '모' },
    // 다른 기기에서 바꾼 선호도를 다시 읽는 주기(초). 화면이 보일 때만 동작
    SYNC_SEC: 60,
  },
};

/* ---------- 상태 ---------- */
const state = { rows: [], depts: [], source: '', query: '', rankFilter: '전체', ratingFilter: '전체', localPhotos: new Set(), ratings: new Map(), notes: new Map(), session: null };
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
  refreshBtn.classList.add('busy');
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
    setTimeout(() => refreshBtn.classList.remove('busy'), 400);
  }
}
refreshBtn.addEventListener('click', refreshNow);

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
  } else {
    renderHome();
    closeDrawer(false);
  }
  document.querySelectorAll('[data-nav]').forEach(a => a.setAttribute('aria-current', a.dataset.nav === r.view ? 'page' : 'false'));
  window.scrollTo({ top: 0 });
}

/* ---------- 화면: 분석 (선호도 시각화) ---------- */
const SCORE = { '확': 3, '중': 2, '모': 1, '부': -1 }; // 비(비해당)는 점수 없음 → 평균·키워드 분석에서 제외
const hasScore = p => SCORE[getRating(p)] != null;
const RLABELS = () => [...CONFIG.RATINGS.LABELS, '미지정'];
const rcls = r => r === '미지정' ? 'none' : rClass(r);

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
/* 확(확실) 비율: 비해당(연구년 등) 교수를 모수에서 뺀 뒤 계산 */
function sureRate(profs) {
  const pool = profs.filter(p => getRating(p) !== '비');
  const sure = pool.filter(p => getRating(p) === '확').length;
  // 50%가 되려면 확이 몇 명 더 필요한지 (모수는 그대로 두고 확만 늘어난다고 가정). 음수면 그만큼 여유
  const need = Math.ceil(pool.length / 2) - sure;
  return { pool: pool.length, sure, na: profs.length - pool.length, pct: pool.length ? Math.round(sure / pool.length * 1000) / 10 : null, need, rest: pool.length - sure };
}
const fmtPct = v => v == null ? '–' : (Number.isInteger(v) ? v : v.toFixed(1)) + '%';

function stackBar(profs, opts = {}) {
  const c = dist(profs), total = profs.length || 1;
  return `<div class="sbar" role="img" aria-label="${esc(RLABELS().map(r => `${r} ${c[r]}`).join(', '))}">
    ${RLABELS().filter(r => c[r]).map(r => {
      const pct = c[r] / total * 100;
      const link = opts.deptId ? ` data-go="${esc(opts.deptId)}" data-rating="${esc(r)}" tabindex="0" role="link"` : '';
      return `<span class="sbar__seg sbar__seg--${rcls(r)}" style="flex:${c[r]} 0 0"${link} title="${esc(r)} ${c[r]}명 (${Math.round(pct)}%)">${pct >= 11 ? c[r] : ''}</span>`;
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
  const { list: tags, minN } = tagStats();
  const singles = minN === 2 ? (() => { const seen = new Set(tags.map(t => t.tag)), out = []; state.rows.filter(hasScore).forEach(p => p.tags.forEach(t => { if (!seen.has(t)) { seen.add(t); out.push({ tag: t, r: getRating(p), prof: p.name }); } })); return out.sort((a, b) => SCORE[b.r] - SCORE[a.r]); })() : [];
  const ranks = Object.keys(RANK_ORDER).map(r => ({ r, profs: all.filter(p => p.rank === r) })).filter(x => x.profs.length);
  const legend = `<div class="legend" aria-label="범례">${RLABELS().map(r => `<span class="legend__i"><i class="sw sw--${rcls(r)}"></i>${esc(r)}</span>`).join('')}</div>`;

  $app.innerHTML = `
    <div class="view stats">
      <div class="crumbs"><a href="#/">학과 목록</a><span class="sep">/</span><span>분석</span></div>
      <div class="hero"><h1>선호도 분석</h1><p>${state.session ? esc(state.session.email) + ' 계정의 ' : ''}${CONFIG.RATINGS.LABELS.join('·')} 선택을 학과·직급·전공 키워드별로 정리한 화면입니다.</p>
        <div class="legend legend--names" aria-label="선호도 뜻">${CONFIG.RATINGS.LABELS.map(r => `<span class="legend__i"><i class="sw sw--${rcls(r)}"></i><b>${esc(r)}</b> ${esc(CONFIG.RATINGS.NAMES[r])}</span>`).join('')}</div></div>

      ${!rated.length ? `<div class="empty"><strong>아직 선택한 선호도가 없습니다</strong>학과 화면에서 교수 카드의 ${CONFIG.RATINGS.LABELS.join('·')} 칩을 눌러 보세요. <a href="#/">학과 목록으로 →</a></div>` : ''}

      <section class="st-sec">
        <div class="st-hero">
          <div class="st-hero__num">${rated.length}<small>/ ${all.length}명 평가</small></div>
          <div class="meter" aria-label="평가 진행률 ${pct}%"><span style="width:${pct}%"></span></div>
          ${(() => { const sr = sureRate(all); return `<div class="st-sure"><span class="st-sure__pct">${fmtPct(sr.pct)}</span><span class="st-sure__txt"><b>확(확실) 비율</b> — 확 ${sr.sure}명 / 평가 대상 ${sr.pool}명 <span class="muted">(전체 ${all.length}명에서 비해당 ${sr.na}명 제외)</span><br>${sr.pool ? (sr.need > 0 ? `<span class="st-sure__need">50%가 되려면 확 <b>${sr.need}명</b> 더 필요</span> <span class="muted">(${Math.ceil(sr.pool / 2)}명 이상 · 나머지 ${sr.rest}명 중에서)</span>` : `<span class="st-sure__ok">50% 달성</span> <span class="muted">(${-sr.need}명 여유)</span>`) : ''}</span></div>`; })()}
          <div class="st-hero__sub">진행률 ${pct}% · ${state.depts.length}개 학과 · 평균 점수 <b>${fmt1(avgScore(all))}</b> <span class="muted">(확 3 · 중 2 · 모 1 · 부 −1 · 비해당·미지정은 평균에서 제외)</span></div>
        </div>
        <div class="tiles">
          ${RLABELS().map(r => `<div class="tile tile--${rcls(r)}"><span class="tile__lbl"><i class="sw sw--${rcls(r)}"></i>${esc(r)}${CONFIG.RATINGS.NAMES[r] ? `<span class="opt"> ${esc(CONFIG.RATINGS.NAMES[r].split(' ')[0])}</span>` : ''}</span><span class="tile__val">${c[r]}</span><span class="tile__pct">${all.length ? Math.round(c[r] / all.length * 100) : 0}%</span></div>`).join('')}
        </div>
      </section>

      <section class="st-sec">
        <div class="st-head"><h2>학과별 분포</h2>${legend}</div>
        <div class="st-rows">
          ${state.depts.map(d => `
            <div class="st-row" style="--dept-color:${esc(d.color)}">
              <div class="st-row__lbl"><a href="#/dept/${encodeURIComponent(d.id)}">${esc(d.name)}</a><small>${d.profs.length}명 · 확 ${fmtPct(sureRate(d.profs).pct)}${(() => { const r = sureRate(d.profs); return r.pool ? (r.need > 0 ? ` (50%까지 ${r.need}명 더)` : ' (50% 달성)') : ''; })()} · 평균 ${fmt1(avgScore(d.profs))}</small></div>
              ${stackBar(d.profs, { deptId: d.id })}
            </div>`).join('')}
        </div>
        <p class="st-note">막대의 구간을 누르면 해당 학과가 그 선호도 필터로 열립니다.</p>
      </section>

      <section class="st-sec">
        <div class="st-head"><h2>전공 키워드 × 선호도</h2><span class="muted st-small">키워드별 평균 점수 · 교수 ${minN}명 이상인 키워드</span></div>
        ${tags.length ? `
        <div class="dv">
          <div class="dv__axis"><span></span><div class="dv__axisin"><span>−1 부정</span><span>0</span><span>3 긍정</span></div><span></span></div>
          ${tags.map(t => `
            <div class="dv__row" title="${esc(t.tag)} · 평균 ${fmt1(t.avg)} · 교수 ${t.n}명">
              <div class="dv__lbl">${esc(t.tag)}<small>${t.n}</small></div>
              <div class="dv__track">
                <span class="dv__neg" style="width:${t.avg < 0 ? Math.min(100, -t.avg / 1 * 100) : 0}%"></span>
                <span class="dv__pos" style="width:${t.avg > 0 ? Math.min(100, t.avg / 3 * 100) : 0}%"></span>
              </div>
              <div class="dv__val">${fmt1(t.avg)}</div>
            </div>`).join('')}
        </div>
        <p class="st-note">오른쪽(초록)은 내가 높게 본 연구 주제, 왼쪽(빨강)은 낮게 본 주제입니다. 축은 −1(부)에서 3(확)까지이며, 비해당·미지정 교수는 계산에 넣지 않습니다.</p>
        ${singles.length ? `<details class="st-details"><summary>교수 1명뿐인 키워드 ${singles.length}개 보기</summary><div class="kw-cloud">${singles.map(t => `<span class="kw kw--${rcls(t.r)}" title="${esc(t.prof)}"><i class="sw sw--${rcls(t.r)}"></i>${esc(t.tag)}</span>`).join('')}</div></details>` : ''}` : `<div class="empty">평가한 교수가 생기면 키워드 분석이 표시됩니다.</div>`}
      </section>

      <section class="st-sec st-two">
        <div>
          <div class="st-head"><h2>직급별</h2></div>
          <table class="st-table"><thead><tr><th>직급</th><th>인원</th><th>평가</th>${CONFIG.RATINGS.LABELS.map(r => `<th>${esc(r)}</th>`).join('')}<th>확%</th><th>평균</th></tr></thead>
          <tbody>${ranks.map(x => { const dc = dist(x.profs); return `<tr><td>${esc(x.r)}</td><td>${x.profs.length}</td><td>${x.profs.filter(getRating).length}</td>${CONFIG.RATINGS.LABELS.map(r => `<td>${dc[r] || '·'}</td>`).join('')}<td><b>${fmtPct(sureRate(x.profs).pct)}</b></td><td>${fmt1(avgScore(x.profs))}</td></tr>`; }).join('')}</tbody></table>
        </div>
        <div>
          <div class="st-head"><h2>학과별</h2></div>
          <table class="st-table"><thead><tr><th>학과</th><th>인원</th><th>평가</th>${CONFIG.RATINGS.LABELS.map(r => `<th>${esc(r)}</th>`).join('')}<th>확%</th><th>50%까지</th><th>평균</th></tr></thead>
          <tbody>${state.depts.map(d => { const dc = dist(d.profs), r = sureRate(d.profs); return `<tr><td>${esc(d.name)}</td><td>${d.profs.length}</td><td>${d.profs.filter(getRating).length}</td>${CONFIG.RATINGS.LABELS.map(r => `<td>${dc[r] || '·'}</td>`).join('')}<td><b>${fmtPct(r.pct)}</b></td><td>${r.pool ? (r.need > 0 ? `+${r.need}` : '달성') : '·'}</td><td>${fmt1(avgScore(d.profs))}</td></tr>`; }).join('')}</tbody></table>
          <p class="st-note">확% = 확(확실) 인원 ÷ (인원 − 비해당). 비해당(연구년 등)은 모수에서 뺍니다. "50%까지"는 확이 몇 명 더 있어야 절반이 되는지입니다.</p>
        </div>
      </section>

      <section class="st-sec">
        <div class="st-head"><h2>선호도별 교수 목록</h2><button class="btn" type="button" id="csvBtn">CSV 내보내기</button></div>
        <div class="st-lists">
          ${CONFIG.RATINGS.LABELS.map(r => { const ps = all.filter(p => getRating(p) === r); return `
            <div class="st-list"><h3><i class="sw sw--${rcls(r)}"></i>${esc(r)} <span class="n">${ps.length}</span></h3>
              ${ps.length ? `<ul>${ps.map(p => `<li><a href="#/dept/${encodeURIComponent(p.dept_id)}/prof/${encodeURIComponent(p.slug)}">${esc(p.name)}</a><small>${esc(p.dept_name)} · ${esc(p.rank)}</small></li>`).join('')}</ul>` : `<div class="muted st-small">없음</div>`}
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
function renderHome() {
  const q = state.query.trim().toLowerCase();
  if (q) return renderSearch(q);
  const total = state.rows.length;
  $app.innerHTML = `
    <div class="view home">
      <div class="hero">
        <h1>교수진 안내</h1>
        <p>${state.depts.length}개 학과 · 전임교원 ${total}명${(() => { const na = state.rows.filter(p => getRating(p) === '비').length; return na ? ` · 비참여 ${na}명 <span class="muted">(비해당, 평가 대상 ${total - na}명)</span>` : ''; })()}</p>
      </div>
      ${state.source === 'error' ? `<div class="empty"><strong>데이터를 불러오지 못했습니다</strong>Google 시트 공개 설정과 네트워크 연결을 확인해 주세요.</div>` : ''}
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
              ${d.profs.slice(0, 7).map(p => p.photo
                ? `<i class="av"><img src="${esc(p.photo)}" data-alt="${esc(p.photo_alt)}" data-initial="${esc(initial(p.name))}" alt="" loading="lazy" onerror="photoErr(this,'initial')"></i>`
                : `<i class="av">${esc(initial(p.name))}</i>`).join('')}
              ${d.profs.length > 7 ? `<i class="av av--more">+${d.profs.length - 7}</i>` : ''}
            </div>
            <span class="drow__arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          </a>`).join('')}
      </div>
    </div>`;
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
  const list = d.profs.filter(p => (state.rankFilter === '전체' || p.rank === state.rankFilter) && matchRating(p));
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
          </div>
        </div>
      </div>
      ${list.length ? `<div class="prof-grid">${list.map(p => profCard(p, d)).join('')}</div>` : `<div class="empty"><strong>조건에 맞는 교수가 없습니다</strong></div>`}
    </div>`;
  $app.querySelectorAll('.chip[data-rank]').forEach(b => b.addEventListener('click', () => { state.rankFilter = b.dataset.rank; renderDept(d); }));
  $app.querySelectorAll('.chip[data-rating]').forEach(b => b.addEventListener('click', () => { state.ratingFilter = b.dataset.rating; renderDept(d); }));
  bindCards();
}

function profCard(p, d, showDept = false) {
  const color = d ? d.color : '#1f8a5b';
  return `
    <div class="prof" role="button" tabindex="0" data-dept="${esc(p.dept_id)}" data-slug="${esc(p.slug)}" data-rating="${esc(getRating(p))}" style="--dept-color:${esc(color)}" aria-label="${esc(p.name)} ${esc(p.rank)} 상세 보기">
      ${rateChips(p)}
      <div class="prof__photo">
        <div class="avatar" aria-hidden="true">${esc(initial(p.name))}</div>
        ${p.photo ? `<img src="${esc(p.photo)}" data-alt="${esc(p.photo_alt)}" alt="" loading="lazy" onload="this.classList.add('loaded')" onerror="photoErr(this,'remove')">` : ''}
      </div>
      <div class="prof__body">
        <div class="prof__rank">${esc(p.rank)}${showDept ? ` · ${esc(p.dept_name)}` : ''}</div>
        <h3 class="prof__name">${esc(p.name)}<small>${esc(p.name_en || '')}</small></h3>
        <div class="prof__tags">${p.tags.slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        <div class="prof__note">${noteBadge(entryOf(rKey(p)))}</div>
        ${p.office ? `<div class="prof__office"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>${esc(p.office)}</div>` : ''}
      </div>
    </div>`;
}

/* ---------- 선호도 ---------- */
const rKey = p => `${p.dept_id}/${p.slug}`;
/* 카드에 붙는 작은 표시: 만남 N회 · 메모 있음 */
const noteBadge = e => (e.met ? `<span class="nb nb--met" title="만난 횟수">만남 ${e.met}회</span>` : '') + (e.memo ? `<span class="nb nb--memo" title="${esc(e.memo)}">메모</span>` : '');
const getRating = p => state.ratings.get(rKey(p)) || '';
const matchRating = p => state.ratingFilter === '전체' || (state.ratingFilter === '미지정' ? !getRating(p) : getRating(p) === state.ratingFilter);
const countRating = (d, r) => r === '전체' ? d.profs.length : d.profs.filter(p => r === '미지정' ? !getRating(p) : getRating(p) === r).length;

function ratingSummary(d) {
  const parts = CONFIG.RATINGS.LABELS.map(r => [r, countRating(d, r)]).filter(([, n]) => n);
  if (!parts.length) return '';
  return `<div class="drow__rates">${parts.map(([r, n]) => `<span class="rs rs--${rClass(r)}">${esc(r)} ${n}</span>`).join('')}</div>`;
}
const rClass = r => ({ '확': 'high', '중': 'mid', '모': 'low', '부': 'neg', '비': 'na' }[r] || '');
/* 저장된 값을 현재 라벨로 정규화 (예전 값 상→확, 하→모; 모르는 값은 버림) */
const normRating = v => { v = String(v || ''); return CONFIG.RATINGS.LEGACY[v] || (CONFIG.RATINGS.LABELS.includes(v) ? v : ''); };

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
    <span class="counter__n" aria-live="polite">${n}</span><span class="counter__u">회</span>
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
const sync = { pending: new Map(), dirty: new Map(), queue: new Map(), running: false, timer: null, last: 0, savedAt: 0 };
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
  await syncRatings({ initial: true });
  startSyncLoop();
}

function startSyncLoop() {
  if (sync.timer || !CONFIG.RATINGS.API_URL || !state.session) return;
  const sec = Math.max(15, Number(CONFIG.RATINGS.SYNC_SEC) || 60);
  sync.timer = setInterval(() => { if (document.visibilityState === 'visible') { syncRatings(); keepTokenFresh(); } }, sec * 1000);
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
    for (const [key, fields] of [...sync.dirty]) {
      if (await pushEntry(key, fields)) { sync.dirty.delete(key); saveDirty(); }
    }
    updateSaveBar();
    // 2) 시트에서 내 기록 전체를 읽음
    const r = await ratingsApi('list', {});
    if (!r || !Array.isArray(r.ratings)) throw new Error((r && r.error) || '응답 오류');
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
    else if (changed.length) { if (route().view === 'dept') changed.forEach(k => refreshRatingUI(k, state.ratings.get(k) || '')); else render(); flashStatus(`다른 기기의 기록 ${changed.length}건을 반영했습니다`); }
    let n = 0;
    for (const [key, e] of localOnly) if (await pushEntry(key, e)) n++;
    if (n) { saveRatingsCache(); flashStatus(`이 기기의 기록 ${n}건을 시트로 동기화했습니다`); }
  } catch (e) {
    console.warn('동기화 실패:', e.message);
    if (initial) flashStatus('선호도 동기화 실패 — 시트 연결을 확인하세요', true);
  } finally { sync.running = false; }
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
  const saving = sync.queue.size, dirty = sync.dirty.size;
  if (sync.authNeeded) {
    if ($saveBar.dataset.mode !== 'auth') {
      $saveBar.className = 'savebar savebar--warn savebar--auth'; $saveBar.dataset.mode = 'auth';
      $saveBar.innerHTML = `<span>${dirty ? `미저장 ${dirty}건 · ` : ''}저장을 계속하려면 Google 로그인을 한 번 확인해 주세요</span><span id="reloginBtn"></span>`;
      $saveBar.hidden = false;
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

/* 토큰이 5분 안에 만료되면 화면이 보이는 동안 미리 조용히 갱신해 둔다 (저장 시점에 만료돼 실패하는 일 방지) */
async function keepTokenFresh() {
  const s = state.session;
  if (!s || !s.credential || s.tokExp - Date.now() > 5 * 60e3 || tokenWaiter) return;
  try { await getFreshToken(); } catch (e) { console.warn('토큰 갱신 실패:', e.message); }
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

/* Apps Script 호출 — ID 토큰을 함께 보내 서버가 본인 여부를 확인 */
async function ratingsApi(action, payload) {
  const token = await getFreshToken();
  const res = await fetch(CONFIG.RATINGS.API_URL, { method: 'POST', body: JSON.stringify({ action, token, ...payload }), redirect: 'follow', keepalive: action === 'set' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function bindCards() {
  const open = b => { location.hash = `#/dept/${encodeURIComponent(b.dataset.dept)}/prof/${encodeURIComponent(b.dataset.slug)}`; };
  $app.querySelectorAll('.prof').forEach(b => {
    b.addEventListener('click', e => { if (e.target.closest('.rate')) return; open(b); });
    b.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.rate')) { e.preventDefault(); open(b); } });
  });
  bindRates($app);
  $app.querySelector('[data-clear]')?.addEventListener('click', () => { $q.value = ''; state.query = ''; });
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
          <div class="d-top"><span class="d-rank">${esc(p.rank)}</span>${rateChips(p, true)}</div>
          <div class="d-meet">${meetCounter(p)}</div>
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

      <div class="d-section"><h3>연락처</h3>
        <dl class="d-info">
          ${p.office ? `<dt>연구실</dt><dd>${esc(p.office)}</dd>` : ''}
          ${p.phone ? `<dt>전화</dt><dd><a href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${esc(p.phone)}</a></dd>` : ''}
          ${p.email ? `<dt>이메일</dt><dd><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></dd>` : ''}
          ${p.homepage ? `<dt>홈페이지</dt><dd><a href="${esc(p.homepage)}" target="_blank" rel="noopener">${esc(p.homepage.replace(/^https?:\/\//, ''))}</a></dd>` : ''}
        </dl>
      </div>

      ${p.summary ? `<div class="d-section"><h3>세부 전공</h3><p class="d-summary">${esc(p.summary)}</p></div>` : ''}

      ${p.papers.length ? `<div class="d-section"><h3>대표 논문</h3><ul class="d-papers">${p.papers.map(x => `<li><span class="t">${esc(x.t)}</span><span class="j"><i>${esc(x.j || '')}</i>${x.y ? ` · ${esc(x.y)}` : ''}</span></li>`).join('')}</ul></div>` : ''}

      ${links.length ? `<div class="d-section"><h3>바로가기</h3><div class="d-links">${links.map(l => `<a class="lnk ${l.primary ? 'primary' : ''}" href="${esc(l.href)}" ${l.href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${esc(l.label)} ↗</a>`).join('')}</div></div>` : ''}
    </div>`;
  bindRates($panel);
  bindNotes($panel);
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
    sync.authNeeded = false;
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
function authError() { sync.authNeeded = true; updateSaveBar(); return new Error('로그인 확인 필요'); }

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
window.addEventListener('hashchange', () => { state.rankFilter = '전체'; if (!state._keepRating) state.ratingFilter = '전체'; state._keepRating = false; render(); });
if (!authEnabled()) {
  enterApp(null);
} else {
  const s = loadSession();
  s ? enterApp(s) : showGate();
}
