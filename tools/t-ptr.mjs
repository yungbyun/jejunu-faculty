/* 당겨서 새로고침 — 아이폰 홈 화면(주소창 없음)에서 쓰는 손수 만든 것.
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
const ok = []; const t = (n, v, x = '') => ok.push([n, v, x]);

/* 진짜로 새로고침이 일어나면 그 뒤 검사를 못 하므로, 새로 받는 일만 가로챈다.
   ptrGo 까지는 그대로 돌리고 hardReload 만 바꿔치기한다. */
await page.evaluate(() => {
  window.__reloads = 0;
  window.hardReload = () => { window.__reloads++; ptr.busy = false; };
});

/* 손가락 흉내 — 터치 이벤트를 직접 만들어 보낸다 */
async function pull(dy, { steps = 6, x = 195, startAt = 300, release = true } = {}) {
  return page.evaluate(async a => {
    const mk = (type, y) => {
      const el = document.elementFromPoint(a.x, Math.max(1, Math.min(innerHeight - 1, y))) || document.body;
      const tt = [new Touch({ identifier: 1, target: el, clientX: a.x, clientY: y })];
      const ev = new TouchEvent(type, { touches: type === 'touchend' ? [] : tt, targetTouches: type === 'touchend' ? [] : tt,
        changedTouches: tt, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev;
    };
    mk('touchstart', a.startAt);
    let last = null;
    for (let i = 1; i <= a.steps; i++) last = mk('touchmove', a.startAt + a.dy * i / a.steps);
    const prevented = last ? last.defaultPrevented : false;
    const seen = { d: ptr.d, on: ptr.on, cls: document.querySelector('.ptr').className };
    if (a.release) { mk('touchend', a.startAt + a.dy); await new Promise(r => setTimeout(r, 60)); }
    return { prevented, seen, reloads: window.__reloads, cls: document.querySelector('.ptr').className,
      y: getComputedStyle(document.querySelector('.ptr')).transform };
  }, { dy, steps, x, startAt, release });
}

t('표식이 꽂혀 있다', await page.locator('.ptr').count() === 1);
t('처음엔 안 보인다', await page.evaluate(() => getComputedStyle(document.querySelector('.ptr')).opacity) === '0',
  await page.evaluate(() => getComputedStyle(document.querySelector('.ptr')).opacity));

// 1) 조금만 당기면 아무 일도 없다
let r = await pull(60);
t('조금 당기면 안 새로고침', r.reloads === 0, '당긴 길이 ' + r.seen.d.toFixed(0));
t('조금 당겨도 표식은 나온다', r.seen.d > 0);
t('그때는 아직 「놓으세요」가 아니다', !r.seen.cls.includes('ptr--ready'), r.seen.cls);

// 2) 충분히 당기면 새로고침
r = await pull(200);
t('충분히 당기면 새로고침', r.reloads === 1, String(r.reloads));
t('놓기 전에 「놓으세요」', r.seen.cls.includes('ptr--ready'), r.seen.cls);
t('사파리 고무줄을 막는다', r.prevented === true);

// 3) 위로 올리는 손짓은 건드리지 않는다
await page.evaluate(() => { window.__reloads = 0; });
r = await pull(-150, { startAt: 500 });
t('위로 올리면 가만히 있는다', r.reloads === 0);
t('위로 올릴 땐 막지 않는다', r.prevented === false);

// 4) 가로로 밀면 쉰다
await page.evaluate(() => { window.__reloads = 0; });
const side = await page.evaluate(async () => {
  const mk = (type, x, y) => {
    const el = document.elementFromPoint(Math.max(1, x), Math.max(1, y)) || document.body;
    const tt = [new Touch({ identifier: 2, target: el, clientX: x, clientY: y })];
    const ev = new TouchEvent(type, { touches: type === 'touchend' ? [] : tt, targetTouches: type === 'touchend' ? [] : tt,
      changedTouches: tt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev); return ev;
  };
  mk('touchstart', 190, 300);
  let last; for (let i = 1; i <= 6; i++) last = mk('touchmove', 190 + i * 25, 300 + i * 4);
  mk('touchend', 340, 324);
  await new Promise(r => setTimeout(r, 60));
  return { prevented: last.defaultPrevented, reloads: window.__reloads };
});
t('옆으로 밀면 쉰다', side.reloads === 0 && side.prevented === false, JSON.stringify(side));

// 5) 화면 가운데(맨 위가 아닐 때)에서는 쉰다
await page.evaluate(() => { window.__reloads = 0; window.scrollTo(0, 400); });
await page.waitForFunction(() => window.scrollY > 100, null, { timeout: 5000 }).catch(() => {});
const mid = await page.evaluate(() => window.scrollY);
r = await pull(200);
t('맨 위가 아니면 쉰다', mid < 100 || r.reloads === 0, '스크롤 ' + mid);
await page.evaluate(() => window.scrollTo(0, 0));

// 6) 상세가 열려 있으면 쉰다
await page.evaluate(() => { window.__reloads = 0; const p = state.rows[0]; location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render(); });
await page.waitForFunction(() => !document.getElementById('drawer').hidden, null, { timeout: 10000 });
r = await pull(200);
t('상세가 열려 있으면 쉰다', r.reloads === 0, String(r.reloads));
await page.evaluate(() => { closeDrawer(); window.scrollTo(0, 0); });

// 7) 미저장이 있으면 먼저 올려 보낸다
await page.evaluate(() => {
  window.__reloads = 0; window.__synced = 0;
  window.syncRatings = async () => { window.__synced++; };
  sync.dirty.set('x', { rating: '확' });
});
r = await pull(200);
t('미저장이 있으면 먼저 저장', await page.evaluate(() => window.__synced) === 1 && r.reloads === 1,
  await page.evaluate(() => `저장 ${window.__synced}회 · 새로고침 ${window.__reloads}회`));
await page.evaluate(() => sync.dirty.clear());

// 7-2) 학과 차례 손잡이에서 시작하면 쉰다 — 맨 윗줄을 끌어 내리다 새로고침되면 큰일
await page.evaluate(() => { window.__reloads = 0; location.hash = '#/'; render(); window.scrollTo(0, 0); });
await page.waitForSelector('[data-grip]', { timeout: 10000 });
const grip = await page.evaluate(async () => {
  const g = document.querySelector('[data-grip]');
  g.scrollIntoView({ block: 'center' }); window.scrollTo(0, 0);
  const r = g.getBoundingClientRect(), x = r.left + r.width / 2, y0 = r.top + r.height / 2;
  const mk = (type, y) => {
    const tt = [new Touch({ identifier: 3, target: g, clientX: x, clientY: y })];
    const ev = new TouchEvent(type, { touches: type === 'touchend' ? [] : tt, targetTouches: type === 'touchend' ? [] : tt,
      changedTouches: tt, bubbles: true, cancelable: true });
    g.dispatchEvent(ev); return ev;
  };
  mk('touchstart', y0);
  let last; for (let i = 1; i <= 6; i++) last = mk('touchmove', y0 + i * 40);
  mk('touchend', y0 + 240);
  await new Promise(r => setTimeout(r, 60));
  return { prevented: last.defaultPrevented, reloads: window.__reloads, live: ptr.live };
});
t('손잡이에서 끌면 쉰다', grip.reloads === 0 && grip.prevented === false, JSON.stringify(grip));

// 8) 손가락이 없는 기기(PC)에서는 아예 안 만든다
const pc = await b.newContext({ viewport: { width: 1280, height: 800 } });
const pg2 = await pc.newPage();
await pg2.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await pg2.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
t('PC 에는 표식을 안 만든다', await pg2.locator('.ptr').count() === 0);

let bad = 0; for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close(); process.exit(bad ? 1 : 0);
