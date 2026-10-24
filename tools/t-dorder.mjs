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

/* ---------- 끌 때 미끄러지듯 움직인다 (2026-10-24) ----------
 * 전에는 손이 움직일 때마다 DOM 을 옮겨 줄이 툭툭 튀었다. 지금은 DOM 을 건드리지 않고,
 * 끌리는 줄은 손가락을 따라오고 비켜 줄 줄들만 미끄러진다. */
await page.evaluate(() => { dorderList = []; localStorage.removeItem('jnu-deptorder'); location.hash = '#/'; render(); });
await page.waitForSelector('[data-grip]', { timeout: 10000 });
{
  const ids = () => page.evaluate(() => [...document.querySelectorAll('.drow-w')].map(e => e.dataset.did).join());
  const before = await ids();
  const g = await page.locator('[data-grip]').first().boundingBox();
  const t3 = await page.locator('.drow-w').nth(3).boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, t3.y + t3.height * 0.6, { steps: 10 });
  await page.waitForTimeout(140);
  const mid = await page.evaluate(() => {
    const d = document.querySelector('.drow-w--drag');
    const o = [...document.querySelectorAll('.drow-w')].find(e => e !== d && e.style.transform);
    const cs = e => getComputedStyle(e);
    return { order: [...document.querySelectorAll('.drow-w')].map(e => e.dataset.did).join(),
             dragT: d ? d.style.transform : '', dragDur: d ? cs(d).transitionDuration : '',
             otherT: o ? o.style.transform : '', otherDur: o ? cs(o).transitionDuration : '',
             lifted: d ? cs(d).zIndex : '' };
  });
  t('끄는 동안 DOM 차례는 그대로', mid.order === before, mid.order === before ? '그대로' : '바뀜');
  t('끌리는 줄이 손가락을 따라온다', /translateY\(/.test(mid.dragT), mid.dragT);
  t('끌리는 줄에는 전환을 걸지 않는다', parseFloat(mid.dragDur) === 0, mid.dragDur);
  t('끌리는 줄을 들어 올린다', Number(mid.lifted) >= 2, mid.lifted);
  t('비켜 주는 줄이 위로 밀린다', /translateY\(/.test(mid.otherT), mid.otherT);
  t('비켜 주는 줄은 미끄러진다', parseFloat(mid.otherDur) > 0, mid.otherDur);
  await page.mouse.up();
  await page.waitForTimeout(420);
  const now = (await ids()).split(',');
  t('손을 떼면 그 자리로 간다', now[3] === before.split(',')[0], now.indexOf(before.split(',')[0]) + '번째');
  t('떼고 나면 임시로 민 자리는 걷힌다', await page.evaluate(() =>
    [...document.querySelectorAll('.drow-w')].every(e => !e.style.transform && !e.style.transition)));
  t('끌기 표시도 걷힌다', await page.evaluate(() =>
    !document.querySelector('.drow-w--drag') && !document.querySelector('.dept-list--drag')));
  t('보이는 차례와 담긴 차례가 같다', await page.evaluate(() =>
    [...document.querySelectorAll('.drow-w')].map(e => e.dataset.did).join() === dorder().join()),
    await page.evaluate(() => dorder().slice(0, 4).join()));
  t('아무 학과도 잃지 않는다', now.length === before.split(',').length && new Set(now).size === now.length,
    `${now.length}개`);
}
/* 화살표로 옮길 때도 미끄러진다(FLIP) — 그쪽은 다시 그리므로 data-did 로 이어 준다 */
await page.locator('[data-grip]').first().focus();
t('화살표로 옮기면 그림이 돈다', await page.evaluate(async () => {
  document.querySelector('[data-grip]').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  const n = [...document.querySelectorAll('.drow-w')]
    .reduce((s2, e) => s2 + (e.getAnimations ? e.getAnimations().length : 0), 0);
  await new Promise(r => setTimeout(r, 250));
  return n > 0;
}));
t('그 뒤에도 차례가 맞다', await page.evaluate(() =>
  [...document.querySelectorAll('.drow-w')].map(e => e.dataset.did).join() === dorder().join()));

/* ---------- 폰에서 끌면 화면이 저절로 구른다 (2026-10-24) ----------
 * 화면이 좁으면 맨 아래 학과를 맨 위로 올릴 때 손가락이 화면 밖으로 나갈 수 없다.
 * 손잡이에 `touch-action:none` 을 주어 브라우저가 대신 굴려 주지 않으므로 우리가 굴린다.
 * 함정: `scrollBy({behavior:'auto'})` 는 CSS 의 `scroll-behavior:smooth` 를 따라가 버려
 * `scrollY` 가 바로 안 바뀐다 — 그래서 `'instant'` 로 못 박고 CSS 도 잠깐 꺼 둔다. */
{
  const ph = await (await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })).newPage();
  const perr = []; ph.on('pageerror', e => perr.push(String(e)));
  await ph.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
  await ph.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
  await ph.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
  await ph.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
  await ph.evaluate(() => { dorderList = []; localStorage.removeItem('jnu-deptorder'); location.hash = '#/'; render(); });
  await ph.waitForSelector('[data-grip]', { timeout: 10000 });
  const ids = () => ph.evaluate(() => [...document.querySelectorAll('.drow-w')].map(e => e.dataset.did).join());
  const before = (await ids()).split(',');
  const tail = before[before.length - 1];

  /* 맨 아래 학과까지 내려가 손잡이를 잡고, 화면 위 가장자리에 머문다 */
  await ph.evaluate(() => { [...document.querySelectorAll('.drow-w')].pop().scrollIntoView({ block: 'center', behavior: 'instant' }); });
  await ph.waitForTimeout(300);
  const y0 = await ph.evaluate(() => Math.round(window.scrollY));
  t('폰에서 목록이 한 화면을 넘는다', y0 > 200, `${y0}px 내려와 있다`);
  const g2 = await ph.locator('[data-grip]').last().boundingBox();
  await ph.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2);
  await ph.mouse.down();
  await ph.mouse.move(g2.x + g2.width / 2, 24, { steps: 6 });
  const y1 = await ph.evaluate(() => Math.round(window.scrollY));
  await ph.waitForTimeout(400);
  const y2 = await ph.evaluate(() => Math.round(window.scrollY));
  t('가장자리에 머물면 저절로 올라간다', y2 < y1 - 50, `${y1} → ${y2}`);
  t('구르는 동안에도 줄이 손가락을 따라온다', await ph.evaluate(() => {
    const d = document.querySelector('.drow-w--drag');
    const r = d.getBoundingClientRect();
    return r.top < 120;       // 손가락(24) 가까이 붙어 있다
  }), await ph.evaluate(() => `줄 화면 y ${Math.round(document.querySelector('.drow-w--drag').getBoundingClientRect().top)}`));
  for (let i = 0; i < 40; i++) { await ph.waitForTimeout(100); if (await ph.evaluate(() => window.scrollY) === 0) break; }
  t('맨 위까지 굴러간다', await ph.evaluate(() => Math.round(window.scrollY)) === 0,
    String(await ph.evaluate(() => Math.round(window.scrollY))));
  await ph.mouse.up();
  await ph.waitForTimeout(450);
  const after = (await ids()).split(',');
  t('맨 아래 학과를 맨 위로 올릴 수 있다', after[0] === tail, `${tail} → ${after.indexOf(tail)}번째`);
  t('아무 학과도 잃지 않는다', after.length === before.length && new Set(after).size === after.length);
  t('저절로 구른 뒤에도 차례가 맞다', await ph.evaluate(() =>
    [...document.querySelectorAll('.drow-w')].map(e => e.dataset.did).join() === dorder().join()));
  t('부드럽게 구르기 설정을 되돌린다', await ph.evaluate(() => document.documentElement.style.scrollBehavior === ''),
    await ph.evaluate(() => `"${document.documentElement.style.scrollBehavior}"`));

  /* 아래쪽 가장자리로도 굴러야 한다 */
  await ph.evaluate(() => { dorderList = []; localStorage.removeItem('jnu-deptorder'); render(); window.scrollTo(0, 0); });
  await ph.waitForTimeout(250);
  const head = (await ids()).split(',')[0];
  const g3 = await ph.locator('[data-grip]').first().boundingBox();
  await ph.mouse.move(g3.x + g3.width / 2, g3.y + g3.height / 2);
  await ph.mouse.down();
  await ph.mouse.move(g3.x + g3.width / 2, 756, { steps: 6 });
  for (let i = 0; i < 50; i++) {
    await ph.waitForTimeout(100);
    if (await ph.evaluate(() => Math.round(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2)) break;
  }
  t('아래 가장자리로도 굴러간다', await ph.evaluate(() => window.scrollY) > 500,
    String(await ph.evaluate(() => Math.round(window.scrollY))));
  await ph.mouse.up();
  await ph.waitForTimeout(450);
  const down = (await ids()).split(',');
  t('맨 위 학과를 맨 아래로 내릴 수 있다', down[down.length - 1] === head, `${head} → ${down.indexOf(head)}번째`);
  t('폰에서도 콘솔 오류 없음', perr.length === 0, perr.join(' | '));
  await ph.close();
}

await page.evaluate(() => { dorderList = []; localStorage.removeItem('jnu-deptorder'); });
let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
