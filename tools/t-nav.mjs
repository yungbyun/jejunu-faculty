/* 폰에서는 위 메뉴에 원고가 없고, 접촉 화면 회차 줄에서 열 수 있어야 한다.
   PC 에서는 그 반대. 로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const ok=[]; const t=(n,v,x='')=>ok.push([n,v,x]);
for (const [w,h,tag] of [[1440,1000,'PC'],[390,844,'폰']]) {
  const page = await (await b.newContext({viewport:{width:w,height:h}})).newPage();
  page.on('pageerror',e=>console.log('pageerror',String(e)));
  await page.goto('http://127.0.0.1:8080/',{waitUntil:'load'});
  await page.waitForFunction(()=>typeof enterApp==='function',null,{timeout:20000});
  await page.evaluate(()=>{ if(!document.body.classList.contains('authed')) enterApp(null); });
  await page.waitForFunction(()=>typeof state!=='undefined'&&state.rows.length>0,null,{timeout:25000});
  const navSeen = await page.evaluate(()=>[...document.querySelectorAll('.nav a')].filter(a=>a.offsetParent!==null).map(a=>a.textContent.trim()));
  await page.evaluate(()=>{ location.hash='#/outreach'; render(); });
  await page.waitForTimeout(700);
  const tabSeen = await page.evaluate(()=>{ const e=document.querySelector('.ep-tab'); return !!e && e.offsetParent!==null; });
  if (tag === '폰') {
    t('폰 메뉴에 원고 없음', !navSeen.includes('원고'), navSeen.join(' '));
    t('폰 메뉴는 네 개', navSeen.length===4, navSeen.join(' '));
    t('폰 접촉에 원고 탭 단추', tabSeen);
    await page.click('.ep-tab');
    await page.waitForTimeout(600);
    t('눌러서 원고로 감', await page.evaluate(()=>location.hash)==='#/letters', await page.evaluate(()=>location.hash));
    t('원고 화면이 뜸', await page.locator('.let-list').count()>0);
  } else {
    t('PC 메뉴에 원고 있음', navSeen.includes('원고'), navSeen.join(' '));
    t('PC 메뉴는 다섯 개', navSeen.length===5, navSeen.join(' '));
    t('PC 접촉에는 군더더기 없음', !tabSeen);
  }
  await page.close();
}
/* ---------- 상세의 X 는 **들어온 자리로** 되돌아간다 (2026-10-24) ----------
 * 전에는 어디에서 들어왔든 늘 학과 화면으로 떨어뜨렸다. 분석에서 교수를 눌러 들어온 뒤
 * X 를 누르면 엉뚱하게 학과 명단이 나왔다. */
{
  const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
  await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
  await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
  const hash = () => page.evaluate(() => location.hash);
  const X = async () => { await page.click('button.iconbtn[data-close]'); await page.waitForTimeout(600); };
  const open = async sel => { await page.evaluate(q => document.querySelector(q).click(), sel); await page.waitForTimeout(700); };

  /* 분석에서 — 보던 자리까지 되돌아와야 한다 */
  await page.evaluate(() => { state.ratings.clear(); state.rows.slice(0, 30).forEach(p => setRating(rKey(p), '확')); location.hash = '#/stats'; render(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 1200));
  const y0 = await page.evaluate(() => window.scrollY);
  await open('a.st-c');
  t('분석에서 상세가 열린다', (await hash()).includes('/prof/'), await hash());
  await X();
  t('X 를 누르면 분석으로 돌아간다', await hash() === '#/stats', await hash());
  t('보던 자리도 그대로', Math.abs(await page.evaluate(() => window.scrollY) - y0) < 40,
    `${y0} → ${await page.evaluate(() => window.scrollY)}`);

  /* 학과에서 — 전부터 하던 대로 학과 명단으로 */
  await page.evaluate(() => { const p = state.rows[0]; location.hash = `#/dept/${p.dept_id}`; render(); });
  await page.waitForTimeout(500);
  await open('.prof');
  await X();
  t('학과에서 들어오면 학과로', await hash() === `#/dept/${await page.evaluate(() => state.rows[0].dept_id)}`, await hash());

  /* 첫 화면(관심 명단)에서 */
  await page.evaluate(() => { favSet = new Set(); state.rows.slice(0, 4).forEach(p => favs().add(rKey(p))); favSave(); location.hash = '#/'; render(); });
  await page.waitForTimeout(500);
  await open('.favc');
  await X();
  t('첫 화면에서 들어오면 첫 화면으로', await hash() === '#/', await hash());

  /* Esc 로 닫아도 같다 */
  await page.evaluate(() => { location.hash = '#/stats'; render(); });
  await page.waitForTimeout(500);
  await open('a.st-c');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  t('Esc 로 닫아도 같은 길', await hash() === '#/stats', await hash());

  /* 주소로 바로 들어오면(앞 기록이 없으면) 학과 화면으로 — 앱 밖으로 나가지 않는다 */
  const p2 = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await p2.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
  await p2.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
  await p2.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
  await p2.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
  await p2.evaluate(() => { const p = state.rows[0]; location.replace(location.pathname + `#/dept/${p.dept_id}/prof/${p.slug}`); });
  await p2.waitForTimeout(900);
  await p2.click('button.iconbtn[data-close]');
  await p2.waitForTimeout(600);
  t('주소로 바로 들어왔으면 학과로', (await p2.evaluate(() => location.hash)) === `#/dept/${await p2.evaluate(() => state.rows[0].dept_id)}`,
    await p2.evaluate(() => location.hash));
  t('그때도 앱 안에 머문다', (await p2.evaluate(() => location.pathname)).includes('/'), await p2.evaluate(() => location.pathname));
  t('콘솔 오류 없음', errs.length === 0, errs.join(' | '));
  await page.close(); await p2.close();
}

let bad=0; for(const [n,v,x] of ok){ if(!v) bad++; console.log(`${v?'OK  ':'실패'} ${n}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad}/${ok.length} 통과`);
await b.close(); process.exit(bad?1:0);
