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
    return { head: Math.round(line('.cal-head:not(.cal-head--day):not(.cal-head--ate) > *')), neu: Math.round(line('.cal-new__b')),
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

  /* 「이제까지 만난 분」의 갈래 고르기 단추 넷(모두·점심·저녁·Tea)은 폰에서도 **한 줄**이어야
     한다 (2026-11-02, 교수님 지정). 횟수가 두 자리로 올라도 접히지 않는지 함께 본다 —
     한 자리로만 재면 320px 에서 두 자리가 되는 날 조용히 두 줄이 된다. */
  const ate = await page.evaluate(() => {
    meetMap = {}; localStorage.removeItem('jnu-meets');
    const d0 = new Date(mtToday() + 'T00:00:00');
    const day = k => { const x = new Date(d0); x.setDate(x.getDate() + k);
      return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`; };
    const who = i => rKey(state.rows[i % state.rows.length]);
    const mk = (dd, key, kind) => { const id = mtAdd(dd, key, kind); meets()[id].done = 'met'; };
    for (let i = 0; i < 13; i++) mk(day(-60 + i), who(i), 'lunch');
    for (let i = 0; i < 13; i++) mk(day(-40 + i), who(i + 20), 'dinner');
    for (let i = 0; i < 13; i++) mk(day(-9), who(i + 40), 'other');
    CAL.ate = ''; location.hash = '#/cal'; render();
    const box = document.querySelector('.mt-fs');
    const bs = [...box.querySelectorAll('.mt-f')];
    const br = box.getBoundingClientRect();
    return { n: bs.length,
      lines: new Set(bs.map(e => Math.round(e.getBoundingClientRect().top))).size,
      /* 갈래 다섯(모두·식사·점심·저녁·Tea)만 따로 — 「아직」은 뒤에 혼자 내려와도 된다 */
      l5: new Set(bs.slice(0, 5).map(e => Math.round(e.getBoundingClientRect().top))).size,
      slack: Math.round(br.right - Math.max(...bs.map(e => e.getBoundingClientRect().right))),
      labels: bs.map(e => e.textContent.trim().replace(/\s+/g, '')),
      /* 단추 높이 — 2026-11-13 저녁에 조금 높였다 (교수님 지정). 폰에서 누르기 쉽게. */
      h: Math.round(Math.min(...bs.map(e => e.getBoundingClientRect().height))),
      /* 칩 안의 숫자 — 2026-11-13 부터 **폰에서도** 보인다 (교수님 지정) */
      nums: bs.map(e => [...e.querySelectorAll(':scope>i')].filter(x => !x.classList.contains('mt-i'))
        .map(x => getComputedStyle(x).display === 'none' ? '' : x.textContent.trim()).join('')),
      wide: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  /* 2026-11-02 저녁에 「식사」(점심+저녁)가 더해져 다섯이 되었고, 2026-11-13 에 「아직」
     (아직 뵙지 못한 분)이, 같은 날 저녁에 「식사 외」(점심·저녁을 함께 안 하신 분)가 끝에
     붙어 **일곱**이 되었다 (교수님 지정). 사람을 세우는 단추 둘이 뒤로 내려와도 두 줄까지다. */
  t(`${w}px 만난 분 고르기 단추가 일곱`, ate.n === 7, ate.labels.join(' '));
  /* **폰에서도 숫자를 보여 준다** (2026-11-13, 교수님 지정). 전에는 ≤340px 에서 숫자를
     통째로 접어 한 줄을 지켰는데, 머리줄의 풀이를 걷은 뒤로는 **숫자가 그 자리를 대신하므로**
     폰에서 숨기면 몇 번·몇 명인지 볼 데가 없어진다. */
  t(`${w}px 칩 안에 숫자가 보인다`, ate.nums.every(Boolean), ate.nums.join('|'));
  /* 위아래 여백만 늘려 **조금 높게** (2026-11-13 저녁, 교수님 지정) — 옆 여백을 건드리면
     한 줄에 서는 수가 줄어 또 접힌다. 30px 이면 폰에서 누르기 어렵지 않다. */
  t(`${w}px 칩이 누르기 좋게 높다`, ate.h >= 30, `${ate.h}px`);
  /* 갈래 다섯은 390px 에서 한 줄에 선다. 320px 은 숫자까지 세우면 자리가 모자라 한 번 더
     접힌다 — 숫자를 숨기는 쪽보다 접히는 쪽이 낫다. 「아직」은 갈래가 아니라 **반대쪽을 보는
     단추**라 뒤로 혼자 내려와도 된다 (이 칸은 달력 아래라 밀려날 것이 없다). */
  t(`${w}px 갈래 다섯이 ${w <= 340 ? '두 줄 안에' : '한 줄에'}`, w <= 340 ? ate.l5 <= 2 : ate.l5 === 1,
    `${ate.lines}줄 · ${ate.labels.join(' ')}`);
  t(`${w}px 접혀도 두 줄까지`, ate.lines <= 2, `${ate.lines}줄 · ${ate.labels.join(' ')}`);
  t(`${w}px 두 자리 횟수에도 자리가 남는다`, ate.slack >= 0, `${ate.slack}px 남음`);
  t(`${w}px 만난 분 칸이 가로로 안 넘침`, !ate.wide);

  /* 달력 칸의 표시는 점이 아니라 **그림**입니다 (2026-11-05, 교수님 지정) — 점심은 해,
     저녁은 달, Tea 는 찻잔. 점(5px)보다 크므로 셋에 「+N」까지 칸 안에 들어가는지 잽니다. */
  const calx = await page.evaluate(() => {
    /* 달력은 **이 달**을 보여 준다 — 위에서 넣은 자리는 지난달치라 칸에 아무것도 안 뜬다.
       그래서 오늘 자리로 넷(해·달·찻잔·시계)을 깔고 잰다. 「+N」까지 보려고 넷을 넣는다. */
    const d0 = mtToday();
    ['lunch', 'dinner', 'other', ''].forEach((k, i) => { mtAdd(d0, rKey(state.rows[i]), k); });
    CAL.ym = ''; CAL.day = d0; location.hash = '#/cal'; render();
    const cs = [...document.querySelectorAll('.cal-c')].filter(c => c.querySelector('.cal-c__d'));
    return cs.map(c => {
      const d = c.querySelector('.cal-c__d').getBoundingClientRect(), b2 = c.getBoundingClientRect();
      return { fits: d.left >= b2.left - .5 && d.right <= b2.right + .5,
        svg: !!c.querySelector('.cal-c__d i svg'), tall: c.scrollHeight <= Math.ceil(b2.height) + 1,
        w: Math.round(d.width), cw: Math.round(b2.width) };
    });
  });
  t(`${w}px 달력 칸에 해·달·찻잔이 그려진다`, calx.length > 0 && calx.every(x => x.svg), `${calx.length}칸`);
  t(`${w}px 그림이 칸을 넘지 않는다`, calx.every(x => x.fits && x.tall),
    calx.filter(x => !x.fits || !x.tall).map(x => `${x.w}/${x.cw}`).join(' ') || '모두 들어감');

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
