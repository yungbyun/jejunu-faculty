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
