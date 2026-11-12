/* 친한 사람 — 상세의 **입사 동기 위** 칸 (2026-11-12, 교수님 지정).
   고치는 길은 입사 동기와 같되, **묶음으로 이어 붙이지 않는 것**이 이 칸의 핵심이다 —
   甲·乙이 친하고 乙·丙이 친하다고 甲·丙이 친해지면 안 된다. 그 선을 여기서 지킨다.
   시트는 부르지 않고, **이 기기에 담기는 것과 그리는 것**을 잰다.
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

/* 시트를 부르지 않도록 저장 길을 끊는다 — 담기는 것만 잰다 */
await page.evaluate(() => { window.saveSetting = () => {}; });
const clear = () => page.evaluate(() => { palList = null; localStorage.removeItem('jnu-pals'); });

/* 세 분의 열쇠 — 甲(me) · 乙(b) · 丙(c) */
const K = await page.evaluate(() => ({
  me: rKey(state.rows[0]), b: rKey(state.rows[1]), c: rKey(state.rows[2]),
  nm: [state.rows[0].name, state.rows[1].name, state.rows[2].name],
}));

/* ---------- 짝 담기 — 이어 붙이지 않는다 ---------- */
await clear();
const linked = (a, z) => page.evaluate(([x, y]) => isPal(x, y), [a, z]);
await page.evaluate(([a, z]) => palAdd(a, z), [K.me, K.b]);
t('짝을 하나 담는다', await linked(K.me, K.b));
t('짝은 양쪽에서 같이 보인다', await linked(K.b, K.me));
await page.evaluate(([a, z]) => palAdd(a, z), [K.b, K.c]);
t('乙·丙을 더해도 甲·丙은 친해지지 않는다 — 이어 붙이지 않는다', !(await linked(K.me, K.c)),
  JSON.stringify(await page.evaluate(() => palLines())));
t('乙에게는 두 분이 선다', (await page.evaluate(k => palLines().filter(l => l.includes(k)).length, K.b)) === 2);
t('같은 짝을 두 번 더해도 한 줄이다',
  (await page.evaluate(([a, z]) => { palAdd(a, z); return palLines().length; }, [K.me, K.b])) === 2);
t('본인끼리는 담지 않는다',
  (await page.evaluate(k => { palAdd(k, k); return palLines().length; }, K.me)) === 2);
/* 빼기 — **그 짝만** 풀려야 한다. 입사 동기처럼 모든 줄에서 지우면 乙·丙까지 끊긴다 */
await page.evaluate(([a, z]) => palDrop(a, z), [K.me, K.b]);
t('뺀 짝은 풀린다', !(await linked(K.me, K.b)));
t('乙·丙은 그대로 남는다 — 그 짝만 푼다', await linked(K.b, K.c),
  JSON.stringify(await page.evaluate(() => palLines())));
t('이 기기에도 담는다',
  (await page.evaluate(() => (JSON.parse(localStorage.getItem('jnu-pals') || '[]')).length)) === 1);

/* ---------- 설정 한 자리 ---------- */
t('설정 열쇠 목록에 든다', await page.evaluate(() => SET_KEYS.includes('pals')
  && SET_LABEL['pals'] === '친한 사람' && SET_LOCAL_KEY['pals'] === 'jnu-pals'));
t('값은 짝의 배열 — 객체로 싸지 않는다', await page.evaluate(() =>
  !SET_OBJ.includes('pals') && Array.isArray(settingValue('pals'))));
t('다른 기기에서 내려온 짝을 받는다', await page.evaluate(() => {
  settingApplyLocal('pals', [['a/x', 'b/y']]);
  return isPal('a/x', 'b/y') && localStorage.getItem('jnu-pals') === '[["a/x","b/y"]]';
}));

/* ---------- 상세 화면 ---------- */
await clear();
const openMe = async () => {
  await page.evaluate(() => { location.hash = '#/'; render(); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { const p = state.rows[0]; location.hash = `#/dept/${encodeURIComponent(p.dept_id)}/prof/${encodeURIComponent(p.slug)}`; render(); });
  await page.waitForSelector('.d-pal', { timeout: 10000 });
};
await openMe();
t('상세에 친한 사람 칸이 선다', await page.evaluate(() => !!document.querySelector('.d-palsec .d-pal')));
t('칸 이름은 「친한 사람」', await page.evaluate(() =>
  (document.querySelector('.d-palsec h3') || {}).textContent.trim() === '친한 사람'));
/* 자리 — **입사 동기 위**라야 한다 (2026-11-12, 교수님 지정) */
t('입사 동기 위에 선다', await page.evaluate(() => {
  const a = document.querySelector('.d-palsec'), h = document.querySelector('.d-hiresec');
  return !!a && !!h && a.compareDocumentPosition(h) === Node.DOCUMENT_POSITION_FOLLOWING;
}), await page.evaluate(() => [...document.querySelectorAll('.d-body .d-section h3')].map(x => x.textContent.trim()).join(' | ')));
t('두 칸은 서로 섞이지 않는다', await page.evaluate(() =>
  !document.querySelector('.d-palsec .d-hire') && !document.querySelector('.d-hiresec .d-pal')));
t('비었어도 연필은 선다', await page.evaluate(() => !!document.querySelector('.d-palsec [data-paledit]')));
t('비었으면 까닭을 적는다', await page.evaluate(() =>
  /아직 적어 둔 분이 없습니다/.test(document.querySelector('.d-pal').textContent)));
t('연필을 누르기 전에는 찾는 칸이 없다', !(await page.$('[data-palin]')));
t('연필을 누르기 전에는 ×도 없다', (await page.$$('.d-pal [data-paldrop]')).length === 0);

/* ---------- 고치기 ---------- */
const pen = async () => { await page.click('.d-palsec [data-paledit]'); await page.waitForTimeout(180); };
const type = async q => {
  await page.evaluate(x => { const i = document.querySelector('[data-palin]'); i.value = x;
    i.dispatchEvent(new Event('input', { bubbles: true })); }, q);
  await page.waitForTimeout(150);
};
await pen();
t('연필을 누르면 찾는 칸이 선다', !!(await page.$('[data-palin]')));
t('찾는 칸에 손이 가 있다', await page.evaluate(() =>
  document.activeElement === document.querySelector('[data-palin]')));
t('찾는 칸은 칩 줄 **맨 뒤**에 선다', await page.evaluate(() => {
  const s = document.querySelector('.d-palsec'), i = s.querySelector('[data-palin]');
  return [...s.querySelectorAll('.d-pal li')].pop().contains(i);
}));
await type('ㅋㅋ없는이름');
t('없는 이름이면 그렇다고 적는다', await page.evaluate(() =>
  /명단에 없는 이름/.test(document.querySelector('[data-palhits]').textContent)));
await type(K.nm[1]);
t('친 대로 찾아 칩을 세운다', (await page.$$('[data-paladd]')).length >= 1,
  (await page.evaluate(() => [...document.querySelectorAll('[data-paladd]')].map(x => x.textContent.trim()).join(','))));
t('본인은 찾은 분에 안 끼인다', await page.evaluate(k =>
  ![...document.querySelectorAll('[data-paladd]')].some(x => x.getAttribute('data-paladd') === k), K.me));
await page.click(`[data-paladd="${K.b}"]`);
await page.waitForTimeout(200);
t('고른 분이 칩으로 선다', await page.evaluate(n =>
  [...document.querySelectorAll('.d-pal li a')].some(a => a.textContent.trim() === n), K.nm[1]));
t('더하면 담긴다', await linked(K.me, K.b));
t('더한 뒤 찾는 칸은 비워 둔다 — 다음 분을 바로 치시도록', await page.evaluate(() =>
  document.querySelector('[data-palin]').value === ''));
t('이미 친한 분은 찾은 분에 다시 안 뜬다',
  await page.evaluate(async k => { const i = document.querySelector('[data-palin]');
    i.value = state.rows[1].name; i.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 120));
    return ![...document.querySelectorAll('[data-paladd]')].some(x => x.getAttribute('data-paladd') === k);
  }, K.b));
await type('');
t('고치는 동안에는 칩마다 ×가 붙는다', (await page.$$('.d-pal [data-paldrop]')).length === 1);
t('×는 칩 **안쪽**에 앉는다', await page.evaluate(() => {
  const li = document.querySelector('.d-pal li');
  const a = li.querySelector('a').getBoundingClientRect(), x = li.querySelector('.d-pal__x').getBoundingClientRect();
  return x.right <= a.right + 1 && x.left >= a.left;
}));
const padOn = await page.evaluate(() => getComputedStyle(document.querySelector('.d-pal .st-c')).paddingRight);
await pen();
const padOff = await page.evaluate(() => getComputedStyle(document.querySelector('.d-pal .st-c')).paddingRight);
t('고치는 동안만 칩 오른쪽을 비운다', parseFloat(padOn) > parseFloat(padOff), `${padOn} → ${padOff}`);
t('닫으면 ×가 사라진다', (await page.$$('.d-pal [data-paldrop]')).length === 0);
t('닫아도 칩은 그대로', await page.evaluate(n =>
  [...document.querySelectorAll('.d-pal li a')].some(a => a.textContent.trim() === n), K.nm[1]));
await pen();
t('세 번째에 다시 열린다 — 듣는 이는 늘 하나', !!(await page.$('[data-palin]')));

/* 빼기 — 칩의 ×로 */
await page.click(`.d-pal [data-paldrop="${K.b}"]`);
await page.waitForTimeout(200);
t('×를 누르면 빠진다', !(await linked(K.me, K.b)));
t('뺀 뒤에는 칩도 없다', (await page.$$('.d-pal li a')).length === 0);

/* ---------- 상대 쪽 상세 ---------- */
await page.evaluate(([a, z]) => palAdd(a, z), [K.me, K.b]);
await page.evaluate(() => { const p = state.rows[1]; location.hash = `#/dept/${encodeURIComponent(p.dept_id)}/prof/${encodeURIComponent(p.slug)}`; render(); });
await page.waitForSelector('.d-pal', { timeout: 10000 });
t('상대 교수 상세에도 내가 선다', await page.evaluate(n =>
  [...document.querySelectorAll('.d-pal li a')].some(a => a.textContent.trim() === n), K.nm[0]),
  await page.evaluate(() => document.querySelector('.d-pal').textContent.trim()));
t('다른 교수를 열면 고치기는 닫힌 자리에서 시작한다', !(await page.$('[data-palin]')));

/* ---------- 입사 동기 칸은 그대로 ---------- */
t('입사 동기 칸은 건드리지 않는다', await page.evaluate(() =>
  !!document.querySelector('.d-hiresec .d-hire') &&
  (document.querySelector('.d-hiresec h3') || {}).textContent.trim() === '입사 동기'));
t('친한 사람을 담아도 입사 동기 줄은 그대로', await page.evaluate(() =>
  !JSON.stringify(hireLines()).includes('jnu-pals')));

/* ---------- 좁은 화면 ---------- */
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
t('390px 에서 칸이 안 넘친다', await page.evaluate(() => {
  const sec = document.querySelector('.d-palsec'), ul = sec.querySelector('.rel-unames');
  return ul.getBoundingClientRect().right <= sec.getBoundingClientRect().right + 1;
}));
await page.setViewportSize({ width: 1440, height: 1100 });
await clear();

let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
