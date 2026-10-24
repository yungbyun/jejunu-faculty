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
// 자리가 좁아 건물 이름을 줄여 쓴다 — 공과대학 → 공대, 해양과학대학 → 해대
t('공과대학 → 공대', await page.evaluate(()=>shortLoc('공과대학 1호관 7219')==='공대 1호관 7219'));
t('해양과학대학 → 해대', await page.evaluate(()=>shortLoc('해양과학대학 3호관 5502호')==='해대 3호관 5502호'));
t('연구실 이름만 있으면 그대로', await page.evaluate(()=>shortLoc('MEMS 연구실')==='MEMS 연구실'));
t('카드에 긴 이름이 안 남음', await page.evaluate(()=>![...document.querySelectorAll('.favc__loc')].some(e=>/공과대학|해양과학대학/.test(e.textContent))),
  await page.evaluate(()=>[...document.querySelectorAll('.favc__loc')].map(e=>e.textContent.trim()).join(' | ')));
t('호실은 그대로 보인다', await page.evaluate(()=>[...document.querySelectorAll('.favc__loc')].some(e=>/\d호관/.test(e.textContent))));

/* 선호도 칩은 이름 바로 오른쪽에 — 오른쪽 끝에 두면 폰에서 호실이 잘린다 (2026-10-09) */
await page.evaluate(()=>{ state.rows.slice(0,2).forEach((p,i)=>state.ratings.set(rKey(p), ['확','긍'][i])); render(); });
await page.waitForSelector('.favc__nm .rs',{timeout:10000});
t('칩이 이름 칸 안에 있다', await page.evaluate(()=>{
  const nm=document.querySelector('.favc__nm'), c=nm&&nm.querySelector('.rs');
  return !!c && c.previousElementSibling === nm.querySelector('b');
}));
t('칩이 이름보다 작다', await page.evaluate(()=>{
  const b=document.querySelector('.favc__nm b'), c=document.querySelector('.favc__nm .rs');
  return parseFloat(getComputedStyle(c).fontSize) < parseFloat(getComputedStyle(b).fontSize);
}), await page.evaluate(()=>getComputedStyle(document.querySelector('.favc__nm .rs')).fontSize));
t('오른쪽 끝으로 밀지 않는다', await page.evaluate(()=>{
  const nm=document.querySelector('.favc__nm'), c=nm.querySelector('.rs'), b=nm.querySelector('b');
  return c.getBoundingClientRect().left - b.getBoundingClientRect().right < 12;
}));
t('호실이 안 잘린다', await page.evaluate(()=>[...document.querySelectorAll('.favc__loc')]
  .every(e=>e.scrollWidth <= e.clientWidth+1)));

/* 메모에서 굵게 한 말만 카드 밑에 줄 하나로 (2026-10-09) */
await page.evaluate(()=>{
  const k0=rKey(state.rows[0]), k1=rKey(state.rows[1]);
  state.notes.set(k0,{memo:'**학과장 출신** 통화함' + String.fromCharCode(10) + '**실험실 공간**이 관심사'});
  state.notes.set(k1,{memo:'굵게 한 데가 없는 메모'});
  render();
});
await page.waitForSelector('.favc__m',{timeout:10000});
t('굵게 한 말만, 콤마로', await page.evaluate(()=>document.querySelector('.favw .favc__m').textContent)==='학과장 출신, 실험실 공간',
  await page.evaluate(()=>document.querySelector('.favw .favc__m').textContent));
t('굵은 데가 없으면 줄도 없다', await page.locator('.favc__m').count()===1,
  String(await page.locator('.favc__m').count()));
/* X 는 **사진 줄 높이까지만** 선다 (2026-10-24) — 메모 높이까지 내려오면 누르는 자리가
   너무 넓어, 메모를 읽다가 잘못 눌러 관심이 풀렸다 */
t('X 단추는 사진 줄 높이까지만', await page.evaluate(() => {
  const w = document.querySelector('.favw'), r = w.querySelector('.favw__r'), x = w.querySelector('.favx');
  const R = e => e.getBoundingClientRect();
  return Math.abs(R(x).height - R(r).height) <= 3 && R(x).height < R(w).height - 10;
}), await page.evaluate(() => {
  const w = document.querySelector('.favw'), R = e => e.getBoundingClientRect();
  return `카드 ${Math.round(R(w).height)} / 윗줄 ${Math.round(R(w.querySelector('.favw__r')).height)} / X ${Math.round(R(w.querySelector('.favx')).height)}`;
}));
t('X 는 윗줄 안에 있다', await page.evaluate(() =>
  !!document.querySelector('.favw__r > .favx')));
t('메모 줄은 카드 너비를 끝까지 쓴다', await page.evaluate(() => {
  const w = document.querySelector('.favw'), m = w.querySelector('.favc__m'), x = w.querySelector('.favx');
  const R = e => e.getBoundingClientRect();
  return R(m).right >= R(x).right - 1;
}), await page.evaluate(() => {
  const w = document.querySelector('.favw'), R = e => e.getBoundingClientRect();
  return `메모 끝 ${Math.round(R(w.querySelector('.favc__m')).right)} / X 끝 ${Math.round(R(w.querySelector('.favx')).right)}`;
}));
t('메모 자리를 눌러도 관심이 풀리지 않는다', await page.evaluate(() => {
  const w = document.querySelector('.favw'), m = w.querySelector('.favc__m');
  const r = m.getBoundingClientRect();
  /* 메모 줄의 오른쪽 끝(예전에 X 가 내려오던 자리)에 무엇이 있는지 */
  const el = document.elementFromPoint(r.right - 6, r.top + r.height / 2);
  return !el || !el.closest('.favx');
}));
t('메모에 바탕색을 깔지 않는다', await page.evaluate(() => {
  const bg = getComputedStyle(document.querySelector('.favc__m')).backgroundColor;
  return bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent';
}), await page.evaluate(() => getComputedStyle(document.querySelector('.favc__m')).backgroundColor));
t('가로줄로 갈라 둔다', await page.evaluate(()=>{
  const m=document.querySelector('.favc__m'), cs=getComputedStyle(m);
  return parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle === 'solid';
}), await page.evaluate(()=>getComputedStyle(document.querySelector('.favc__m')).borderTopWidth));
t('윗줄 아래에 있다', await page.evaluate(()=>{
  const w=document.querySelector('.favw'), m=w.querySelector('.favc__m'), r=w.querySelector('.favw__r');
  return m.getBoundingClientRect().top >= r.getBoundingClientRect().bottom - 1;
}));
t('길면 잘리지 않고 줄을 바꾼다', await page.evaluate(()=>{
  const m=document.querySelector('.favc__m');
  m.textContent='아주 긴 말 '.repeat(12);
  const fits = m.scrollWidth <= m.clientWidth+1 && m.getBoundingClientRect().height > 20;
  render(); return fits;
}));
await page.evaluate(()=>{ state.notes.clear(); state.ratings.clear(); render(); });
await page.waitForSelector('.favw',{timeout:10000});

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

/* 상세 사진 왼쪽 위에도 관심 교수 체크 — 카드의 것보다 조금 작게 (2026-10-09) */
await page.evaluate(() => { const p = state.rows[2]; favs().delete(rKey(p));
  location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render(); });
await page.waitForSelector('.d-photo .fav', { timeout: 10000 });
t('상세 사진에 체크가 있다', await page.locator('.d-photo .fav').count() === 1);
t('사진 왼쪽 위에 얹힌다', await page.evaluate(() => {
  const f = document.querySelector('.d-photo .fav').getBoundingClientRect();
  const ph = document.querySelector('.d-photo').getBoundingClientRect();
  return getComputedStyle(document.querySelector('.d-photo .fav')).position === 'absolute'
    && f.left - ph.left < 12 && f.top - ph.top < 12 && f.right <= ph.right + 1;
}), await page.evaluate(() => {
  const f = document.querySelector('.d-photo .fav').getBoundingClientRect();
  const ph = document.querySelector('.d-photo').getBoundingClientRect();
  return `왼쪽 ${Math.round(f.left - ph.left)} · 위 ${Math.round(f.top - ph.top)}`;
}));
t('카드의 것보다 작다', await page.evaluate(() => {
  const d = document.querySelector('.d-photo .fav').getBoundingClientRect().width;
  return d > 0 && d <= 26;
}), await page.evaluate(() => String(Math.round(document.querySelector('.d-photo .fav').getBoundingClientRect().width))));
t('동그랗다', await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.d-photo .fav'));
  return cs.borderRadius === '50%' && cs.width === cs.height;
}), await page.evaluate(() => getComputedStyle(document.querySelector('.d-photo .fav')).borderRadius));
t('처음엔 꺼져 있다', await page.getAttribute('.d-photo .fav', 'aria-pressed') === 'false');
await page.click('.d-photo .fav');
t('누르면 관심 교수가 된다', await page.evaluate(() => isFav(state.rows[2])));
t('단추도 켜진 꼴', await page.getAttribute('.d-photo .fav', 'aria-pressed') === 'true');
await page.click('.d-photo .fav');
t('다시 누르면 풀린다', await page.evaluate(() => !isFav(state.rows[2])));
await page.evaluate(() => { closeDrawer(); location.hash = '#/'; render(); });
await page.waitForSelector('.favw', { timeout: 10000 });

// 다른 화면과 같은 값
await page.evaluate(()=>{ const p=state.rows[0]; location.hash=`#/dept/${p.dept_id}/prof/${p.slug}`; render(); });
await page.waitForSelector('#drawer .counter',{timeout:10000});
t('상세 화면도 같은 값', await page.evaluate(()=>document.querySelector('#drawer .counter__n').textContent)==='1',
  await page.evaluate(()=>document.querySelector('#drawer .counter__n').textContent));

/* ---------- 메모 줄 접기 단추 (2026-10-24) ---------- */
await page.evaluate(() => {
  localStorage.removeItem('jnu-favmemo'); favMemoOff = null;
  favSet = new Set();
  state.rows.slice(0, 4).forEach(p => { favs().add(rKey(p));
    state.notes.set(rKey(p), { met: 0, memo: '**학과장 출신** 통화함' }); });
  favSave(); location.hash = '#/'; render();
});
await page.waitForSelector('[data-favmemo]', { timeout: 10000 });
const memoSeen = () => page.evaluate(() => {
  const e = document.querySelector('.favc__m');
  return !!e && e.getClientRects().length > 0;
});
const pressed = () => page.getAttribute('[data-favmemo]', 'aria-pressed');
t('머리줄에 메모 단추가 하나', await page.locator('[data-favmemo]').count() === 1);
t('제목 바로 오른쪽에 있다', await page.evaluate(() => {
  const h = document.querySelector('.favsec__head h2').getBoundingClientRect();
  const b = document.querySelector('[data-favmemo]').getBoundingClientRect();
  return b.left >= h.right - 1 && b.left - h.right < 40;
}), await page.evaluate(() => {
  const h = document.querySelector('.favsec__head h2').getBoundingClientRect();
  const b = document.querySelector('[data-favmemo]').getBoundingClientRect();
  return `제목 끝 ${Math.round(h.right)} / 단추 ${Math.round(b.left)}`;
}));
t('조그맣다 — 30px 아래', await page.evaluate(() => {
  const r = document.querySelector('[data-favmemo]').getBoundingClientRect();
  return r.width <= 30 && r.height <= 30;
}), await page.evaluate(() => { const r = document.querySelector('[data-favmemo]').getBoundingClientRect();
  return `${Math.round(r.width)}x${Math.round(r.height)}`; }));
t('처음엔 메모가 보인다', await memoSeen() && await pressed() === 'true', await pressed());
const h0 = await page.evaluate(() => Math.round(document.querySelector('.favw').getBoundingClientRect().height));
await page.click('[data-favmemo]');
await page.waitForTimeout(300);
t('누르면 메모가 감춰진다', !(await memoSeen()) && await pressed() === 'false', await pressed());
t('그만큼 칸이 낮아진다', await page.evaluate(() =>
  Math.round(document.querySelector('.favw').getBoundingClientRect().height)) < h0,
  `${h0} → ${await page.evaluate(() => Math.round(document.querySelector('.favw').getBoundingClientRect().height))}`);
t('글을 지우는 것이 아니라 가리는 것', await page.evaluate(() => document.querySelectorAll('.favc__m').length > 0),
  String(await page.locator('.favc__m').count()) + '개');
t('도움말도 바뀐다', await page.getAttribute('[data-favmemo]', 'title') === '메모 보이기',
  await page.getAttribute('[data-favmemo]', 'title'));
t('이 기기에 기억된다', await page.evaluate(() => localStorage.getItem('jnu-favmemo') === '0'),
  await page.evaluate(() => localStorage.getItem('jnu-favmemo')));
t('시트에는 올리지 않는다', await page.evaluate(() => !SET_KEYS.includes('favmemo')));
await page.click('[data-favmemo]');
await page.waitForTimeout(300);
t('다시 누르면 돌아온다', await memoSeen() && await pressed() === 'true', await pressed());
t('기억도 지워진다', await page.evaluate(() => !localStorage.getItem('jnu-favmemo')));

/* ---------- 관심 교수 차례 바꾸기 (2026-10-20) ---------- */
await page.evaluate(() => {
  favSet = new Set();
  state.rows.slice(0, 6).forEach(p => favs().add(rKey(p)));
  favSave(); location.hash = '#/'; render();
});
await page.waitForSelector('.favsec__list [data-fgrip]', { timeout: 10000 });
const fkeys = () => page.evaluate(() => [...document.querySelectorAll('.favw')].map(e => e.dataset.fkey).join(','));
const fsaved = () => page.evaluate(() => [...favs()].join(','));
const first = await fkeys();
t('칸마다 손잡이가 있다', await page.locator('.favsec__list [data-fgrip]').count() === 6,
  String(await page.locator('.favsec__list [data-fgrip]').count()));
t('손잡이는 손가락 몸짓을 우리가 받는다', await page.evaluate(() =>
  getComputedStyle(document.querySelector('[data-fgrip]')).touchAction) === 'none',
  await page.evaluate(() => getComputedStyle(document.querySelector('[data-fgrip]')).touchAction));

/* 화살표로 한 칸씩 */
await page.locator('[data-fgrip]').first().focus();
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(250);
const down1 = (await fkeys()).split(',');
t('아래 화살표로 한 칸 뒤로', down1[0] === first.split(',')[1] && down1[1] === first.split(',')[0],
  down1.slice(0, 2).join(' → '));
t('바꾼 차례가 그대로 담긴다', await fsaved() === await fkeys(), await fsaved());
t('초점이 손잡이에 남는다', await page.evaluate(() =>
  document.activeElement && document.activeElement.dataset.fgrip !== undefined));
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(250);
t('위 화살표로 되돌아온다', await fkeys() === first, await fkeys());
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(250);
t('맨 앞에서 더 못 올라간다', await fkeys() === first, await fkeys());
await page.locator('[data-fgrip]').last().focus();
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(250);
t('맨 뒤에서 더 못 내려간다', await fkeys() === first, await fkeys());

/* 끌어서 — 격자라 가로세로를 함께 잰다 */
const g = await page.locator('[data-fgrip]').first().boundingBox();
const to = await page.locator('.favw').nth(3).boundingBox();
await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
await page.mouse.down();
await page.mouse.move(to.x + to.width * 0.8, to.y + to.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(350);
const moved = (await fkeys()).split(',');
t('끌어 놓으면 그 자리로 간다', moved[3] === first.split(',')[0], moved.indexOf(first.split(',')[0]) + '번째');
t('끌어 바꾼 차례도 담긴다', await fsaved() === await fkeys(), await fsaved());
t('아무도 잃지 않는다', moved.length === 6 && new Set(moved).size === 6, moved.length + '장');
t('다시 그려도 그 차례', await page.evaluate(async () => {
  render(); await new Promise(r => setTimeout(r, 200));
  return [...document.querySelectorAll('.favw')].map(e => e.dataset.fkey).join(',') === [...favs()].join(',');
}), await fkeys());

/* 손잡이를 눌러도 상세로 새지 않는다 */
await page.evaluate(() => { window.__h = location.hash; });
await page.locator('[data-fgrip]').first().click();
await page.waitForTimeout(250);
t('손잡이를 눌러도 상세로 가지 않는다', await page.evaluate(() => location.hash === window.__h),
  await page.evaluate(() => location.hash));

let bad=0; for(const [n,v,x] of ok){ if(!v) bad++; console.log(`${v?'OK  ':'실패'} ${n}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close(); process.exit(bad?1:0);
