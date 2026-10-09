/* 간단 표시 — 학과 페이지에서 사진을 접고 이름·직위·고른 선호도만 보는 모드.
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
const ok = []; const t = (n, v, x = '') => ok.push([n, v, x]);

const DEPT = await page.evaluate(() => {
  simpleOn = false; localStorage.removeItem('jnu-simple');
  state.ratings.clear(); favSet = new Set();
  state.rankFilter = '전체'; state.ratingFilter = '전체'; state.favOnly = false;
  const d = state.depts.find(x => x.profs.length >= 6) || state.depts[0];
  const v = ['확', '긍', '중', '모', '부', '비'];
  d.profs.forEach((p, i) => setRating(rKey(p), v[i % 6]));
  setRating(rKey(d.profs[d.profs.length - 1]), '');       // 한 명은 일부러 안 고른 채로 둔다
  state.notes.clear();
  /* 메모에 굵게 한 말이 간단히 보기에 나와야 한다 */
  state.notes.set(rKey(d.profs[0]), { met: 0, memo: '지난주 **연구년 복귀** 직후 뵘. **학부 증원**에 관심.' });
  state.notes.set(rKey(d.profs[1]), { met: 0, memo: '통화만 했음. 굵게 한 말이 없다.' });
  state.notes.set(rKey(d.profs[2]), { met: 0, memo: '**같은 말**을 두 번 **같은 말** 굵게.' });
  /* 한 줄에 안 들어가는 긴 것 — 잘라 내지 말고 줄을 바꿔 다 보여야 한다 */
  state.notes.set(rKey(d.profs[3]), { met: 0, memo: '**연구년 복귀 직후라 학내 사정을 잘 모르심**, '
    + '**학부 정원 증원 문제**, **실습실 공간 재배치**, **대학원생 장학금 확대**, '
    + '**산학협력 과제 행정 간소화**까지 길게 말씀하심.' });
  location.hash = `#/dept/${d.id}`; render();
  return d.id;
});
await page.waitForSelector('[data-simple]', { timeout: 10000 });

t('처음엔 카드로 보인다', await page.locator('.prof-grid').count() === 1 && await page.locator('.simple-list').count() === 0);
/* 거르개 줄의 칩이 아니라 학과 홈페이지 옆 링크로 둔다 — 폰에서 손이 덜 간다 (2026-10-09) */
t('학과 홈페이지 바로 옆에 있다', await page.evaluate(() => {
  const sub = document.querySelector('.dept-hero .sub');
  const b = sub && sub.querySelector('[data-simple]');
  if (!b) return false;
  const home = sub.querySelector('a[target="_blank"]');
  return home ? b.previousElementSibling === home : true;   // 홈페이지가 없는 학과면 그냥 줄 안에 있으면 된다
}), await page.evaluate(() => (document.querySelector('.dept-hero .sub') || {}).innerText));
t('거르개 줄에는 두지 않는다', await page.evaluate(() => !document.querySelector('.filters [data-simple]')));
t('링크처럼 보인다', await page.evaluate(() => {
  const b = document.querySelector('[data-simple]'), a = document.querySelector('.dept-hero .sub a');
  const cb = getComputedStyle(b), ca = a ? getComputedStyle(a) : cb;
  return cb.fontSize === ca.fontSize && cb.backgroundColor === 'rgba(0, 0, 0, 0)' && cb.borderTopWidth === '0px';
}), await page.evaluate(() => getComputedStyle(document.querySelector('[data-simple]')).backgroundColor));
t('꺼져 있을 땐 「간단히 보기」', (await page.locator('[data-simple]').innerText()).trim() === '간단히 보기',
  await page.locator('[data-simple]').innerText());
t('처음엔 꺼져 있다', await page.evaluate(() => document.querySelector('[data-simple]').getAttribute('aria-pressed')) === 'false');

await page.click('[data-simple]');
await page.waitForSelector('.simple-list', { timeout: 10000 });
t('켜면 목록으로 바뀐다', await page.locator('.prof-grid').count() === 0 && await page.locator('.simple-list').count() === 1);
t('단추가 켜진 모양', await page.evaluate(() => document.querySelector('[data-simple]').getAttribute('aria-pressed')) === 'true');
t('켜져 있을 땐 「카드로 보기」', (await page.locator('[data-simple]').innerText()).trim() === '카드로 보기',
  await page.locator('[data-simple]').innerText());
t('사진이 없다', await page.evaluate(() => !document.querySelector('.simple-list img')));
t('그 학과 전원이 한 줄씩', await page.evaluate(id =>
  document.querySelectorAll('.sp').length === state.depts.find(x => x.id === id).profs.length, DEPT),
  `${await page.locator('.sp').count()}`);

const rows = await page.evaluate(() => [...document.querySelectorAll('.sp')].map(e => ({
  name: e.querySelector('.sp__n').textContent.trim(),
  rank: e.querySelector('.sp__r').textContent.trim(),
  rate: (e.querySelector('.sp__v .rs') || {}).textContent || '',
  href: e.getAttribute('href'),
})));
t('이름이 적힌다', rows.every(r => r.name.length > 0));
t('직위가 적힌다', rows.every(r => ['교수', '부교수', '조교수'].includes(r.rank)),
  [...new Set(rows.map(r => r.rank))].join(' '));
t('고른 선호도만 적힌다', await page.evaluate(() =>
  [...document.querySelectorAll('.sp')].every(e => {
    const p = state.rows.find(x => e.getAttribute('href').endsWith(encodeURIComponent(x.slug)));
    const shown = (e.querySelector('.sp__v .rs') || {}).textContent || '';
    return shown === (getRating(p) || '');
  })), rows.map(r => `${r.name}:${r.rate || '-'}`).join(' '));
t('안 고른 사람은 칸이 비어 있다', rows.some(r => !r.rate), rows.filter(r => !r.rate).map(r => r.name).join(' '));
t('선호도 칩 색이 그 선호도 색', await page.evaluate(() => {
  const el = [...document.querySelectorAll('.sp__v .rs')].find(e => e.textContent === '확');
  if (!el) return true;
  const hex = x => { const m = x.match(/\d+/g); return m ? '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('') : x; };
  return hex(getComputedStyle(el).color) === getComputedStyle(document.documentElement).getPropertyValue('--rs-high').trim();
}));

/* 메모에서 굵게 한 말만 이름 아래에, 콤마로 이어 적는다 (2026-10-09) */
t('굵게 한 말이 이름 아래에', await page.evaluate(() => {
  const d = state.depts.find(x => x.id === route().dept);
  const el = [...document.querySelectorAll('.sp')].find(e => e.getAttribute('href').endsWith(encodeURIComponent(d.profs[0].slug)));
  return (el.querySelector('.sp__b') || {}).textContent;
}) === '연구년 복귀, 학부 증원', await page.evaluate(() => (document.querySelector('.sp__b') || {}).textContent));
t('이름 줄 바로 아래', await page.evaluate(() => {
  const e = document.querySelector('.sp__b');
  return e.previousElementSibling.classList.contains('sp__h') && e.parentElement.classList.contains('sp__t');
}));
t('굵게 한 말이 없으면 줄도 없다', await page.evaluate(() => {
  const d = state.depts.find(x => x.id === route().dept);
  const el = [...document.querySelectorAll('.sp')].find(e => e.getAttribute('href').endsWith(encodeURIComponent(d.profs[1].slug)));
  return !el.querySelector('.sp__b');
}));
t('같은 말을 두 번 굵게 해도 한 번만', await page.evaluate(() => {
  const d = state.depts.find(x => x.id === route().dept);
  const el = [...document.querySelectorAll('.sp')].find(e => e.getAttribute('href').endsWith(encodeURIComponent(d.profs[2].slug)));
  return (el.querySelector('.sp__b') || {}).textContent === '같은 말';
}), await page.evaluate(() => {
  const d = state.depts.find(x => x.id === route().dept);
  const el = [...document.querySelectorAll('.sp')].find(e => e.getAttribute('href').endsWith(encodeURIComponent(d.profs[2].slug)));
  return (el.querySelector('.sp__b') || {}).textContent;
}));
t('밑줄·기울임은 뽑지 않는다', await page.evaluate(() =>
  JSON.stringify(memoBold('__밑줄__ *기울임* **굵게**'))) === '["굵게"]',
  await page.evaluate(() => JSON.stringify(memoBold('__밑줄__ *기울임* **굵게**'))));
t('줄바꿈이 끼어도 한 줄로 편다', await page.evaluate(() => {
  const br = String.fromCharCode(10);
  return JSON.stringify(memoBold('**두' + br + '줄에  걸친 말**'));
}) === '["두 줄에 걸친 말"]', await page.evaluate(() => {
  const br = String.fromCharCode(10);
  return JSON.stringify(memoBold('**두' + br + '줄에  걸친 말**'));
}));
/* 길면 잘라 내지 말고 줄을 바꾼다 — 무엇을 적어 두었는지가 간단히 보기의 쓸모다 (2026-10-09) */
const wrap = await page.evaluate(() => {
  const d = state.depts.find(x => x.id === route().dept);
  const el = [...document.querySelectorAll('.sp')].find(e => e.getAttribute('href').endsWith(encodeURIComponent(d.profs[3].slug)));
  const b = el.querySelector('.sp__b'), cs = getComputedStyle(b);
  return {
    white: cs.whiteSpace,
    lines: Math.round(b.getBoundingClientRect().height / parseFloat(cs.lineHeight)),
    clipped: b.scrollWidth > b.clientWidth + 1,
    full: b.textContent.includes('산학협력 과제 행정 간소화'),
  };
});
t('긴 것은 여러 줄이 된다', wrap.lines >= 2, `${wrap.lines}줄 / ${wrap.white}`);
t('옆으로 잘리지 않는다', !wrap.clipped);
/* 학과 색으로 물들이지 않는다 — 본문 글자색 그대로 (2026-10-09) */
t('글자색은 본문과 같다', await page.evaluate(() =>
  getComputedStyle(document.querySelector('.sp__b')).color === getComputedStyle(document.querySelector('.sp__n')).color),
  await page.evaluate(() => getComputedStyle(document.querySelector('.sp__b')).color));
t('말줄임으로 감추지 않는다', wrap.white !== 'nowrap', wrap.white);
t('끝까지 다 보인다', wrap.full);
t('줄이 늘어도 선호도 칩은 위에 붙는다', await page.evaluate(() => {
  const d = state.depts.find(x => x.id === route().dept);
  const el = [...document.querySelectorAll('.sp')].find(e => e.getAttribute('href').endsWith(encodeURIComponent(d.profs[3].slug)));
  const r = el.getBoundingClientRect(), v = el.querySelector('.sp__v').getBoundingClientRect();
  return v.top - r.top < r.height / 2;
}));

t('도움말에도 함께 적힌다', (await page.evaluate(() => {
  const d = state.depts.find(x => x.id === route().dept);
  const el = [...document.querySelectorAll('.sp')].find(e => e.getAttribute('href').endsWith(encodeURIComponent(d.profs[0].slug)));
  return el.getAttribute('title');
})).includes('연구년 복귀, 학부 증원'));
t('카드로 보기에는 안 나온다', await page.evaluate(() => {
  simpleToggle(); renderDept(state.depts.find(x => x.id === route().dept));
  const none = !document.querySelector('.sp__b');
  simpleToggle(); renderDept(state.depts.find(x => x.id === route().dept));
  return none;
}));

// 눌러서 상세로
await page.locator('.sp').first().click();
await page.waitForTimeout(600);
t('이름을 누르면 상세가 열린다', await page.evaluate(() => !document.querySelector('.drawer').hidden));
t('주소도 그 교수로', (await page.evaluate(() => location.hash)).includes('/prof/'),
  await page.evaluate(() => location.hash));
await page.evaluate(() => history.back());
await page.waitForTimeout(600);
t('돌아와도 간단히 그대로', await page.locator('.simple-list').count() === 1);

// 거르개와 함께 쓴다
await page.evaluate(() => { state.rankFilter = '교수'; renderDept(state.depts.find(x => x.id === route().dept)); });
await page.waitForTimeout(500);
t('직위 거르개가 그대로 듣는다', await page.evaluate(() =>
  [...document.querySelectorAll('.sp__r')].every(e => e.textContent.trim() === '교수')));
await page.evaluate(() => { state.rankFilter = '전체'; state.ratingFilter = '확'; renderDept(state.depts.find(x => x.id === route().dept)); });
await page.waitForTimeout(500);
t('선호도 거르개도 그대로 듣는다', await page.evaluate(() =>
  [...document.querySelectorAll('.sp__v .rs')].every(e => e.textContent === '확')));
await page.evaluate(() => { state.ratingFilter = '전체'; renderDept(state.depts.find(x => x.id === route().dept)); });
await page.waitForTimeout(400);

// 기억은 이 기기에만
t('이 기기에 기억된다', await page.evaluate(() => localStorage.getItem('jnu-simple') === '1'));
t('시트에는 올리지 않는다', await page.evaluate(() => !SET_KEYS.includes('simple')));
await page.evaluate(() => { location.hash = '#/'; render(); location.hash = `#/dept/${route().dept || ''}`; });
await page.evaluate(id => { location.hash = `#/dept/${id}`; render(); }, DEPT);
await page.waitForTimeout(500);
t('다른 화면에 갔다 와도 그대로', await page.locator('.simple-list').count() === 1);

await page.click('[data-simple]');
await page.waitForTimeout(500);
t('다시 누르면 카드로 돌아온다', await page.locator('.prof-grid').count() === 1 && await page.locator('.simple-list').count() === 0);
t('기억도 지워진다', await page.evaluate(() => !localStorage.getItem('jnu-simple')));

await page.evaluate(() => { simpleOn = false; localStorage.removeItem('jnu-simple'); state.ratings.clear(); });
let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
