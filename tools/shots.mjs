/* 화면 확인용 스크린샷 — 배포 전에 반드시 한 번 돌린다.

   준비(처음 한 번만):  cd tools && npm i && npx playwright install chromium
   사용:                cd tools
                        node shots.mjs                          배포본을 찍는다
                        node shots.mjs http://localhost:8080/ shots local   로컬을 찍는다
                        (인자: <url> <출력폴더> <태그>)

   첫 화면 / 학과(교수 카드) / 분석  x  390px·PC  x  라이트·다크 = 12장을
   tools/shots/ 에 남긴다. 이 폴더와 node_modules 는 .gitignore 로 빠져 있다.

   로그인 게이트는 enterApp(null) 로 건너뛴다. 선호도와 관심 교수는 브라우저 메모리에만
   임시로 채우므로(favSave 를 부르지 않는다) 시트로 나가는 요청이 없다. */
import { chromium } from 'playwright';
import fs from 'fs';

const url    = process.argv[2] || 'https://yungbyun.github.io/jejunu-faculty/';
const outDir = process.argv[3] || 'shots';
const tag    = process.argv[4] || '';

const ROUTES = [
  { name: 'home',  hash: '#/' },
  { name: 'dept',  hash: '#/dept/comdol' },
  { name: 'stats', hash: '#/stats' },
  // 퀴즈는 한 문제 넘기고 힌트를 두 개 연 상태로 찍는다
  // ('이전' 버튼이 살아 있는 모습과 힌트로 열린 글자를 함께 봐야 한다)
  { name: 'quiz',  hash: '#/quiz', after: () => { quizNext(); quiz.hints = 2; renderQuiz(); } },
];
const VIEWPORTS = [{ name: 'mobile', width: 390, height: 844 }, { name: 'pc', width: 1440, height: 900 }];
const THEMES = ['light', 'dark'];

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'ko-KR', colorScheme: theme,
      isMobile: vp.name === 'mobile', hasTouch: vp.name === 'mobile',
    });
    const page = await ctx.newPage();
    await page.addInitScript(t => { try { localStorage.setItem('jnu-theme', t); } catch {} }, theme);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
    await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
    await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });

    // 선호도·관심 교수를 화면에만 채운다 (favSave 를 부르지 않으므로 서버로 나가지 않는다)
    await page.evaluate(() => {
      const vals = ['확', '중', '모', '부', '비'];
      state.rows.forEach((p, i) => { if (i % 7 !== 6) state.ratings.set(rKey(p), vals[i % 5]); });
      favSet = new Set(state.rows.filter((_, i) => i % 23 === 1).map(rKey));
    });

    for (const r of ROUTES) {
      await page.evaluate(h => { location.hash = h; render(); }, r.hash);
      await page.waitForTimeout(800);
      if (r.after) { await page.evaluate(`(${r.after.toString()})()`); await page.waitForTimeout(400); }
      await page.waitForTimeout(600);
      const f = `${outDir}/${tag ? tag + '-' : ''}${r.name}-${vp.name}-${theme}.png`;
      await page.screenshot({ path: f, fullPage: true });
      console.log('저장:', f);
    }
    await ctx.close();
  }
}
await browser.close();
