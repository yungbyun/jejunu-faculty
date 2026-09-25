/* 학과 차례 바꾸기 — 손잡이를 끌어 바꾸고, 그 차례가 다른 화면과 다른 기기까지 따라가는지.
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
const ok = []; const t = (n, v, x = '') => ok.push([n, v, x]);

const reset = () => page.evaluate(() => {
  dorderList = []; localStorage.removeItem('jnu-deptorder');
  apply(state.rawRows, state.source);
  location.hash = '#/'; render();
});
await reset();
await page.waitForSelector('[data-grip]', { timeout: 10000 });

t('학과마다 손잡이가 있다', await page.evaluate(() =>
  document.querySelectorAll('[data-grip]').length === state.depts.length));
t('손잡이는 링크 안에 있지 않다', await page.evaluate(() =>
  ![...document.querySelectorAll('[data-grip]')].some(g => g.closest('a'))));
t('처음엔 원래대로 단추가 없다', await page.locator('#dordReset').count() === 0);
t('안내 문구는 두지 않는다', await page.locator('.dept-head').count() === 0);

// 끌어서 옮기기 — 붙박이 머리띠에 가리지 않는 줄을 고른다
const before = await page.evaluate(() => state.depts.map(d => d.id));
const gi = await page.evaluate(() => [...document.querySelectorAll('[data-grip]')].findIndex(g => {
  const r = g.getBoundingClientRect();
  const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return el && el.closest('[data-grip]') === g;
}));
const g = await page.locator('[data-grip]').nth(gi).boundingBox();
const to = await page.locator('.drow-w').nth(gi + 3).boundingBox();
await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
await page.mouse.down();
await page.mouse.move(g.x + g.width / 2, to.y + to.height * 0.8, { steps: 25 });
await page.waitForTimeout(150);
await page.mouse.up();
await page.waitForTimeout(600);
const after = await page.evaluate(() => state.depts.map(d => d.id));

t('차례가 바뀐다', JSON.stringify(before) !== JSON.stringify(after), `${before.slice(0, 5)} → ${after.slice(0, 5)}`);
t('끈 학과가 세 칸 뒤로', after.indexOf(before[gi]) === gi + 3, `${gi} → ${after.indexOf(before[gi])}`);
t('학과가 사라지거나 늘지 않는다', before.length === after.length && before.every(id => after.includes(id)));
/* DOM 만 바뀌고 state 가 그대로면, 다시 그릴 때 원래대로 돌아가 버린다 */
t('화면과 state 가 같은 차례', await page.evaluate(() =>
  JSON.stringify([...document.querySelectorAll('.drow-w')].map(e => e.dataset.did)) === JSON.stringify(state.depts.map(d => d.id))));
t('이 기기에 저장된다', await page.evaluate(() =>
  JSON.stringify(JSON.parse(localStorage.getItem('jnu-deptorder') || '[]')) === JSON.stringify(state.depts.map(d => d.id))));
t('차례를 정렬해서 저장하지 않는다', await page.evaluate(() =>
  JSON.stringify(settingValue('deptorder')) === JSON.stringify(dorder())));

// 다시 그려도, 자료를 다시 읽어도 그대로
await page.evaluate(() => render());
await page.waitForTimeout(400);
t('다시 그려도 그대로', await page.evaluate(() =>
  JSON.stringify([...document.querySelectorAll('.drow-w')].map(e => e.dataset.did))) === JSON.stringify(after));
await page.evaluate(() => apply(state.rawRows, state.source));
await page.waitForTimeout(400);
t('시트를 다시 읽어도 그대로', await page.evaluate(() => state.depts.map(d => d.id)).then(x => JSON.stringify(x)) === JSON.stringify(after));

// 다른 화면도 같은 차례
await page.evaluate(() => { location.hash = '#/stats'; render(); });
await page.waitForSelector('.st-row', { timeout: 10000 });
t('분석 화면도 같은 차례', await page.evaluate(() => {
  const names = [...document.querySelectorAll('.st-row__lbl a')].map(a => a.textContent);
  return JSON.stringify(names) === JSON.stringify(state.depts.map(d => d.name));
}));
await page.evaluate(() => { location.hash = '#/outreach'; render(); });
await page.waitForSelector('[data-dept]', { timeout: 10000 });
t('접촉 학과 칩도 같은 차례', await page.evaluate(() =>
  JSON.stringify([...document.querySelectorAll('[data-dept]')].map(e => e.dataset.dept)) === JSON.stringify(state.depts.map(d => d.id))));

// 키보드로도 옮긴다
await page.evaluate(() => { location.hash = '#/'; render(); });
await page.waitForSelector('[data-grip]', { timeout: 10000 });
const kb = await page.evaluate(async () => {
  const first = state.depts[0].id, second = state.depts[1].id;
  const g = document.querySelector(`[data-grip="${CSS.escape(second)}"]`);
  g.focus();
  g.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  return { now: state.depts.map(d => d.id).slice(0, 2), want: [second, first] };
});
t('위 화살표로 한 칸 올라간다', JSON.stringify(kb.now) === JSON.stringify(kb.want), `${kb.now} / ${kb.want}`);

// 되돌리기
t('바꾼 뒤에는 원래대로 단추가 보인다', await page.locator('#dordReset').count() === 1);
await page.evaluate(() => { window.confirm = () => true; });
await page.click('#dordReset');
await page.waitForTimeout(700);
t('원래 차례로 돌아온다', await page.evaluate(() => state.depts.map(d => d.id)).then(x => JSON.stringify(x)) === JSON.stringify(before),
  (await page.evaluate(() => state.depts.map(d => d.id))).slice(0, 4).join(' '));
t('저장한 것도 지워진다', await page.evaluate(() => !localStorage.getItem('jnu-deptorder') && dorder().length === 0));
t('단추도 사라진다', await page.locator('#dordReset').count() === 0);

// 시트에서 내려온 차례도 반영된다
t('시트 값으로도 세운다', await page.evaluate(() => {
  const ids = state.depts.map(d => d.id);
  const want = [ids[2], ids[0], ...ids.filter((_, i) => i !== 0 && i !== 2)];
  settingApplyLocal('deptorder', want);
  return JSON.stringify(state.depts.map(d => d.id)) === JSON.stringify(want);
}));
t('모르는 학과가 섞여 있어도 버틴다', await page.evaluate(() => {
  const ids = state.depts.map(d => d.id);
  settingApplyLocal('deptorder', ['없는학과', ids[1]]);
  const now = state.depts.map(d => d.id);
  return now.length === ids.length && now[0] === ids[1] && ids.every(id => now.includes(id));
}));

await page.evaluate(() => { dorderList = []; localStorage.removeItem('jnu-deptorder'); });
let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
