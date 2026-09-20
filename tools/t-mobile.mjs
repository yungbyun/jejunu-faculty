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
const page = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
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

// 3) 상세 드로어에서 고칠 수 있다
await page.evaluate(x => {
  const p = state.rows.find(y => rKey(y) === x);
  location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render();
}, k);
await page.waitForSelector('.d-mob', { timeout: 10000 });
check('드로어에 입력칸', await page.evaluate(() => document.querySelector('.d-mob').value === '010-1234-5678'));
await page.fill('.d-mob', '01099998888');
await page.evaluate(() => document.querySelector('.d-mob').dispatchEvent(new Event('change')));
await page.waitForTimeout(500);
check('드로어에서 고치면 저장됨', await page.evaluate(x =>
  mobileOf(state.rows.find(y => rKey(y) === x)) === '010-9999-8888', k));

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

// 5) 설정 동기화 경로에 얹혀 있다 (시트로 나간다)
check('settings 키로 등록됨', await page.evaluate(() =>
  setKeys().includes('mobile') && SET_OBJ.includes('mobile')));

let bad = 0;
for (const [t, v, extra] of checks) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${t}${extra ? '   (' + extra + ')' : ''}`); }
console.log(`\n${checks.length - bad}/${checks.length} 통과`);
await b.close();
process.exit(bad ? 1 : 0);
