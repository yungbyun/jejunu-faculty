/* 메모 서식 편집기 — 화면에서 바로 꾸며지고, 저장은 평문(**굵게** __밑줄__ *기울임*).
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

// 평문 → 화면
t('**굵게** 가 <b> 로', await page.evaluate(()=>memoHtml('앞 **여기** 뒤')==='앞 <b>여기</b> 뒤'));
t('__밑줄__ 이 <u> 로', await page.evaluate(()=>memoHtml('앞 __여기__ 뒤')==='앞 <u>여기</u> 뒤'));
t('*기울임* 이 <i> 로', await page.evaluate(()=>memoHtml('앞 *여기* 뒤')==='앞 <i>여기</i> 뒤'));
t('HTML 은 먼저 막는다', await page.evaluate(()=>memoHtml('<script>x</script>').indexOf('<script')<0));
t('짝이 안 맞으면 그대로', await page.evaluate(()=>memoHtml('**열기만')==='**열기만'));
t('표시 기호 없애기', await page.evaluate(()=>memoPlain('**가** __나__ *다*')==='가 나 다'));

// 화면 → 평문
t('DOM 을 평문으로', await page.evaluate(()=>{
  const d=document.createElement('div');
  d.innerHTML='앞 <b>굵게</b> <u>밑줄</u> <i>기울임</i> 뒤';
  return memoRead(d)==='앞 **굵게** __밑줄__ *기울임* 뒤';
}));
t('줄바꿈도 살린다', await page.evaluate(()=>{
  const d=document.createElement('div'); d.innerHTML='한 줄<br>두 줄'; return memoRead(d)==='한 줄\n두 줄';
}));
t('빈 껍데기에는 표시를 안 붙임', await page.evaluate(()=>{
  const d=document.createElement('div'); d.innerHTML='가<b></b>나'; return memoRead(d)==='가나';
}));
t('되돌리면 같은 글', await page.evaluate(()=>{
  const src='오고 출신, **강창남 교수** 후배.\n__연구실 AX__ 에 *관심*';
  const d=document.createElement('div'); d.innerHTML=memoHtml(src); return memoRead(d)===src;
}));

// 실제 편집기
const info = await page.evaluate(()=>{ const p=state.rows[0]; return {k:rKey(p), h:`#/dept/${p.dept_id}/prof/${p.slug}`}; });
await page.evaluate(h=>{ location.hash=h; render(); }, info.h);
await page.waitForSelector('.memo[contenteditable]',{timeout:10000});
t('칸이 서식 편집기', await page.evaluate(()=>document.querySelector('.memo').getAttribute('contenteditable'))==='true');
t('단추 세 개', await page.locator('.memo__b').count()===3);
t('미리보기 칸은 사라짐', await page.locator('.memo__prev').count()===0);

// 글을 쓰고 굵게
await page.click('.memo');
await page.keyboard.type('오고 출신, 강창남 교수 후배.');
await page.waitForTimeout(300);
await page.evaluate(()=>{
  const el=document.querySelector('.memo'), tx=el.firstChild;
  const i=tx.nodeValue.indexOf('강창남 교수');
  const r=document.createRange(); r.setStart(tx,i); r.setEnd(tx,i+'강창남 교수'.length);
  const sel=getSelection(); sel.removeAllRanges(); sel.addRange(r);
});
await page.click('.memo__b[data-cmd="bold"]');
await page.waitForTimeout(400);
t('편집기 안에서 바로 굵어짐', await page.evaluate(()=>document.querySelector('.memo').innerHTML.replace(/<strong>/g,'<b>').replace(/<\/strong>/g,'</b>').includes('<b>강창남 교수</b>')),
  await page.evaluate(()=>document.querySelector('.memo').innerHTML));
t('화면에 ** 가 안 보임', !(await page.evaluate(()=>document.querySelector('.memo').textContent)).includes('*'),
  await page.evaluate(()=>document.querySelector('.memo').textContent));
await page.evaluate(()=>document.querySelector('.memo').blur());
await page.waitForTimeout(500);
t('저장은 평문으로', await page.evaluate(k=>getNote(k).memo.includes('**강창남 교수**'), info.k),
  await page.evaluate(k=>getNote(k).memo, info.k));

// 붙여넣기는 글자만
t('붙여넣기 막음(서식 제거)', await page.evaluate(()=>{
  const el=document.querySelector('.memo');
  let blocked=false;
  const ev=new Event('paste',{bubbles:true,cancelable:true});
  ev.clipboardData={ getData:()=>'붙인 글' };
  el.dispatchEvent(ev);
  blocked = ev.defaultPrevented;
  return blocked;
}));

// 상세 화면을 다시 열어도 꾸밈이 그대로 보인다
await page.evaluate(k=>applyEntry(k,{memo:'오고 출신, **강창남 교수** 후배.'}), info.k);
await page.evaluate(h=>{ location.hash=h; render(); }, info.h);
await page.waitForSelector('.memo[contenteditable]',{timeout:10000});
const html = await page.evaluate(()=>document.querySelector('.memo').innerHTML);
t('다시 열어도 굵게 그대로', html.includes('<b>강창남 교수</b>'), html);

let bad=0; for(const [n,v,x] of ok){ if(!v) bad++; console.log(`${v?'OK  ':'실패'} ${n}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close(); process.exit(bad?1:0);
