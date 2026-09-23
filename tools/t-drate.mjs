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
t('선호도 단추 6개', await page.locator('.rate--wide .rate__b').count()===6, String(await page.locator('.rate--wide .rate__b').count()));
t('확·긍·중·모·부·비 순서', await page.evaluate(()=>[...document.querySelectorAll('.rate--wide .rate__b')].map(b=>b.dataset.val).join(''))==='확긍중모부비');
t('글자만 (이름 없음)', await page.evaluate(()=>document.querySelector('.rate--wide .rate__b').textContent.trim())==='확');
t('뜻은 도움말로', await page.evaluate(()=>document.querySelector('.rate--wide .rate__b').getAttribute('title'))==='확실');

// 만난 횟수 카운터
t('상세에 만난 횟수', await page.locator('#drawer .counter').count()===1);
const dk = await page.evaluate(()=>document.querySelector('#drawer .counter').dataset.key);
await page.locator('#drawer .counter [data-inc]').click();
await page.waitForTimeout(300);
await page.locator('#drawer .counter [data-inc]').click();
await page.waitForTimeout(300);
t('+ 를 두 번 누르면 2', await page.evaluate(k=>getNote(k).met===2, dk), String(await page.evaluate(()=>document.querySelector('#drawer .counter__n').textContent)));
await page.locator('#drawer .counter [data-dec]').click();
await page.waitForTimeout(300);
t('− 로 줄어듦', await page.evaluate(k=>getNote(k).met===1, dk));
t('화면 숫자도 같이', await page.evaluate(()=>document.querySelector('#drawer .counter__n').textContent)==='1');

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

// 5) 비도 상세에서 바로 고를 수 있다
await page.evaluate(h=>{ location.hash=h; render(); }, info.h);
await page.waitForSelector('.rate--wide',{timeout:10000});
await page.locator('.rate--wide .rate__b[data-val="비"]').click();
await page.waitForTimeout(400);
t('비를 상세에서 고를 수 있다', await page.evaluate(k=>getRatingByKey(k)==='비', info.k));
t('비가 눌린 상태로 보인다', await page.evaluate(()=>document.querySelector('.rate--wide .rate__b[data-val="비"]').getAttribute('aria-pressed'))==='true');

// 6) 누른 뒤 포커스 테두리가 남지 않는다
t('누른 단추가 포커스를 놓는다', await page.evaluate(()=>
  document.activeElement !== document.querySelector('.rate--wide .rate__b[data-val="비"]')),
  await page.evaluate(()=>document.activeElement.className||document.activeElement.tagName));
t('포커스 테두리 없음', await page.evaluate(()=>{
  const b=document.querySelector('.rate--wide .rate__b'); b.focus();
  return getComputedStyle(b).outlineStyle === 'none';
}));
t('폰에서 누를 때 회색 네모 없음', await page.evaluate(()=>{
  const c=getComputedStyle(document.querySelector('.rate--wide .rate__b')).webkitTapHighlightColor || '';
  return /rgba\(0, 0, 0, 0\)|transparent/.test(c);
}), await page.evaluate(()=>getComputedStyle(document.querySelector('.rate--wide .rate__b')).webkitTapHighlightColor));
t('고른 단추에 덧고리 없음', await page.evaluate(()=>
  getComputedStyle(document.querySelector('.rate--wide .rate__b[aria-pressed="true"]')).boxShadow === 'none'));
// 학과 카드의 선호도 여섯 개는 어떤 폭에서도 한 줄
for (const w of [300, 320, 360, 390]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.evaluate(()=>{ location.hash='#/dept/comdol'; render(); });
  await page.waitForTimeout(350);
  const r = await page.evaluate(()=>{
    const bs=[...document.querySelectorAll('.prof .rate')[0].querySelectorAll('.rate__b')];
    const ys=new Set(bs.map(b=>Math.round(b.getBoundingClientRect().y)));
    return { n:bs.length, 줄:ys.size, 끝:Math.round(bs[bs.length-1].getBoundingClientRect().right), vw:innerWidth };
  });
  t(`카드 선호도 ${w}px 에서 한 줄`, r.n===6 && r.줄===1 && r.끝<=r.vw, `${r.n}개 ${r.줄}줄 끝=${r.끝}/${r.vw}`);
}
await page.setViewportSize({ width: 1440, height: 1000 });
await page.waitForTimeout(200);

t('학과 카드의 고리는 그대로', await page.evaluate(()=>{
  location.hash='#/dept/comdol'; render();
  const p=state.rows.find(x=>x.dept_id==='comdol'); setRating(rKey(p),'확');
  const b=document.querySelector('.prof .rate__b[aria-pressed="true"]');
  return !!b && getComputedStyle(b).boxShadow !== 'none';
}));

let bad=0; for(const [n,v,x] of ok){ if(!v) bad++; console.log(`${v?'OK  ':'실패'} ${n}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close(); process.exit(bad?1:0);
