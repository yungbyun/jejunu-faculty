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

/* ---------- 검색은 여섯 자리만 훑는다 (2026-10-24) ----------
 * 이름 · 영문명 · 직위 · 전공 키워드 · 연구실 · 학과. 소개 글과 논문 제목은 글이 길어
 * 흔한 글자가 거의 다 걸리므로 뺐다 — 「양」 한 글자로 19명이 걸리던 일 때문이다. */
{
  const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
  await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
  await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
  const hits = q => page.evaluate(qq => state.rows.filter(p => matches(p, qq)).length, q);

  t('「양」은 아홉 — 이름 셋 + 해양과학대학 다섯 + 양식 키워드 하나', await hits('양') === 9,
    String(await hits('양')));
  t('이름으로 찾는다', await hits('양진아') === 1, String(await hits('양진아')));
  t('전공 키워드로 찾는다', await hits('인공지능') > 0, String(await hits('인공지능')));
  t('연구실 호실로 찾는다', await hits('7219') === 1, String(await hits('7219')));
  t('학과로 찾는다', await hits('기계시스템') > 0, String(await hits('기계시스템')));
  t('직위로 찾는다', await hits('교수') === 69, String(await hits('교수')));

  /* 소개 글에만 있는 말은 안 걸려야 한다 */
  const only = await page.evaluate(() => {
    const six = p => [p.name, p.name_en, p.rank, p.tags.join(' '), p.office, p.dept_name].join(' ').toLowerCase();
    const all = state.rows.map(six).join(' ');
    for (const p of state.rows) {
      for (const w of String(p.summary || '').split(/[^가-힣A-Za-z]+/)) {
        if (w.length >= 4 && !all.includes(w.toLowerCase())) return { w, who: p.name };
      }
    }
    return null;
  });
  t('소개 글에만 있는 말은 안 걸린다', !!only && await hits(only.w) === 0,
    only ? `「${only.w}」(${only.who} 소개) → ${await hits(only.w)}명` : '그런 말을 못 찾음');

  /* 논문 제목에만 있는 말도 마찬가지 */
  const onlyP = await page.evaluate(() => {
    const six = p => [p.name, p.name_en, p.rank, p.tags.join(' '), p.office, p.dept_name].join(' ').toLowerCase();
    const all = state.rows.map(six).join(' ');
    for (const p of state.rows) {
      for (const w of (p.papers || []).map(x => x.t).join(' ').split(/[^가-힣A-Za-z]+/)) {
        if (w.length >= 5 && !all.includes(w.toLowerCase())) return { w, who: p.name };
      }
    }
    return null;
  });
  t('논문 제목에만 있는 말도 안 걸린다', !onlyP || await hits(onlyP.w) === 0,
    onlyP ? `「${onlyP.w}」(${onlyP.who} 논문) → ${await hits(onlyP.w)}명` : '그런 말이 없음');
  await page.close();
}

let bad=0; for(const [n,v,x] of ok){ if(!v) bad++; console.log(`${v?'OK  ':'실패'} ${n}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad}/${ok.length} 통과`);
await b.close(); process.exit(bad?1:0);
