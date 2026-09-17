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
};

/* ---------- 상태 ---------- */
const state = { rows: [], depts: [], source: '', query: '', rankFilter: '전체' };
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
    .map(r => ({
      ...r,
      slug: slugify(r.name_en || r.name),
      order: Number(r.order) || 999,
      tags: splitList(r.tags),
      papers: [r.paper1, r.paper2, r.paper3, r.paper4, r.paper5]
        .filter(Boolean)
        .map(p => { const [t, j, y] = p.split('|').map(s => s.trim()); return { t, j, y }; }),
    }));
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

function setStatus(src) {
  const map = {
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
        <div class="eyebrow">Jeju National University · College of Engineering</div>
        <h1>교수진 안내</h1>
        <p>${state.depts.length}개 학과 · 전임교원 ${total}명. 학과를 선택하면 교수진과 세부 연구 분야를 볼 수 있습니다.</p>
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
            </div>
            <div class="drow__avs" aria-hidden="true">
              ${d.profs.slice(0, 7).map(p => p.photo
                ? `<i class="av"><img src="${esc(p.photo)}" alt="" loading="lazy" onerror="this.parentNode.textContent='${esc(initial(p.name))}'"></i>`
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
  const list = d.profs.filter(p => state.rankFilter === '전체' || p.rank === state.rankFilter);
  $app.innerHTML = `
    <div class="view" style="--dept-color:${esc(d.color)}">
      <div class="crumbs"><a href="#/">학과 목록</a><span class="sep">/</span><span>${esc(d.name)}</span></div>
      <div class="dept-hero">
        <div>
          <div class="eyebrow">${esc(d.en || 'Department')}</div>
          <h1>${esc(d.name)}</h1>
          <div class="sub">전임교원 ${d.profs.length}명${d.url ? ` · <a href="${esc(d.url)}" target="_blank" rel="noopener">학과 홈페이지 ↗</a>` : ''}</div>
        </div>
        <div class="filters" role="group" aria-label="직위 필터">
          ${ranks.map(r => `<button class="chip" type="button" data-rank="${esc(r)}" aria-pressed="${state.rankFilter === r}">${esc(r)}<span class="n">${r === '전체' ? d.profs.length : d.profs.filter(p => p.rank === r).length}</span></button>`).join('')}
        </div>
      </div>
      ${list.length ? `<div class="prof-grid">${list.map(p => profCard(p, d)).join('')}</div>` : `<div class="empty"><strong>해당 직위의 교수가 없습니다</strong></div>`}
    </div>`;
  $app.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { state.rankFilter = b.dataset.rank; renderDept(d); }));
  bindCards();
}

function profCard(p, d, showDept = false) {
  const color = d ? d.color : '#1f8a5b';
  return `
    <button class="prof" type="button" data-dept="${esc(p.dept_id)}" data-slug="${esc(p.slug)}" style="--dept-color:${esc(color)}" aria-label="${esc(p.name)} ${esc(p.rank)} 상세 보기">
      <div class="prof__photo">
        <div class="avatar" aria-hidden="true">${esc(initial(p.name))}</div>
        ${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy" onload="this.classList.add('loaded')" onerror="this.remove()">` : ''}
      </div>
      <div class="prof__body">
        <div class="prof__rank">${esc(p.rank)}${showDept ? ` · ${esc(p.dept_name)}` : ''}</div>
        <h3 class="prof__name">${esc(p.name)}<small>${esc(p.name_en || '')}</small></h3>
        <div class="prof__tags">${p.tags.slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        ${p.office ? `<div class="prof__office"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>${esc(p.office)}</div>` : ''}
      </div>
    </button>`;
}

function bindCards() {
  $app.querySelectorAll('.prof').forEach(b => b.addEventListener('click', () => {
    location.hash = `#/dept/${encodeURIComponent(b.dataset.dept)}/prof/${encodeURIComponent(b.dataset.slug)}`;
  }));
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
        <div class="d-photo"><div class="avatar" aria-hidden="true">${esc(initial(p.name))}</div>${p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)} 사진" onerror="this.remove()">` : ''}</div>
        <div>
          <span class="d-rank">${esc(p.rank)}</span>
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

/* ---------- 시작 ---------- */
window.addEventListener('hashchange', () => { state.rankFilter = '전체'; render(); });
render();
loadData();
