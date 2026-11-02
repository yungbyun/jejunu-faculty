/* 관계 지도 — 동문(자료)·메모(적어 두신 말)로 선을 긋고, 말투로 긍정·부정을 가른다.
   메모를 고치면 **다시 그릴 때 바로** 바뀌어야 한다(배포 없이).
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1200, height: 1000 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
const ok = []; const t = (n, v, x = '') => ok.push([n, v, x]);

/* 밑자리 — 선호도를 돌려 매기고, 메모를 몇 줄 적어 둔다 */
const NAMES = await page.evaluate(() => {
  const R = ['확', '긍', '중', '모', '부', '비'];
  state.rows.forEach((p, i) => applyEntry(rKey(p), { rating: R[i % 6], memo: '' }));
  const me = state.rows.find(p => p.name === ME.name);
  const others = state.rows.filter(p => p !== me && getRating(p) !== '비');
  return { me: me.name, a: others[0].name, c: others[1].name, d: others[2].name };
});
const setMemo = (who, memo) => page.evaluate(([w, m]) => {
  const p = state.rows.find(x => x.name === w);
  applyEntry(rKey(p), { memo: m });
  location.hash = '#/stats'; render();
}, [who, memo]);

await setMemo(NAMES.me, `${NAMES.a} 교수와 아주 가깝다. ${NAMES.c} 교수와는 좀 껄끄럽다.`);
await page.waitForSelector('.rel-svg', { timeout: 15000 });

t('분석 맨 아래에 관계 지도', await page.evaluate(() => {
  const sec = document.getElementById('relSec');
  const secs = [...document.querySelectorAll('.view .st-sec')];
  return !!sec && secs[secs.length - 1] === sec;
}));
t('출신 대학을 69명 다 읽었다', await page.evaluate(() => Object.keys(eduMap || {}).length) === 69,
  await page.evaluate(() => Object.keys(eduMap || {}).length));

const edges = () => page.evaluate(() => {
  const g = relGraph();
  return g.edges.map(e => ({ a: nameOfKey(e.a), b: nameOfKey(e.b), kind: e.kind, pol: e.pol, why: e.why }));
});

let E = await edges();
const find = (x, y, kind) => E.find(e => e.kind === kind && ((e.a === x && e.b === y) || (e.a === y && e.b === x)));
t('메모에 적은 이름끼리 선이 생긴다', !!find(NAMES.me, NAMES.a, 'memo') && !!find(NAMES.me, NAMES.c, 'memo'),
  E.filter(e => e.kind === 'memo').map(e => `${e.a}-${e.b}:${e.pol}`).join(' '));
t('「가깝다」는 긍정으로 읽는다', (find(NAMES.me, NAMES.a, 'memo') || {}).pol > 0,
  JSON.stringify(find(NAMES.me, NAMES.a, 'memo')));
t('「껄끄럽다」는 부정으로 읽는다', (find(NAMES.me, NAMES.c, 'memo') || {}).pol < 0,
  JSON.stringify(find(NAMES.me, NAMES.c, 'memo')));
t('근거 문장을 들고 다닌다', ((find(NAMES.me, NAMES.a, 'memo') || {}).why || '').includes(NAMES.a));

/* 뒤집는 말 — 「가깝지 않다」 */
await setMemo(NAMES.me, `${NAMES.a} 교수와 가깝지 않다.`);
E = await edges();
t('「가깝지 않다」는 뒤집어 읽는다', (find(NAMES.me, NAMES.a, 'memo') || {}).pol < 0,
  JSON.stringify(find(NAMES.me, NAMES.a, 'memo')));

/* 메모를 고치면 바로 따라온다 — 다시 컴파일하거나 배포할 일이 없다 */
await setMemo(NAMES.me, `${NAMES.d} 교수가 도와주기로 했다.`);
E = await edges();
t('메모를 고치면 선도 따라 바뀐다', !find(NAMES.me, NAMES.a, 'memo') && !!find(NAMES.me, NAMES.d, 'memo'),
  E.filter(e => e.kind === 'memo').map(e => `${e.a}-${e.b}`).join(' '));
t('메모를 비우면 선이 사라진다', await page.evaluate(async ([w]) => {
  const p = state.rows.find(x => x.name === w);
  applyEntry(rKey(p), { memo: '' });
  return relGraph().edges.filter(e => e.kind === 'memo').length === 0;
}, [NAMES.me]));

/* 비참여는 뺀다 */
t('비참여는 그림에 안 넣는다', await page.evaluate(() => {
  const g = relGraph();
  return g.nodes.every(n => getRating(n.p) !== '비') && g.skipped > 0;
}), await page.evaluate(() => relGraph().skipped + '명 뺌'));

/* 동문 — 자료에서 미룬 것이라 점선·중립 */
t('동문은 점선으로 긋는다', await page.evaluate(() => {
  const l = [...document.querySelectorAll('.rel-l')].find(x => x.getAttribute('stroke-dasharray'));
  return !!l;
}));
t('동문은 긍정도 부정도 아니다', (await edges()).filter(e => e.kind === 'alum').every(e => e.pol === 0));
t('너무 큰 동문 묶음은 안 긋는다', await page.evaluate(() => {
  const by = {};
  state.rows.filter(p => getRating(p) !== '비').forEach(p =>
    eduUnivs(eduOf(p)).forEach(u => { (by[u] = by[u] || []).push(p.name); }));
  const big = Object.entries(by).filter(([, v]) => v.length > 14).map(([u]) => u);
  const drawn = new Set(relGraph().edges.filter(e => e.kind === 'alum').map(e => e.uni));
  return big.every(u => !drawn.has(u));
}));

/* 보기 설정 */
/* 처음부터 **모든 관계**를 보여 준다 (2026-10-17, 사용자 지정) */
t('처음엔 모든 관계를 보여 준다', await page.evaluate(() => {
  const g = relGraph(), v = relView(g);
  return RELV.all && v.edges.some(e => e.a !== g.meKey && e.b !== g.meKey);
}), await page.evaluate(() => relView(relGraph()).edges.length + '선'));
await page.click('[data-relme]');
await page.waitForTimeout(400);
t('누르면 나와 이어진 것만 남는다', await page.evaluate(() => {
  const g = relGraph(), v = relView(g);
  return !RELV.all && v.edges.every(e => e.a === g.meKey || e.b === g.meKey) && v.edges.length > 0;
}));
await page.click('[data-relme]');
await page.waitForTimeout(400);
await page.click('[data-relalum]');
await page.waitForTimeout(400);
t('동문선을 끌 수 있다', await page.evaluate(() => !RELV.alum && relView(relGraph()).edges.every(e => e.kind !== 'alum')));
await page.evaluate(() => { RELV.all = false; RELV.alum = true; relRefresh(); });
await page.waitForTimeout(300);

/* 자리는 다시 그려도 안 흔들린다 — 씨앗을 이름에서 뽑는다 */
t('새로 그려도 시작 자리가 같다', await page.evaluate(() => {
  const pos = () => [...document.querySelectorAll('[data-relnode]')].map(e => e.getAttribute('transform')).join('|');
  relRefresh(); const a = pos(); relRefresh(); return a === pos() && a.length > 10;
}));

/* 나는 한가운데로 당겨 둔다 — 끌면 풀린다 */
t('나는 한가운데 선다', await page.evaluate(() => {
  const me = SIM.nodes.find(n => n.me);
  return Math.abs(me.x - SIM.W / 2) < 40 && Math.abs(me.y - SIM.H / 2) < 40;
}), await page.evaluate(() => {
  const m = SIM.nodes.find(n => n.me);
  return Math.round(m.x) + ',' + Math.round(m.y) + ' / ' + SIM.W + 'x' + SIM.H;
}));

/* 손으로 끌면 그 자리로 옮겨지고, 바퀴로 키우고 줄인다 (옵시디언처럼) */
t('점을 끌면 따라온다', await page.evaluate(async () => {
  const svg = document.querySelector('.rel-svg');
  const g = [...document.querySelectorAll('.rel-n')].find(x => !x.classList.contains('rel-n--me'));
  const key = g.dataset.relnode, before = { ...SIM.byKey.get(key) };
  const r = svg.getBoundingClientRect();
  const ev = (t2, x, y, el) => el.dispatchEvent(new PointerEvent(t2, { bubbles: true, pointerId: 1, clientX: x, clientY: y }));
  svg.setPointerCapture = () => {};
  ev('pointerdown', r.left + before.x * r.width / SIM.W, r.top + before.y * r.height / SIM.H, g);
  ev('pointermove', r.left + r.width * .8, r.top + r.height * .2, svg);
  ev('pointerup', r.left + r.width * .8, r.top + r.height * .2, svg);
  await new Promise(r2 => setTimeout(r2, 50));
  const now = SIM.byKey.get(key);
  return Math.hypot(now.x - before.x, now.y - before.y) > 40;
}));
t('바퀴로 키우고 줄인다', await page.evaluate(() => {
  const svg = document.querySelector('.rel-svg'), k0 = SIM.k;
  svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -300, clientX: 10, clientY: 10 }));
  const up = SIM.k;
  svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 600, clientX: 10, clientY: 10 }));
  return up > k0 && SIM.k < up;
}));
/* 바탕을 끌면 **상하좌우로 돌아간다** (2026-10-17) */
t('바탕을 끌면 돌아간다', await page.evaluate(async () => {
  const svg = document.querySelector('.rel-svg'), r = svg.getBoundingClientRect();
  svg.setPointerCapture = () => {};
  const ev = (t2, x, y) => svg.dispatchEvent(new PointerEvent(t2, { bubbles: true, pointerId: 9, clientX: x, clientY: y }));
  SIM.yaw = 0; SIM.pitch = 0;
  const before = [...document.querySelectorAll('[data-relnode]')].map(e => e.getAttribute('transform')).join('|');
  ev('pointerdown', r.left + r.width * .5, r.top + r.height * .5);
  for (let i = 1; i <= 8; i++) ev('pointermove', r.left + r.width * (.5 + i * .02), r.top + r.height * (.5 + i * .015));
  ev('pointerup', r.left + r.width * .66, r.top + r.height * .62);
  await new Promise(x => setTimeout(x, 80));
  const after = [...document.querySelectorAll('[data-relnode]')].map(e => e.getAttribute('transform')).join('|');
  return Math.abs(SIM.yaw) > .1 && Math.abs(SIM.pitch) > .1 && before !== after;
}), await page.evaluate(() => `yaw ${SIM.yaw.toFixed(2)} pitch ${SIM.pitch.toFixed(2)}`));
t('위아래로 돌려도 뒤집히지 않는다', await page.evaluate(() => {
  SIM.pitch = 0;
  const svg = document.querySelector('.rel-svg'), r = svg.getBoundingClientRect();
  const ev = (t2, x, y) => svg.dispatchEvent(new PointerEvent(t2, { bubbles: true, pointerId: 11, clientX: x, clientY: y }));
  ev('pointerdown', r.left + r.width * .5, r.top + r.height * .5);
  for (let i = 0; i < 60; i++) ev('pointermove', r.left + r.width * .5, r.top + r.height * .5 + i * 20);
  ev('pointerup', r.left + r.width * .5, r.top + r.height * .9);
  return Math.abs(SIM.pitch) <= 1.2001;
}), await page.evaluate(() => SIM.pitch.toFixed(2)));
t('「맞춤」을 누르면 똑바로 서고 상자에 맞는다', await page.evaluate(async () => {
  document.querySelector('[data-relfit]').click();
  await new Promise(r => setTimeout(r, 400));
  const xs = SIM.nodes.map(n => n.px * SIM.k + SIM.tx), ys = SIM.nodes.map(n => n.py * SIM.k + SIM.ty);
  const inBox = Math.min(...xs) > -1 && Math.max(...xs) < SIM.W + 1 && Math.min(...ys) > -1 && Math.max(...ys) < SIM.H + 1;
  return SIM.yaw === 0 && SIM.pitch === 0 && SIM.focus === '' && inBox;
}));
t('붐비면 이름표를 감춘다 — 나는 늘 보인다', await page.evaluate(async () => {
  RELV.all = true; SIM.focus = ''; relRefresh();
  await new Promise(r => setTimeout(r, 400));
  const ns = document.querySelector('.rel-ns');
  if (SIM.nodes.length <= 36) return false;                 // 전부 보기면 서른 명은 넘어야 한다
  const me = document.querySelector('.rel-n--me text');
  return ns.classList.contains('rel-ns--hide') && getComputedStyle(me).opacity === '1';
}), await page.evaluate(() => SIM.nodes.length + '명 · ' + document.querySelector('.rel-ns').getAttribute('class')));

/* 점을 고르면 그 사람 중심 — 나를 거치지 않는 관계를 본다 */
await page.evaluate(() => { RELV.all = true; SIM.focus = ''; relRefresh(); });
await page.waitForTimeout(400);
t('점을 고르면 그 사람 둘레만 또렷해진다', await page.evaluate(async () => {
  const g = [...document.querySelectorAll('.rel-n')].find(x => !x.classList.contains('rel-n--me'));
  const key = g.dataset.relnode;
  SIM.focus = key; relRefresh(true);
  await new Promise(r => setTimeout(r, 300));
  const on = document.querySelector('.rel-n.on');
  return !!on && on.dataset.relnode === key && document.querySelectorAll('.rel-n.off').length > 0;
}));
t('고른 사람 설명에 상세 열기가 붙는다', await page.evaluate(() =>
  !!document.querySelector('.rel-why .rel-go')));
t('나를 빼고도 둘끼리 이어진 선이 있다', await page.evaluate(() => {
  const g = relGraph();
  return relView(g).edges.some(e => e.a !== g.meKey && e.b !== g.meKey);
}), await page.evaluate(() => { const g = relGraph(); return relView(g).edges.filter(e => e.a !== g.meKey && e.b !== g.meKey).length + '건'; }));
await page.evaluate(() => { SIM.focus = ''; RELV.all = false; relRefresh(); });
await page.waitForSelector('.rel-svg', { timeout: 10000 });

/* 근거 보기 */
await setMemo(NAMES.me, `${NAMES.a} 교수와 아주 가깝다.`);
await page.waitForSelector('.rel-list button', { timeout: 10000 });
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.rel-list button')].find(b => /가깝/.test(b.innerText));
  (btn || document.querySelector('.rel-list button')).click();
});
await page.waitForTimeout(400);
t('누르면 근거 문장을 보여 준다', (await page.evaluate(() => document.querySelector('.rel-why').textContent)).includes(NAMES.a),
  await page.evaluate(() => document.querySelector('.rel-why').textContent.slice(0, 60)));

await page.evaluate(() => { state.rows.forEach(p => applyEntry(rKey(p), { rating: '', memo: '' })); });

/* ---------- 출신 대학 줄 (2026-10-26, 교수님 지정) ----------
 * 관계 지도 **위**에 출신 대학을 쭉 늘어놓고, 하나를 누르면 그 대학을 거친 교수 명단이 편다. */
await page.waitForSelector('.rel-unis [data-reluni]', { timeout: 20000 });
const U = await page.evaluate(() => {
  const chips = [...document.querySelectorAll('[data-reluni]')];
  const box = document.querySelector('.rel-unis');
  const svg = document.querySelector('.rel-svg') || document.querySelector('.rel-tools');
  return {
    n: chips.length,
    names: chips.map(e => e.dataset.reluni),
    cnts: chips.map(e => +e.querySelector('i').textContent),
    above: !!(box && svg) && (box.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING) > 0,
    open: document.querySelectorAll('.rel-unames').length,
  };
});
t('대학 줄이 그림 위에 있다', U.above);
t('대학을 쭉 늘어놓는다', U.n > 3, `${U.n}곳`);
t('많은 데부터 적는다', U.cnts.every((v, i) => i === 0 || U.cnts[i - 1] >= v), U.cnts.join(','));
t('같은 수면 이름 차례', U.names.every((v, i) => i === 0 ||
  U.cnts[i - 1] > U.cnts[i] || U.names[i - 1].localeCompare(v, 'ko') <= 0), U.names.join(','));
t('처음에는 명단이 접혀 있다', U.open === 0);

const uni = U.names[0];
await page.click(`[data-reluni="${uni}"]`);
await page.waitForTimeout(400);
const L = await page.evaluate(u => {
  const li = [...document.querySelectorAll('.rel-unames li a')];
  const want = state.rows.filter(p => getRating(p) !== '비' && [...new Set([eduOf(p)?.bs, eduOf(p)?.ms, eduOf(p)?.phd])].includes(u));
  return {
    n: li.length, want: want.length,
    /* 「최수석」처럼 이름이 학위 글자로 끝나기도 한다 — 글자를 깎지 말고 학위 조각만 떼어 낸다 */
    names: li.map(e => { const c = e.cloneNode(true); c.querySelector('.st-d')?.remove(); return c.textContent.trim(); }),
    wantNames: want.map(p => p.name),
    degs: li.map(e => (e.querySelector('.st-d') || {}).textContent || ''),
    pressed: document.querySelector(`[data-reluni="${CSS.escape(u)}"]`).getAttribute('aria-pressed'),
    link: li[0] && li[0].getAttribute('href'),
    tip: li[0] && li[0].title,
  };
}, uni);
t('고른 대학 명단이 펴진다', L.n > 0 && L.n === L.want, `${L.n} / ${L.want}명`);
t('그 대학 사람만 나온다', L.names.every(n => L.wantNames.includes(n)), L.names.join(' '));
t('고른 칩이 눌린 꼴', L.pressed === 'true');
t('학위를 학·석·박으로 적는다', L.degs.every(d => /^[학석박]{1,3}$/.test(d)), L.degs.join(' '));
t('이름을 누르면 그 교수 상세로', /^#\/dept\/.+\/prof\/.+/.test(L.link || ''), L.link);
t('도움말에 학과와 확률', /·/.test(L.tip || '') && /확률|비참여|미지정/.test(L.tip || ''), L.tip);
t('비참여는 명단에서 뺀다', await page.evaluate(u => {
  const li = [...document.querySelectorAll('.rel-unames li a')]
    .map(e => { const c = e.cloneNode(true); c.querySelector('.st-d')?.remove(); return c.textContent.trim(); });
  return !state.rows.some(p => getRating(p) === '비' && li.includes(p.name));
}, uni));

await page.click(`[data-reluni="${uni}"]`);
await page.waitForTimeout(350);
t('다시 누르면 접힌다', await page.evaluate(() => document.querySelectorAll('.rel-unames').length === 0));
t('명단을 여닫아도 그림은 그대로', await page.evaluate(() => !!document.querySelector('.rel-svg') || !!document.querySelector('.rel-box .empty')));

/* ---------- 상세 화면의 「동문 교수」 (2026-11-02, 교수님 지정) ----------
 * 선호도 **위**에, 같은 대학을 거친 교수를 대학마다 묶어 적는다. */
const pick = await page.evaluate(() => {
  /* 대학이 둘인 분을 고른다 — 묶음이 둘로 갈리는지 보려면 그래야 한다 */
  const p = state.rows.find(x => alumGroups(x).length >= 2) || state.rows.find(x => alumGroups(x).length);
  const g = alumGroups(p);
  const mine = eduUnivs(eduOf(p));
  return { name: p.name, hash: `#/dept/${encodeURIComponent(p.dept_id)}/prof/${encodeURIComponent(p.slug)}`,
    groups: g.length, unis: g.map(x => x.u), ns: g.map(x => x.ps.length),
    all: g.map(x => x.ps.map(y => y.name)),
    /* 같은 대학인데 비참여라 빠져야 할 분 */
    out: state.rows.filter(x => rKey(x) !== rKey(p) && getRating(x) === '비'
      && eduUnivs(eduOf(x)).some(u => mine.includes(u))).map(x => x.name) };
});
await page.evaluate(h => { location.hash = h; }, pick.hash);
await page.waitForSelector('.d-alum', { timeout: 15000 });
await page.waitForTimeout(500);
const al = await page.evaluate(() => {
  const box = document.querySelector('.d-alum');
  const secs = [...document.querySelectorAll('.d-section h3')].map(h => h.textContent.trim());
  const txt = el => { const c = el.cloneNode(true); c.querySelector('.st-d')?.remove(); return c.textContent.trim(); };
  return {
    secs,
    groups: box.querySelectorAll('.d-alum__g').length,
    unis: [...box.querySelectorAll('.d-alum__u')].map(e => e.firstChild.textContent.trim()),
    names: [...box.querySelectorAll('.d-alum__g')].map(g => [...g.querySelectorAll('li a')].map(txt)),
    degs: [...box.querySelectorAll('li .st-d')].map(e => e.textContent.trim()),
    href: box.querySelector('li a')?.getAttribute('href') || '',
    note: box.querySelector('.st-note')?.textContent.trim() || '',
    me: document.querySelector('.d-name').textContent.trim(),
  };
});
t('상세에 「동문 교수」 칸이 있다', al.secs.includes('동문 교수'), al.secs.join(' | '));
t('선호도 바로 위에 둔다', al.secs.indexOf('동문 교수') === al.secs.indexOf('선호도') - 1, al.secs.join(' | '));
t('대학마다 묶는다', al.groups === pick.groups && al.groups >= 2, `${al.groups} / ${pick.groups}묶음`);
t('묶음 머리에 대학 이름', al.unis.join(',') === pick.unis.join(','), `${al.unis.join(',')} / ${pick.unis.join(',')}`);
t('그 대학 동문을 다 적는다', al.names.map(x => x.join(',')).join(' | ') === pick.all.map(x => x.join(',')).join(' | '),
  al.names.map(x => x.length).join(',') + ' / ' + pick.ns.join(','));
t('자기 자신은 안 넣는다', !al.names.flat().includes(al.me), al.me);
t('비참여는 뺀다', !al.names.flat().some(n => pick.out.includes(n)), pick.out.join(' '));
t('뺀 비참여가 몇 명인지 적는다', !pick.out.length || /비참여 \d+명은 뺐습니다/.test(al.note), al.note);
t('이름 뒤에 학·석·박을 적는다', al.degs.length > 0 && al.degs.every(d => /^[학석박]+$/.test(d)), al.degs.join(' '));
t('이름을 누르면 그 교수 상세로', /^#\/dept\/.+\/prof\/.+/.test(al.href), al.href);

/* 영문 이름 **바로 아래**에 출신 학교를 적는다 (2026-11-02, 교수님 지정) */
const edu = await page.evaluate(() => {
  const en = document.querySelector('.d-en');
  const box = document.querySelector('.d-eduw');
  const e = eduOf(state.rows.find(p => p.slug === box.dataset.edu));
  return {
    afterEn: en.nextElementSibling === box,
    beforeOffice: !!box.nextElementSibling && /d-(office|phones)/.test(box.nextElementSibling.className),
    degs: [...box.querySelectorAll('em')].map(x => ({
      deg: x.querySelector('i').textContent.trim(),
      uni: x.textContent.replace(x.querySelector('i').textContent, '').trim() })),
    want: [['학사', e.bs], ['석사', e.ms], ['박사', e.phd]].filter(x => x[1]),
    icon: !!box.querySelector('svg'),
  };
});
t('출신 학교가 영문 이름 바로 아래', edu.afterEn, String(edu.afterEn));
t('연구실·번호 줄보다 위', edu.beforeOffice, String(edu.beforeOffice));
t('학위마다 적는다', edu.degs.length === edu.want.length
  && edu.degs.every((d, i) => d.deg === edu.want[i][0] && d.uni === edu.want[i][1]),
  edu.degs.map(d => `${d.deg} ${d.uni}`).join(' · '));
t('학위 이름을 붙여 둔다', edu.degs.every(d => /^(학사|석사|박사)$/.test(d.deg)),
  edu.degs.map(d => d.deg).join(' '));
t('앞에 학사모 그림', edu.icon);

/* 학력 자료는 관계 지도에서만 쓰던 것이라 **늦게** 온다 — 상세를 바로 열어도 채워져야 한다 */
await page.goto('http://127.0.0.1:8080/' + pick.hash, { waitUntil: 'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
await page.waitForTimeout(600);
const late = await page.evaluate(async () => {
  for (let i = 0; i < 60; i++) {
    const box = document.querySelector('.d-alum');
    if (box && box.querySelector('li a')) break;
    await new Promise(r => setTimeout(r, 200));
  }
  return { alum: !!document.querySelector('.d-alum li a'), edu: !!document.querySelector('.d-edu em') };
});
t('바로 연 상세에도 동문이 채워진다', late.alum);
t('바로 연 상세에도 출신 학교가 채워진다', late.edu);

let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
