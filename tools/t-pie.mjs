/* 도넛 조각의 인원수와, 눌렀을 때 선호도별 명단으로 내려가는지.
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto('http://127.0.0.1:8080/',{waitUntil:'load'});
await page.waitForFunction(()=>typeof enterApp==='function',null,{timeout:20000});
await page.evaluate(()=>{ if(!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(()=>typeof state!=='undefined'&&state.rows.length>0,null,{timeout:25000});

/* 조각을 누른다 — 조각 한가운데(번호표 자리)의 실제 화면 좌표를 구해서 누른다.
   g 의 테두리 상자 가운데는 도넛의 빈 속이라 아무것도 안 눌린다. */
async function clickSeg(page, r) {
  const pt = await page.evaluate(rr => {
    const tx = document.querySelector(`.pie__hit[data-rs="${rr}"] text`);
    const svg = tx.ownerSVGElement, m = svg.getScreenCTM();
    const p = svg.createSVGPoint();
    p.x = +tx.getAttribute('x'); p.y = +tx.getAttribute('y');
    const s = p.matrixTransform(m);
    return { x: s.x, y: s.y };
  }, r);
  await page.mouse.click(pt.x, pt.y);
}

const ok=[]; const t=(n,v,x='')=>ok.push([n,v,x]);
await page.evaluate(()=>{ const v=['확','긍','중','모','부','비']; state.rows.forEach((p,i)=>state.ratings.set(rKey(p), v[i%v.length])); location.hash='#/stats'; render(); });
await page.waitForSelector('.pie__hit',{timeout:10000});

// 1) 숫자가 제 조각에 얹혀 있다
const nums = await page.evaluate(()=>[...document.querySelectorAll('.pie__hit')].map(g=>({r:g.dataset.rs, n:g.querySelector('text')?.textContent||''})));
t('조각마다 번호표', nums.every(x=>x.n!==''), JSON.stringify(nums));
const real = await page.evaluate(()=>{ const c={}; state.rows.forEach(p=>{const g=getRating(p); if(g)c[g]=(c[g]||0)+1;}); return c; });
t('숫자가 실제 인원과 같음', nums.every(x=>String(real[x.r])===x.n), JSON.stringify(real));
t('비(평가제외)는 도넛에 없음', !nums.some(x=>x.r==='비'));

// 2) 숫자가 조각 안에 있다 — 도넛 띠(반지름 60~84) 위에 놓였는지
t('숫자가 띠 위에 놓임', await page.evaluate(()=>[...document.querySelectorAll('.pie__sn')].every(tx=>{
  const x=+tx.getAttribute('x'), y=+tx.getAttribute('y');
  const d=Math.hypot(x-100, y-112);
  return d>60 && d<84 && y<=112.5;
})));

// 3) 누르면 그 선호도의 명단으로 내려간다
await page.evaluate(()=>window.scrollTo(0,0));
const before = await page.evaluate(()=>window.scrollY);
await clickSeg(page, '모');
await page.waitForTimeout(1200);
const after = await page.evaluate(()=>window.scrollY);
t('아래로 내려감', after > before, `${before} → ${after}`);
t('그 줄이 화면 안에', await page.evaluate(()=>{
  const r=document.querySelector('[data-rslist="모"]').getBoundingClientRect();
  return r.top > -10 && r.top < window.innerHeight;
}));
t('그 줄이 번쩍임', await page.evaluate(()=>document.querySelector('[data-rslist="모"]').classList.contains('st-list--hit')));
t('다른 줄은 가만히', await page.evaluate(()=>!document.querySelector('[data-rslist="확"]').classList.contains('st-list--hit')));

// 4) 키보드로도 된다
await page.evaluate(()=>window.scrollTo(0,0));
await page.evaluate(()=>document.querySelector('.pie__hit[data-rs="부"]').focus());
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
t('키보드로도 내려감', await page.evaluate(()=>window.scrollY)>0);
t('주소는 그대로', await page.evaluate(()=>location.hash)==='#/stats', await page.evaluate(()=>location.hash));

// 5) 비(평가제외)는 과반 계산의 모수에서 빠진다
const maj = await page.evaluate(()=>{
  state.ratings.clear();
  state.rows.slice(0,3).forEach(p=>state.ratings.set(rKey(p),'비'));
  state.rows.slice(3,33).forEach(p=>state.ratings.set(rKey(p),'확'));
  render();
  const ks=[...document.querySelectorAll('.pie__k')].map(k=>k.innerText.split(String.fromCharCode(10)).join(' '));
  const u=document.querySelector('.pie__u').textContent;
  return { ks, u, n: state.rows.length };
});
t('비 3명은 모수에서 빠짐', maj.u.includes(`/ ${maj.n-3}명`), maj.u);
t('기준선은 모수의 절반(올림)', maj.ks[1].includes(`${Math.ceil((maj.n-3)/2)-30}명`), maj.ks[1]);
t('아직 안 매긴 사람도 같이 적는다', maj.ks[1].includes('미지정'), maj.ks[1]);

let bad=0; for(const [n,v,x] of ok){ if(!v) bad++; console.log(`${v?'OK  ':'실패'} ${n}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close(); process.exit(bad?1:0);
