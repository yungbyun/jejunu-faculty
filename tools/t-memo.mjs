/* 메모 서식 편집기 — 화면에서 바로 꾸며지고, 저장은 평문(**굵게** __밑줄__ *기울임*).
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({viewport:{width:1440,height:1000}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
/* 화면 깨우기(Screen Wake Lock)를 흉내 내어 걸고 푸는지만 본다 */
await page.addInitScript(() => {
  window.__wake = [];
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
    request: async type => { window.__wake.push('on:' + type);
      return { release: async () => { window.__wake.push('off'); }, addEventListener() {} }; } } });
});
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
/* 서식 단추는 글칸 **위**에 (2026-10-15) — 아이폰에서 글자를 고르면 「오려두기·복사」 말풍선이
   고른 자리 아래에 떠서, 글칸 밑에 있던 단추를 덮어 누를 수가 없었다. */
t('서식 단추가 글칸 위에', await page.evaluate(() => {
  const bar = document.querySelector('.memo__bar'), ed = document.querySelector('.memo[contenteditable]');
  return !!(bar.compareDocumentPosition(ed) & Node.DOCUMENT_POSITION_FOLLOWING)
    && bar.getBoundingClientRect().bottom <= ed.getBoundingClientRect().top + 1;
}), await page.evaluate(() => [...document.querySelector('.memo-box').children].map(e => e.className).join(' / ')));
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
/* ---------- 넘칠 때 서는 세로 바 (2026-11-03, 교수님 지정) ----------
 * 메모가 320px 를 넘으면 뒷부분이 잘리는데 **잘렸다는 것 자체가 안 보였다**. 네이티브 바는
 * 믿을 수 없다 — 아이폰은 손가락을 떼면 사라지고, 맥은 겹침 바라서 가만히 있으면 흔적이 없다.
 * 그래서 네이티브 바를 숨기고 우리 바를 그린다. 아래 시험은 **그 바가 늘 서 있는지**를 본다. */
const sb = async () => await page.evaluate(() => {
  const t = document.querySelector('.memo'), box = t.closest('.memo-box');
  const b = box.querySelector('.memo__sb'), th = b && b.firstElementChild;
  const r = e => { const x = e.getBoundingClientRect(); return { t: x.top, b: x.bottom, l: x.left, r: x.right, w: x.width, h: x.height }; };
  return { over: box.classList.contains('memo-box--over'), shown: b ? getComputedStyle(b).display !== 'none' : false,
    bar: b ? r(b) : null, thumb: th ? r(th) : null, memo: r(t), pad: parseFloat(getComputedStyle(t).paddingRight),
    sh: t.scrollHeight, ch: t.clientHeight, top: t.scrollTop,
    native: getComputedStyle(t).scrollbarWidth,
    /* 네이티브 바가 섬면 `clientWidth` 가 그만큼 줄어든다 — 테두리 두께는 빼고 본다 */
    w: t.offsetWidth - t.clientWidth - parseFloat(getComputedStyle(t).borderLeftWidth)
      - parseFloat(getComputedStyle(t).borderRightWidth) };
});
/* 상세를 **닫았다 열지 않는다** — 닫을 때 `flushMemo()` 가 화면의 글칸을 읽어 그대로 저장하므로,
   방금 넣은 메모가 열자마자 빈 것으로 덮여 쓰인다. `render()` 만 불러 그 자리에서 다시 그린다. */
const setMemo = async n => {
  await page.evaluate(([k, n]) => applyEntry(k, { memo: n ? Array.from({ length: n },
    (_, i) => `${i + 1}번째 줄 — 길어지면 뒤가 잘립니다.`).join(String.fromCharCode(10)) : '' }), [info.k, n]);
  await page.evaluate(h => { location.hash = h; render(); }, info.h);
  await page.waitForSelector('.memo[contenteditable]', { timeout: 10000 });
  await page.waitForTimeout(250); };

await setMemo(3);
const few = await sb();
t('짧은 메모에는 바가 없다', !few.over && !few.shown, `over=${few.over} shown=${few.shown}`);
t('바가 없어도 자리는 비워 둔다', few.pad >= 18,
  `padding-right ${few.pad}px`);   // 바가 설 때 글이 밀리면 안 된다

await setMemo(30);
const many = await sb();
t('넘치면 바가 선다', many.over && many.shown, `over=${many.over} shown=${many.shown} ${many.sh}/${many.ch}`);
t('네이티브 바는 숨긴다', many.native === 'none' && many.w <= 1, `${many.native} / 자리 ${many.w}px`);
t('바가 글칸 안 오른쪽에 붙는다', many.bar.r <= many.memo.r && many.memo.r - many.bar.r < 12
  && many.bar.r > many.memo.l + many.memo.w * 0.8, `바 ${Math.round(many.bar.r)} / 글칸 ${Math.round(many.memo.r)}`);
t('바가 글칸 높이를 따라간다', Math.abs(many.bar.h - many.ch) <= 2 && Math.abs(many.bar.t - many.memo.t) <= 3,
  `${Math.round(many.bar.h)} / ${many.ch}`);
t('막대 길이가 넘친 만큼 짧다', many.thumb.h < many.bar.h - 20 && many.thumb.h >= 28,
  `${Math.round(many.thumb.h)} / ${Math.round(many.bar.h)}`);
t('맨 위에서는 막대도 맨 위', Math.abs(many.thumb.t - many.bar.t) <= 1,
  `${Math.round(many.thumb.t)} / ${Math.round(many.bar.t)}`);

/* 내리면 막대도 따라 내려간다 — 어디쯤 읽고 있는지 알려 주는 것이 바의 몫이다 */
await page.evaluate(() => { const t = document.querySelector('.memo'); t.scrollTop = t.scrollHeight; });
await page.waitForTimeout(150);
const low = await sb();
t('내리면 막대가 바닥에 닿는다', Math.abs(low.thumb.b - low.bar.b) <= 1 && low.top > 0,
  `${Math.round(low.thumb.b)} / ${Math.round(low.bar.b)}`);

/* 바를 끌어서도 옮긴다 — 네이티브 바를 숨겼으니 이 바가 그 몫까지 한다 */
await page.evaluate(() => { const t = document.querySelector('.memo'); t.scrollTop = 0; });
await page.waitForTimeout(100);
const box0 = await page.evaluate(() => {
  const b = document.querySelector('.memo__sb').getBoundingClientRect();
  return { x: b.left + b.width / 2, y1: b.top + 10, y2: b.bottom - 10 };
});
await page.mouse.move(box0.x, box0.y1);
await page.mouse.down();
await page.mouse.move(box0.x, box0.y2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(150);
const drag = await sb();
t('바를 끌면 글이 따라 내려간다', drag.top > 0, `scrollTop ${Math.round(drag.top)}`);

/* 글을 쳐서 길어지는 그 자리에서 바가 서야 한다 — 다시 열어야 보이면 소용이 없다 */
await setMemo(3);
await page.click('.memo');
await page.evaluate(() => {
  const t = document.querySelector('.memo');
  t.innerHTML = Array.from({ length: 40 }, (_, i) => `${i + 1}째 줄 길어집니다`).join('<br>');
  t.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(200);
const typed2 = await sb();
t('치는 동안 바가 선다', typed2.over && typed2.shown, `over=${typed2.over} shown=${typed2.shown}`);
await page.evaluate(() => document.querySelector('.memo').blur());
await page.waitForTimeout(900);              // 밀린 저장이 끝나길 기다린 뒤에 지운다
await setMemo(0);

/* 글을 쓰는 동안 화면이 꺼지지 않게 (2026-10-15) */
await page.evaluate(() => { document.activeElement.blur(); window.__wake.length = 0; });
await page.waitForTimeout(400);
await page.evaluate(() => { window.__wake.length = 0; });
await page.click('.memo');
await page.waitForTimeout(250);
t('메모에 손을 대면 화면을 깨워 둔다', await page.evaluate(() => window.__wake.join()) === 'on:screen',
  await page.evaluate(() => window.__wake.join()));
await page.evaluate(() => document.querySelector('.memo').blur());
await page.waitForTimeout(400);
t('칸을 떠나면 바로 놓는다', await page.evaluate(() => window.__wake.join()) === 'on:screen,off',
  await page.evaluate(() => window.__wake.join()));
t('잠금을 쥔 채로 두지 않는다', await page.evaluate(() => wakeLock === null && wakeWant === false));
/* 없는 기기에서도 탈이 나면 안 된다 */
t('화면 깨우기가 없어도 그냥 넘어간다', await page.evaluate(async () => {
  const keep = navigator.wakeLock;
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
  try { await wakeOn(); await wakeOff(); } finally {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: keep }); }
  return wakeLock === null;
}));
await page.evaluate(() => { window.__wake.length = 0; closeDrawer(); });

let bad=0; for(const [n,v,x] of ok){ if(!v) bad++; console.log(`${v?'OK  ':'실패'} ${n}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close(); process.exit(bad?1:0);
