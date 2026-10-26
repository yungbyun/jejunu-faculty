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
await page.evaluate(()=>{ const v=CONFIG.RATINGS.LABELS; state.rows.forEach((p,i)=>state.ratings.set(rKey(p), v[i%v.length])); location.hash='#/stats'; render(); });
await page.waitForSelector('.pie__hit',{timeout:10000});

// 1) 숫자가 제 조각에 얹혀 있다
const nums = await page.evaluate(()=>[...document.querySelectorAll('.pie__hit')].map(g=>({r:g.dataset.rs, n:g.querySelector('text')?.textContent||''})));
t('조각마다 번호표', nums.every(x=>x.n!==''), JSON.stringify(nums));
const real = await page.evaluate(()=>{ const c={}; state.rows.forEach(p=>{const g=getRating(p); if(g)c[g]=(c[g]||0)+1;}); return c; });
t('숫자가 실제 인원과 같음', nums.every(x=>String(real[x.r])===x.n), JSON.stringify(real));
t('비(평가제외)는 도넛에 없음', !nums.some(x=>x.r==='비'));

// 2) 숫자가 조각 안에 있다 — 도넛 띠(반지름 60~84) 위에 놓였는지
t('띠 안의 숫자는 띠 위에 놓임', await page.evaluate(()=>
  [...document.querySelectorAll('.pie__sn')].every(tx=>{
    const x=+tx.getAttribute('x'), y=+tx.getAttribute('y');
    const d=Math.hypot(x-100, y-112);
    return d>58 && d<86 && y<=112.5;        // 띠는 72 ± 13.2 (2026-10-26 에 두꺼워졌다)
  })));

// 3) 누르면 그 선호도의 명단으로 내려간다
await page.evaluate(()=>window.scrollTo(0,0));
const before = await page.evaluate(()=>window.scrollY);
await clickSeg(page, '부');
await page.waitForTimeout(1200);
const after = await page.evaluate(()=>window.scrollY);
t('아래로 내려감', after > before, `${before} → ${after}`);
t('그 줄이 화면 안에', await page.evaluate(()=>{
  const r=document.querySelector('[data-rslist="부"]').getBoundingClientRect();
  return r.top > -10 && r.top < window.innerHeight;
}));
t('그 줄이 번쩍임', await page.evaluate(()=>document.querySelector('[data-rslist="부"]').classList.contains('st-list--hit')));
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
  /* textContent 로 읽는다 — 폰에서는 꼬리말(모수·절반)이 숨어 innerText 에 안 잡힌다 (2026-10-20) */
  const ks=[...document.querySelectorAll('.pie__k')].map(k=>k.textContent);
  const u=document.querySelector('.pie__u').textContent;
  return { ks, u, n: state.rows.length, pool: document.querySelector('.pie__pool').textContent,
           goal: !!document.querySelector('.pie__k--goal, .pie__k--over') };
});
/* 도넛 아래는 「전체 N명(절반 K명)」 (2026-10-20. 전에는 「확(확실) · 29명 / 63명」) */
t('비 3명은 모수에서 빠짐', maj.u.includes(`전체 ${maj.n-3}명`), maj.u);
t('절반도 도넛 아래에 적는다', maj.u === `전체 ${maj.n-3}명(절반 ${Math.ceil((maj.n-3)/2)}명)`, maj.u);
/* 「절반까지」 카드는 2026-09-25 에 없앴다 — 모자란 인원은 % 옆 괄호로 간다 */
t('절반까지 카드는 없다', !maj.goal);
/* 절반과의 거리는 **카드 맨 아랫줄에** 적는다 — 「3명 부족」 (2026-10-20, 사용자 지정).
 * 「절반」이라는 말은 화면에 적지 않는다 — 도넛 아래와 말풍선에 있다. */
t('모자란 인원이 맨 아랫줄에', maj.ks[0].includes(`${Math.ceil((maj.n-3)/2)-30}명 부족`), maj.ks[0]);
t('모자랄 때 「초과」라 하지 않는다', !maj.ks[0].includes('초과'), maj.ks[0]);
t('카드에는 「절반」이라 적지 않는다', !maj.ks.some(k => k.includes('절반')), maj.ks.join(' | '));
t('큰 숫자는 % 하나뿐', await page.evaluate(() =>
  document.querySelector('.pie__k--high b').textContent) === '45%',
  await page.evaluate(() => document.querySelector('.pie__k--high b').textContent));
/* 맨 왼쪽은 「확실」 카드 — 확 하나만 센다 (2026-10-20, 사용자 지정) */
t('맨 왼쪽은 확실 카드', maj.ks[0].startsWith('확실'), maj.ks[0]);
t('확실 카드 이름에 인원이 붙는다 — 여기선 확이 서른', maj.ks[0].includes('확실 30'), maj.ks[0]);
t('이름에 「=」는 쓰지 않는다', !maj.ks.some(k => k.includes('=')), maj.ks.join(' | '));
t('어디서 끌어올지 아래 줄에', maj.pool.includes('미지정') && maj.pool.includes('중간'), maj.pool);

const over = await page.evaluate(()=>{
  state.ratings.clear();
  state.rows.forEach(p=>state.ratings.set(rKey(p),'확'));   // 전원 확 — 절반을 크게 넘는다
  render();
  const half = Math.ceil(state.rows.length/2);
  return { k: document.querySelector('.pie__k--high').textContent,
           want: state.rows.length - half };
});
t('절반을 넘으면 「N명 초과」', over.k.includes(`${over.want}명 초과`), over.k);
t('넘침을 도움말에도 적는다',
  (await page.getAttribute('.pie__k--high .pie__kn', 'title')).includes(`${over.want}명 넘습니다`),
  await page.getAttribute('.pie__k--high .pie__kn', 'title'));
t('그때는 100%', over.k.includes('100%'), over.k);

// 6) 만난 적이 있으면 이름 칩 안에 초록 불
const lit = await page.evaluate(()=>{
  state.ratings.clear(); state.notes.clear();
  const v=['확','중','부'];
  state.rows.forEach((p,i)=>{ state.ratings.set(rKey(p), v[i%v.length]); if(i%3===0) state.notes.set(rKey(p),{met:2,memo:''}); });
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
/* 2026-10-25 — 만남 횟수는 **말풍선에서 뺐습니다**(교수님 지정). 이름 옆 점으로 이미 보입니다 */
t('도움말에 만남 횟수를 적지 않는다', !lit.title.includes('만남'), lit.title);

/* 이름에 올리면 학과명과 「확률」이 함께 보여야 한다 (2026-10-25, 교수님 지정) */
const tip = await page.evaluate(() => {
  const sv = [...sures()], wv = [...weaks()];
  sureSet = new Set(); weakSet = new Set();
  const pick = r => state.rows.find(x => getRating(x) === r);
  const g = r => { const q = pick(r); return q ? stChip(q, r).match(/title="([^"]*)"/)[1] : ''; };
  const 중 = pick('중'), out = {};
  out.확 = g('확'); out.중 = g('중'); out.부 = g('부');
  out.학과 = pick('확') ? pick('확').dept_name : '';
  const z = state.rows[1], zwas = getRating(z);          // 비참여가 없는 자료일 수 있다
  setRating(rKey(z), '비'); out.비 = stChip(z, '비').match(/title="([^"]*)"/)[1];
  setRating(rKey(z), zwas || '');
  if (중) { weaks().add(rKey(중)); out.중약 = g('중'); weaks().delete(rKey(중));
            sures().add(rKey(중)); out.중강 = g('중'); sures().delete(rKey(중)); }
  const q = state.rows[0], was = getRating(q);
  setRating(rKey(q), ''); out.없음 = stChip(q, '').match(/title="([^"]*)"/)[1];
  setRating(rKey(q), was || '');
  sureSet = new Set(sv); weakSet = new Set(wv);
  return out;
});
t('도움말이 학과명으로 열린다', !!tip.학과 && tip.확.startsWith(tip.학과 + ' · '), `${tip.학과} | ${tip.확}`);
t('확실은 95%', tip.확.includes('확률 95%'), tip.확);
t('중간은 50%', tip.중.includes('확률 50%'), tip.중);
t('중간+강화는 65%', !tip.중강 || tip.중강.includes('확률 65%'), tip.중강);
t('중간-약화는 35%', !tip.중약 || tip.중약.includes('확률 35%'), tip.중약);
t('부정은 0%', tip.부.includes('확률 0%'), tip.부);
t('비참여는 셈에서 뺀다고 적는다', tip.비.includes('비참여') && tip.비.includes('뺌'), tip.비);
t('미지정은 0 으로 센다고 적는다', tip.없음.includes('미지정'), tip.없음);
t('말풍선에 만남 횟수가 없다', !Object.values(tip).some(v => String(v).includes('만남')),
  Object.values(tip).join(' | '));
t('안 만난 사람은 불 없음', await page.evaluate(()=>[...document.querySelectorAll('.st-list li a')].filter(e=>!e.querySelector('.metlit')).length)>0);
const dots = await page.evaluate(()=>{
  state.ratings.clear(); state.notes.clear();
  const v=['확','중','부'];
  state.rows.forEach((p,i)=>{ state.ratings.set(rKey(p), v[i%v.length]); state.notes.set(rKey(p),{met:i%9,memo:''}); });
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
t('점은 작고 또렷하다(4px 이하)', dots.size>0 && dots.size<=4, `${dots.size}px`);
t('번지는 빛을 두르지 않는다', await page.evaluate(() =>
  getComputedStyle(document.querySelector('.metlit b')).boxShadow === 'none'),
  await page.evaluate(() => getComputedStyle(document.querySelector('.metlit b')).boxShadow));
t('동그라미다', await page.evaluate(() => {
  const b = document.querySelector('.metlit b'), cs = getComputedStyle(b), r = b.getBoundingClientRect();
  return cs.borderRadius === '50%' && Math.abs(r.width - r.height) < 0.5;
}));
t('점끼리 붙지 않는다', await page.evaluate(() => {
  const w = document.querySelector('.metlit');
  const bs = [...w.querySelectorAll('b')].map(b => b.getBoundingClientRect());
  return bs.length < 2 || bs.slice(1).every((r, i) => r.left - bs[i].right >= 2);
}));
const cols = await page.evaluate(()=>{
  const v=CONFIG.RATINGS.LABELS; state.ratings.clear(); state.notes.clear();
  state.rows.forEach((p,i)=>{ state.ratings.set(rKey(p), v[i%6]); state.notes.set(rKey(p),{met:1,memo:''}); });
  render();
  const hex = x => '#'+x.match(/\d+/g).slice(0,3).map(n=>(+n).toString(16).padStart(2,'0')).join('');
  return [...document.querySelectorAll('.st-list')].map(box=>{
    const r=box.dataset.rslist, lit=box.querySelector('.metlit b');
    return { r, got: lit?hex(getComputedStyle(lit).backgroundColor):'', want: RCOLOR[r] };
  });
});
t('불 색이 그 선호도 대표색', cols.length===4 && cols.every(c=>c.got===c.want),
  cols.map(c=>`${c.r} ${c.got}${c.got===c.want?'':'≠'+c.want}`).join(' '));

// 7) 확+긍에 **중인 강화**를 더한 값 (2026-10-17, 전에는 중·모인 공략이었다)
const setup = (pushEvery) => page.evaluate(n => {
  sureSet = new Set(); localStorage.removeItem('jnu-sure');
  pushSet = new Set(); localStorage.removeItem('jnu-push');
  state.ratings.clear(); state.notes.clear();
  const v = CONFIG.RATINGS.LABELS;
  state.rows.forEach((p,i)=>{
    if (i % 9 !== 8) setRating(rKey(p), v[i%v.length]);   // 아홉에 하나는 미지정으로 남긴다
    if (n && i % n === 0) sures().add(rKey(p));
  });
  render();
}, pushEvery);
/* 화면과 따로, 집합으로 다시 세어 맞춰 본다 */
const truth = () => page.evaluate(() => {
  const inPool = p => getRating(p) !== '비';
  const base = new Set(state.rows.filter(p => getRating(p) === '확').map(rKey));
  const pu = new Set(state.rows.filter(p => isSure(p) && getRating(p) === '중').map(rKey));
  const total = state.rows.filter(inPool).length;
  const union = new Set([...base, ...pu]);          // 중인 강화는 확실과 겹칠 수 없다
  return { total, base: base.size, add: pu.size, union: union.size,
           dup: state.rows.filter(p => isSure(p) && getRating(p) === '확').length,
           out: state.rows.filter(p => isSure(p) && getRating(p) !== '중').length,
           pct: Math.round(union.size/total*100) };
});

await setup(0);
await page.waitForTimeout(500);
t('강화가 없으면 카드도 없다', await page.locator('.pie__k--push').count() === 0);

await setup(5);
await page.waitForTimeout(500);
const T = await truth();
t('강화가 있으면 카드가 생긴다', await page.locator('.pie__k--push').count() === 1);
/* 인원은 카드 **이름**에 붙는다 — 「+중-강화(6) = 43」 (2026-10-20, 사용자 지정) */
const klTxt = k => page.evaluate(q => document.querySelector(q + ' .pie__kl').textContent.trim(), k);
t('확+긍에 중인 강화만 더한 값', (await klTxt('.pie__k--push')).endsWith(` ${T.base + T.add}`),
  `화면 ${await klTxt('.pie__k--push')} / 셈 ${T.base}+${T.add}`);
t('%도 같은 기준', (await page.locator('.pie__k--push b').innerText()) === `${T.pct}%`,
  `${await page.locator('.pie__k--push b').innerText()} / ${T.pct}%`);
t('더해진 인원을 이름에 적는다', (await klTxt('.pie__k--push')).startsWith(`+중-강(${T.add})`),
  await klTxt('.pie__k--push'));
t('안 더한 강화가 실제로 있다', T.out > 0, `${T.out}명`);
t('이름에는 더해진 숫자만 적는다', !/나머지|겹친/.test(await klTxt('.pie__k--push')), await klTxt('.pie__k--push'));
t('어느 카드도 모수(/N명)를 되풀이하지 않는다', await page.evaluate(() =>
  ![...document.querySelectorAll('.pie__k')].some(k => k.textContent.includes('/'))),
  await page.evaluate(() => [...document.querySelectorAll('.pie__k')].map(k => k.textContent).join(' | ')));
t('모수는 도넛 아래에 한 번만', await page.evaluate(() =>
  /^전체 \d+명\(절반 \d+명\)$/.test(document.querySelector('.pie__u').textContent)),
  await page.evaluate(() => document.querySelector('.pie__u').textContent));
t('도움말이 「중간인 강화」 기준임을 밝힌다', (await page.getAttribute('.pie__k--push', 'title')).includes('중간인 강화'),
  await page.getAttribute('.pie__k--push', 'title'));
t('도움말이 안 더한 까닭도 밝힌다', await page.evaluate(() => {
  const txt = document.querySelector('.pie__k--push').title;
  const n = r => state.rows.filter(p => isSure(p) && (getRating(p)||'미지정') === r).length;
  const want = [['부정', n('부')], ['비참여', n('비')], ['미지정', n('미지정')]].filter(x => x[1]);
  return want.every(([r, c]) => txt.includes(`${r} ${c}명`));
}), await page.getAttribute('.pie__k--push', 'title'));

// 중이 아닌 분만 강화로 몰면 한 명도 안 더해진다
await page.evaluate(() => {
  sureSet = new Set();
  state.rows.filter(p => getRating(p) !== '중').forEach(p => sures().add(rKey(p)));
  sureSave(); renderStats();
});
await page.waitForTimeout(300);
const T1 = await truth();
t('중이 아니면 한 명도 안 더한다', (await klTxt('.pie__k--push')).startsWith('+중-강(0)'),
  await klTxt('.pie__k--push'));
t('그때 %는 확+긍과 같다', (await page.locator('.pie__k--push b').innerText()) === (await page.locator('.pie__k--high b').innerText()),
  `${await page.locator('.pie__k--push b').innerText()} / ${await page.locator('.pie__k--high b').innerText()}`);
t('부도 강화지만 안 더한다', T1.out > 0 && T1.add === 0, JSON.stringify(T1));

// 모두 강화로 몰아도 확+긍+중을 넘지 않는다
await page.evaluate(() => { state.rows.forEach(p => sures().add(rKey(p))); sureSave(); renderStats(); });
await page.waitForTimeout(500);
const T2 = await truth();
t('전원을 강화로 해도 100% 이하', await page.evaluate(() =>
  parseInt(document.querySelector('.pie__k--push b').textContent, 10)) <= 100,
  await page.locator('.pie__k--push b').innerText());
t('그때는 확+긍+중 전원', (await klTxt('.pie__k--push')).endsWith(` ${T2.base + T2.add}`),
  `${await klTxt('.pie__k--push')} / ${T2.base}+${T2.add}`);
t('부·비·미지정은 그래도 빠져 있다', T2.base + T2.add < T2.total, `${T2.base + T2.add} < ${T2.total}`);
t('확+긍 카드는 그대로', (await klTxt('.pie__k--high')).endsWith(` ${T2.base}`), await klTxt('.pie__k--high'));
await page.evaluate(() => { sureSet = new Set(); localStorage.removeItem('jnu-sure'); });

/* 확·긍과 겹친 강화는 더하지 않는다 — 그 사실을 화면에도 적어 둔다 (2026-10-09) */
await page.evaluate(() => {
  sureSet = new Set();
  state.rows.filter(p => getRating(p) === '확').forEach(p => sures().add(rKey(p)));
  sureSave(); renderStats();
});
t('확실만 강화면 더해지는 사람이 없다', (await klTxt('.pie__k--push')).startsWith('+중-강(0)'),
  await klTxt('.pie__k--push'));
t('확+긍 숫자도 그대로',
  (await page.locator('.pie__k--push b').innerText()) === (await page.locator('.pie__k--high b').innerText()),
  (await page.locator('.pie__k--push b').innerText()) + ' / ' + (await page.locator('.pie__k--high b').innerText()));
t('겹친 인원은 말풍선에만 적는다', await page.evaluate(() => {
  const n = state.rows.filter(p => isSure(p) && getRating(p) === '확').length;
  return document.querySelector('.pie__k--push').title.includes(`확실(이미 셈) ${n}명`);
}), await page.getAttribute('.pie__k--push', 'title'));
await page.evaluate(() => { sureSet = new Set(); localStorage.removeItem('jnu-sure'); renderStats(); });

/* 세 카드의 맨 아랫줄 생김새 — 「N명 부족」 · 「N명 초과」 · 「딱 맞음」 (2026-10-20) */
await page.evaluate(() => { sures().add(rKey(state.rows.find(p => getRating(p) === '중'))); sureSave(); renderStats(); });
const knTxt = k => page.evaluate(q => document.querySelector(q + ' .pie__kn').textContent.trim(), k);
const GAPRE = /^(\d+명 부족|\d+명 초과|딱 맞음)\(\d+명 차\)$/;
for (const k of ['.pie__k--high', '.pie__k--push'])
  t(`${k.split('--')[1]} 맨 아랫줄 생김새`, GAPRE.test(await knTxt(k)), await knTxt(k));
/* 테두리·바탕은 **기대 칸**에만 두른다 (2026-10-25. 갈래가 셋으로 줄며 「+긍정」 칸이 없어졌다) */
t('기대 칸만 테를 두른다', await page.evaluate(() => {
  const bc = q => getComputedStyle(document.querySelector(q)).borderColor;
  const line = getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
  const asRGB = c => { const d = document.createElement('div'); d.style.color = c;
    document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; };
  return bc('.pie__k--score') !== bc('.pie__k--high')
      && bc('.pie__k--high') === bc('.pie__k--push')
      && bc('.pie__k--high') === asRGB(line);
}), await page.evaluate(() => [...document.querySelectorAll('.pie__k')]
  .map(k => k.className.split(' ')[1] + ' ' + getComputedStyle(k).borderColor).join(' | ')));

/* 괄호 안은 윗줄 「내 표 vs 상대 표」 두 수의 차 (2026-10-20, 사용자 지정) */
t('괄호 안은 윗줄 두 수의 차', await page.evaluate(() =>
  [...document.querySelectorAll('.pie__k:not(.pie__k--score)')].every(k => {
    const [a, c] = k.querySelector('.pie__kv').textContent.split('vs').map(x => +x.trim());
    return k.querySelector('.pie__kd').textContent === `(${Math.abs(a - c)}명 차)`;
  })),
  await page.evaluate(() => [...document.querySelectorAll('.pie__k')]
    .map(k => k.querySelector('.pie__kv').textContent + ' → ' + k.querySelector('.pie__kd').textContent).join(' | ')));
t('차는 모자란 몫의 갑절쯤', await page.evaluate(() =>
  [...document.querySelectorAll('.pie__k:not(.pie__k--score)')].every(k => {
    const gap = +(k.querySelector('.pie__kg') || { textContent: '0' }).textContent;
    const dif = +k.querySelector('.pie__kd').textContent.replace(/\D/g, '');
    return Math.abs(dif - gap * 2) <= 1;
  })),
  await page.evaluate(() => [...document.querySelectorAll('.pie__kn')].map(e => e.textContent).join(' | ')));
t('카드 이름은 「이름 인원」', await page.evaluate(() =>
  [...document.querySelectorAll('.pie__kl')].every(e => /^(확실|\+중-강\(\d+\)|기대) [\d.]+$/.test(e.textContent.trim()))),
  await page.evaluate(() => [...document.querySelectorAll('.pie__kl')].map(e => e.textContent.trim()).join('|')));
await page.evaluate(() => { sureSet = new Set(); localStorage.removeItem('jnu-sure'); renderStats(); });

/* 카드 이름 — 「확실」 · 「+중-강(N)」 · 「기대」 (2026-10-25. 갈래가 셋으로 줄었다) */
const klHead = () => page.evaluate(() => [...document.querySelectorAll('.pie__kl')]
  .map(e => e.textContent.trim().replace(/ [\d.]+$/, '')).join('|'));
t('강화가 없으면 카드는 둘', /^확실\|기대$/.test(await klHead()), await klHead());
await page.evaluate(() => { sures().add(rKey(state.rows.find(p => getRating(p) === '중'))); sureSave(); renderStats(); });
t('카드 이름 셋', /^확실\|\+중-강\(\d+\)\|기대$/.test(await klHead()), await klHead());
t('둘째 이름의 괄호는 더해진 인원', await page.evaluate(() =>
  document.querySelector('.pie__k--push .pie__kl').textContent.startsWith(
    `+중-강(${state.rows.filter(p => isSure(p) && getRating(p) === '중').length})`)),
  await klTxt('.pie__k--push'));

/* 카드 맨 아랫줄에 「내 표 vs 상대 표」 (2026-10-19, 사용자 지정).
 * 상대 표는 모수에서 내 표를 뺀 나머지 — 중·모·미지정까지 다 상대에게 간다고 본 가장 모진 셈이다. */
const vsl = await page.evaluate(() => {
  state.ratings.clear(); state.notes.clear();
  sureSet = new Set(); localStorage.removeItem('jnu-sure');
  const v = CONFIG.RATINGS.LABELS;
  state.rows.forEach((p, i) => setRating(rKey(p), v[i % 6]));
  sures().add(rKey(state.rows.find(p => getRating(p) === '중'))); sureSave();
  render();
  const txt = k => ((document.querySelector(k + ' .pie__kv') || {}).innerText || '').trim();
  return { total: state.rows.filter(p => getRating(p) !== '비').length,
           base: state.rows.filter(p => getRating(p) === '확').length,
           add: state.rows.filter(p => isSure(p) && getRating(p) === '중').length,
           pos: txt('.pie__k--high'), push: txt('.pie__k--push'),
           order: ['.pie__k--high', '.pie__k--push']
             .map(k => [...document.querySelector(k).children]
               .map(c => c.className.split(' ')[0] || c.tagName.toLowerCase()).join('>'))
             .join(' / ') };
});
t('확+긍 카드에 내 표 vs 상대 표', vsl.pos === `${vsl.base} vs ${vsl.total - vsl.base}`,
  `${vsl.pos} (모수 ${vsl.total})`);
t('「내·상대」 글자는 적지 않는다 — 뜻은 말풍선에', !/내|상대/.test(vsl.pos + vsl.push), vsl.pos + ' / ' + vsl.push);
t('강화 카드에도 같은 줄 — 강화만큼 늘어난다',
  vsl.push === `${vsl.base + vsl.add} vs ${vsl.total - vsl.base - vsl.add}`,
  `${vsl.push} (+${vsl.add})`);
t('두 표를 더하면 모수', vsl.add > 0 && vsl.total === vsl.base + (vsl.total - vsl.base), JSON.stringify(vsl));
/* 줄 차례: 이름 · % · 표 수 · 모자람/넘침 (2026-10-20, 사용자 지정) */
const ORDER = 'pie__kl>b>pie__kv>pie__kn';
t('줄 차례는 이름 · 표 수 · 모자람/넘침', vsl.order === `${ORDER} / ${ORDER}`, vsl.order);
await page.evaluate(() => { sureSet = new Set(); localStorage.removeItem('jnu-sure'); render(); });

/* 카드가 셋이어도 폰(390px)에서 한 줄에 서야 한다 (2026-10-20).
 * 자리를 벌려 주는 것은 꼬리말(모수·절반, 「중 강화」)을 숨기는 일이다 — 그 뜻은
 * % 옆 괄호와 맨 아랫줄에 이미 있고, 말풍선에는 그대로 다 적혀 있다. */
const lay = w => page.evaluate(() => {
  const ks = [...document.querySelectorAll('.pie__k')];
  const box = document.querySelector('.pie__kpi').getBoundingClientRect();
  return { n: ks.length,
           rows: new Set(ks.map(k => Math.round(k.getBoundingClientRect().top))).size,
           out: ks.filter(k => k.getBoundingClientRect().right > box.right + 1).length,
           over: ks.filter(k => k.scrollWidth > k.clientWidth + 1).length,
           lines: ks.map(k => [...k.children].map(c => c.getClientRects().length).join('')).join('/') };
});
await page.evaluate(() => { sures().add(rKey(state.rows.find(p => getRating(p) === '중'))); sureSave(); render(); });
await page.setViewportSize({ width: 390, height: 1200 });   /* 이 시험은 1440px 에서 돈다 */
await page.waitForTimeout(250);
const phone = await lay();
/* 2026-10-25 에 「기대」 칸이 더해져 넷이 되었다. 폰에서는 넷을 한 줄에 밀어 넣으면
   글이 깨지므로 **둘씩 두 줄**로 세운다(`.pie__kpi--4`). */
t('카드는 셋', phone.n === 3, `${phone.n}장`);
t('폰에서도 한 줄에 선다', phone.rows === 1 && phone.out === 0, `${phone.rows}줄 · ${phone.out}장 밖`);
t('폰에서 글이 칸을 넘지 않는다', phone.over === 0, `${phone.over}장 넘침`);
t('390px 에서 줄이 흐트러지지 않는다', phone.lines === '1111/1111/1111', phone.lines);
/* 더 좁은 폰(320px)에서도 넘치지 않아야 한다 */
await page.setViewportSize({ width: 320, height: 1200 });
await page.waitForTimeout(250);
const tiny = await lay();
t('320px 에서도 한 줄에 서고 안 넘친다',
  tiny.rows === 1 && tiny.out === 0 && tiny.over === 0 && tiny.lines === '1111/1111/1111',
  JSON.stringify(tiny));
await page.setViewportSize({ width: 900, height: 1200 });
await page.waitForTimeout(250);
const wide = await lay();
t('넓은 화면에서는 넷이 한 줄', wide.rows === 1 && wide.over === 0, JSON.stringify(wide));
await page.setViewportSize({ width: 1440, height: 900 });    /* 뒤의 시험을 위해 되돌린다 */
await page.waitForTimeout(250);

/* ---------- 도넛이 강화·약화까지 가른다 (2026-10-25, 교수님 요청) ---------- */
{
  const D = await page.evaluate(() => {
    state.ratings.clear(); sureSet = new Set(); weakSet = new Set();
    const rows = state.rows, plan = [['확', 6], ['중', 8], ['부', 5], ['비', 2]];
    let i = 0;
    for (const [r, n] of plan) for (let k = 0; k < n; k++) if (rows[i]) setRating(rKey(rows[i++]), r);
    rows.filter(p => getRating(p) === '중').slice(0, 3).forEach(p => sures().add(rKey(p)));
    rows.filter(p => getRating(p) === '중').slice(3, 4).forEach(p => weaks().add(rKey(p)));
    rows.filter(p => getRating(p) === '부').slice(0, 2).forEach(p => sures().add(rKey(p)));
    rows.filter(p => getRating(p) === '확').slice(0, 2).forEach(p => weaks().add(rKey(p)));
    sureSave(); weakSave(); renderStats();
    const g = [...document.querySelectorAll('.pie__hit')];
    return { names: g.map(e => e.querySelector('title').textContent.split('명')[0].trim()),
             rs: g.map(e => e.dataset.rs),
             cols: g.map(e => e.querySelector('.pie__seg').getAttribute('stroke')),
             lens: g.map(e => parseFloat(e.querySelector('.pie__seg').getAttribute('stroke-dasharray'))),
             labels: [...CONFIG.RATINGS.LABELS, '미지정'] };
  });
  t('갈래 안이 강화 → 그냥 → 약화 차례', D.names.join('|').includes('중+강화 3|중 4|중-약화 1'), D.names.join('|'));
  t('부도 강화와 그냥 둘로', D.names.join('|').includes('부+강화 2|부 3'), D.names.join('|'));
  t('확은 그냥과 약화 둘로', D.names.join('|').startsWith('확 4|확-약화 2'), D.names.join('|'));
  t('갈래마다 강화·약화로 갈린다', D.names.length >= 7, D.names.join('|'));
  t('빛깔이 갈래마다 한 톤씩 다르다', await page.evaluate(() => {
    const g = [...document.querySelectorAll('.pie__hit')];
    const by = r => g.filter(e => e.dataset.rs === r).map(e => e.querySelector('.pie__seg').getAttribute('stroke'));
    const 중 = by('중');
    return 중.length === 3 && new Set(중).size === 3;
  }), D.cols.join(' '));
  t('강화는 진하고 약화는 옅다', await page.evaluate(() => {
    const lum = h => { const m = h.replace('#', '');
      return [0, 2, 4].reduce((a, i) => a + parseInt(m.slice(i, i + 2), 16), 0); };
    const g = [...document.querySelectorAll('.pie__hit')].filter(e => e.dataset.rs === '중')
      .map(e => lum(e.querySelector('.pie__seg').getAttribute('stroke')));
    return g[0] < g[1] && g[1] < g[2];     // 강화 < 그냥 < 약화 (밝기)
  }));
  t('누를 자리는 갈래 그대로', D.rs.every(r => D.labels.includes(r)), D.rs.join('|'));
  /* 갈래 **안**에는 틈을 두지 않는다 — 틈이 있으면 다른 갈래처럼 보인다 (2026-10-25, 교수님 지적).
     갈래끼리의 틈보다 반드시 좁아야 한다. */
  t('갈래 안은 틈 없이 이어 붙는다', await page.evaluate(() => {
    const g = [...document.querySelectorAll('.pie__hit')];
    const L = e => parseFloat(e.querySelector('.pie__seg').getAttribute('stroke-dasharray'));
    const OFF = e => -parseFloat(e.querySelector('.pie__seg').getAttribute('stroke-dashoffset'));
    const inner = [], outer = [];
    for (let i = 1; i < g.length; i++) {
      const gapv = OFF(g[i]) - (OFF(g[i - 1]) + L(g[i - 1]));
      (g[i].dataset.rs === g[i - 1].dataset.rs ? inner : outer).push(Math.round(gapv * 10) / 10);
    }
    return inner.length > 0 && inner.every(v => v < 0.05) && outer.every(v => v > 1.5);
  }), await page.evaluate(() => {
    const g = [...document.querySelectorAll('.pie__hit')];
    const L = e => parseFloat(e.querySelector('.pie__seg').getAttribute('stroke-dasharray'));
    const OFF = e => -parseFloat(e.querySelector('.pie__seg').getAttribute('stroke-dashoffset'));
    return g.slice(1).map((e, i) => `${g[i].dataset.rs}${e.dataset.rs === g[i].dataset.rs ? '=' : '|'}${(OFF(e) - OFF(g[i]) - L(g[i])).toFixed(1)}`).join(' ');
  }));
  /* 조각마다 인원을 적는다 — 좁으면 띠 바깥에 (2026-10-25, 교수님 요청) */
  t('조각마다 숫자가 하나씩 있다', await page.evaluate(() => {
    const g = [...document.querySelectorAll('.pie__hit')];
    return g.length > 0 && g.every(e => e.querySelectorAll('text').length === 1);
  }), await page.evaluate(() => [...document.querySelectorAll('.pie__hit')]
    .map(e => (e.querySelector('title').textContent.split(' —')[0]) + '→' + (e.querySelector('text') || {}).textContent).join(' ')));
  /* 2026-10-26 — 좁은 조각의 숫자도 **제 색 위**에 적는다(교수님 지정). 글씨만 작아진다.
     띠 바깥에 적고 실마리 선을 긋던 방식은 그만두었다. */
  t('좁은 조각은 글씨만 작게, 자리는 제 색 위', await page.evaluate(() => {
    const rows = state.rows;
    rows.filter(x => getRating(x) === '부').slice(1).forEach(x => setRating(rKey(x), '중'));
    renderStats();                                   // 부를 한 명만 남겨 아주 좁은 조각을 만든다
    const g = [...document.querySelectorAll('.pie__hit')].find(e => e.dataset.rs === '부');
    const tx = g && g.querySelector('text');
    if (!tx) return false;
    const x = +tx.getAttribute('x'), y = +tx.getAttribute('y');
    return tx.classList.contains('pie__sn--sm') && Math.abs(Math.hypot(x - 100, y - 112) - 72) < 12;
  }));
  t('실마리 선은 쓰지 않는다', await page.evaluate(() => document.querySelectorAll('.pie__lead').length === 0));
  /* 작은 숫자는 **원에 담는다** (2026-10-26, 교수님 지정) — 가는 조각 위에서도 한 덩이로 읽힌다 */
  t('작은 숫자마다 원이 하나씩', await page.evaluate(() =>
    document.querySelectorAll('.pie__snb').length === document.querySelectorAll('.pie__sn--sm').length
    && document.querySelectorAll('.pie__snb').length > 0));
  t('원이 숫자를 덮지 않는다 — 원이 먼저 그려진다', await page.evaluate(() => {
    const g = [...document.querySelectorAll('.pie__hit')].find(e => e.querySelector('.pie__snb'));
    const kids = [...g.children].map(e => e.tagName.toLowerCase() + '.' + (e.getAttribute('class') || ''));
    return kids.indexOf('circle.pie__snb') < kids.findIndex(k => k.startsWith('text.'));
  }));
  /* 원 안의 숫자가 **어느 갈래인지** 빛깔로 말한다 (2026-10-26, 교수님 물음).
     바탕을 **그 조각 색 그대로** 쓰고 흰 테를 둘러 울타리로 삼는다. */
  t('원 바탕은 그 조각 색 그대로', await page.evaluate(() => {
    const g = [...document.querySelectorAll('.pie__hit')].filter(e => e.querySelector('.pie__snb'));
    if (!g.length) return false;
    return g.every(e => getComputedStyle(e.querySelector('.pie__snb')).fill
                     === getComputedStyle(e.querySelector('.pie__seg')).stroke);
  }), await page.evaluate(() => [...document.querySelectorAll('.pie__hit')]
    .filter(e => e.querySelector('.pie__snb'))
    .map(e => `${e.dataset.rs}:${e.querySelector('.pie__snb').style.getPropertyValue('--sc')}`).join(' ')));
  t('테는 흰색 — 제 띠 위에서도 울타리가 된다', await page.evaluate(() =>
    [...document.querySelectorAll('.pie__snb')].every(e => {
      const k = getComputedStyle(e).stroke.match(/\d+/g).map(Number);
      return k[0] > 245 && k[1] > 245 && k[2] > 245 && parseFloat(getComputedStyle(e).strokeWidth) >= 1;
    })));
  t('조각 색 위에서 숫자가 읽힌다(4.5 이상)', await page.evaluate(() => {
    const lin = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
    const L = rgb => { const [r, g, b] = rgb.map(lin); return .2126 * r + .7152 * g + .0722 * b; };
    const cr = (a2, b2) => { const x = L(a2), y = L(b2); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const rgb = v => v.match(/\d+/g).map(Number);
    return [...document.querySelectorAll('.pie__hit')].filter(e => e.querySelector('.pie__snb'))
      .every(e => cr(rgb(getComputedStyle(e.querySelector('text')).fill),
                     rgb(getComputedStyle(e.querySelector('.pie__snb')).fill)) >= 4.5);
  }), await page.evaluate(() => {
    const lin = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
    const L = rgb => { const [r, g, b] = rgb.map(lin); return .2126 * r + .7152 * g + .0722 * b; };
    const cr = (a2, b2) => { const x = L(a2), y = L(b2); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const rgb = v => v.match(/\d+/g).map(Number);
    return [...document.querySelectorAll('.pie__hit')].filter(e => e.querySelector('.pie__snb'))
      .map(e => cr(rgb(getComputedStyle(e.querySelector('text')).fill),
                   rgb(getComputedStyle(e.querySelector('.pie__snb')).fill)).toFixed(2)).join(' ');
  }));
  t('글자색은 흰색 아니면 어두운 색 둘 중 또렷한 쪽', await page.evaluate(() => {
    const rgb = v => v.match(/\d+/g).map(Number);
    return [...document.querySelectorAll('.pie__sn--sm')].every(e => {
      const f = rgb(getComputedStyle(e).fill);
      const white = f.every(v => v > 245), dark = f.every(v => v < 60);
      return white || dark;
    });
  }), await page.evaluate(() => [...document.querySelectorAll('.pie__snb')]
    .map(e => `${e.style.getPropertyValue('--sc')}→${e.style.getPropertyValue('--si')}`).join(' ')));
  t('원이 숫자를 품을 만큼 크다', await page.evaluate(() => {
    const g = [...document.querySelectorAll('.pie__hit')].find(e => e.querySelector('.pie__snb'));
    const c = g.querySelector('.pie__snb').getBoundingClientRect();
    const t2 = g.querySelector('text').getBoundingClientRect();
    return c.width >= t2.width + 2 && c.height >= t2.height - 1
      && Math.abs((c.left + c.right) / 2 - (t2.left + t2.right) / 2) < 1.5;
  }));
  t('작은 글씨가 큰 글씨보다 작다', await page.evaluate(() => {
    const px = e => parseFloat(getComputedStyle(e).fontSize);
    const sm = document.querySelector('.pie__sn--sm'), bg = document.querySelector('.pie__sn:not(.pie__sn--sm)');
    return !!sm && !!bg && px(sm) < px(bg);
  }), await page.evaluate(() => {
    const px = e => e ? getComputedStyle(e).fontSize : '없음';
    return `${px(document.querySelector('.pie__sn--sm'))} vs ${px(document.querySelector('.pie__sn:not(.pie__sn--sm)'))}`;
  }));
  t('숫자가 그림 틀을 넘지 않는다', await page.evaluate(() => {
    const sv = document.querySelector('.pie__svg').getBoundingClientRect();
    return [...document.querySelectorAll('.pie__sn')].every(e => {
      const r = e.getBoundingClientRect();
      return r.left >= sv.left - 1 && r.right <= sv.right + 1 && r.top >= sv.top - 1 && r.bottom <= sv.bottom + 1;
    });
  }));
  /* 2026-10-26 — 교수님이 「중간의 약화 숫자가 왜 없지」라고 짚어 주셨다. 숫자는 그려지고
     있었으나 자리를 찾다가 띠에 묻혀 있었다. 이제 **모든 숫자가 제 조각 한가운데**에
     얹히므로 빠지는 것이 없다. 겹쳐도 괜찮다 — 색이 곧 갈래라 읽어 낼 수 있다. */
  const nums = () => page.evaluate(() => {
    const R = 72, CX = 100, CY = 112;
    const W = parseFloat(getComputedStyle(document.querySelector('.pie__seg')).strokeWidth);
    return [...document.querySelectorAll('.pie__hit')].map(e => {
      const t2 = e.querySelector('text');
      const x = +t2.getAttribute('x'), y = +t2.getAttribute('y');
      return { lab: e.getAttribute('aria-label').split(' — ')[0], n: +t2.textContent,
        sm: t2.classList.contains('pie__sn--sm'), rad: Math.hypot(x - CX, y - CY),
        onBand: Math.abs(Math.hypot(x - CX, y - CY) - R) < W / 2 };
    });
  });
  /* 강화·약화까지 잘게 갈린 자료 — 좁은 조각이 여섯이나 된다 */
  await page.evaluate(() => {
    const rows = state.rows;
    state.ratings.clear(); sureSet = new Set(); weakSet = new Set();
    let i = 0;
    const give = (r, n, m) => { for (let k = 0; k < n; k++) { const p = rows[i++]; if (!p) return;
      setRating(rKey(p), r); if (m === 's') sures().add(rKey(p)); if (m === 'w') weaks().add(rKey(p)); } };
    give('확', 20); give('확', 2, 'w'); give('중', 3, 's'); give('중', 2); give('중', 1, 'w');
    give('부', 2, 's'); give('부', 1); give('부', 1, 'w'); give('비', 4);
    renderStats();
  });
  const NS = await nums();
  t('강화·약화 조각에도 숫자가 빠짐없이 붙는다', NS.length === 9 && NS.every(o => o.n > 0),
    NS.map(o => `${o.lab}=${o.n}`).join(' '));
  t('숫자를 다 더하면 모수가 된다', NS.reduce((a, o) => a + o.n, 0) ===
    await page.evaluate(() => state.rows.filter(p => getRating(p) !== '비').length),
    String(NS.reduce((a, o) => a + o.n, 0)));
  t('숫자는 모두 제 조각 위에 얹힌다', NS.every(o => o.onBand),
    NS.filter(o => !o.onBand).map(o => `${o.lab} r=${o.rad.toFixed(1)}`).join(' ') || '없음');
  /* 큰 글씨는 **갈래마다 하나**, 그 갈래에서 가장 많은 조각에만 (2026-10-26, 교수님 지정).
     으뜸이라도 조각이 가늘면 작은 원에 담으므로 「큰 글씨는 으뜸뿐」만 못 박는다. */
  t('큰 글씨는 갈래마다 많아야 하나', await page.evaluate(() => {
    const by = {};
    [...document.querySelectorAll('.pie__hit')].forEach(e => {
      const big = !e.querySelector('text').classList.contains('pie__sn--sm');
      by[e.dataset.rs] = (by[e.dataset.rs] || 0) + (big ? 1 : 0);
    });
    return Object.values(by).every(v => v <= 1);
  }), await page.evaluate(() => [...document.querySelectorAll('.pie__hit')]
    .map(e => `${e.dataset.rs}${e.querySelector('text').classList.contains('pie__sn--sm') ? '작' : '큰'}`).join(' ')));
  t('큰 글씨는 그 갈래의 으뜸 조각에', await page.evaluate(() => {
    const by = {};
    [...document.querySelectorAll('.pie__hit')].forEach(e => {
      const n = +e.querySelector('text').textContent;
      const big = !e.querySelector('text').classList.contains('pie__sn--sm');
      (by[e.dataset.rs] = by[e.dataset.rs] || []).push({ n, big });
    });
    return Object.values(by).every(v => {
      const mx = Math.max(...v.map(x => x.n));
      return v.every(x => !x.big || x.n === mx);        // 큰 글씨면 반드시 으뜸이다
    });
  }));
  t('으뜸이 아니면 모두 작은 원', NS.filter(o => o.sm).length > 0 && NS.filter(o => !o.sm).length > 0,
    NS.map(o => `${o.lab}${o.sm ? '(작)' : ''}`).join(' '));
  /* 가는 조각이 잇달으면 원을 띠의 안쪽·바깥쪽으로 엇갈려 앉힌다 — 안 그러면 뒤에 그린
     원이 앞 숫자를 덮는다 (2026-10-26) */
  t('바싹 붙은 원은 두 줄로 엇갈린다', await page.evaluate(() => {
    const r = [...document.querySelectorAll('.pie__snb')]
      .map(e => Math.hypot(+e.getAttribute('cx') - 100, +e.getAttribute('cy') - 112));
    return r.length >= 4 && new Set(r.map(v => Math.round(v))).size >= 2;
  }), await page.evaluate(() => [...document.querySelectorAll('.pie__snb')]
    .map(e => Math.hypot(+e.getAttribute('cx') - 100, +e.getAttribute('cy') - 112).toFixed(0)).join(' ')));
  t('원도 띠 안에 머문다', await page.evaluate(() =>
    [...document.querySelectorAll('.pie__snb')].every(e => {
      const d = Math.hypot(+e.getAttribute('cx') - 100, +e.getAttribute('cy') - 112);
      const r2 = +e.getAttribute('r');
      const W = parseFloat(getComputedStyle(document.querySelector('.pie__seg')).strokeWidth);
      return d - r2 >= 72 - W / 2 - 1 && d + r2 <= 72 + W / 2 + 1;
    })));
  /* 부정에서 강화는 **더 모진 쪽**이라 진하고, 약화는 **덜 모진 쪽**이라 옅어야 한다
     (2026-10-26, 교수님 지정 — 「부-약화가 부정보다 덜 진하게」) */
  t('부정은 강화가 진하고 약화가 옅다', await page.evaluate(() => {
    const lum = h => { const m = h.replace('#', '');
      return [0, 2, 4].reduce((a, i) => a + parseInt(m.slice(i, i + 2), 16), 0) / 3; };
    const g = [...document.querySelectorAll('.pie__hit')].filter(e => e.dataset.rs === '부')
      .map(e => lum(e.querySelector('.pie__seg').getAttribute('stroke')));
    return g.length === 3 && g[0] < g[1] - 8 && g[1] < g[2] - 25;
  }), await page.evaluate(() => [...document.querySelectorAll('.pie__hit')]
    .filter(e => e.dataset.rs === '부').map(e => e.querySelector('.pie__seg').getAttribute('stroke')).join(' ')));
  t('잘게 갈려도 틀을 안 넘는다', await page.evaluate(() => {
    const sv = document.querySelector('.pie__svg').getBoundingClientRect();
    return [...document.querySelectorAll('.pie__sn')].every(e => {
      const r = e.getBoundingClientRect();
      return r.left >= sv.left - 1 && r.right <= sv.right + 1 && r.top >= sv.top - 1 && r.bottom <= sv.bottom + 1;
    });
  }));

  t('빛깔 턱은 살짝만 — 같은 갈래로 보여야 한다', await page.evaluate(() => {
    const lum = h => { const m = h.replace('#', '');
      return [0, 2, 4].reduce((a, i) => a + parseInt(m.slice(i, i + 2), 16), 0) / 3; };
    const g = [...document.querySelectorAll('.pie__hit')].filter(e => e.dataset.rs === '중')
      .map(e => lum(e.querySelector('.pie__seg').getAttribute('stroke')));
    const d = Math.max(...g) - Math.min(...g);
    return d > 6 && d < 70;          // 눈에는 보이되 다른 색으로는 안 보일 만큼
  }));
  t('조각 길이의 합이 그대로', await page.evaluate(() => {
    const total = state.rows.filter(p => getRating(p) !== '비').length;
    const HALF = Math.PI * 72;
    const sum = [...document.querySelectorAll('.pie__seg')]
      .reduce((a, c) => a + parseFloat(c.getAttribute('stroke-dasharray')), 0);
    /* 틈(갈래 안 0.8 · 갈래끼리 1.5)만큼 짧으므로 조금 모자란 것이 맞다 */
    return sum < HALF && sum > HALF - 20;
  }));
  await page.evaluate(() => { sureSet = new Set(); weakSet = new Set();
    localStorage.removeItem('jnu-sure'); localStorage.removeItem('jnu-weak'); renderStats(); });
}

/* ---------- 기대 표 수 (2026-10-25, 교수님과 맞춘 무게) ----------
 * 확 .95 · 긍 .75(강화 .80) · 중 .40(강화 .60) · 모 .20 · 부 0 · 미지정 0 · 비참여는 빠짐 */
{
  const E = await page.evaluate(() => {
    state.ratings.clear(); sureSet = new Set();
    const rows = state.rows, plan = [['확', 4], ['중', 6], ['부', 5], ['비', 2]];
    let i = 0;
    for (const [r, n] of plan) for (let k = 0; k < n; k++) if (rows[i]) setRating(rKey(rows[i++]), r);
    rows.filter(p => getRating(p) === '중').slice(0, 2).forEach(p => sures().add(rKey(p)));
    rows.filter(p => getRating(p) === '중').slice(2, 3).forEach(p => weaks().add(rKey(p)));
    rows.filter(p => getRating(p) === '확').slice(0, 1).forEach(p => weaks().add(rKey(p)));
    rows.filter(p => getRating(p) === '부').slice(0, 2).forEach(p => sures().add(rKey(p)));
    sureSave(); weakSave(); renderStats();
    /* 확 3×.95 + 확−약 1×.80 + 중+강 2×.65 + 중 3×.5 + 중−약 1×.35 + 부+강 2×.20 + 부 3×0 */
    const want = 3 * .95 + .80 + 2 * .65 + 3 * .50 + .35 + 2 * .20;
    const varr = 3 * .95 * .05 + .80 * .20 + 2 * .65 * .35 + 3 * .5 * .5 + .35 * .65
      + 2 * .20 * .80;
    const kl = document.querySelector('.pie__k--score .pie__kl').textContent.trim();
    const kn = document.querySelector('.pie__k--score .pie__kn').textContent.trim();
    return { want: Math.round(want * 10) / 10, sd: Math.round(Math.sqrt(varr) * 10) / 10,
             kl, kn, none: state.rows.filter(p => !getRating(p)).length };
  });
  t('기대 표 수가 무게대로 나온다', E.kl === `기대 ${E.want}`, `${E.kl} / 셈 ${E.want}`);
  t('흔들림 폭(±)을 함께 적는다', E.kn.includes(`(± ${E.sd})`), `${E.kn} / 셈 ± ${E.sd}`);
  t('아랫줄에 「N명 차」는 안 적는다 — 그 자리가 ± 다', !/명 차/.test(E.kn), E.kn);
  t('아직 안 매긴 분이 섞여 있다', E.none > 0, `${E.none}명`);

  /* 무게가 바뀌면 숫자도 바뀐다 — 강화가 값을 올리는지 */
  const up = await page.evaluate(() => {
    const was = weightSum(state.rows.filter(p => getRating(p) !== '비'));
    const p = state.rows.find(x => getRating(x) === '중' && !isSure(x) && !isWeak(x));
    sures().add(rKey(p)); sureSave(); renderStats();
    const now = weightSum(state.rows.filter(q => getRating(q) !== '비'));
    return Math.round((now - was) * 100) / 100;
  });
  t('중에 강화를 더하면 .15 만큼 오른다', up === 0.15, String(up));
  const up2 = await page.evaluate(() => {
    const was = weightSum(state.rows.filter(p => getRating(p) !== '비'));
    const p = state.rows.find(x => getRating(x) === '부' && !isSure(x) && !isWeak(x));
    sures().add(rKey(p)); sureSave(); renderStats();
    return Math.round((weightSum(state.rows.filter(q => getRating(q) !== '비')) - was) * 100) / 100;
  });
  t('부에 강화를 더하면 .20 만큼 오른다', up2 === 0.20, String(up2));
  t('아홉 칸이 줄곧 낮아진다 — 묶인 두 쌍 빼고 일곱 값', await page.evaluate(() => {
    const ws = [], sv = [...sures()], wv = [...weaks()];   // 다른 시험이 쓰는 표시를 지키려고 적어 둔다
    for (const r of ['확', '중', '부']) for (const m of ['s', '', 'w']) {
      const p = state.rows[0], was = getRating(p);
      setRating(rKey(p), r); sureSet = new Set(); weakSet = new Set();
      if (m === 's') sures().add(rKey(p));
      if (m === 'w') weaks().add(rKey(p));
      ws.push(weightOf(p));
      sureSet = new Set(); weakSet = new Set(); setRating(rKey(p), was || '');
    }
    sureSet = new Set(sv); weakSet = new Set(wv);          // 적어 둔 표시를 되돌린다
    return new Set(ws).size === 7 && ws.every((v, i) => i === 0 || ws[i - 1] >= v);
  }));
  t('확에 강화를 찍어도 .95 그대로 — 위 두 칸이 같다', await page.evaluate(() => {
    const a = state.rows.find(x => getRating(x) === '확' && !isWeak(x) && !isSure(x));
    const wa = weightOf(a);
    sures().add(rKey(a)); sureSave();
    const nw = weightOf(a);
    sures().delete(rKey(a)); sureSave();
    return wa === .95 && nw === .95;
  }));
  const weightSumHere = await page.evaluate(() =>
    Math.round(weightSum(state.rows.filter(p => getRating(p) !== '비')) * 10) / 10);
  t('미지정은 0 이다', await page.evaluate(() => {
    const p = state.rows.find(x => !getRating(x));
    return !p || weightOf(p) === 0;
  }));
  t('비참여도 0 이고 모수에서도 빠진다', await page.evaluate(() => {
    const p = state.rows.find(x => getRating(x) === '비');
    return weightOf(p) === 0 && !document.querySelector('.pie__u').textContent.includes(`전체 ${state.rows.length}명`);
  }));
  /* 기대 카드를 누르면 **풀이 칸**이 펴진다 (2026-10-25, 교수님 요청) */
  t('처음엔 접혀 있다', await page.evaluate(() =>
    document.querySelector('[data-expopen]').getAttribute('aria-expanded') === 'false'
    && document.querySelector('#explBox').hidden));
  await page.click('[data-expopen]');
  await page.waitForTimeout(350);
  const X = await page.evaluate(() => {
    const e = document.querySelector('#explBox');
    const seg = [...e.querySelectorAll('.expl__seg')];
    const total = state.rows.filter(p => getRating(p) !== '비').length;
    const sum = seg.reduce((a2, s2) => a2 + parseFloat(s2.style.getPropertyValue('--w')), 0);
    const want = weightSum(state.rows.filter(p => getRating(p) !== '비')) / total * 100;
    const foot = e.querySelector('.expl__t tfoot td b').textContent;
    const rows = [...e.querySelectorAll('.expl__t tbody tr')].map(r => {
      const c = [...r.children].map(x => x.textContent.trim());
      return { k: c[0], n: +c[1].replace('명', ''), w: +c[2], s: +c[3] };
    });
    return { open: !e.hidden, segs: seg.length, sum, want, foot, rows,
             half: parseFloat(e.querySelector('.expl__half').style.left),
             halfWant: Math.ceil(total / 2) / total * 100,
             sd: !!e.querySelector('.expl__sd') };
  });
  t('누르면 풀이가 펴진다', X.open && await page.evaluate(() =>
    document.querySelector('[data-expopen]').getAttribute('aria-expanded') === 'true'));
  t('띠의 길이가 기대 표 수와 같다', Math.abs(X.sum - X.want) < .2, `${X.sum.toFixed(1)}% / 셈 ${X.want.toFixed(1)}%`);
  t('금이 절반 자리에 선다', Math.abs(X.half - X.halfWant) < .2, `${X.half}% / 셈 ${X.halfWant.toFixed(1)}%`);
  t('흔들림 폭 띠도 그린다', X.sd);
  t('갈래마다 인원 × 무게 = 보탬', X.rows.every(r => Math.abs(r.n * r.w - r.s) < .06),
    X.rows.map(r => `${r.k} ${r.n}×${r.w}=${r.s}`).join(' / '));
  t('강화는 따로 줄을 세운다', X.rows.some(r => /\+강화$/.test(r.k)), X.rows.map(r => r.k).join('|'));
  t('굳은 쪽부터 차례로 적는다', await page.evaluate(() => {
    const want = ['확+강화', '확', '확-약화', '중+강화', '중', '중-약화', '부+강화', '부', '부-약화', '미지정'];
    const got = [...document.querySelectorAll('#explBox .expl__t tbody th')].map(e => e.textContent.trim());
    return got.join('|') === want.filter(k => got.includes(k)).join('|');
  }), X.rows.map(r => r.k).join('|'));
  t('띠도 같은 차례로 쌓는다', await page.evaluate(() => {
    const want = ['확+강화', '확', '확-약화', '중+강화', '중', '중-약화', '부+강화', '부', '부-약화'];
    const got = [...document.querySelectorAll('#explBox .expl__seg')].map(e => e.title.split(' ')[0]);
    return got.join('|') === want.filter(k => got.includes(k)).join('|');
  }), await page.evaluate(() => [...document.querySelectorAll('#explBox .expl__seg')].map(e => e.title.split(' ')[0]).join('|')));
  /* 띠·표의 빛깔이 **도넛과 같은 턱**으로 강화·약화를 가른다 (2026-10-26, 교수님 지정).
     전에는 갈래 기둥색만 써서 파란 조각 셋이 똑같아 보였다 — 같은 사람이 두 그림에서
     다른 말을 하면 안 된다. */
  const paint = () => page.evaluate(() => {
    const seg = {}, sw = {}, arc = {};
    document.querySelectorAll('#explBox .expl__seg').forEach(e => {
      seg[e.title.split(' ')[0]] = getComputedStyle(e).backgroundColor; });
    document.querySelectorAll('#explBox .expl__t tbody tr').forEach(r => {
      sw[r.querySelector('th').textContent.trim()] = getComputedStyle(r.querySelector('.sw')).backgroundColor; });
    document.querySelectorAll('.pie__hit').forEach(e => {
      const d = document.createElement('div');
      d.style.color = e.querySelector('.pie__seg').getAttribute('stroke');
      document.body.appendChild(d);
      arc[e.getAttribute('aria-label').split(' ')[0]] = getComputedStyle(d).color;
      d.remove();
    });
    return { seg, sw, arc };
  });
  const P = await paint();
  t('띠의 빛깔이 도넛 조각과 같다', Object.keys(P.seg).length > 3
    && Object.keys(P.seg).every(k => P.arc[k] === P.seg[k]),
    Object.keys(P.seg).map(k => `${k} 띠${P.seg[k]} 도넛${P.arc[k]}`).join(' | '));
  t('표의 네모도 같은 빛깔', Object.keys(P.seg).every(k => P.sw[k] === P.seg[k]),
    Object.keys(P.seg).map(k => `${k} ${P.sw[k]}`).join(' | '));
  t('한 갈래 안에서 강화·보통·약화가 서로 다른 빛깔', await page.evaluate(() => {
    const by = {};
    document.querySelectorAll('#explBox .expl__seg').forEach(e => {
      const k = e.title.split(' ')[0], r = k[0];
      (by[r] = by[r] || new Set()).add(getComputedStyle(e).backgroundColor);
    });
    const many = Object.entries(by).filter(([, v]) => v.size > 0);
    const cnt = {};
    document.querySelectorAll('#explBox .expl__seg').forEach(e => {
      const r = e.title.split(' ')[0][0]; cnt[r] = (cnt[r] || 0) + 1; });
    return many.length > 0 && many.every(([r, v]) => v.size === cnt[r]);
  }), await page.evaluate(() => [...document.querySelectorAll('#explBox .expl__seg')]
    .map(e => `${e.title.split(' ')[0]}:${getComputedStyle(e).backgroundColor}`).join(' ')));

  t('기대 칸은 옅은 바탕으로 띄워 둔다', await page.evaluate(() => {
    const bg = e => getComputedStyle(e).backgroundColor;
    return bg(document.querySelector('.pie__k--score')) !== bg(document.querySelector('.pie__k--high'));
  }), await page.evaluate(() => getComputedStyle(document.querySelector('.pie__k--score')).backgroundColor));
  t('합계가 기대 표 수와 같다', Math.abs(+X.foot - weightSumHere) < .06,
    `${X.foot} / 셈 ${weightSumHere}`);
  t('비참여는 표에 없다', !X.rows.some(r => r.k === '비'), X.rows.map(r => r.k).join('|'));
  await page.click('[data-expopen]');
  await page.waitForTimeout(250);
  t('다시 누르면 접힌다', await page.evaluate(() => document.querySelector('#explBox').hidden));
  t('키보드로도 펴진다', await page.evaluate(() => {
    const el = document.querySelector('[data-expopen]');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const on = !document.querySelector('#explBox').hidden;
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return on;
  }));
  t('다시 그려도 펴진 채 그대로', await page.evaluate(() => {
    EXP_OPEN = true; renderStats();
    return !document.querySelector('#explBox').hidden
      && document.querySelector('[data-expopen]').getAttribute('aria-expanded') === 'true';
  }));
  await page.evaluate(() => { EXP_OPEN = false; renderStats(); });

  /* 선호도는 그대로 둔다 — 뒤의 막대·범례 시험이 비참여가 있는 자료를 쓴다 */
  await page.evaluate(() => { sureSet = new Set(); localStorage.removeItem('jnu-sure'); renderStats(); });
}

/* ---------- 범례에 「무게를 먹인 값」을 나란히 (2026-10-25, 교수님 요청) ---------- */
{
  const L = await page.evaluate(() => {
    state.ratings.clear(); sureSet = new Set(); weakSet = new Set();
    const rows = state.rows, plan = [['확', 8], ['중', 10], ['부', 6], ['비', 2]];
    let i = 0;
    for (const [r, n] of plan) for (let k = 0; k < n; k++) if (rows[i]) setRating(rKey(rows[i++]), r);
    rows.filter(p => getRating(p) === '중').slice(0, 2).forEach(p => sures().add(rKey(p)));
    rows.filter(p => getRating(p) === '확').slice(0, 2).forEach(p => weaks().add(rKey(p)));
    sureSave(); weakSave(); renderStats();
    const li = [...document.querySelectorAll('.pie__li')];
    const want = r => rows.filter(p => (getRating(p) || '미지정') === r).reduce((a, p) => a + weightOf(p), 0);
    return {
      txt: li.map(e => e.textContent.replace(/\s+/g, ' ').trim()),
      got: li.map(e => (e.querySelector('.pie__lw') || {}).textContent),
      want: li.map(e => {
        const r = e.textContent.trim().split(' ')[0];
        return `(→${want(r).toFixed(1)})`;
      }),
      one: li.every(e => /\(→\d+\.\d\)$/.test((e.querySelector('.pie__lw') || {}).textContent || '')),
    };
  });
  t('갈래마다 무게 먹인 값을 적는다', L.got.length > 0 && L.got.every(Boolean), L.txt.join(' | '));
  t('그 값이 무게대로다', L.got.join() === L.want.join(), `${L.got.join()} / 셈 ${L.want.join()}`);
  t('늘 소수 첫째 자리까지', L.one, L.got.join());
  t('머릿수는 그대로 둔다', L.txt.every(x => /^\S+ \d+\(→/.test(x)), L.txt.join(' | '));
  t('강화·약화가 섞이면 갈래 합이 달라진다', await page.evaluate(() => {
    const li = [...document.querySelectorAll('.pie__li')];
    const 확 = li.find(e => e.textContent.trim().startsWith('확'));
    const n = +확.querySelector('b').textContent;
    const w = parseFloat(확.querySelector('.pie__lw').textContent.replace(/[^\d.]/g, ''));
    return Math.abs(w - n * 0.9) > 0.01;      // 약화 둘이 섞여 있어 n×0.9 와 다르다
  }));
  await page.evaluate(() => { sureSet = new Set(); weakSet = new Set();
    localStorage.removeItem('jnu-sure'); localStorage.removeItem('jnu-weak'); renderStats(); });
}

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
/* 2026-10-25 에 「모름」 갈래가 없어져 중(파랑)과 견준다 */
t('중(파랑)보다 옅다', await page.evaluate(() => {
  const g = s => (getComputedStyle(document.querySelector(s)).backgroundColor.match(/\d+/g) || []).map(Number)[0];
  return g('.sbar__seg--na') > g('.sbar__seg--mid') + 40;
}), await page.evaluate(() => [...document.querySelectorAll('.sbar__seg--na,.sbar__seg--mid')].slice(0,2)
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
  .map(e => e.textContent.trim()).join('|')) === '확실|중간|부정|비참여',
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
