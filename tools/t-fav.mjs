/* 관심 교수 카드의 만남 카운터. 로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({viewport:{width:1440,height:1000}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto('http://127.0.0.1:8080/',{waitUntil:'load'});
await page.waitForFunction(()=>typeof enterApp==='function',null,{timeout:20000});
await page.evaluate(()=>{ if(!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(()=>typeof state!=='undefined'&&state.rows.length>0,null,{timeout:25000});
const ok=[]; const t=(n,v,x='')=>ok.push([n,v,x]);

const k = await page.evaluate(()=>{
  favs().clear();
  toggleFav(state.rows[0]); toggleFav(state.rows[1]);
  state.notes.clear();
  location.hash='#/'; render();
  return rKey(state.rows[0]);
});
await page.waitForSelector('.favw',{timeout:10000});
t('관심 카드 2장', await page.locator('.favw').count()===2);
t('카드마다 카운터', await page.locator('.favw .counter').count()===2);
t('처음은 0', await page.evaluate(()=>document.querySelector('.favw .counter__n').textContent)==='0');
const lay = await page.evaluate(()=>{
  const c=document.querySelector('.favw .counter').getBoundingClientRect();
  const inc=document.querySelector('.favw [data-inc]').getBoundingClientRect();
  const dec=document.querySelector('.favw [data-dec]').getBoundingClientRect();
  return { w:Math.round(c.width), incY:Math.round(inc.y), decY:Math.round(dec.y), incX:Math.round(inc.x), decX:Math.round(dec.x) };
});
t('+ 가 − 보다 위에', lay.incY < lay.decY, `+ y=${lay.incY} / − y=${lay.decY}`);
t('+ 와 − 가 같은 열에', Math.abs(lay.incX - lay.decX) <= 1);
t('폭이 50px 아래', lay.w < 50, `${lay.w}px`);

await page.locator('.favw .counter [data-inc]').first().click();
await page.waitForTimeout(300);
await page.locator('.favw .counter [data-inc]').first().click();
await page.waitForTimeout(300);
t('+ 두 번이면 2', await page.evaluate(x=>getNote(x).met===2, k), await page.evaluate(()=>document.querySelector('.favw .counter__n').textContent));
t('화면 숫자도 2', await page.evaluate(()=>document.querySelector('.favw .counter__n').textContent)==='2');
await page.locator('.favw .counter [data-dec]').first().click();
await page.waitForTimeout(300);
t('− 로 줄어듦', await page.evaluate(x=>getNote(x).met===1, k));
t('0 밑으로는 안 내려감', await page.evaluate(()=>{ const k2=rKey(state.rows[1]); setMet(k2,0); setMet(k2,-1); return getNote(k2).met===0; }));

// 눌러도 상세로 튀지 않아야 한다
t('카운터를 눌러도 화면 안 바뀜', await page.evaluate(()=>location.hash)==='#/', await page.evaluate(()=>location.hash));
t('옆 교수는 그대로', await page.evaluate(()=>getNote(rKey(state.rows[1])).met===0));

// 다른 화면과 같은 값
await page.evaluate(()=>{ const p=state.rows[0]; location.hash=`#/dept/${p.dept_id}/prof/${p.slug}`; render(); });
await page.waitForSelector('#drawer .counter',{timeout:10000});
t('상세 화면도 같은 값', await page.evaluate(()=>document.querySelector('#drawer .counter__n').textContent)==='1',
  await page.evaluate(()=>document.querySelector('#drawer .counter__n').textContent));

let bad=0; for(const [n,v,x] of ok){ if(!v) bad++; console.log(`${v?'OK  ':'실패'} ${n}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close(); process.exit(bad?1:0);
