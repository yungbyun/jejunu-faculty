/* 입사 동기 — 교수 상세의 **동문 교수 위** 칸.
   가장 중요한 것은 **이어 붙임**이다: 「박승민과 홍길동이 동기」라고 적으면 박승민과 동기인
   분 모두가 홍길동과도 동기가 되어야 한다. 그 일을 사람이 아니라 `hireMerge()` 가 한다.
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1200, height: 1000 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
const ok = []; const t = (n, v, x = '') => ok.push([n, v, x]);

const SAID = await page.evaluate(() => HIRE_SAID.map(l => [...l]));
const FIVE = ['박승민', '김민철', '홍정숙', '임형용', '이상엽'];   /* 최찬수 → 이상엽 (2026-11-04) */

/* ---------- 이어 붙임 (`hireMerge`) — 들은 그대로 적어도 끊기지 않아야 한다 ---------- */
const sort = g => g.map(x => [...x].sort().join(',')).sort();
const merge = said => page.evaluate(s => hireMerge(s), said);

t('적어 둔 그대로 한 묶음', sort(await merge([['가', '나', '다']])).join(' | ') === '가,나,다');
t('한 사람이 겹치면 두 줄이 한 묶음',
  sort(await merge([['가', '나'], ['나', '다']])).join(' | ') === '가,나,다',
  JSON.stringify(await merge([['가', '나'], ['나', '다']])));
/* 이것이 교수님이 특히 일러 주신 자리다 — 나중에 들어온 줄이 **앞서 적어 둔 묶음 전체**와
   이어져야 한다. 「박승민과 홍길동」 한 줄로 홍길동이 넷 모두의 동기가 된다. */
t('새 줄 하나로 묶음 전체와 이어진다',
  sort(await merge([['가', '나', '다', '라'], ['가', '마']])).join(' | ') === '가,나,다,라,마',
  JSON.stringify(await merge([['가', '나', '다', '라'], ['가', '마']])));
t('사슬로 이어진 세 줄도 한 묶음',
  sort(await merge([['가', '나'], ['다', '라'], ['나', '다']])).join(' | ') === '가,나,다,라',
  JSON.stringify(await merge([['가', '나'], ['다', '라'], ['나', '다']])));
t('뒤늦은 줄이 떨어져 있던 두 묶음을 잇는다',
  sort(await merge([['가', '나'], ['다', '라'], ['마', '바'], ['가', '다', '마']])).join(' | ')
  === '가,나,다,라,마,바');
t('겹치지 않으면 따로 둔다',
  sort(await merge([['가', '나'], ['다', '라']])).join(' | ') === '가,나 | 다,라');
t('혼자인 줄은 버린다', (await merge([['가']])).length === 0);
t('같은 이름을 두 번 적어도 한 번만',
  sort(await merge([['가', '나', '가']])).join(' | ') === '가,나');

/* ---------- 이름 찾기 (`hireTok`) ---------- */
const tok = n => page.evaluate(x => hireTok(x), n);
t('명단에 있는 이름은 열쇠로 바뀐다', !(await tok('박승민')).startsWith('?'), await tok('박승민'));
t('없는 이름은 ? 를 달고 그대로 남는다', (await tok('홍길동')) === '?홍길동', await tok('홍길동'));
t('학과를 붙여도 찾는다', (await tok('컴퓨터공학과/박승민')) === (await tok('박승민')),
  await tok('컴퓨터공학과/박승민'));
t('학과 아이디로도 찾는다', (await tok('ce/박승민')) === (await tok('박승민')), await tok('ce/박승민'));

/* ---------- 화면 ---------- */
const open = n => page.evaluate(nm => {
  const p = state.rows.find(x => x.name === nm);
  location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render();
}, n);
const read = () => page.evaluate(() => {
  const box = document.querySelector('.d-hire');
  /* 제목 안에는 더하는 〈+〉 단추도 들어 있으므로 **글자 조각만** 모은다 (2026-11-04) —
     그대로 읽으면 「입사 동기+」가 되어 칸 이름이 어긋난다. */
  const secs = [...document.querySelectorAll('.d-section h3')].map(h =>
    [...h.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim());
  const a0 = box.querySelector('li a');
  return { secs, names: [...box.querySelectorAll('li a')].map(a => a.textContent.trim()),
    head: (box.querySelector('.d-hire__h') || {}).textContent || '',
    note: (box.querySelector('.st-note') || {}).textContent || '',
    href: a0 ? a0.getAttribute('href') : '' };
});

await open('박승민');
await page.waitForSelector('.d-hire', { timeout: 10000 });
const A = await read();
t('상세에 「입사 동기」 칸이 있다', A.secs.includes('입사 동기'), A.secs.join(' | '));
t('동문 교수 바로 위에 둔다', A.secs.indexOf('입사 동기') === A.secs.indexOf('동문 교수') - 1,
  A.secs.join(' | '));
t('함께 적어 둔 네 분이 다 보인다',
  A.names.slice().sort().join(',') === FIVE.filter(n => n !== '박승민').sort().join(','),
  A.names.join(' '));
t('자기 자신은 안 넣는다', !A.names.includes('박승민'), A.names.join(' '));
t('이름을 누르면 그 교수 상세로', /^#[/]dept[/].+[/]prof[/].+/.test(A.href), A.href);
t('다 찾았으면 꼬리말이 없다', A.note === '', A.note);

/* 동기는 서로 마주 본다 — 다섯 가운데 누구를 열어도 나머지 넷이 나와야 한다 */
for (const n of FIVE.slice(1)) {
  await open(n);
  await page.waitForSelector('.d-hire', { timeout: 10000 });
  const r = await read();
  t(`${n} 쪽에서도 나머지 넷이 보인다`,
    r.names.slice().sort().join(',') === FIVE.filter(x => x !== n).sort().join(','), r.names.join(' '));
}

/* 적어 두지 않은 분 */
const other = await page.evaluate(f => (state.rows.find(p => !f.includes(p.name)) || {}).name, FIVE);
await open(other);
await page.waitForSelector('.d-hire', { timeout: 10000 });
const B = await read();
t('적어 두지 않은 분은 빈 안내', !B.names.length && /적어 둔 분이 없습니다/.test(B.note),
  `${other}: ${B.note}`);

/* 뺀 분은 정말 빠져야 한다 (2026-11-04) — `hireMerge()` 는 잇기만 하므로, 줄에서 지우는 것을
   빠뜨리면 조용히 묶음에 남는다. 지워졌는지 여기서 못 박는다. */
await open('최찬수');
await page.waitForSelector('.d-hire', { timeout: 10000 });
const E = await read();
t('뺀 최찬수는 묶음에 없다', !E.names.length && /적어 둔 분이 없습니다/.test(E.note), E.note);
t('박승민 쪽에도 최찬수가 없다', !A.names.includes('최찬수'), A.names.join(' '));

/* 비참여는 뺀다 — 동문 교수·관계 지도와 같은 규칙 */
await page.evaluate(() => {
  const p = state.rows.find(x => x.name === '김민철'); applyEntry(rKey(p), { rating: '비' });
});
await open('박승민');
await page.waitForSelector('.d-hire', { timeout: 10000 });
const C = await read();
t('비참여는 뺀다', !C.names.includes('김민철'), C.names.join(' '));
t('뺀 비참여가 몇 명인지 적는다', /비참여 1명은 뺐습니다/.test(C.note), C.note);
t('남은 셋은 그대로', C.names.length === 3, C.names.join(' '));
await page.evaluate(() => {
  const p = state.rows.find(x => x.name === '김민철'); applyEntry(rKey(p), { rating: '' });
});

/* 적어 둔 이름이 명단에 없으면 조용히 사라지지 않고 꼬리에 뜬다 */
const D = await page.evaluate(() => {
  const keep = HIRE_SAID.map(l => [...l]);
  HIRE_SAID.length = 0; HIRE_SAID.push(['박승민', '홍길동']);
  hireCache = null;
  const p = state.rows.find(x => x.name === '박승민');
  const d = document.createElement('div'); d.innerHTML = hireHtml(p);
  const out = { note: (d.querySelector('.st-note') || {}).textContent || '',
    names: [...d.querySelectorAll('li a')].map(a => a.textContent.trim()) };
  HIRE_SAID.length = 0; keep.forEach(l => HIRE_SAID.push(l)); hireCache = null;
  return out;
});
t('못 찾은 이름을 꼬리에 알려 준다', /못 찾은 이름: 홍길동/.test(D.note), D.note);

/* 교수님이 적어 두신 그 줄 자체 — 다섯 분이 한 묶음인지 */
t('적어 둔 다섯 분이 한 묶음', SAID.some(l => FIVE.every(n => l.includes(n))),
  JSON.stringify(SAID));


/* ---------- 화면에서 고치기 (2026-11-04, 교수님 지정) ----------
   더하는 단추는 제목 「입사 동기」 오른쪽의 〈+〉이고, 더할 분은 **이름이나 학과로 찾아**
   뜬 칩을 눌러 고릅니다(접촉 쪽 「만날 분」과 같은 꼴). 여기부터는 `jnu-hire` 에 저장이
   쌓이므로 **차례가 뜻을 가집니다**. 앞의 시험들은 저장이 비어 있는(= 씨앗을 쓰는)
   자리에서 돌아야 하므로 이 토막은 맨 뒤에 둡니다. */
const state0 = await page.evaluate(() => state.rows.map(r => ({ n: r.name, k: rKey(r), d: r.dept_name, i: r.dept_id })));
const plus = async () => { await page.click('.d-hiresec [data-hireedit]'); await page.waitForTimeout(180); };
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('jnu-hire') || 'null'));
const names = () => page.evaluate(() => [...document.querySelectorAll('.d-hire li a')].map(a => a.textContent.trim()));
const status = () => page.evaluate(() => document.querySelector('.foot__status').textContent.trim());
/* 찾은 분 — **명단에서** 찾은 칩만 본다. 칩 줄 끝에 서는 「그대로 더하기」(명단 밖 사람,
   열쇠가 `@…`)는 `extHit()` 로 따로 본다 (2026-11-12) */
const hits = () => page.evaluate(() => [...document.querySelectorAll('[data-hireadd]')]
  .filter(b => b.getAttribute('data-hireadd')[0] !== '@').map(b => b.textContent.trim()));
const extHit = () => page.evaluate(() => {
  const b = document.querySelector('[data-hireadd^="@"]');
  return b ? b.textContent.trim() : '';
});
/* 치는 시늉 — 적는 칸은 건드리지 않고 찾은 분만 갈아 끼워야 한글 조합이 안 끊긴다 */
const q = async v => {
  await page.evaluate(x => { const i = document.querySelector('[data-hirein]'); i.value = x;
    i.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await page.waitForTimeout(220);
};
const enter = async () => {
  await page.evaluate(() => document.querySelector('[data-hirein]')
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await page.waitForTimeout(300);
};

await open('박승민');
await page.waitForSelector('.d-hire', { timeout: 10000 });
const H3 = await page.evaluate(() => {
  const s = document.querySelector('.d-hiresec'), b = s.querySelector('[data-hireedit]');
  const lis = [...s.querySelectorAll('.d-hire li')];
  return { h3: s.querySelector('h3').textContent.trim(), label: b.textContent.trim(),
    inLast: lis[lis.length - 1].contains(b), n: lis.length, pen: !!b.querySelector('svg'),
    head: !!s.querySelector('.d-hire__h') };
});
/* 더하는 자리는 **칩 줄 맨 뒤**입니다 (2026-11-04, 교수님 지정) — 제목 옆이 아니라 칩 끝에
   있어야 「여기 이어서 한 분 더」라는 것이 눈으로 읽힙니다. */
t('제목에는 단추가 없다', H3.h3 === '입사 동기', H3.h3);
/* 표시는 **연필(고치기)** 입니다 (2026-11-04, 교수님 지정) — 약속 족 「고치기」와
   같은 그림을 씁니다. 그림이라 `textContent` 는 비어 있으므로 `svg` 가 있는지를 봅니다. */
t('고치는 표시는 칩 줄 맨 뒤에 선다', H3.inLast && H3.pen, `${H3.n}칸 / svg ${H3.pen}`);
/* 「본인 빼고 N명」 머리줄은 뺐다 (2026-11-04, 교수님 지정) — 칩을 세면 알 수 있다 */
t('사람 수 머리줄은 없다', !H3.head);
t('「적어 둔 동기」 줄도 없다', (await read()).note.indexOf('적어 둔 동기') < 0, (await read()).note);
t('+ 를 누르기 전에는 찾는 칸이 없다', !(await page.$('[data-hirein]')));
t('+ 를 누르기 전에는 ×도 없다', (await page.$$('.d-hire [data-hiredrop]')).length === 0);

await plus();
t('+ 를 누르면 찾는 칸이 선다', !!(await page.$('[data-hirein]')));
t('그 칸에 바로 손이 가 있다', await page.evaluate(() =>
  document.activeElement === document.querySelector('[data-hirein]')));
/* 〈+〉자리가 그대로 **칩 모양 적는 칸**이 되고, 그 옆에 닫는 × 가 선다.
   적는 칸과 × 는 **한 칸에 묶어** 줄이 꽉 찼을 때 따로 떨어지지 않게 했다. */
const IN = await page.evaluate(() => {
  const s = document.querySelector('.d-hiresec'), i = s.querySelector('[data-hirein]');
  const b = s.querySelector('.d-hire__plus'), chip = s.querySelector('.d-hire li a');
  const r = e => e.getBoundingClientRect();
  return { label: b.textContent.trim(), together: i.parentElement === b.parentElement,
    inLast: [...s.querySelectorAll('.d-hire li')].pop().contains(i),
    sameUl: i.closest('ul') === chip.closest('ul'),
    dh: Math.abs(r(i).height - r(chip).height),
    rad: getComputedStyle(i).borderTopLeftRadius };
});
t('누르면 닫는 × 로 바뀐다', IN.label === '×', IN.label);
/* 좁은 화면에서는 칩이 줄을 넘으므로 **같은 줄**이 아니라 **같은 칩 목록의 맨 끝**인지를
   본다 — 줄바꿈은 제대로 도는 것이지 잘못이 아니다. */
t('적는 칸은 칩 목록 맨 뒤 그 자리에 선다', IN.inLast && IN.sameUl);
t('적는 칸은 칩과 같은 모양이다', IN.dh < 3 && parseFloat(IN.rad) > 100,
  `높이차 ${IN.dh} / 둥글기 ${IN.rad}`);
t('적는 칸과 × 는 한 칸에 묶인다', IN.together);
/* 안내 글은 「이름」만 (2026-11-04, 교수님 지정) — 찾기는 학과로도 되지만 글은 짧게 */
t('적는 칸의 안내 글은 「이름」이다',
  (await page.evaluate(() => document.querySelector('[data-hirein]').placeholder)) === '이름');
t('고치는 동안에는 칩마다 ×가 붙는다', (await page.$$('.d-hire [data-hiredrop]')).length === 4);
/* ×는 **칩 안쪽**에 앉아야 한다 (2026-11-04, 교수님 지정) */
const XB = await page.evaluate(() => {
  const li = document.querySelector('.d-hire li');
  const a = li.querySelector('a').getBoundingClientRect(), x = li.querySelector('.d-hire__x').getBoundingClientRect();
  return { inside: x.left >= a.left && x.right <= a.right + 0.5, a: [a.left, a.right], x: [x.left, x.right] };
});
t('× 는 칩 안쪽에 앉는다', XB.inside, `칩 ${XB.a} / × ${XB.x}`);
/* 안 고칠 때는 칩 오른쪽을 비우지 않는다 — 비워 두면 허전하게 뜬다 */
const padOn = await page.evaluate(() => getComputedStyle(document.querySelector('.d-hire .st-c')).paddingRight);
await plus();
const padOff = await page.evaluate(() => getComputedStyle(document.querySelector('.d-hire .st-c')).paddingRight);
t('고칠 때만 칩이 오른쪽을 비운다', parseFloat(padOn) > parseFloat(padOff), `${padOn} / ${padOff}`);
t('한 번 더 누르면 닫힌다', !(await page.$('[data-hirein]')));
await plus();
t('세 번째에 다시 열린다 — 듣는 이는 늘 하나', !!(await page.$('[data-hirein]')));

/* 찾기 — 접촉 쪽 「만날 분」과 같은 꼴로 칩이 선다 */
t('치기 전에는 찾은 분이 없다', (await hits()).length === 0);
await q('송왕철');
t('이름으로 찾으면 칩이 선다', (await hits()).join(' ').indexOf('송왕철') >= 0, (await hits()).join(' '));
await q('원자력');
const dh = await hits();
t('학과로도 찾는다', dh.length > 1 && dh.every(x => x.indexOf('원자력공학과') >= 0), dh.join(' '));
await q('박승민');
t('본인은 찾아도 안 나온다', (await hits()).length === 0, (await hits()).join(' '));
await q('김민철');
t('이미 묶인 분도 안 나온다', (await hits()).length === 0, (await hits()).join(' '));
await q('홍길동');
/* 명단에 없는 이름이면 **그대로 더하는 칩**이 선다 (2026-11-12, 교수님 지정) */
t('없는 이름이면 「그대로 더하기」 칩만 선다', (await hits()).length === 0 && /명단 밖/.test(await extHit()),
  await extHit());

/* ★ 교수님이 특히 일러 주신 자리 — 한 분을 더하면 **묶음 전체**와 이어진다 */
await q('송왕철');
await page.click('[data-hireadd]');
await page.waitForTimeout(300);
t('찾은 칩을 누르면 더해진다', (await names()).includes('송왕철'), (await names()).join(' '));
t('더한 뒤 몇 명과 이어졌는지 알려 준다', /동기 5명이 함께 섭니다/.test(await status()), await status());
t('더한 뒤 찾는 칸은 비워 둔다', (await page.evaluate(() =>
  document.querySelector('[data-hirein]').value)) === '');
t('씨앗이 저장으로 굳는다', Array.isArray(await saved()) && (await saved()).length === 2,
  JSON.stringify(await saved()));

/* 엔터 — 한 분이면 그대로, 여럿이면 고르라고, 아무도 없으면 왜 그런지 */
const far = state0.find(r => r.i === 'nuclear');
await q(far.n); await enter();
t('엔터 — 찾은 분이 하나면 그대로 더한다', (await names()).includes(far.n), (await names()).join(' '));
await q('김'); await enter();
t('엔터 — 여럿이면 고르시라 한다', /한 분을 누르십시오/.test(await status()), await status());
/* 없는 이름에 엔터는 **명단 밖 사람으로 더합니다** (2026-11-12, 교수님 지정) — 아래
   「명단 밖 사람」 묶음에서 자세히 잽니다. 여기서는 되돌려 두기만 합니다. */
await q('홍길동'); await enter();
await page.waitForTimeout(250);
t('엔터 — 없는 이름은 명단 밖 사람으로 더한다', /명단에 없는 분이라 이름만/.test(await status()), await status());
await page.click('.d-hire [data-hiredrop="@홍길동"]');
await page.waitForTimeout(200);

await open('송왕철');
await page.waitForSelector('.d-hire', { timeout: 10000 });
const S = await names();
t('더해진 교수 쪽에도 나머지가 함께 선다',
  ['박승민', '김민철', '홍정숙', '임형용', '이상엽', far.n].every(n => S.includes(n)), S.join(' '));

/* 빼기 — 모든 줄에서 지우므로 다른 교수 쪽에서도 함께 빠진다 */
await plus();
const limK = state0.find(r => r.n === '임형용').k;
await page.click(`.d-hire [data-hiredrop="${limK}"]`);
await page.waitForTimeout(300);
t('뺀 분은 그 자리에서 사라진다', !(await names()).includes('임형용'), (await names()).join(' '));
await open('박승민');
await page.waitForSelector('.d-hire', { timeout: 10000 });
t('다른 교수 쪽에서도 함께 빠진다', !(await names()).includes('임형용'), (await names()).join(' '));
await open('임형용');
await page.waitForSelector('.d-hire', { timeout: 10000 });
t('빠진 분 쪽은 빈 안내로 돌아간다', !(await names()).length, (await read()).note);
t('빈 칸에도 + 는 그대로 있다', !!(await page.$('.d-hiresec [data-hireedit]')));


/* ---------- 명단 밖 사람 (2026-11-12, 교수님 지정) ----------
   본부 보직자처럼 **우리 명단에 없는 분**도 입사 동기로 적어 둘 수 있어야 한다. */
const outs = () => page.evaluate(() => [...document.querySelectorAll('.d-hire .st-c--out')].map(x => x.textContent.trim()));
if (!(await page.$('[data-hirein]'))) await plus();
await q('총장님');
t('명단에 없는 이름이면 「그대로 더하기」 칩이 선다', /명단 밖/.test(await extHit()), await extHit());
t('그때 명단에서 찾은 칩은 없다', (await hits()).length === 0, (await hits()).join(' '));
await page.click('[data-hireadd^="@"]');
await page.waitForTimeout(300);
t('누르면 이름만으로 들어간다', (await outs()).includes('총장님'), (await outs()).join(','));
t('고리가 아니라 글자다 — 갈 상세가 없으므로', await page.evaluate(() => {
  const el = document.querySelector('.d-hire .st-c--out');
  return !!el && el.tagName === 'SPAN' && !document.querySelector('.d-hire a .st-c--out');
}));
t('저장에는 `@이름` 으로 담긴다', JSON.stringify(await saved()).includes('@총장님'), JSON.stringify(await saved()));
t('더한 뒤 명단 밖 분이라고 알려 준다', /명단에 없는 분이라 이름만/.test(await status()), await status());
t('고치는 동안에는 ×가 붙는다', (await page.$$('.d-hire [data-hiredrop^="@"]')).length === 1);
await q('총장님');
t('이미 적은 이름은 다시 안 뜬다', (await extHit()) === '');
await q('부총장'); await enter();
await page.waitForTimeout(250);
t('엔터만 쳐도 들어간다 — 뜬 칩이 하나이므로', (await outs()).includes('부총장'), (await outs()).join(','));
/* 명단 밖 분도 **이어 붙음**에 낍니다 — 같은 때 들어오셨으면 그 묶음의 한 분입니다 */
t('명단 밖 분도 묶음에 든다', await page.evaluate(() =>
  (hireAll().find(g => g.includes('@총장님')) || []).length >= 2),
  JSON.stringify(await page.evaluate(() => hireAll())));
await page.click('.d-hire [data-hiredrop="@부총장"]');
await page.waitForTimeout(250);
t('×로 뺀다', !(await outs()).includes('부총장'), (await outs()).join(','));
t('뺀 것은 그 이름뿐', (await outs()).includes('총장님'), (await outs()).join(','));
t('명단 열쇠와는 섞이지 않는다', await page.evaluate(() =>
  !isExt(rKey(state.rows[0])) && isExt('@총장님') && extName('@총장님') === '총장님'));

/* 다 지워도 씨앗으로 **되돌아가지 않는다** — `[]` 는 「다 지우셨다」는 뜻이다 */
await page.evaluate(() => { hireSave([]); });
await open('박승민');
await page.waitForSelector('.d-hire', { timeout: 10000 });
t('다 지우면 씨앗으로 되돌아가지 않는다', !(await names()).length, (await names()).join(' '));
t('비어도 저장은 남는다(씨앗과 가려야 하므로)', JSON.stringify(await saved()) === '[]',
  JSON.stringify(await saved()));

let bad = 0; for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close(); process.exit(bad ? 1 : 0);
