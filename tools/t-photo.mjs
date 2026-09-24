/* 바짝 잘린 사진을 줄여 턱이 보이게 한 것. 로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({viewport:{width:1440,height:1100}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto('http://127.0.0.1:8080/',{waitUntil:'load'});
await page.waitForFunction(()=>typeof enterApp==='function',null,{timeout:20000});
await page.evaluate(()=>{ if(!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(()=>typeof state!=='undefined'&&state.rows.length>0,null,{timeout:25000});
const ok=[]; const t=(n,v,x='')=>ok.push([n,v,x]);

const bad = await page.evaluate(()=>Object.keys(PHOTO_ZOOM).filter(k=>!state.rows.some(p=>rKey(p)===k)));
t('명단이 모두 실제 교수', bad.length===0, bad.join(' '));
t('값이 0과 1 사이', await page.evaluate(()=>Object.values(PHOTO_ZOOM).every(v=>v>0&&v<1)));

await page.evaluate(()=>{ location.hash='#/dept/nuclear'; render(); });
await page.waitForSelector('.prof__photo--z',{timeout:10000});
await page.waitForTimeout(800);
const n = await page.evaluate(()=>{
  const want = state.rows.filter(p=>p.dept_id==='nuclear'&&PHOTO_ZOOM[rKey(p)]).length;
  return { want, got: document.querySelectorAll('.prof__photo--z').length };
});
t('원자력 3명에 적용', n.got===n.want && n.want===3, `${n.got}/${n.want}`);
t('사진이 잘리지 않고 다 들어온다', await page.evaluate(()=>
  [...document.querySelectorAll('.prof__photo--z img')].every(i=>getComputedStyle(i).objectFit==='contain')));
t('줄인 배율이 붙어 있다', await page.evaluate(()=>
  [...document.querySelectorAll('.prof__photo--z')].every(e=>/scale\(/.test(getComputedStyle(e.querySelector('img')).transform) || getComputedStyle(e.querySelector('img')).transform!=='none')));
t('여백이 테마 색을 따른다', await page.evaluate(()=>{
  const e=document.querySelector('.prof__photo--z');
  return getComputedStyle(e).backgroundColor === getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim()
      || getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)';
}));
t('손대지 않은 교수는 그대로', await page.evaluate(()=>{
  const p=state.rows.find(x=>x.dept_id==='nuclear'&&!PHOTO_ZOOM[rKey(x)]);
  const c=document.querySelector(`.prof[data-slug="${p.slug}"] .prof__photo`);
  return c && !c.classList.contains('prof__photo--z');
}));
let bad2=0; for(const [nm,v,x] of ok){ if(!v) bad2++; console.log(`${v?'OK  ':'실패'} ${nm}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad2}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close(); process.exit(bad2?1:0);
