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
    SESSION_HOURS: 24 * 7,
  },
  // ---- 선호도 저장 (Apps Script 웹 앱 URL. 비워 두면 브라우저에만 저장) ----
  RATINGS: {
    API_URL: '',
    LABELS: ['상', '중', '하', '부'],
  },
};

/* ---------- 상태 ---------- */
const state = { rows: [], depts: [], source: '', query: '', rankFilter: '전체', ratingFilter: '전체', localPhotos: new Set(), ratings: new Map(), session: null };
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
  return { view: 'home' };
}

function render() {
  const r = route();
  if (!state.rows.length && state.source !== 'error') { renderSkeleton(r); return; }
  if (r.view === 'dept') {
    const d = state.depts.find(x => x.id === r.dept);
    if (!d) { location.hash = '#/'; return; }
    renderDept(d);
    const p = r.prof ? d.profs.find(x => x.slug === r.prof) : null;
    p ? openDrawer(p, d) : closeDrawer(false);
  } else {
    renderHome();
    closeDrawer(false);
  }
  window.scrollTo({ top: 0 });
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
        <p>${state.depts.length}개 학과 · 전임교원 ${total}명</p>
      </div>
      ${state.source === 'error' ? `<div class="empty"><strong>데이터를 불러오지 못했습니다</strong>Google 시트 공개 설정과 네트워크 연결을 확인해 주세요.</div>` : ''}
      <div class="dept-list">
        ${state.depts.map(d => `
          <a class="drow" href="#/dept/${encodeURIComponent(d.id)}" style="--dept-color:${esc(d.color)}">
            <div class="drow__num">${d.profs.length}<small>명</small></div>
            <div class="drow__main">
              <h2 class="drow__name">${esc(d.name)}</h2>
              <div class="drow__en">${esc(d.en || '')}${d.url ? ` · ${esc(d.url.replace(/^https?:\/\//, ''))}` : ''}</div>
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
        ${p.office ? `<div class="prof__office"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>${esc(p.office)}</div>` : ''}
      </div>
    </div>`;
}

/* ---------- 선호도 ---------- */
const rKey = p => `${p.dept_id}/${p.slug}`;
const getRating = p => state.ratings.get(rKey(p)) || '';
const matchRating = p => state.ratingFilter === '전체' || (state.ratingFilter === '미지정' ? !getRating(p) : getRating(p) === state.ratingFilter);
const countRating = (d, r) => r === '전체' ? d.profs.length : d.profs.filter(p => r === '미지정' ? !getRating(p) : getRating(p) === r).length;

function ratingSummary(d) {
  const parts = CONFIG.RATINGS.LABELS.map(r => [r, countRating(d, r)]).filter(([, n]) => n);
  if (!parts.length) return '';
  return `<div class="drow__rates">${parts.map(([r, n]) => `<span class="rs rs--${rClass(r)}">${esc(r)} ${n}</span>`).join('')}</div>`;
}
const rClass = r => ({ '상': 'high', '중': 'mid', '하': 'low', '부': 'neg' }[r] || '');

function rateChips(p, big = false) {
  const cur = getRating(p);
  return `<div class="rate ${big ? 'rate--big' : ''}" data-key="${esc(rKey(p))}" role="group" aria-label="${esc(p.name)} 선호도">
    ${CONFIG.RATINGS.LABELS.map(r => `<button type="button" class="rate__b rate__b--${rClass(r)}" data-val="${esc(r)}" aria-pressed="${cur === r}" title="선호도 ${esc(r)}${r === '부' ? '(부정)' : ''}">${esc(r)}</button>`).join('')}
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

function ratingsCacheKey() { return 'jnu-ratings:' + (state.session ? state.session.email : 'local'); }

function loadRatingsCache() {
  try {
    const m = JSON.parse(localStorage.getItem(ratingsCacheKey()) || '{}');
    state.ratings = new Map(Object.entries(m));
  } catch { state.ratings = new Map(); }
}
function saveRatingsCache() {
  try { localStorage.setItem(ratingsCacheKey(), JSON.stringify(Object.fromEntries(state.ratings))); } catch {}
}

async function loadRatings() {
  loadRatingsCache();
  if (!CONFIG.RATINGS.API_URL || !state.session) return;
  try {
    const r = await ratingsApi('list', {});
    if (r && Array.isArray(r.ratings)) {
      state.ratings = new Map(r.ratings.map(x => [`${x.dept_id}/${x.slug}`, x.rating]));
      saveRatingsCache();
      render();
    }
  } catch (e) { console.warn('선호도 불러오기 실패:', e.message); }
}

async function setRating(key, val) {
  if (val) state.ratings.set(key, val); else state.ratings.delete(key);
  saveRatingsCache();
  refreshRatingUI(key, val);
  if (!CONFIG.RATINGS.API_URL || !state.session) return;
  const [dept_id, slug] = key.split('/');
  const p = state.rows.find(x => x.dept_id === dept_id && x.slug === slug);
  try {
    const r = await ratingsApi('set', { dept_id, slug, name: p ? p.name : '', rating: val });
    if (!r || !r.ok) throw new Error((r && r.error) || '저장 실패');
  } catch (e) {
    flashStatus('선호도를 시트에 저장하지 못했습니다 — ' + e.message, true);
  }
}

/* 화면 전체를 다시 그리지 않고 해당 교수의 칩·카드·필터 숫자만 갱신 */
function refreshRatingUI(key, val) {
  document.querySelectorAll(`.rate[data-key="${CSS.escape(key)}"] .rate__b`).forEach(b => b.setAttribute('aria-pressed', b.dataset.val === val));
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
  const res = await fetch(CONFIG.RATINGS.API_URL, { method: 'POST', body: JSON.stringify({ action, token, ...payload }), redirect: 'follow' });
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
          <h2 class="d-name" id="drawerTitle">${esc(p.name)}</h2>
          <div class="d-en">${esc(p.name_en || '')}</div>
          <div class="d-tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
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
  $drawer.hidden = false;
  document.body.style.overflow = 'hidden';
  $panel.querySelector('[data-close]').focus();
}

function closeDrawer(navigate = true) {
  if ($drawer.hidden) return;
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
  if (tokenWaiter) { // 조용한 토큰 갱신 중이었음
    const w = tokenWaiter; tokenWaiter = null;
    if (state.session && state.session.email !== s.email) { w.reject(new Error('다른 계정으로 로그인됨')); location.reload(); return; }
    state.session = s; w.resolve(s.credential); return;
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
  await ensureGis();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { if (tokenWaiter) { tokenWaiter = null; reject(new Error('로그인 갱신 필요 — 로그아웃 후 다시 로그인해 주세요')); } }, 15000);
    const done = fn => v => { clearTimeout(timer); fn(v); };
    tokenWaiter = { resolve: done(resolve), reject: done(reject) };
    google.accounts.id.prompt(n => { if (n.isNotDisplayed && n.isNotDisplayed() || n.isSkippedMoment && n.isSkippedMoment()) { if (tokenWaiter) { tokenWaiter.reject(new Error('로그인 갱신 필요 — 로그아웃 후 다시 로그인해 주세요')); tokenWaiter = null; } } });
  });
}

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
window.addEventListener('hashchange', () => { state.rankFilter = '전체'; render(); });
if (!authEnabled()) {
  enterApp(null);
} else {
  const s = loadSession();
  s ? enterApp(s) : showGate();
}
