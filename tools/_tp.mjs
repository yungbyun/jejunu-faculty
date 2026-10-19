import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({viewport:{width:390,height:1200},deviceScaleFactor:2})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto('http://127.0.0.1:8080/',{waitUntil:'load'});
await page.waitForFunction(()=>typeof enterApp==='function');
await page.evaluate(()=>{ if(!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(()=>typeof state!=='undefined'&&state.rows.length>0);
await page.evaluate(()=>{ meetMap={}; const d=mtToday();
  CAL.open = mtAdd(d, rKey(state.rows[0]), 'other');     // Tea → 14:00
  CAL.day=d; CAL.ym=mtMonth(d); location.hash='#/cal'; render(); });
await page.waitForSelector('[data-mth]',{timeout:10000});
console.log('Tea 기본 시각:', await page.evaluate(()=>mtList()[0].time));
console.log('고른 값:', await page.evaluate(()=>[document.querySelector('[data-mth]').value, document.querySelector('[data-mtm]').value].join(':')));
console.log('시 보기:', await page.evaluate(()=>[...document.querySelectorAll('[data-mth] option')].slice(0,4).map(o=>o.textContent).join(' / ')
  +' … '+[...document.querySelectorAll('[data-mth] option')].slice(-2).map(o=>o.textContent).join(' / ')));
console.log('분 보기:', await page.evaluate(()=>[...document.querySelectorAll('[data-mtm] option')].map(o=>o.textContent).join(' ')));
/* 시각을 바꿔도 Tea 가 그대로여야 한다 */
await page.selectOption('[data-mth]','15'); await page.waitForTimeout(300);
await page.selectOption('[data-mtm]','30'); await page.waitForTimeout(300);
console.log('15:30 으로 바꾼 뒤:', await page.evaluate(()=>{const m=mtList()[0];
  return `kind=${JSON.stringify(m.kind)} time=${m.time} / `+document.querySelector('.cal-r__t').textContent.trim();}));
/* 점심은 시각을 바꾸면 갈래가 풀린다 */
await page.evaluate(()=>{ meetMap={}; CAL.open=mtAdd(mtToday(), rKey(state.rows[1]), 'lunch'); renderCal(); });
await page.selectOption('[data-mth]','16'); await page.waitForTimeout(300);
console.log('점심을 16시로:', await page.evaluate(()=>{const m=mtList()[0]; return `kind=${JSON.stringify(m.kind)} time=${m.time}`;}));
/* 미정으로 두면 하루 종일 */
await page.selectOption('[data-mth]',''); await page.waitForTimeout(300);
console.log('미정으로:', await page.evaluate(()=>{const m=mtList()[0];
  return `time=${JSON.stringify(m.time)} / 분 칸 잠김=`+document.querySelector('[data-mtm]').disabled
  +' / '+document.querySelector('.cal-r__t').textContent.trim();}));
/* 10분 자리가 아닌 옛 값도 지킨다 */
await page.evaluate(()=>{ meetMap={}; const id=mtAdd(mtToday(), rKey(state.rows[2]), ''); mtSet(id,{time:'18:03'});
  CAL.open=id; renderCal(); });
console.log('18:03 옛 자료:', await page.evaluate(()=>[document.querySelector('[data-mth]').value,document.querySelector('[data-mtm]').value].join(':')
  +' / 분 목록 '+[...document.querySelectorAll('[data-mtm] option')].map(o=>o.value).join(',')));
await page.locator('.cal-f').screenshot({path:'C:/Users/Public/Documents/ESTsoft/CreatorTemp/tp.png'});
console.log('오류',errs);
await page.evaluate(()=>{ meetMap={}; mtSave(); });
await b.close();
