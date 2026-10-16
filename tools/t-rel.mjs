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
t('다시 그려도 자리가 그대로', await page.evaluate(() => {
  const pos = () => [...document.querySelectorAll('.rel-n circle')].map(c => c.getAttribute('cx') + ',' + c.getAttribute('cy')).join('|');
  const a = pos(); relRefresh(); return a === pos();
}));

/* 나는 한가운데, 테가 둘러 있다 */
t('나는 한가운데 선다', await page.evaluate(() => {
  const me = document.querySelector('.rel-n--me circle'), svg = document.querySelector('.rel-svg');
  const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number);
  return Math.abs(+me.getAttribute('cx') - W / 2) < 30 && Math.abs(+me.getAttribute('cy') - H / 2) < 30;
}));

/* 점을 누르면 그 교수로 간다 */
await page.evaluate(() => { const n = [...document.querySelectorAll('.rel-n')].find(x => !x.classList.contains('rel-n--me')); n.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
await page.waitForTimeout(500);
t('점을 누르면 그 교수로 간다', /#\/dept\/[^/]+\/prof\//.test(await page.evaluate(() => location.hash)),
  await page.evaluate(() => location.hash));
await page.evaluate(() => { closeDrawer(false); location.hash = '#/stats'; render(); });
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
