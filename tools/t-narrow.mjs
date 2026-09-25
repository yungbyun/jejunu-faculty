/* 좁은 화면에서 글자가 세로로 서지 않는지.
   한글은 글자마다 줄이 바뀔 수 있어, flex 안의 단추가 한 글자 너비까지 줄어들면
   「문 자 원 고」처럼 세로로 선다. 320·390px 에서 모든 화면을 훑는다.
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const ok = []; const t = (n, v, x = '') => ok.push([n, v, x]);
const VIEWS = ['#/', '#/stats', '#/outreach', '#/manual', '#/letters', '#/dept/comdol'];

for (const w of [320, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
  await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
  await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
  /* 무엇이든 다 나오도록 채워 놓고 본다 */
  await page.evaluate(() => {
    const v = ['확', '긍', '중', '모', '부', '비'];
    state.rows.forEach((p, i) => {
      setRating(rKey(p), v[i % 6]);
      if (i % 5 === 0) pushes().add(rKey(p));
      if (i % 7 === 0) sures().add(rKey(p));
    });
    mobileMap = {}; const m = mobiles(); state.rows.forEach(p => { m[rKey(p)] = '010-1234-5678'; });
  });
  for (const v of VIEWS) {
    await page.evaluate(h => { location.hash = h; render(); }, v);
    await page.waitForTimeout(700);
    const bad = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('button, a.btn, .chip, label, select, summary').forEach(el => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const txt = (el.textContent || '').trim();
        if (txt.length < 2) return;
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 18;
        if (r.height > lh * 2.5 && r.width < 60) {
          out.push(`${el.className || el.tagName} "${txt.slice(0, 14)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      });
      return out;
    });
    t(`${w}px ${v} 글자가 세로로 서지 않음`, bad.length === 0, bad.join(' // '));
  }
  /* 접촉 ① 의 원고 단추는 실제로 이렇게 깨졌던 곳이라 따로 못 박아 둔다 */
  await page.evaluate(() => { location.hash = '#/outreach'; render(); });
  await page.waitForSelector('.ot-load .btn', { timeout: 10000 });
  await page.waitForTimeout(400);
  const btn = await page.evaluate(() => [...document.querySelectorAll('.ot-load .btn')].map(e => {
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), txt: e.textContent.trim() };
  }));
  t(`${w}px 원고 단추가 한 줄`, btn.length === 2 && btn.every(x => x.h < 45),
    btn.map(x => `${x.txt} ${x.w}x${x.h}`).join(' | '));
  t(`${w}px 원고 단추 글이 안 잘림`, btn.every(x => x.w >= 60), btn.map(x => x.w).join(' '));
  await page.evaluate(() => {
    pushSet = new Set(); sureSet = new Set(); mobileMap = {};
    localStorage.removeItem('jnu-push'); localStorage.removeItem('jnu-sure'); localStorage.removeItem('jnu-mobile');
  });
  await ctx.close();
}

let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
await b.close();
process.exit(bad ? 1 : 0);
