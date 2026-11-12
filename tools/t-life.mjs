/* 사는 곳 · 가족사항 — 상세의 **번호 줄 바로 아래** (2026-11-13, 교수님 지정).
   적는 칸을 따로 두지 않고 **메모에 적어 두신 「주거지(…)」·「가족사항(…)」 을 읽는다.**
   읽는 눈(괄호가 어긋나도, 꾸밈 표시가 섞여도)과 세우는 자리를 잰다.
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
const ok = []; const t = (n, v, x = '') => ok.push([n, v, x]);

/* ---------- 읽는 눈 ---------- */
const home = s => page.evaluate(x => lifePick(LIFE_HOME_RE, memoPlain(x)), s);
const fam = s => page.evaluate(x => lifePick(LIFE_FAM_RE, memoPlain(x)), s);

t('주거지(…) 를 읽는다', (await home('주거지(한일베라체)'))[0] === '한일베라체');
t('가족사항(…) 을 읽는다', (await fam('가족사항(아들 7세)'))[0] === '아들 7세');
t('가족사항은 여러 번 적어도 다 읽는다',
  JSON.stringify(await fam('주거지(한일베라체), 가족사항(아들 7세), 가족사항(딸 5세)')) === '["아들 7세","딸 5세"]');
t('한 줄에 섞여 있어도 주거지만 집는다',
  JSON.stringify(await home('주거지(한일베라체), 가족사항(아들 7세)')) === '["한일베라체"]');
/* 괄호가 어긋나는 일은 실제로 있다 — `주거지{한일베라체)` (교수님 메모) */
t('여는 괄호가 { 여도 읽는다', (await home('주거지{한일베라체)'))[0] === '한일베라체');
t('닫는 괄호가 없어도 읽는다', (await home('주거지(노형동 아이파크'))[0] === '노형동 아이파크');
t('전각 괄호도 읽는다', (await fam('가족（딸 둘）'))[0] === '딸 둘');
t('안쪽 공백은 다듬는다', (await home('사는 곳 (  아라동 e편한세상  )'))[0] === '아라동 e편한세상');
t('거주지·사는 곳 도 같이 받는다',
  (await home('거주지(이도동)'))[0] === '이도동' && (await home('사는곳(연동)'))[0] === '연동');
t('가족관계·가족 도 같이 받는다',
  (await fam('가족관계(배우자 교사)'))[0] === '배우자 교사' && (await fam('가족(딸 하나)'))[0] === '딸 하나');
/* 괄호가 바로 뒤에 와야 한다 — 그래서 보통 글은 걸리지 않는다 */
t('「가족 모임」 같은 보통 글은 걸리지 않는다',
  !(await fam('지난주 가족 모임에 다녀오셨다. 학과 가족 행사도.')).length);
t('꾸밈 표시는 털어 내고 읽는다',
  (await home('**주거지(노형동)**'))[0] === '노형동' && (await fam('{빨강:가족사항(배우자 교사)}'))[0] === '배우자 교사');
t('같은 말을 두 번 적으면 한 번만 센다',
  JSON.stringify(await fam('가족사항(딸 5세) 가족사항(딸 5세)')) === '["딸 5세"]');
t('줄을 넘어가며 먹지 않는다',
  JSON.stringify(await home('주거지(노형동\n가족사항(아들 7세)')) === '["노형동"]');
t('괄호만 열고 비면 아무것도 아니다', !(await home('주거지(')).length);
t('아무것도 없으면 빈 줄이다', !(await home('그냥 메모입니다')).length && !(await fam('그냥 메모입니다')).length);

/* ---------- 상세 화면 ---------- */
const info = await page.evaluate(() => {
  const p = state.rows[0];
  return { k: rKey(p), h: `#/dept/${encodeURIComponent(p.dept_id)}/prof/${encodeURIComponent(p.slug)}`, nm: p.name };
});
/* 상세를 **닫았다 열지 않는다** — 닫을 때 `flushMemo()` 가 화면의 글칸을 읽어 저장하므로,
   방금 넣은 메모가 빈 것으로 덮여 쓰인다. `render()` 만 불러 그 자리에서 다시 그린다. */
const show = async memo => {
  await page.evaluate(([k, m]) => applyEntry(k, { memo: m }), [info.k, memo]);
  await page.evaluate(h => { location.hash = h; render(); }, info.h);
  /* 빈 줄은 **보이지 않는다**(높이 0) — 그래서 「붙어 있는지」만 기다린다 */
  await page.waitForSelector('.d-lifew', { state: 'attached', timeout: 10000 });
  await page.waitForTimeout(120);
};
const rows = () => page.evaluate(() => [...document.querySelectorAll('.d-lifew .d-life__r')]
  .map(r => [r.getAttribute('title'), r.querySelector('span').textContent]));

await show('');
t('메모에 아무것도 없으면 줄을 세우지 않는다',
  await page.evaluate(() => !!document.querySelector('.d-lifew') && !document.querySelector('.d-lifew').innerHTML.trim()));
t('빈 줄은 자리도 차지하지 않는다',
  (await page.evaluate(() => document.querySelector('.d-lifew').getBoundingClientRect().height)) < 1);

await show('오고 출신. 주거지(한일베라체), 가족사항(아들 7세), 가족사항(딸 5세)');
const r = await rows();
t('두 줄이 선다 — 사는 곳, 가족사항', r.length === 2 && r[0][0] === '사는 곳' && r[1][0] === '가족사항', JSON.stringify(r));
t('사는 곳이 그대로 선다', r[0] && r[0][1] === '한일베라체', JSON.stringify(r));
t('가족사항은 가운뎃점으로 잇는다', r[1] && r[1][1] === '아들 7세 · 딸 5세', JSON.stringify(r));
t('사는 곳이 가족사항보다 위다', r[0][0] === '사는 곳');
/* 자리 — **번호 줄 바로 아래**라야 한다 (교수님 지정) */
t('번호 줄 바로 아래에 선다', await page.evaluate(() => {
  const w = document.querySelector('.d-lifew');
  return !!w.previousElementSibling && w.previousElementSibling.classList.contains('d-phones');
}), await page.evaluate(() => (document.querySelector('.d-lifew').previousElementSibling || {}).className));
t('번호 줄보다 아래에 그려진다', await page.evaluate(() => {
  const a = document.querySelector('.d-phones').getBoundingClientRect();
  const z = document.querySelector('.d-lifew .d-life__r').getBoundingClientRect();
  return z.top >= a.top;
}));
t('선호도 칸보다는 위다', await page.evaluate(() => {
  const z = document.querySelector('.d-lifew').getBoundingClientRect().top;
  return z < document.querySelector('.d-section').getBoundingClientRect().top;
}));
t('그림이 앞에 선다', await page.evaluate(() =>
  [...document.querySelectorAll('.d-lifew .d-life__r')].every(x => x.firstElementChild.tagName.toLowerCase() === 'svg')));
t('메모 글은 그대로다 — 읽기만 한다', await page.evaluate(() =>
  document.querySelector('.memo').textContent.includes('주거지(한일베라체)')));

await show('가족사항(아들 7세)');
t('하나만 적혀 있으면 그 줄만 선다',
  JSON.stringify(await rows()) === JSON.stringify([['가족사항', '아들 7세']]));

/* ---------- 메모를 쓰는 동안 그 자리에서 선다 ---------- */
await show('');
await page.evaluate(() => { const m = document.querySelector('.memo'); m.focus();
  m.textContent = '주거지(아라스위첸)'; m.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(150);
t('메모를 쓰는 동안 줄이 그 자리에서 선다',
  JSON.stringify(await rows()) === JSON.stringify([['사는 곳', '아라스위첸']]), JSON.stringify(await rows()));
t('글을 지우면 줄도 걷힌다', await page.evaluate(async () => {
  const m = document.querySelector('.memo');
  m.textContent = '그냥 메모'; m.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  return !document.querySelector('.d-lifew').innerHTML.trim();
}));
t('핵심 메모를 쓸 때는 상세 줄을 건드리지 않는다', await page.evaluate(() => {
  const w = document.querySelector('.d-lifew');
  w.innerHTML = '<i>표</i>';
  lifeRefresh('@keymemo', '주거지(딴곳)');
  const same = w.innerHTML === '<i>표</i>';
  w.innerHTML = '';
  return same;
}));

/* ---------- 좁은 화면 ---------- */
await show('주거지(한일베라체 아파트 101동 1001호), 가족사항(아들 7세), 가족사항(딸 5세)');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
t('390px 에서 넘치지 않는다', await page.evaluate(() => {
  const w = document.querySelector('.d-lifew'), box = w.parentElement.getBoundingClientRect();
  return [...w.querySelectorAll('.d-life__r')].every(x => x.getBoundingClientRect().right <= box.right + 1);
}));
await page.setViewportSize({ width: 1440, height: 1100 });
await page.evaluate(k => applyEntry(k, { memo: '' }), info.k);

let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
