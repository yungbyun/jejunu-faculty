/* 접촉 화면 — 문자 쓰기 → 학과 고르기 → 받을 분 고르기 → 예약.
   서버는 부르지 않고 ratingsApi 를 가짜로 바꿔 끼운다.
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';

const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 1100 },
  permissions: ['clipboard-read', 'clipboard-write'] })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });

const checks = [];
const check = (t, v, extra = '') => checks.push([t, v, extra]);

/* 가짜 서버 + 모두에게 번호를 주고 시작 (한 명만 빼고) */
await page.evaluate(() => {
  window.__calls = [];
  state.session = { email: 'ycb@jejunu.ac.kr' };
  window.ratingsApi = async (action, payload) => {
    window.__calls.push({ action, payload });
    if (action === 'outbox') return { ok: true, on: true, dry: true, sms: true, quota: 97, rows: [] };
    if (action === 'queueMany') return { ok: true, n: (payload.items || []).length, skip: 0 };
    return { ok: true };
  };
  Object.assign(OB, { rows: new Map(), on: true, dry: true, sms: true, quota: 97, loaded: true, needDeploy: false });
  mobileMap = {};
  const m = mobiles();
  state.rows.forEach((p, i) => { if (i) m[rKey(p)] = '010-1234-5678'; });   // 0번만 번호 없음
  OUT.text = ''; OUT.depts = new Set(); OUT.off = new Set();
  location.hash = '#/outreach'; render();
});
await page.waitForSelector('.ot-people', { timeout: 10000 });

// 1) 처음 상태
check('전체가 켜져 있다', await page.evaluate(() => document.querySelector('[data-dall]').getAttribute('aria-pressed')) === 'true');
check('전원이 대상', await page.evaluate(() => document.querySelectorAll('.ot-p').length === state.rows.length),
  `${await page.evaluate(() => document.querySelectorAll('.ot-p').length)} / ${await page.evaluate(() => state.rows.length)}`);
check('번호 없는 사람은 체크 안 됨', await page.evaluate(() => {
  const el = document.querySelector('.ot-p--no input');
  return !!el && !el.checked && el.disabled;
}));
check('본문이 비면 보내기 못 누름', await page.evaluate(() => document.querySelector('[data-send]').disabled));

// 2) 문자를 쓴다 — 쓰는 동안 화면을 다시 그리지 않아야 한다(커서가 튄다)
await page.click('.ot-msg');
await page.type('.ot-msg', '{이름} 교수님, 변영철입니다.');
await page.waitForTimeout(300);
check('쓰면 보내기가 열린다', await page.evaluate(() => !document.querySelector('[data-send]').disabled));
check('글자 수를 센다', (await page.evaluate(() => document.querySelector('[data-len]').textContent)).includes('자'));
check('커서가 끝에 남아 있다', await page.evaluate(() => {
  const t = document.querySelector('.ot-msg');
  return document.activeElement === t && t.selectionStart === t.value.length;
}));

// 3) 미리보기에 이름이 들어간다
const prev = await page.evaluate(() => document.querySelector('[data-prev]').textContent);
const firstName = await page.evaluate(() => outPicked()[0].name);
check('미리보기에 이름이 바뀌어 들어감', prev.includes(firstName) && !prev.includes('{이름}'), prev);

// 4) 학과를 여러 개 고른다
await page.click('[data-dept="comdol"]');
await page.waitForTimeout(300);
await page.click('[data-dept="telecom"]');
await page.waitForTimeout(300);
const twoDept = await page.evaluate(() => {
  const want = state.rows.filter(p => p.dept_id === 'comdol' || p.dept_id === 'telecom').length;
  return { want, got: document.querySelectorAll('.ot-p').length, all: document.querySelector('[data-dall]').getAttribute('aria-pressed') };
});
check('두 학과만 남는다', twoDept.got === twoDept.want, `${twoDept.got} / ${twoDept.want}`);
check('전체 칩은 꺼진다', twoDept.all === 'false');
await page.click('[data-dept="telecom"]');
await page.waitForTimeout(300);
check('다시 누르면 빠진다', await page.evaluate(() =>
  document.querySelectorAll('.ot-p').length === state.rows.filter(p => p.dept_id === 'comdol').length));

// 5) 사람을 뺀다
const before = await page.evaluate(() => outPicked().length);
await page.locator('.ot-p:not(.ot-p--no) input').first().uncheck();
await page.waitForTimeout(300);
check('해제하면 한 명 줄어든다', await page.evaluate(() => outPicked().length) === before - 1);
check('단추 글자도 따라 바뀐다', (await page.locator('[data-send]').innerText()).includes(String(before - 1)),
  await page.locator('[data-send]').innerText());
await page.click('[data-allon]');
await page.waitForTimeout(300);
check('전체 선택으로 되돌아온다', await page.evaluate(() => outPicked().length) === before);
await page.click('[data-alloff]');
await page.waitForTimeout(300);
check('전체 해제하면 0명', await page.evaluate(() => outPicked().length) === 0);
check('0명이면 보내기 못 누름', await page.evaluate(() => document.querySelector('[data-send]').disabled));
await page.click('[data-allon]');
await page.waitForTimeout(300);

// 6) 예약한다
await page.evaluate(() => { window.confirm = () => true; });
await page.click('[data-send]');
await page.waitForTimeout(700);
const call = await page.evaluate(() => (window.__calls.filter(c => c.action === 'queueMany').pop() || {}).payload || {});
check('queueMany 로 한 번에 보낸다', Array.isArray(call.items) && call.items.length === before, String(call.items && call.items.length));
check('문자 채널로 나간다', call.channel === 'sms');
check('사람마다 본문이 다르다', new Set(call.items.map(i => i.body)).size === call.items.length);
check('본문에 표시가 남아 있지 않다', call.items.every(i => !i.body.includes('{이름}')));
check('번호로 보낸다', call.items.every(i => /^010-\d{4}-\d{4}$/.test(i.to)));
check('번호 없는 사람은 빠진다', call.items.length === before);

// 7) 확인 창에서 취소하면 안 보낸다
await page.evaluate(() => { window.__calls = []; window.confirm = () => false; });
await page.click('[data-send]');
await page.waitForTimeout(500);
check('취소하면 아무것도 안 나간다', await page.evaluate(() => window.__calls.filter(c => c.action === 'queueMany').length) === 0);

// 8) 원고 불러오기
const loaded = await page.evaluate(() => {
  window.confirm = () => true;
  const n = epNos()[0];
  document.querySelector('[data-epsel]').value = String(n);
  document.querySelector('[data-epload]').click();
  return { want: (epOf(n).sms || epOf(n).body || '').slice(0, 40), ep: n };
});
await page.waitForTimeout(500);
check('회차 원고를 불러온다', (await page.evaluate(() => OUT.text)).startsWith(loaded.want), loaded.want.slice(0, 20));

// 9) 없어진 것들
check('교수별 초안 펼치기 없음', await page.evaluate(() => !document.querySelector('[data-open]')));
check('AI 다시 쓰기 없음', await page.evaluate(() => !document.querySelector('[data-airun], [data-aidept], [data-aiprof]')));
check('채널 고르기 없음', await page.evaluate(() => !document.querySelector('[data-ch]')));

// 10) 카톡용 복사 — 자동 발송이 안 되므로 한 사람씩 붙여넣는다
await page.evaluate(() => {
  copiedSet = new Set(); localStorage.removeItem('jnu-copied');
  OUT.text = '{이름} 교수님, 컴퓨터공학과 변영철입니다.';
  OUT.depts = new Set(['comdol']); OUT.off = new Set();
  renderOutreach();
});
await page.waitForSelector('[data-copy]', { timeout: 10000 });
check('행마다 복사 단추', await page.locator('[data-copy]').count() > 0, String(await page.locator('[data-copy]').count()));
check('처음엔 0 복사', await page.evaluate(() => document.querySelector('[data-ncopy]').textContent) === '0');
const cname = await page.locator('[data-prof]').first().innerText();
await page.locator('[data-copy]').first().click();
await page.waitForTimeout(500);
const clip = await page.evaluate(() => navigator.clipboard.readText());
check('클립보드에 개인화된 글', clip.startsWith(cname) && !clip.includes('{이름}'), clip);
check('단추가 복사함으로 바뀜', (await page.locator('[data-copy]').first().innerText()).includes('복사함'));
check('진행 숫자 올라감', await page.evaluate(() => document.querySelector('[data-ncopy]').textContent) === '1');
check('이 기기에만 저장', await page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('jnu-copied')).length === 1; } catch { return false; }
}));
await page.evaluate(() => { location.hash = '#/'; render(); location.hash = '#/outreach'; render(); });
await page.waitForSelector('[data-copy]', { timeout: 10000 });
check('화면을 다시 열어도 표시가 남는다', (await page.locator('[data-copy]').first().innerText()).includes('복사함'));
await page.evaluate(() => { window.confirm = () => true; });
await page.click('[data-copyclr]');
await page.waitForTimeout(400);
check('복사 표시 지우기', await page.evaluate(() => copied().size === 0));
await page.evaluate(() => { copiedSet = new Set(); localStorage.removeItem('jnu-copied'); });



// 11) 복사 단추는 토글 — 잘못 눌렀으면 되돌릴 수 있어야 한다
await page.evaluate(() => { copiedSet = new Set(); localStorage.removeItem('jnu-copied'); renderOutreach(); });
await page.waitForSelector('[data-copy]', { timeout: 10000 });
await page.locator('[data-copy]').first().click();
await page.waitForTimeout(400);
check('한 번 누르면 복사함', (await page.locator('[data-copy]').first().innerText()).includes('복사함'));
await page.locator('[data-copy]').first().click();
await page.waitForTimeout(400);
check('다시 누르면 복사로 돌아옴', (await page.locator('[data-copy]').first().innerText()).trim() === '복사',
  (await page.locator('[data-copy]').first().innerText()).trim());
check('되돌리면 숫자도 줄어든다', await page.evaluate(() => document.querySelector('[data-ncopy]').textContent) === '0');
check('기록에서도 빠진다', await page.evaluate(() => copied().size === 0));

// 12) 항시 제외 — 넣어 두면 받을 분에 기본으로 안 들어간다
await page.evaluate(() => { noSendSet = new Set(); localStorage.removeItem('jnu-nosend'); renderOutreach(); });
await page.waitForSelector('[data-ban]', { timeout: 10000 });
const nBefore = await page.evaluate(() => outPicked().length);
const banned = await page.evaluate(() => outPicked()[0].name);
await page.locator('[data-ban]').first().click();
await page.waitForTimeout(500);
check('항시 제외하면 한 명 줄어든다', await page.evaluate(() => outPicked().length) === nBefore - 1,
  `${nBefore} → ${await page.evaluate(() => outPicked().length)}`);
check('체크가 꺼지고 잠긴다', await page.evaluate(() => {
  const i = document.querySelector('.ot-p--ban input');
  return !!i && !i.checked && i.disabled;
}));
check('머리말에 빠진 이유 표시', (await page.evaluate(() =>
  document.querySelector('[data-nsel]').closest('.st-note').textContent)).includes('항시 제외 1명'));
check('전체 선택을 눌러도 안 들어온다', await page.evaluate(() => {
  document.querySelector('[data-allon]').click();
  return outPicked().length;
}) === nBefore - 1);
await page.waitForTimeout(400);
check('보낼 목록에서도 빠진다', await page.evaluate(w => !outPicked().some(p => p.name === w), banned), banned);
await page.evaluate(() => { location.hash = '#/'; render(); location.hash = '#/outreach'; render(); });
await page.waitForSelector('[data-ban]', { timeout: 10000 });
check('다시 열어도 그대로', await page.evaluate(() => outPicked().length) === nBefore - 1);
await page.locator('.ot-p--ban [data-ban]').click();
await page.waitForTimeout(500);
check('되돌리면 다시 들어온다', await page.evaluate(() => outPicked().length) === nBefore);
await page.evaluate(() => { noSendSet = new Set(); localStorage.removeItem('jnu-nosend'); });


// 13) 비참여(선호도 '비')도 기본으로 빠진다 — 과반 계산에서 빠지는 분들이다
const nb = await page.evaluate(() => outPicked().length);
const bname = await page.evaluate(() => { const p = outPicked()[0]; setRating(rKey(p), '비'); renderOutreach(); return p.name; });
await page.waitForTimeout(500);
check('비참여는 빠진다', await page.evaluate(() => outPicked().length) === nb - 1, `${nb} → ${await page.evaluate(() => outPicked().length)}`);
check('행에 비참여라고 적힌다', await page.evaluate(w => {
  const row = [...document.querySelectorAll('.ot-p')].find(e => e.querySelector('[data-prof]').textContent === w);
  return !!row && row.querySelector('.ot-p__m').textContent.includes('비참여');
}, bname), bname);
check('체크가 잠긴다', await page.evaluate(w => {
  const row = [...document.querySelectorAll('.ot-p')].find(e => e.querySelector('[data-prof]').textContent === w);
  return row.querySelector('input').disabled && !row.querySelector('input').checked;
}, bname));
check('전체 선택으로도 안 들어온다', await page.evaluate(() => { document.querySelector('[data-allon]').click(); return outPicked().length; }) === nb - 1);
await page.waitForTimeout(400);
check('선호도를 바꾸면 다시 들어온다', await page.evaluate(w => {
  const p = state.rows.find(x => x.name === w);
  setRating(rKey(p), '중'); renderOutreach();
  return outPicked().length;
}, bname) === nb);
await page.evaluate(w => { const p = state.rows.find(x => x.name === w); setRating(rKey(p), ''); }, bname);

let bad = 0;
for (const [t, v, extra] of checks) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${t}${extra ? '   (' + extra + ')' : ''}`); }
console.log(`\n${checks.length - bad}/${checks.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
