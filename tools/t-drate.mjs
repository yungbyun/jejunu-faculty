/* 상세 화면의 선호도 고르기, 그리고 박철민 교수가 빠졌는지.
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

// 0) 퇴직 교수
t('전체 69명', await page.evaluate(()=>state.rows.length)===69, String(await page.evaluate(()=>state.rows.length)));
t('박철민 교수 없음', await page.evaluate(()=>!state.rows.some(p=>p.name==='박철민')));
t('건축학과 4명', await page.evaluate(()=>state.rows.filter(p=>p.dept_name==='건축학과').length)===4);

// 1) 상세에 선호도 줄
const info = await page.evaluate(()=>{ const p=state.rows.find(x=>x.name==='좌정우'); state.ratings.delete(rKey(p)); return {k:rKey(p), h:`#/dept/${p.dept_id}/prof/${p.slug}`}; });
await page.evaluate(h=>{ location.hash=h; render(); }, info.h);
await page.waitForSelector('.rate--wide',{timeout:10000});
t('선호도 단추 5개', await page.locator('.rate--wide .rate__b').count()===5, String(await page.locator('.rate--wide .rate__b').count()));
t('비(평가제외)는 없음', await page.evaluate(()=>![...document.querySelectorAll('.rate--wide .rate__b')].some(b=>b.dataset.val==='비')));
t('확·긍·중·모·부 순서', await page.evaluate(()=>[...document.querySelectorAll('.rate--wide .rate__b')].map(b=>b.dataset.val).join(''))==='확긍중모부');
t('이름도 함께 보임', await page.evaluate(()=>document.querySelector('.rate--wide .rate__b').textContent.replace(/\s+/g,''))==='확확실');

// 2) 고르면 저장된다
await page.locator('.rate--wide .rate__b[data-val="긍"]').click();
await page.waitForTimeout(400);
t('고르면 저장됨', await page.evaluate(k=>getRatingByKey(k)==='긍', info.k));
t('고른 것이 눌린 상태', await page.evaluate(()=>document.querySelector('.rate--wide .rate__b[data-val="긍"]').getAttribute('aria-pressed'))==='true');
t('다른 것은 안 눌림', await page.evaluate(()=>document.querySelector('.rate--wide .rate__b[data-val="확"]').getAttribute('aria-pressed'))==='false');

// 3) 다시 누르면 해제
await page.locator('.rate--wide .rate__b[data-val="긍"]').click();
await page.waitForTimeout(400);
t('다시 누르면 해제', await page.evaluate(k=>!getRatingByKey(k), info.k));

// 4) 카드 쪽과 이어진다
await page.locator('.rate--wide .rate__b[data-val="확"]').click();
await page.waitForTimeout(300);
await page.evaluate(()=>{ location.hash='#/dept/telecom'; render(); });
await page.waitForTimeout(600);
t('학과 카드에도 반영', await page.evaluate(k=>{
  const c=document.querySelector(`.prof[data-slug="${k.split('/')[1]}"]`);
  return c && c.dataset.rating==='확';
}, info.k));

// 5) 비로 되어 있으면 알려 준다
await page.evaluate(k=>{ setRating(k,'비'); }, info.k);
await page.evaluate(h=>{ location.hash=h; render(); }, info.h);
await page.waitForSelector('.rate--wide',{timeout:10000});
t('비면 안내가 뜬다', await page.evaluate(()=>[...document.querySelectorAll('.d-section .st-note')].some(e=>e.textContent.includes('연구년'))));
t('비면 아무것도 안 눌림', await page.evaluate(()=>![...document.querySelectorAll('.rate--wide .rate__b')].some(b=>b.getAttribute('aria-pressed')==='true')));

let bad=0; for(const [n,v,x] of ok){ if(!v) bad++; console.log(`${v?'OK  ':'실패'} ${n}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close(); process.exit(bad?1:0);
