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
  return { ks, u, n: state.rows.length, pool: document.querySelector('.pie__pool').textContent,
           goal: !!document.querySelector('.pie__k--goal, .pie__k--over') };
});
t('비 3명은 모수에서 빠짐', maj.u.includes(`/ ${maj.n-3}명`), maj.u);
/* 「절반까지」 카드는 2026-09-25 에 없앴다 — 모자란 인원은 % 옆 괄호로 간다 */
t('절반까지 카드는 없다', !maj.goal);
t('모자란 인원이 % 옆 괄호에', maj.ks[0].includes(`(-${Math.ceil((maj.n-3)/2)-30}명)`), maj.ks[0]);
t('절반이 몇 명인지 카드에 적힌다', maj.ks[0].includes(`절반 ${Math.ceil((maj.n-3)/2)}명`), maj.ks[0]);
t('어디서 끌어올지 아래 줄에', maj.pool.includes('미지정') && maj.pool.includes('중·모'), maj.pool);

const over = await page.evaluate(()=>{
  state.ratings.clear();
  state.rows.forEach(p=>state.ratings.set(rKey(p),'확'));   // 전원 확 — 절반을 크게 넘는다
  render();
  const half = Math.ceil(state.rows.length/2);
  return { k: document.querySelector('.pie__k--pos').innerText.split(String.fromCharCode(10)).join(' '),
           want: state.rows.length - half };
});
t('절반을 넘으면 +N명', over.k.includes(`(+${over.want}명)`), over.k);
t('그때는 100%', over.k.includes('100%'), over.k);

// 6) 만난 적이 있으면 이름 칩 안에 초록 불
const lit = await page.evaluate(()=>{
  state.ratings.clear(); state.notes.clear();
  const v=['확','긍','중','모','부'];
  state.rows.forEach((p,i)=>{ state.ratings.set(rKey(p), v[i%5]); if(i%3===0) state.notes.set(rKey(p),{met:2,memo:''}); });
  render();
  const want = state.rows.filter(p=>getMet(p)>0).length;
  const got = document.querySelectorAll('.st-list .metlit').length;
  const a = [...document.querySelectorAll('.st-list li a')];
  const withLit = a.filter(el=>el.querySelector('.metlit'));
  const okPos = withLit.length > 0 && withLit.every(el=>
    el.lastElementChild && el.lastElementChild.classList.contains('metlit'));
  const first = a.find(el=>el.querySelector('.metlit'));
  return { want, got, okPos, title: first ? first.getAttribute('title') : '' };
});
t('만난 사람 수만큼 불이 켜짐', lit.got === lit.want, `${lit.got} / ${lit.want}`);
t('불은 이름 오른쪽 끝에', lit.okPos);
t('도움말에 만남 횟수', lit.title.includes('만남'), lit.title);
t('안 만난 사람은 불 없음', await page.evaluate(()=>[...document.querySelectorAll('.st-list li a')].filter(e=>!e.querySelector('.metlit')).length)>0);
const dots = await page.evaluate(()=>{
  state.ratings.clear(); state.notes.clear();
  const v=['확','긍','중','모','부'];
  state.rows.forEach((p,i)=>{ state.ratings.set(rKey(p), v[i%5]); state.notes.set(rKey(p),{met:i%9,memo:''}); });
  render();
  const rows = [...document.querySelectorAll('.st-list li a')].map(el=>{
    const p = state.rows.find(x=>el.getAttribute('href').endsWith(encodeURIComponent(x.slug)));
    const w = el.querySelector('.metlit');
    return { met: p?getMet(p):-1, n: w?w.querySelectorAll('b').length:0, num: w&&w.querySelector('em')?w.querySelector('em').textContent:'' };
  });
  return {
    small: rows.some(x=>x.met>0) && rows.filter(x=>x.met>0&&x.met<=5).every(x=>x.n===x.met&&!x.num),
    capped: rows.filter(x=>x.met>5).every(x=>x.n===5&&x.num===String(x.met)),
    many: rows.filter(x=>x.met>5).length,
    size: (()=>{ const b=document.querySelector('.metlit b'); return b?Math.round(b.getBoundingClientRect().width):0; })(),
  };
});
t('만난 횟수만큼 점이 찍힌다', dots.small);
t('다섯을 넘으면 점 다섯에 숫자', dots.capped && dots.many>0, `${dots.many}명`);
t('점은 전보다 작다(7px 미만)', dots.size>0 && dots.size<7, `${dots.size}px`);
const cols = await page.evaluate(()=>{
  const v=['확','긍','중','모','부','비']; state.ratings.clear(); state.notes.clear();
  state.rows.forEach((p,i)=>{ state.ratings.set(rKey(p), v[i%6]); state.notes.set(rKey(p),{met:1,memo:''}); });
  render();
  const hex = x => '#'+x.match(/\d+/g).slice(0,3).map(n=>(+n).toString(16).padStart(2,'0')).join('');
  return [...document.querySelectorAll('.st-list')].map(box=>{
    const r=box.dataset.rslist, lit=box.querySelector('.metlit b');
    return { r, got: lit?hex(getComputedStyle(lit).backgroundColor):'', want: RCOLOR[r] };
  });
});
t('불 색이 그 선호도 대표색', cols.length===6 && cols.every(c=>c.got===c.want),
  cols.map(c=>`${c.r} ${c.got}${c.got===c.want?'':'≠'+c.want}`).join(' '));

// 7) 확+긍에 공략을 더한 값 — 더하는 사람은 중·모 안의 공략뿐 (2026-10-09)
const setup = (pushEvery) => page.evaluate(n => {
  pushSet = new Set(); localStorage.removeItem('jnu-push');
  state.ratings.clear(); state.notes.clear();
  const v = ['확','긍','중','모','부','비'];
  state.rows.forEach((p,i)=>{
    if (i % 9 !== 8) setRating(rKey(p), v[i%6]);     // 아홉에 하나는 미지정으로 남긴다
    if (n && i % n === 0) pushes().add(rKey(p));
  });
  render();
}, pushEvery);
/* 화면과 따로, 집합으로 다시 세어 맞춰 본다 */
const truth = () => page.evaluate(() => {
  const inPool = p => getRating(p) !== '비';
  const base = new Set(state.rows.filter(p => ['확','긍'].includes(getRating(p))).map(rKey));
  const pu = new Set(state.rows.filter(p => isPush(p) && ['중','모'].includes(getRating(p))).map(rKey));
  const total = state.rows.filter(inPool).length;
  const union = new Set([...base, ...pu]);          // 중·모 공략은 확·긍과 겹칠 수 없다
  return { total, base: base.size, add: pu.size, union: union.size,
           dup: state.rows.filter(p => isPush(p) && ['확','긍'].includes(getRating(p))).length,
           out: state.rows.filter(p => isPush(p) && !['중','모'].includes(getRating(p))).length,
           pct: Math.round(union.size/total*100) };
});

await setup(0);
await page.waitForTimeout(500);
t('공략이 없으면 카드도 없다', await page.locator('.pie__k--push').count() === 0);

await setup(5);
await page.waitForTimeout(500);
const T = await truth();
t('공략이 있으면 카드가 생긴다', await page.locator('.pie__k--push').count() === 1);
t('확+긍에 중·모 공략만 더한 값', await page.evaluate(() =>
  document.querySelector('.pie__k--push .pie__kn').textContent.split('명')[0]) === String(T.base + T.add),
  `화면 ${await page.evaluate(() => document.querySelector('.pie__k--push .pie__kn').textContent)} / 셈 ${T.base}+${T.add}`);
t('%도 같은 기준', (await page.locator('.pie__k--push b').innerText()).startsWith(`${T.pct}%`),
  `${await page.locator('.pie__k--push b').innerText()} / ${T.pct}%`);
t('더해진 인원을 적는다', (await page.locator('.pie__k--push .pie__kn').innerText()).includes(`+${T.add}명(중·모 공략)`),
  await page.locator('.pie__k--push .pie__kn').innerText());
t('안 더한 공략이 실제로 있다', T.out > 0, `${T.out}명`);
t('줄에는 더해진 숫자만 적는다', !/나머지|겹친/.test(await page.locator('.pie__k--push .pie__kn').innerText()),
  await page.locator('.pie__k--push .pie__kn').innerText());
t('공략 카드에는 모수(/N명)를 되풀이하지 않는다', !(await page.locator('.pie__k--push .pie__kn').innerText()).includes('/'),
  await page.locator('.pie__k--push .pie__kn').innerText());
t('모수는 옆 카드에 그대로 있다', (await page.locator('.pie__k--pos .pie__kn').innerText()).includes('/'),
  await page.locator('.pie__k--pos .pie__kn').innerText());
t('도움말이 중·모 기준임을 밝힌다', (await page.getAttribute('.pie__k--push', 'title')).includes('중·모인 공략'),
  await page.getAttribute('.pie__k--push', 'title'));
t('도움말이 안 더한 까닭도 밝힌다', await page.evaluate(() => {
  const txt = document.querySelector('.pie__k--push').title;
  const n = r => state.rows.filter(p => isPush(p) && (getRating(p)||'미지정') === r).length;
  const want = [['부', n('부')], ['비참여', n('비')], ['미지정', n('미지정')]].filter(x => x[1]);
  return want.every(([r, c]) => txt.includes(`${r} ${c}명`));
}), await page.getAttribute('.pie__k--push', 'title'));

// 부·비·미지정만 공략으로 몰면 한 명도 안 더해진다
await page.evaluate(() => {
  pushSet = new Set();
  state.rows.filter(p => !['중','모'].includes(getRating(p))).forEach(p => pushes().add(rKey(p)));
  pushSave(); renderStats();
});
await page.waitForTimeout(300);
const T1 = await truth();
t('중·모가 아니면 한 명도 안 더한다', (await page.locator('.pie__k--push .pie__kn').innerText()).includes('+0명(중·모 공략)'),
  await page.locator('.pie__k--push .pie__kn').innerText());
t('그때 %는 확+긍과 같다', (await page.locator('.pie__k--push b').innerText()) === (await page.locator('.pie__k--pos b').innerText()),
  `${await page.locator('.pie__k--push b').innerText()} / ${await page.locator('.pie__k--pos b').innerText()}`);
t('부도 공략이지만 안 더한다', T1.out > 0 && T1.add === 0, JSON.stringify(T1));

// 모두 공략으로 몰아도 확+긍+중·모를 넘지 않는다
await page.evaluate(() => { state.rows.forEach(p => pushes().add(rKey(p))); pushSave(); renderStats(); });
await page.waitForTimeout(500);
const T2 = await truth();
t('전원을 공략으로 해도 100% 이하', await page.evaluate(() =>
  parseInt(document.querySelector('.pie__k--push b').textContent, 10)) <= 100,
  await page.locator('.pie__k--push b').innerText());
t('그때는 확+긍+중·모 전원', (await page.locator('.pie__k--push .pie__kn').innerText()).startsWith(`${T2.base + T2.add}명+`),
  `${await page.locator('.pie__k--push .pie__kn').innerText()} / ${T2.base}+${T2.add}`);
t('부·비·미지정은 그래도 빠져 있다', T2.base + T2.add < T2.total, `${T2.base + T2.add} < ${T2.total}`);
t('확+긍 카드는 그대로', (await page.locator('.pie__k--pos .pie__kn').innerText()).startsWith(`${T2.base}명 / ${T2.total}명`),
  await page.locator('.pie__k--pos .pie__kn').innerText());
await page.evaluate(() => { pushSet = new Set(); localStorage.removeItem('jnu-push'); });

/* 확·긍과 겹친 공략은 더하지 않는다 — 그 사실을 화면에도 적어 둔다 (2026-10-09) */
await page.evaluate(() => {
  pushSet = new Set();
  state.rows.filter(p => ['확','긍'].includes(getRating(p))).forEach(p => pushes().add(rKey(p)));
  pushSave(); renderStats();
});
t('확·긍만 공략이면 더해지는 사람이 없다',
  (await page.locator('.pie__k--push .pie__kn').innerText()).includes('+0명(중·모 공략)'),
  await page.locator('.pie__k--push .pie__kn').innerText());
t('확+긍 숫자도 그대로',
  (await page.locator('.pie__k--push b').innerText()) === (await page.locator('.pie__k--pos b').innerText()),
  (await page.locator('.pie__k--push b').innerText()) + ' / ' + (await page.locator('.pie__k--pos b').innerText()));
t('겹친 인원은 말풍선에만 적는다', await page.evaluate(() => {
  const n = state.rows.filter(p => isPush(p) && ['확','긍'].includes(getRating(p))).length;
  return document.querySelector('.pie__k--push').title.includes(`확·긍(이미 셈) ${n}명`);
}), await page.getAttribute('.pie__k--push', 'title'));
await page.evaluate(() => { pushSet = new Set(); localStorage.removeItem('jnu-push'); renderStats(); });

/* 두 줄의 생김새 — 꼬리말을 괄호로 묶는다 (2026-10-09) */
await page.evaluate(() => { pushes().add(rKey(state.rows.find(p => getRating(p) === '중'))); pushSave(); renderStats(); });
t('확+긍 줄은 「N명 / M명(절반 K명)」', /^\d+명 \/ \d+명\(절반 \d+명\)$/.test(
  (await page.locator('.pie__k--pos .pie__kn').innerText()).trim()),
  await page.locator('.pie__k--pos .pie__kn').innerText());
t('공략 줄은 「N명+K명(중·모 공략)」', /^\d+명\+\d+명\(중·모 공략\)$/.test(
  (await page.locator('.pie__k--push .pie__kn').innerText()).trim()),
  await page.locator('.pie__k--push .pie__kn').innerText());
await page.evaluate(() => { pushSet = new Set(); localStorage.removeItem('jnu-push'); renderStats(); });

/* 카드 이름은 「+공략」 한 마디로 (2026-10-09) */
await page.evaluate(() => { pushes().add(rKey(state.rows.find(p => getRating(p) === '중'))); pushSave(); renderStats(); });
t('공략 카드 이름', await page.evaluate(() =>
  (document.querySelector('.pie__k--push .pie__kl') || {}).textContent) === '+공략',
  await page.evaluate(() => (document.querySelector('.pie__k--push .pie__kl') || {}).textContent));

/* 비참여는 보라가 아니라 옅은 회색 — 겨룸에서 빠진 분이라서 (2026-10-09) */
t('비 막대가 보라가 아니다', await page.evaluate(() => {
  const [r, g, b] = (getComputedStyle(document.querySelector('.sbar__seg--na')).backgroundColor.match(/\d+/g) || []).map(Number);
  return !(b > r + 20 && b > g + 20);
}), await page.evaluate(() => getComputedStyle(document.querySelector('.sbar__seg--na')).backgroundColor));
t('비 막대가 옅은 회색', await page.evaluate(() => {
  const [r, g, b] = (getComputedStyle(document.querySelector('.sbar__seg--na')).backgroundColor.match(/\d+/g) || []).map(Number);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max - min <= 20 && min >= 170;      // 색기 없이, 밝게
}), await page.evaluate(() => getComputedStyle(document.querySelector('.sbar__seg--na')).backgroundColor));
t('모(회색)보다 옅다', await page.evaluate(() => {
  const g = s => (getComputedStyle(document.querySelector(s)).backgroundColor.match(/\d+/g) || []).map(Number)[0];
  return g('.sbar__seg--na') > g('.sbar__seg--low') + 40;
}), await page.evaluate(() => [...document.querySelectorAll('.sbar__seg--na,.sbar__seg--low')].slice(0,2)
  .map(e => getComputedStyle(e).backgroundColor).join(' / ')));
t('옅은 바탕이라 숫자는 어둡게', await page.evaluate(() => {
  const d = document.createElement('canvas'); d.width = d.height = 1;
  const x = d.getContext('2d');
  const px = c => { x.fillStyle = '#fff'; x.fillRect(0,0,1,1); x.fillStyle = c; x.fillRect(0,0,1,1);
    return [...x.getImageData(0,0,1,1).data].slice(0,3); };
  const L = ([r,g,b]) => { const f = v => { v /= 255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); };
    return .2126*f(r) + .7152*f(g) + .0722*f(b); };
  const cs = getComputedStyle(document.querySelector('.sbar__seg--na'));
  const a = L(px(cs.color)), b = L(px(cs.backgroundColor));
  return (Math.max(a,b) + .05) / (Math.min(a,b) + .05) >= 4.5;
}), await page.evaluate(() => getComputedStyle(document.querySelector('.sbar__seg--na')).color));
t('범례 네모도 같은 회색', await page.evaluate(() => {
  const a = getComputedStyle(document.querySelector('.stats .sw--na')).backgroundColor;
  const b = getComputedStyle(document.querySelector('.sbar__seg--na')).backgroundColor;
  return a === b;
}), await page.evaluate(() => getComputedStyle(document.querySelector('.stats .sw--na')).backgroundColor));

/* 맨 위 뜻풀이 — 한 글자는 빼고 뜻만, '비'는 「비참여」 (2026-10-09) */
t('뜻만 적는다', await page.evaluate(() => [...document.querySelectorAll('.legend--names .legend__i')]
  .map(e => e.textContent.trim()).join('|')) === '확실|긍정|보통|모름|부정|비참여',
  await page.evaluate(() => [...document.querySelectorAll('.legend--names .legend__i')].map(e => e.textContent.trim()).join('|')));
t('한 글자를 앞에 달지 않는다', await page.evaluate(() =>
  !document.querySelector('.legend--names b')));
t('인원수를 적지 않는다', await page.evaluate(() =>
  !/\d/.test(document.querySelector('.legend--names').textContent)));

/* 지운 안내 문구와 단추 이름 (2026-10-09) */
t('학과별 분포에 설명 줄이 없다', await page.evaluate(() => {
  const h = [...document.querySelectorAll('.st-head')].find(x => /학과별 분포/.test(x.textContent));
  return !!h && !/마대의 구간/.test(h.textContent);
}));
t('단추는 「공략 설정」', (await page.locator('#pushPick').innerText()).trim() === '공략 설정',
  await page.locator('#pushPick').innerText());
await page.click('#pushPick');
t('켜지면 「설정 끝내기」', (await page.locator('#pushPick').innerText()).trim() === '설정 끝내기',
  await page.locator('#pushPick').innerText());
await page.click('#pushPick');

let bad=0; for(const [n,v,x] of ok){ if(!v) bad++; console.log(`${v?'OK  ':'실패'} ${n}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close(); process.exit(bad?1:0);
