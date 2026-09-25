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
let bad=0; for(const [n,v,x] of ok){ if(!v) bad++; console.log(`${v?'OK  ':'실패'} ${n}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad}/${ok.length} 통과`);
await b.close(); process.exit(bad?1:0);
