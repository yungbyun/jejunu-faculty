/* 좁은 화면에서 글자가 세로로 서지 않는지.
   한글은 글자마다 줄이 바뀔 수 있어, flex 안의 단추가 한 글자 너비까지 줄어들면
   「문 자 원 고」처럼 세로로 선다. 320·390px 에서 모든 화면을 훑는다.
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const ok = []; const t = (n, v, x = '') => ok.push([n, v, x]);
const VIEWS = ['#/', '#/stats', '#/outreach', '#/manual', '#/cal', '#/letters', '#/dept/comdol'];

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
    simpleOn = false; localStorage.removeItem('jnu-simple');
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
  /* 폰에서 달력 한 판이 한눈에 들어와야 한다 — 머리줄이 두 줄로 접히면 아랫단이 밀려난다 (2026-10-13) */
  await page.evaluate(() => { meetMap = {}; CAL.open = ''; location.hash = '#/cal'; render(); });
  await page.waitForSelector('.cal-grid', { timeout: 10000 });
  await page.waitForTimeout(400);
  const cal = await page.evaluate(() => {
    const line = sel => {
      const es = [...document.querySelectorAll(sel)];
      if (!es.length) return 99;
      const r = es.map(e => e.getBoundingClientRect());
      return Math.max(...r.map(x => x.bottom)) - Math.min(...r.map(x => x.top));
    };
    const top = document.querySelector('.crumbs').getBoundingClientRect().top;
    const bot = document.querySelector('.cal-new').getBoundingClientRect().bottom;
    return { head: Math.round(line('.cal-head:not(.cal-head--day) > *')), neu: Math.round(line('.cal-new__b')),
      tall: Math.round(bot - top), wide: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  t(`${w}px 달 머리줄이 한 줄`, cal.head <= 46, `${cal.head}px`);
  t(`${w}px 새 약속 단추가 한 줄`, cal.neu <= 46, `${cal.neu}px`);
  t(`${w}px 달력 한 판이 한 화면에`, cal.tall <= 520, `길잡이부터 새 약속까지 ${cal.tall}px`);
  t(`${w}px 가로로 넘치지 않음`, !cal.wide);
  /* 좁은 폰에서 **토요일 칸이 상자 밖으로 밀려났다** — 일곱 칸이 다 안에 들어와야 한다 (2026-10-17) */
  const dow = await page.evaluate(() => {
    const g = document.querySelector('.cal-grid').getBoundingClientRect();
    const es = [...document.querySelectorAll('.cal-dow')].map(e => e.getBoundingClientRect());
    const cs = [...document.querySelectorAll('.cal-c')].map(e => e.getBoundingClientRect());
    return { n: es.length, out: es.filter(r => r.right > g.right + 1 || r.left < g.left - 1).length,
      cout: cs.filter(r => r.right > g.right + 1).length,
      sat: es.length === 7 ? Math.round(es[6].right) : 0, right: Math.round(g.right) };
  });
  t(`${w}px 요일이 일곱이고 다 상자 안에`, dow.n === 7 && dow.out === 0,
    `토 ${dow.sat} / 상자 ${dow.right}`);
  t(`${w}px 날짜 칸도 안 밀려난다`, dow.cout === 0, `${dow.cout}칸 밖`);

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
