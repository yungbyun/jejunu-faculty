/* 접촉 목록에서 사진·이름 → 상세, 그리고 초안 버튼이 그대로인지.
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({viewport:{width:1440,height:1000}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto('http://127.0.0.1:8080/',{waitUntil:'load'});
await page.waitForFunction(()=>typeof enterApp==='function',null,{timeout:20000});
await page.evaluate(()=>{ if(!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(()=>typeof state!=='undefined'&&state.rows.length>0,null,{timeout:25000});
const ok=[]; const t=(n,v,x='')=>ok.push([n,v,x]);
await page.evaluate(()=>{ location.hash='#/outreach'; render(); });
await page.waitForTimeout(800);
t('행마다 누를 수 있는 이름', await page.locator('.oc__who').count() > 0, String(await page.locator('.oc__who').count()));
const name = await page.locator('.oc__who .oc__n b').first().innerText();
// 이름을 누른다
await page.locator('.oc__who').first().click();
await page.waitForSelector('#drawer .d-name',{timeout:10000});
t('상세가 열림', true);
t('같은 교수', (await page.locator('#drawer .d-name').innerText()).trim()===name.trim(), name);
t('주소는 접촉 그대로', await page.evaluate(()=>location.hash)==='#/outreach', await page.evaluate(()=>location.hash));
// 닫으면 접촉으로 돌아온다
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
t('닫으면 드로어 사라짐', await page.evaluate(()=>document.getElementById('drawer').hidden));
t('접촉 목록 그대로', await page.locator('.oc__who').count() > 0);
// 사진을 눌러도 된다
await page.locator('.oc__who .oc__ph').nth(1).click();
await page.waitForSelector('#drawer .d-name',{timeout:10000});
t('사진을 눌러도 열림', !await page.evaluate(()=>document.getElementById('drawer').hidden));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
// 초안 버튼은 그대로 동작
await page.locator('.oc__go').first().click();
await page.waitForTimeout(400);
t('초안 버튼은 그대로', await page.locator('[data-draft]').count()===1);
t('초안 눌러도 드로어 안 열림', await page.evaluate(()=>document.getElementById('drawer').hidden));
let bad=0; for(const [n,v,x] of ok){ if(!v) bad++; console.log(`${v?'OK  ':'실패'} ${n}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close(); process.exit(bad?1:0);
