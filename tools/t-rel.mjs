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
await page.evaluate(() => { RELV.all = false; RELV.alum = true; relRefresh(); });
await page.waitForTimeout(300);
t('처음엔 나와 이어진 것만', await page.evaluate(() => {
  const g = relGraph(), v = relView(g);
  return v.edges.every(e => e.a === g.meKey || e.b === g.meKey) && v.edges.length > 0;
}));
await page.click('[data-relme]');
await page.waitForTimeout(400);
t('누르면 전부 보여 준다', await page.evaluate(() => {
  const g = relGraph(), v = relView(g);
  return RELV.all && v.edges.length > relView({ ...g, meKey: g.meKey }).edges.length - 1;
}));
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
t('「맞춤」을 누르면 되돌아온다', await page.evaluate(async () => {
  document.querySelector('[data-relfit]').click();
  await new Promise(r => setTimeout(r, 300));
  return SIM.k === 1 && SIM.tx === 0 && SIM.ty === 0 && SIM.focus === '';
}));

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

let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
