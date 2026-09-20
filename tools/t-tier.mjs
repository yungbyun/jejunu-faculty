/* 전체 → 학과 → 교수 3단 원고와 AI 다시 쓰기 확인.
   서버는 부르지 않고 ratingsApi 를 가짜로 바꿔 끼운다. 로컬 서버가 떠 있어야 한다. */
import { chromium } from 'playwright';

const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
await page.goto('http://127.0.0.1:8080/#/outreach', { waitUntil: 'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
await page.evaluate(() => {
  state.session = { email: 'ycb@jejunu.ac.kr' };
  window.__ai = [];
  window.ratingsApi = async (action, payload) => {
    if (action === 'rewrite') { window.__ai.push(payload); return { ok: true, text: '[AI] ' + payload.text }; }
    if (action === 'outbox') return { ok: true, on: false, quota: 90, rows: [] };
    return { ok: true };
  };
  location.hash = '#/outreach'; OUT.dept = '전체'; OUT.edit = false; OUT.open = ''; render();
});
await page.waitForTimeout(600);

const checks = [];
const check = (t, v, extra = '') => checks.push([t, v, extra]);

// 1) 기본은 전체 단계
const ids = await page.evaluate(() => {
  const a = state.rows.find(p => p.dept_id === 'archieng');
  const c = state.rows.find(p => p.dept_id === 'civil');
  return { a: rKey(a), c: rKey(c) };
});
check('처음엔 모두 전체 단계', await page.evaluate(k =>
  epLevel(1, state.rows.find(p => rKey(p) === k), '메일') === '전체', ids.a));

// 2) 학과 덮어쓰기
await page.evaluate(() => { epSetOv(1, 'dept', 'archieng', '메일', '건축공학과 전용 원고 {이름} {개인화}'); });
await page.waitForTimeout(300);
check('학과 원고가 그 학과에만 적용', await page.evaluate(x => {
  const a = state.rows.find(p => rKey(p) === x.a), c = state.rows.find(p => rKey(p) === x.c);
  return epLevel(1, a, '메일') === '학과' && epLevel(1, c, '메일') === '전체';
}, ids));
check('학과 원고가 조립에 반영', await page.evaluate(x => {
  const a = state.rows.find(p => rKey(p) === x.a);
  return epFinal(1, a, '메일', '').startsWith('건축공학과 전용 원고 ' + a.name);
}, ids));
check('다른 채널은 그대로 전체', await page.evaluate(x =>
  epLevel(1, state.rows.find(p => rKey(p) === x.a), '문자') === '전체', ids));

// 3) 교수 덮어쓰기가 학과보다 우선
await page.evaluate(k => { epSetOv(1, 'prof', k, '메일', '이 교수님 전용 {이름}'); }, ids.a);
await page.waitForTimeout(300);
check('교수 원고가 학과보다 우선', await page.evaluate(k => {
  const p = state.rows.find(x => rKey(x) === k);
  return epLevel(1, p, '메일') === '교수' && epFinal(1, p, '메일', '') === '이 교수님 전용 ' + p.name;
}, ids.a));
check('같은 학과 다른 교수는 학과 단계', await page.evaluate(k => {
  const me = state.rows.find(x => rKey(x) === k);
  const other = state.rows.find(x => x.dept_id === 'archieng' && rKey(x) !== k);
  return epLevel(1, other, '메일') === '학과';
}, ids.a));

// 4) 되돌리기
await page.evaluate(k => { epSetOv(1, 'prof', k, '메일', ''); }, ids.a);
await page.waitForTimeout(300);
check('교수 원고를 비우면 학과로 되돌아감', await page.evaluate(k =>
  epLevel(1, state.rows.find(p => rKey(p) === k), '메일') === '학과', ids.a));
await page.evaluate(() => { epSetOv(1, 'dept', 'archieng', '메일', ''); });
await page.waitForTimeout(300);
check('학과 원고를 비우면 전체로 되돌아감', await page.evaluate(k =>
  epLevel(1, state.rows.find(p => rKey(p) === k), '메일') === '전체', ids.a));

// 5) 회차마다 따로 저장된다
await page.evaluate(() => { epAdd(); epSetOv(2, 'dept', 'archieng', '메일', '2회차 학과 원고'); });
await page.waitForTimeout(500);
check('회차별로 분리', await page.evaluate(k => {
  const p = state.rows.find(x => rKey(x) === k);
  return epLevel(1, p, '메일') === '전체' && epLevel(2, p, '메일') === '학과';
}, ids.a));
check('회차마다 저장 키가 따로', await page.evaluate(() =>
  setKeys().includes('epov1') && setKeys().includes('epov2')));
check('localStorage 도 회차별', await page.evaluate(() => {
  try { return !!JSON.parse(localStorage.getItem('jnu-epov2') || 'null'); } catch { return false; }
}));

// 6) 학과 원고 편집 화면
await page.evaluate(() => { OUT.ep = 1; OUT.dept = 'archieng'; OUT.edit = true; renderOutreach(); });
await page.waitForTimeout(500);
check('학과를 고르면 학과 원고 화면', await page.evaluate(() =>
  /건축공학과/.test(document.querySelector('.ep-who')?.textContent || '') &&
  document.querySelectorAll('[data-dov]').length === 3));
await page.click('[data-dcopy]');
await page.waitForTimeout(300);
check('전체 원고 가져오기', await page.evaluate(() =>
  document.querySelector('[data-dov="body"]').value.includes('컴송합니다')));

// 7) AI 다시 쓰기 — 학과
await page.fill('.ep-how', '더 짧게');
await page.click('[data-aidept]');
await page.waitForTimeout(1200);
const aiCalls = await page.evaluate(() => window.__ai);
check('AI 가 세 채널 모두 호출됨', aiCalls.length === 3, `${aiCalls.length}회`);
check('AI 에 학과 정보 전달', /건축공학과/.test(aiCalls[0]?.who || ''));
check('AI 에 주문 전달', aiCalls[0]?.how === '더 짧게');
check('AI 결과가 칸에 들어옴', await page.evaluate(() =>
  document.querySelector('[data-dov="body"]').value.startsWith('[AI] ')));

// 8) AI 다시 쓰기 — 교수
await page.evaluate(() => { OUT.edit = false; OUT.dept = '전체'; window.__ai = []; renderOutreach(); });
await page.waitForTimeout(400);
await page.click(`[data-open="${ids.c}"]`);
await page.waitForSelector('[data-aiprof]', { timeout: 10000 });
await page.click('[data-aiprof]');
await page.waitForTimeout(1200);
check('교수 단계 AI 호출', await page.evaluate(() => window.__ai.length === 1));
check('AI 에 교수 정보 전달', await page.evaluate(k => {
  const p = state.rows.find(x => rKey(x) === k);
  return (window.__ai[0].who || '').includes(p.name);
}, ids.c));
check('결과가 초안칸에', await page.evaluate(() => document.querySelector('.oc__ta').value.startsWith('[AI] ')));
await page.click('[data-psave]');
await page.waitForTimeout(600);
check('교수 원고로 저장됨', await page.evaluate(k =>
  epLevel(1, state.rows.find(p => rKey(p) === k), '메일') === '교수', ids.c));

let bad = 0;
for (const [t, v, extra] of checks) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${t}${extra ? '   (' + extra + ')' : ''}`); }
console.log(`\n${checks.length - bad}/${checks.length} 통과`);
await b.close();
process.exit(bad ? 1 : 0);
