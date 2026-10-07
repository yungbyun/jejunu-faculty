/* 핸드폰 번호 — 비공개 시트에만 두고 공개 파일에는 넣지 않는다는 것까지 확인한다.
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
import fs from 'fs';

const checks = [];
const check = (t, v, extra = '') => checks.push([t, v, extra]);

// 0) 공개 파일에 번호가 없어야 한다 — 이게 가장 중요한 검사다
const pub = fs.readFileSync(new URL('../data/professors.json', import.meta.url), 'utf8');
const leaked = pub.match(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g) || [];
check('공개 data/professors.json 에 휴대폰 없음', leaked.length === 0, `${leaked.length}건`);

const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 1000 },
  permissions: ['clipboard-read', 'clipboard-write'] })).newPage();
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });

const k = await page.evaluate(() => rKey(state.rows.find(p => p.dept_id === 'comdol')));

// 1) 저장과 형식 맞추기
check('숫자만 넣어도 하이픈이 붙음', await page.evaluate(x => {
  const p = state.rows.find(y => rKey(y) === x);
  setMobile(p, '01012345678');
  return mobileOf(p) === '010-1234-5678';
}, k));
check('localStorage 저장', await page.evaluate(x => {
  try { return (JSON.parse(localStorage.getItem('jnu-mobile') || '{}'))[x] === '010-1234-5678'; } catch { return false; }
}, k));
check('이상한 값은 지운다', await page.evaluate(x => {
  const p = state.rows.find(y => rKey(y) === x);
  setMobile(p, '12'); const gone = !mobileOf(p);
  setMobile(p, '010-1234-5678');
  return gone;
}, k));

// 2) 교수 카드에 연구실 전화 아래로 나온다
await page.evaluate(() => { location.hash = '#/dept/comdol'; render(); });
await page.waitForTimeout(600);
check('카드에 핸드폰 표시', await page.evaluate(() =>
  !!document.querySelector('.po__mob') && /010-1234-5678/.test(document.querySelector('.po__mob').textContent)));
check('연구실 전화 다음에 온다', await page.evaluate(() => {
  const box = document.querySelector('.prof__office');
  const kids = [...box.children].map(e => e.className);
  return kids.indexOf('po__tel') < kids.findIndex(c => c.includes('po__mob'));
}));
check('tel: 링크', await page.evaluate(() => document.querySelector('.po__mob').getAttribute('href') === 'tel:01012345678'));

// 2-1) 번호 오른쪽의 복사 아이콘
check('번호 옆에 복사 아이콘', await page.evaluate(() => !!document.querySelector('.po__cp')));
check('번호와 아이콘이 한 줄에', await page.evaluate(() => {
  const n = document.querySelector('.po__mob').getBoundingClientRect();
  const c = document.querySelector('.po__cp').getBoundingClientRect();
  return Math.abs((n.top + n.bottom) / 2 - (c.top + c.bottom) / 2) < 4 && c.left >= n.right - 2;
}));
const hashBefore = await page.evaluate(() => location.hash);
await page.locator('[data-copynum]').first().click();
await page.waitForTimeout(400);
check('누르면 번호가 복사된다', await page.evaluate(() => navigator.clipboard.readText()) === '010-1234-5678');
check('카드가 열리지는 않는다', await page.evaluate(() => location.hash) === hashBefore,
  await page.evaluate(() => location.hash));
check('복사한 뒤 확인 표시', await page.evaluate(() => document.querySelector('.po__cp').classList.contains('ok')));

/* 3) 상세 화면의 번호 줄 — 영문 이름 바로 아래, 같은 글꼴·색으로 (2026-10-07).
   따로 칸을 두었다가(같은 날) 영문 이름 아래로 옮겼다. */
await page.evaluate(x => {
  const p = state.rows.find(y => rKey(y) === x);
  location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render();
}, k);
await page.waitForSelector('.d-phones', { timeout: 10000 });
check('연락처 칸을 따로 두지 않는다', await page.evaluate(() =>
  ![...document.querySelectorAll('.d-section h3')].some(h => h.textContent.trim() === '연락처')));
check('영문 이름 바로 다음 줄', await page.evaluate(() =>
  document.querySelector('.d-en').nextElementSibling === document.querySelector('.d-phones')));
check('글꼴·크기·색이 영문 이름과 같다', await page.evaluate(() => {
  const a = getComputedStyle(document.querySelector('.d-en'));
  const b = getComputedStyle(document.querySelector('.d-ct__n'));
  return a.fontFamily === b.fontFamily && a.fontSize === b.fontSize && a.color === b.color;
}), await page.evaluate(() => {
  const a = getComputedStyle(document.querySelector('.d-en')), b = getComputedStyle(document.querySelector('.d-ct__n'));
  return `${a.fontSize}/${a.color} vs ${b.fontSize}/${b.color}`;
}));
const ct = await page.evaluate(() => [...document.querySelectorAll('.d-ct')].map(e => ({
  n: e.querySelector('.d-ct__n').textContent.trim(),
  href: e.querySelector('.d-ct__n').getAttribute('href'),
  cp: !!e.querySelector('[data-copynum]'),
})));
check('연구실 전화가 먼저, 핸드폰이 다음', ct.length === 2 && ct[1].n === '010-1234-5678',
  ct.map(x => x.n).join(' | '));
check('한 줄에 나란히', await page.evaluate(() => {
  const a = document.querySelectorAll('.d-ct');
  const r0 = a[0].getBoundingClientRect(), r1 = a[1].getBoundingClientRect();
  return Math.abs((r0.top + r0.bottom) / 2 - (r1.top + r1.bottom) / 2) < 4;
}));
check('둘 다 tel: 링크', ct.length === 2 && ct.every(x => /^tel:[\d+]+$/.test(x.href)), ct.map(x => x.href).join(' '));
check('둘 다 복사 아이콘', ct.length === 2 && ct.every(x => x.cp));
/* 상세에서 복사 아이콘을 눌러도 화면이 닫히거나 넘어가면 안 된다 */
const dHash = await page.evaluate(() => location.hash);
await page.locator('.d-ct__c').last().click();
await page.waitForTimeout(400);
check('상세에서도 복사된다', await page.evaluate(() => navigator.clipboard.readText()) === '010-1234-5678');
check('상세가 닫히지 않는다', await page.evaluate(() => location.hash) === dHash &&
  await page.evaluate(() => !document.querySelector('.drawer').hidden));
check('번호가 하나도 없으면 줄도 없다', await page.evaluate(() => {
  const q = state.rows.find(y => !mobileOf(y));
  if (!q) return true;
  const keep = q.phone; q.phone = '';
  location.hash = `#/dept/${q.dept_id}/prof/${q.slug}`; render();
  const none = !document.querySelector('.d-phones');
  q.phone = keep;
  return none;
}));
/* 공개 파일에 번호가 새지 않았는지 다시 — 상세에 다시 넣은 뒤라 꼭 본다 */
check('상세에 넣어도 공개 파일은 그대로', (pub.match(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g) || []).length === 0);

// 4) 한 번에 가져오기
const imp = await page.evaluate(() => {
  const a = rKey(state.rows[0]), c = rKey(state.rows[1]);
  const r = mobileImport(JSON.stringify({ [a]: '01011112222', [c]: '010-3333-4444', 'ghost/none': '01055556666', bad: '123' }));
  return { r, a, c, av: mobileOf(state.rows[0]), cv: mobileOf(state.rows[1]) };
});
check('가져오기 2건 반영', imp.r.n === 2, JSON.stringify(imp.r));
check('없는 교수·이상한 값은 건너뜀', imp.r.skip === 2);
check('하이픈 없이 준 것도 정리됨', imp.av === '010-1111-2222' && imp.cv === '010-3333-4444');
check('JSON 이 아니면 오류', await page.evaluate(() => !!mobileImport('{어쩌고').err));
check('경로를 붙여넣으면 알려 준다', await page.evaluate(() =>
  (mobileImport('C:\Users\a\b.json').err || '').indexOf('경로') >= 0));

// 4-1) 빈 값이면 지운다 — 드로어 칸을 뺀 뒤로 여기가 유일한 수정·삭제 자리다
check('빈 값이면 지운다', await page.evaluate(() => {
  const a = rKey(state.rows[0]);
  mobileImport(JSON.stringify({ [a]: '010-7777-8888' }));
  const had = mobileOf(state.rows[0]) === '010-7777-8888';
  const r = mobileImport(JSON.stringify({ [a]: '' }));
  return had && r.del === 1 && !mobileOf(state.rows[0]);
}));
check('한 사람만 고칠 수 있다', await page.evaluate(() => {
  const a = rKey(state.rows[0]);
  mobileImport(JSON.stringify({ [a]: '01011112222' }));
  const r = mobileImport(JSON.stringify({ [a]: '010-5555-6666' }));
  return r.n === 1 && mobileOf(state.rows[0]) === '010-5555-6666';
}));

// 5) 설정 동기화 경로에 얹혀 있다 (시트로 나간다)
// 6) 명단에서 빠진 교수의 번호는 세지 않는다 (퇴직 등)
check('명단에 없는 번호는 안 센다', await page.evaluate(() => {
  mobileMap = {}; localStorage.removeItem('jnu-mobile');
  const m = mobiles();
  state.rows.forEach(p => { m[rKey(p)] = '010-0000-0000'; });
  m['archidesign/park-chul-min'] = '010-9999-9999';       // 퇴직해서 명단에 없는 사람
  return mobileCount() === state.rows.length && mobileStale() === 1;
}), `센 수 ${await page.evaluate(() => mobileCount())} / 교수 ${await page.evaluate(() => state.rows.length)}`);
await page.evaluate(() => { location.hash = '#/outreach'; render(); });
await page.waitForTimeout(600);
check('화면 숫자도 교수 수와 같음', await page.evaluate(() =>
  document.querySelector('[data-impn]').textContent === String(state.rows.length)),
  await page.evaluate(() => document.querySelector('[data-impn]').textContent));
check('남은 번호가 있으면 알려 준다', await page.evaluate(() =>
  !!document.querySelector('[data-impold]') && document.querySelector('[data-impold]').textContent.includes('1건')));

check('지우기 단추가 보인다', await page.evaluate(() => !!document.querySelector('[data-impclean]')));
await page.evaluate(() => { window.confirm = () => true; });
await page.click('[data-impclean]');
await page.waitForTimeout(500);
check('명단에 없는 번호가 지워짐', await page.evaluate(() => mobileStale() === 0));
check('명단에 있는 번호는 그대로', await page.evaluate(() => mobileCount() === state.rows.length),
  `${await page.evaluate(() => mobileCount())} / ${await page.evaluate(() => state.rows.length)}`);
check('다 지우면 단추도 사라짐', await page.evaluate(() => !document.querySelector('[data-impclean]')));
await page.evaluate(() => { mobileMap = {}; localStorage.removeItem('jnu-mobile'); });

check('settings 키로 등록됨', await page.evaluate(() =>
  setKeys().includes('mobile') && SET_OBJ.includes('mobile')));

let bad = 0;
for (const [t, v, extra] of checks) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${t}${extra ? '   (' + extra + ')' : ''}`); }
console.log(`\n${checks.length - bad}/${checks.length} 통과`);
await b.close();
process.exit(bad ? 1 : 0);
