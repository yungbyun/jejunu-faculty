/* .rs--* 칩 글자 대비 측정.
   사용: node contrast.mjs [url]
   색 문자열을 직접 파싱하지 않고 캔버스에 본문 배경 위로 칠해 실제 픽셀을 읽는다
   (color-mix 는 브라우저가 color(srgb 0~1) 로 돌려줘 숫자만 긁으면 255배 틀린다). */
import { chromium } from 'playwright';
const url = process.argv[2] || 'https://yungbyun.github.io/jejunu-faculty/';
const browser = await chromium.launch();

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  const page = await ctx.newPage();
  await page.addInitScript(t => { try { localStorage.setItem('jnu-theme', t); } catch {} }, theme);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
  await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
  await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
  await page.evaluate(() => {
    const vals = ['확', '긍', '중', '모', '부', '비'];
    state.rows.forEach((p, i) => state.ratings.set(rKey(p), vals[i % vals.length]));
    render();
  });
  await page.waitForTimeout(700);

  const r = await page.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 8;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const paint = (over, base) => {                 // base 위에 over 를 칠하고 픽셀을 읽는다
      g.clearRect(0, 0, 8, 8);
      g.fillStyle = base; g.fillRect(0, 0, 8, 8);
      g.fillStyle = over; g.fillRect(0, 0, 8, 8);
      const d = g.getImageData(4, 4, 1, 1).data; return [d[0], d[1], d[2]];
    };
    const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const cr = (a, b) => { const x = L(a), y = L(b); return +(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05))).toFixed(2); };

    const pageBg = getComputedStyle(document.body).backgroundColor;
    const out = [];
    for (const cls of ['rs--high', 'rs--pos', 'rs--mid', 'rs--low', 'rs--neg', 'rs--na']) {
      const el = document.querySelector('.' + cls);
      if (!el) { out.push({ cls, note: '화면에 없음' }); continue; }
      const cs = getComputedStyle(el);
      const chipBg = paint(cs.backgroundColor, pageBg);           // 칩 배경을 본문 배경 위에
      const txt = paint(cs.color, `rgb(${chipBg.join(',')})`);    // 글자를 칩 배경 위에
      out.push({ cls, ratio: cr(txt, chipBg), txt: `rgb(${txt})`, bg: `rgb(${chipBg})` });
    }
    return { pageBg, out };
  });

  console.log(`\n[${theme}] 본문 배경 ${r.pageBg}`);
  for (const x of r.out) {
    if (x.note) { console.log(`  ${x.cls}: ${x.note}`); continue; }
    console.log(`  ${x.ratio >= 4.5 ? 'OK ' : '미달'} ${x.cls.padEnd(8)} 대비 ${String(x.ratio).padStart(5)} : 1   글자 ${x.txt} / 칩 ${x.bg}`);
  }
  await ctx.close();
}
await browser.close();
