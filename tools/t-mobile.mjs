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
/* 핸드폰을 누르면 바로 문자 쓰기로 간다. 전화는 옆의 수화기로 건다. (2026-10-12) */
check('핸드폰은 sms: 링크', await page.evaluate(() => document.querySelector('.po__mob').getAttribute('href') === 'sms:01012345678'),
  await page.evaluate(() => document.querySelector('.po__mob').getAttribute('href')));
check('옆에 전화 걸기 단추', await page.evaluate(() => {
  const a = document.querySelector('.po__mobw a.po__cp');
  return !!a && a.getAttribute('href') === 'tel:01012345678';
}));
check('연구실 번호는 그대로 tel:', await page.evaluate(() => {
  const a = document.querySelector('.prof__office a.po__tel:not(.po__mob)');
  return !a || /^tel:/.test(a.getAttribute('href'));
}));

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
check('복사한 뒤 확인 표시', await page.evaluate(() => document.querySelector('.po__cp[data-copynum]').classList.contains('ok')));

/* 3) 상세 화면의 번호 줄 — 영문 이름 바로 아래, 같은 글꼴·색으로 (2026-10-07).
   따로 칸을 두었다가(같은 날) 영문 이름 아래로 옮겼다. */
await page.evaluate(x => {
  const p = state.rows.find(y => rKey(y) === x);
  location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render();
}, k);
await page.waitForSelector('.d-phones', { timeout: 10000 });
check('연락처 칸을 따로 두지 않는다', await page.evaluate(() =>
  ![...document.querySelectorAll('.d-section h3')].some(h => h.textContent.trim() === '연락처')));
/* 2026-10-15 에 연구실 줄이 사이에 들어왔다 — 영문 이름 / 연구실 / 번호 차례 */
check('영문 이름 — 연구실 — 번호 차례', await page.evaluate(() => {
  const en = document.querySelector('.d-en:not(.d-phones)'), ph = document.querySelector('.d-phones');
  const of = document.querySelector('.d-office');
  return of ? (en.nextElementSibling === of && of.nextElementSibling === ph)
            : en.nextElementSibling === ph;
}), await page.evaluate(() => [...document.querySelector('.d-profile').lastElementChild.children].map(e => e.className).join(' / ')));
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
/* 2026-10-15 — 번호를 누르면 어느 쪽이든 전화. 문자는 핸드폰 옆의 말풍선으로 */
check('번호는 둘 다 tel:', ct.length === 2 && ct.every(x => /^tel:[\d+]+$/.test(x.href)),
  ct.map(x => x.href).join(' '));
check('핸드폰 옆에 문자 단추', await page.evaluate(() => {
  const a = [...document.querySelectorAll('.d-ct')][1].querySelector('a.d-ct__c');
  return !!a && /^sms:/.test(a.getAttribute('href'));
}), await page.evaluate(() => ([...document.querySelectorAll('.d-ct')][1].querySelector('a.d-ct__c') || {}).outerHTML || '(없음)'));
check('둘 다 복사 아이콘', ct.length === 2 && ct.every(x => x.cp));
/* 상세에서 복사 아이콘을 눌러도 화면이 닫히거나 넘어가면 안 된다 */
const dHash = await page.evaluate(() => location.hash);
await page.locator('.d-ct__c').last().click();
await page.waitForTimeout(400);
check('상세에서도 복사된다', await page.evaluate(() => navigator.clipboard.readText()) === '010-1234-5678');
check('상세가 닫히지 않는다', await page.evaluate(() => location.hash) === dHash &&
  await page.evaluate(() => !document.querySelector('.drawer').hidden));
/* 번호가 하나도 없어도 줄은 남긴다 — 거기에 「핸드폰 등록」 단추가 있다 (2026-10-12) */
check('번호가 없으면 등록 단추만', await page.evaluate(() => {
  const q = state.rows.find(y => !mobileOf(y));
  if (!q) return true;
  const keep = q.phone; q.phone = '';
  location.hash = `#/dept/${q.dept_id}/prof/${q.slug}`; render();
  const box = document.querySelector('.d-phones');
  const ok = !!box && !!box.querySelector('[data-mobed]') && !box.querySelector('.d-ct__n');
  q.phone = keep;
  return ok;
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

/* 번호를 폰에서 바로 등록·수정 — 수화기 옆 연필 (2026-10-12) */
const who = await page.evaluate(() => {
  mobileMap = {}; localStorage.removeItem('jnu-mobile');
  const p = state.rows[2];
  location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render();
  return p.name;
});
await page.waitForSelector('.d-phones', { timeout: 10000 });
check('번호가 없으면 「핸드폰 등록」', await page.evaluate(() => {
  const b = document.querySelector('[data-mobed]');
  return !!b && b.textContent.includes('핸드폰 등록');
}), await page.evaluate(() => document.querySelector('.d-phones').innerText.replace(/\n/g, ' | ')));
await page.click('[data-mobed]');
await page.waitForSelector('[data-mobin]', { timeout: 5000 });
check('숫자 자판이 뜨는 칸', await page.evaluate(() => {
  const i = document.querySelector('[data-mobin]');
  return i.type === 'tel' && i.getAttribute('inputmode') === 'numeric';
}));
check('칸에 커서가 가 있다', await page.evaluate(() => document.activeElement === document.querySelector('[data-mobin]')));

/* 자릿수가 안 맞으면 저장하지 않는다 */
await page.fill('[data-mobin]', '12345');
await page.click('[data-mobok]');
await page.waitForTimeout(200);
check('짧은 번호는 안 받는다', await page.evaluate(() => !!document.querySelector('[data-mobin]')));
check('왜 안 되는지 알려 준다', (await page.evaluate(() => document.querySelector('.foot__status').textContent)).includes('자리'),
  await page.evaluate(() => document.querySelector('.foot__status').textContent));

/* 제대로 넣으면 저장되고 바로 문자 링크가 된다 */
await page.fill('[data-mobin]', '01087651234');
await page.press('[data-mobin]', 'Enter');
await page.waitForTimeout(250);
check('엔터로도 저장된다', await page.evaluate(() => mobileOf(state.rows[2])) === '010-8765-1234',
  await page.evaluate(() => mobileOf(state.rows[2])));
check('저장하면 바로 전화 링크', await page.evaluate(() => {
  const a = [...document.querySelectorAll('.d-ct__n')].pop();
  return !!a && a.getAttribute('href') === 'tel:01087651234';
}), await page.evaluate(() => ([...document.querySelectorAll('.d-ct__n')].pop() || {}).getAttribute?.('href')));
check('옆의 말풍선은 문자로 간다', await page.evaluate(() => {
  const a = [...document.querySelectorAll('.d-ct')].pop().querySelector('a.d-ct__c');
  return !!a && a.getAttribute('href') === 'sms:01087651234';
}));
check('시트에도 올라간다', await page.evaluate(() =>
  JSON.parse(localStorage.getItem('jnu-mobile'))[rKey(state.rows[2])] === '010-8765-1234'));
check('수화기 옆에 연필', await page.evaluate(() => {
  const box = [...document.querySelectorAll('.d-ct')].pop();
  const kids = [...box.children].map(e => e.tagName + (e.dataset.mobed !== undefined ? ':pen' : ''));
  return kids.some(k => k.endsWith(':pen'));
}), await page.evaluate(() => [...[...document.querySelectorAll('.d-ct')].pop().children].map(e => e.tagName).join(' ')));

/* 취소하면 그대로 둔다 */
await page.click('[data-mobed]');
await page.fill('[data-mobin]', '01000000000');
await page.click('[data-mobno]');
await page.waitForTimeout(200);
check('취소하면 안 바뀐다', await page.evaluate(() => mobileOf(state.rows[2])) === '010-8765-1234');

/* 카드의 연필 — 상세를 열며 바로 고치게 한다 */
await page.evaluate(() => { closeDrawer(false); const p = state.rows[2]; location.hash = `#/dept/${p.dept_id}`; render(); });
await page.waitForSelector('[data-mobgo]', { timeout: 10000 });
await page.locator('[data-mobgo]').first().click();
await page.waitForTimeout(500);
check('카드 연필이 상세를 연다', await page.evaluate(() => !document.getElementById('drawer').hidden));
check('열자마자 고칠 수 있다', await page.evaluate(() => !!document.querySelector('[data-mobin]')));

/* 비우면 지운다 */
await page.fill('[data-mobin]', '');
await page.click('[data-mobok]');
await page.waitForTimeout(250);
check('비우면 번호가 지워진다', await page.evaluate(() => mobileOf(state.rows[2])) === '');
check('지우면 다시 등록 단추', await page.evaluate(() => !!document.querySelector('[data-mobed]')));
await page.evaluate(() => { mobileMap = {}; localStorage.removeItem('jnu-mobile'); closeDrawer(false); });

/* 번호 앞 그림 — 누르면 무엇이 되는지를 말한다 (2026-10-15) */
check('연구실 번호 앞에 수화기', await page.evaluate(() => {
  const p = state.rows.find(x => x.phone) || state.rows[0];
  mobiles()[rKey(p)] = '010-1234-5678';
  location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render();
  const tel = document.querySelector('.d-ct__n[href^="tel:"]');
  return !!tel && !!tel.querySelector('svg');
}), await page.evaluate(() => (document.querySelector('.d-ct__n[href^="tel:"]') || {}).outerHTML || '(없음)'));
check('핸드폰 번호 앞에도 수화기', await page.evaluate(() => {
  const a = [...document.querySelectorAll('.d-ct__n')].pop();
  return !!a && /^tel:/.test(a.getAttribute('href')) && !!a.querySelector('svg');
}));
/* 그림과 하는 일이 맞아떨어져야 한다 — 수화기는 전화, 말풍선은 문자 */
check('번호 앞 수화기와 옆 말풍선은 다른 그림', await page.evaluate(() => {
  const d = e => (e && e.querySelector('svg path') || {}).getAttribute?.('d') || '';
  const num = [...document.querySelectorAll('.d-ct__n')].pop();
  const sms = [...document.querySelectorAll('.d-ct')].pop().querySelector('a.d-ct__c[href^="sms:"]');
  return !!sms && d(num) !== d(sms);
}));
check('문자 단추의 그림은 연구실 수화기와도 다르다', await page.evaluate(() => {
  const d = e => (e && e.querySelector('svg path') || {}).getAttribute?.('d') || '';
  const tel = document.querySelector('.d-ct__n[href^="tel:"]');
  const sms = [...document.querySelectorAll('.d-ct')].pop().querySelector('a.d-ct__c[href^="sms:"]');
  return !!sms && d(tel) !== d(sms);
}));
check('그림이 번호를 밀어내지 않는다', await page.evaluate(() => {
  const e = document.querySelector('.d-phones');
  return e.scrollWidth <= e.clientWidth + 1;
}), await page.evaluate(() => { const e = document.querySelector('.d-phones'); return e.scrollWidth + '/' + e.clientWidth; }));
await page.evaluate(() => { mobileMap = {}; localStorage.removeItem('jnu-mobile'); });

/* 연구실 방 번호 — 상세에도 적는다 (2026-10-15) */
const ofc = await page.evaluate(() => {
  const pick = f => state.rows.find(f);
  const both = pick(x => /[(（]/.test(x.office || ''));              // 연구실 이름 (건물 호실)
  const only = pick(x => (x.office || '') && !/[(（]/.test(x.office) && /\d/.test(x.office));  // 호실만
  const lab = pick(x => (x.office || '') && !/\d/.test(x.office));   // 이름만, 호실 없음
  const show = p => { location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render();
    const el = document.querySelector('.d-office');
    return { want: p.office, got: el ? el.textContent.trim() : '', svg: !!(el && el.querySelector('svg')) }; };
  return { both: both && show(both), only: only && show(only), lab: lab && show(lab),
    none: (() => { const p = state.rows[0], keep = p.office; p.office = '';
      const r = show(p); p.office = keep; return r; })() };
});
check('연구실 이름과 호실을 함께 적는다', !ofc.both || (ofc.both.got.includes('7212') || /\d/.test(ofc.both.got))
  && ofc.both.got.includes('·'), ofc.both && `${ofc.both.want} → ${ofc.both.got}`);
check('호실만 적힌 분은 호실만', !ofc.only || ofc.only.got === ofc.only.want,
  ofc.only && `${ofc.only.want} → ${ofc.only.got}`);
check('호실이 없으면 연구실 이름만', !ofc.lab || ofc.lab.got === ofc.lab.want,
  ofc.lab && `${ofc.lab.want} → ${ofc.lab.got}`);
check('연구실 칸이 비면 줄을 안 만든다', ofc.none.got === '', JSON.stringify(ofc.none));
check('핀 그림이 앞에 붙는다', !ofc.both || ofc.both.svg);
/* 차례는 학과 카드와 같이 방 번호 → 전화 → 핸드폰 */
check('방 번호가 번호 줄 위에 온다', await page.evaluate(() => {
  const p = state.rows.find(x => /\d/.test(x.office || '') && x.phone) || state.rows[0];
  mobiles()[rKey(p)] = '010-1234-5678';
  location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render();
  const o = document.querySelector('.d-office'), ph = document.querySelector('.d-phones'),
    en = document.querySelector('.d-en:not(.d-phones)'), tg = document.querySelector('.d-tags');
  if (!o || !ph || !en || !tg) return false;
  const after = (a, b2) => !!(a.compareDocumentPosition(b2) & Node.DOCUMENT_POSITION_FOLLOWING);
  return after(en, o) && after(o, ph) && after(ph, tg);
}), await page.evaluate(() => [...document.querySelector('.d-profile').lastElementChild.children]
  .map(e => e.className).join(' / ')));
check('번호 줄 안에서는 연구실 다음 핸드폰', await page.evaluate(() => {
  const a = [...document.querySelectorAll('.d-ct__n')].map(x => (x.getAttribute('href') || '').replace(/\D/g, ''));
  return a.length === 2 && a[0].startsWith('064') && a[1].startsWith('010');
}), await page.evaluate(() => [...document.querySelectorAll('.d-ct__n')].map(x => x.getAttribute('href')).join(' ')));
await page.evaluate(() => { mobileMap = {}; localStorage.removeItem('jnu-mobile'); });
await page.evaluate(() => closeDrawer(false));

let bad = 0;
for (const [t, v, extra] of checks) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${t}${extra ? '   (' + extra + ')' : ''}`); }
console.log(`\n${checks.length - bad}/${checks.length} 통과`);
await b.close();
process.exit(bad ? 1 : 0);
