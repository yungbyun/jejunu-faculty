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
/* 엔터를 치면 브라우저가 만드는 꼴은 제각각이다. 첫 줄은 묶음으로 감싸지 않는 것이 함정이라
   「가<div>나</div>」가 '가나' 로 붙어 줄바꿈이 통째로 사라졌다 (2026-10-09에 고침). */
const shapes = await page.evaluate(() => {
  const br = String.fromCharCode(10);
  const read = h => { const d = document.createElement('div'); d.innerHTML = h; return memoRead(d); };
  return [
    ['엔터 한 번(첫 줄은 맨몸)', '가<div>나</div>', '가' + br + '나'],
    ['엔터 두 번(빈 줄)', '가<div><br></div><div>나</div>', '가' + br + br + '나'],
    ['둘 다 묶음', '<div>가</div><div>나</div>', '가' + br + '나'],
    ['묶음 사이 빈 줄', '<div>가</div><div><br></div><div>나</div>', '가' + br + br + '나'],
    ['br 만 쓰는 브라우저', '가<br>나', '가' + br + '나'],
    ['br 두 번', '가<br><br>나', '가' + br + br + '나'],
    ['겹친 묶음(붙여넣기)', '<div><div>가</div></div>', '가'],
    ['묶음 안의 굵게', '<div><b>굵게</b></div><div>다음</div>', '**굵게**' + br + '다음'],
    ['끝의 빈 줄은 버린다', '가<div><br></div>', '가'],
    ['빈 줄 둘', '<div>한</div><div><br></div><div><br></div><div>셋</div>', '한' + br + br + br + '셋'],
  ].map(([name, html, want]) => ({ name, got: read(html), want }));
});
shapes.forEach(x => t(`줄바꿈 — ${x.name}`, x.got === x.want, `${JSON.stringify(x.got)} / ${JSON.stringify(x.want)}`));

/* 실제로 쳐 보고, 닫았다 다시 열어도 그대로인지 */
await page.evaluate(() => {
  state.notes.clear();
  const p = state.rows[0];
  location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render();
});
await page.waitForSelector('.memo', { timeout: 10000 });
await page.click('.memo');
await page.keyboard.type('첫 줄');
await page.keyboard.press('Enter');
await page.keyboard.type('둘째 줄');
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.keyboard.type('넷째 줄');
await page.waitForTimeout(1200);
t('친 그대로 저장된다', await page.evaluate(() => {
  const br = String.fromCharCode(10);
  return getNote(rKey(state.rows[0])).memo === '첫 줄' + br + '둘째 줄' + br + br + '넷째 줄';
}), await page.evaluate(() => JSON.stringify(getNote(rKey(state.rows[0])).memo)));
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
await page.evaluate(() => { const p = state.rows[0]; location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render(); });
await page.waitForSelector('.memo', { timeout: 10000 });
await page.waitForTimeout(400);
t('다시 열어도 줄이 그대로', await page.evaluate(() => {
  const br = String.fromCharCode(10);
  return memoRead(document.querySelector('.memo')) === '첫 줄' + br + '둘째 줄' + br + br + '넷째 줄';
}), await page.evaluate(() => JSON.stringify(document.querySelector('.memo').innerHTML)));
t('화면에도 네 줄로 보인다', await page.evaluate(() => {
  const m = document.querySelector('.memo');
  return Math.round(m.scrollHeight / parseFloat(getComputedStyle(m).lineHeight)) >= 4;
}));
await page.evaluate(() => { state.notes.clear(); });
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

/* 커서가 선 자리의 꾸밈을 아래 단추가 실시간으로 비춘다 (2026-10-09) */
await page.evaluate(() => {
  const p = state.rows[1];
  state.notes.set(rKey(p), { memo: '보통 글 **굵은 글** __밑줄 글__ *기운 글* 끝' });
  location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render();
});
await page.waitForSelector('.memo__b', { timeout: 10000 });
/* 글 안에 커서를 꽂는다 — 마우스 좌표가 아니라 Range 로 정확히 */
const caretAt = w => page.evaluate(word => {
  const m = document.querySelector('.memo');
  const tw = document.createTreeWalker(m, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    const i = n.nodeValue.indexOf(word);
    if (i < 0) continue;
    const r = document.createRange();
    r.setStart(n, i + 1); r.collapse(true);
    m.focus();
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    return n.parentNode.nodeName;
  }
  return '(못 찾음)';
}, w);
const marks = () => page.evaluate(() => [...document.querySelectorAll('.memo__b')]
  .map(b => `${b.dataset.cmd}:${b.getAttribute('aria-pressed')}:${b.classList.contains('on') ? 'on' : 'off'}`).join(' '));

t('처음엔 셋 다 꺼져 있다', (await marks()) === 'bold:false:off underline:false:off italic:false:off', await marks());
await caretAt('보통');
t('보통 글에서는 그대로 꺼짐', (await marks()) === 'bold:false:off underline:false:off italic:false:off', await marks());
await caretAt('굵은');
t('굵은 글 안이면 굵게만 켜짐', (await marks()) === 'bold:true:on underline:false:off italic:false:off', await marks());
await caretAt('밑줄');
t('밑줄 글 안이면 밑줄만 켜짐', (await marks()) === 'bold:false:off underline:true:on italic:false:off', await marks());
await caretAt('기운');
t('기운 글 안이면 기울임만 켜짐', (await marks()) === 'bold:false:off underline:false:off italic:true:on', await marks());
await caretAt('보통');
t('도로 보통 글로 오면 다 꺼짐', (await marks()) === 'bold:false:off underline:false:off italic:false:off', await marks());

/* 단추를 눌러 켠 직후에도 바로 비춰야 한다 — execCommand 는 selectionchange 를 안 울릴 때가 있다 */
await page.click('.memo__b--b');
t('단추를 누르면 곧바로 켜진다', (await marks()).startsWith('bold:true:on'), await marks());
await page.click('.memo__b--b');
t('다시 누르면 곧바로 꺼진다', (await marks()).startsWith('bold:false:off'), await marks());

/* 글상자 밖으로 나가면 모두 끈다 — 남의 자리 꾸밈을 보여 주면 안 된다 */
await page.evaluate(() => document.querySelector('.memo').blur());
await page.waitForTimeout(80);
t('글상자를 나가면 다 꺼진다', (await marks()) === 'bold:false:off underline:false:off italic:false:off', await marks());

t('켜진 단추는 눈에도 띈다', await page.evaluate(async () => {
  const m = document.querySelector('.memo');
  const tw = document.createTreeWalker(m, NodeFilter.SHOW_TEXT);
  let n; while ((n = tw.nextNode())) if (n.nodeValue.includes('굵은')) break;
  const r = document.createRange(); r.setStart(n, 1); r.collapse(true);
  m.focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  await new Promise(x => setTimeout(x, 60));
  const on = document.querySelector('.memo__b.on'), off = document.querySelector('.memo__b:not(.on)');
  return getComputedStyle(on).backgroundColor !== getComputedStyle(off).backgroundColor;
}));
await page.evaluate(() => closeDrawer());

let bad=0; for(const [n,v,x] of ok){ if(!v) bad++; console.log(`${v?'OK  ':'실패'} ${n}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close(); process.exit(bad?1:0);
