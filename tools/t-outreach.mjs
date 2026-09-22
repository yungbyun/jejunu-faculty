/* 접촉 화면 동작 확인. 로컬 서버(127.0.0.1:8080)가 떠 있어야 한다.
   저장은 localStorage 까지만 확인한다 — 로그인 없이 돌리므로 시트로는 나가지 않는다. */
import { chromium } from 'playwright';

const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
await page.goto('http://127.0.0.1:8080/#/outreach', { waitUntil: 'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
await page.evaluate(() => { location.hash = '#/outreach'; render(); });
await page.waitForTimeout(600);

const checks = [];
const check = (t, v, extra = '') => { checks.push([t, v, extra]); };

// 1) 성향 태그는 뺐다 (2026-09-21) — 회차 갈래가 개인화를 맡는다
check('성향 칩 없음', await page.evaluate(() =>
  !document.querySelector('[data-tr]') && !document.querySelector('[data-of="trait"]') && !document.querySelector('[data-fill]')));
check('성향 데이터 계층도 없음', await page.evaluate(() => typeof traitOf === 'undefined'));

// 3) 초안 펼치기 + 채널 전환
const k2 = await page.evaluate(() => rKey(state.rows[2]));
await page.click(`[data-open="${k2}"]`);
await page.waitForSelector('.oc__ta', { timeout: 10000 });
const mail = await page.evaluate(() => document.querySelector('.oc__ta').value);
check('메일 초안에 이름이 들어감', await page.evaluate(k => {
  const p = state.rows.find(x => rKey(x) === k);
  return document.querySelector('.oc__ta').value.startsWith(p.name + ' 교수님께');
}, k2));
check('메일 초안에 서명', mail.includes('ycb@jejunu.ac.kr'));
// 회차 본문은 갈래 문장으로 개인화한다. 연구 한 줄은 참고용으로 위에 보여 주고,
// 본문에 넣고 싶으면 원고에 {연구} 를 쓴다(회차 테스트에서 확인).
check('연구 한 줄이 참고로 보임', await page.evaluate(() =>
  !!document.querySelector('.oc__one')?.textContent.trim()));
const href = await page.getAttribute('.oc__acts a.btn', 'href');
check('mailto 링크 생성', !!href && href.startsWith('mailto:') && href.includes('subject='), href ? href.slice(0, 60) + '…' : '없음');

await page.click('.oc__d [data-ch="문자"]');
await page.waitForTimeout(400);
const sms = await page.evaluate(() => document.querySelector('.oc__ta').value);
check('문자로 바꾸면 짧아짐', sms.length < mail.length && sms.length > 80, `문자 ${sms.length}자 / 메일 ${mail.length}자`);
check('문자에 제목칸 없음', await page.evaluate(() => !document.querySelector('.oc__sub')));
await page.click('.oc__d [data-ch="카톡"]');
await page.waitForTimeout(400);
const kakao = await page.evaluate(() => document.querySelector('.oc__ta').value);
check('카톡은 줄바꿈 있음', kakao.includes('\n\n'));

// 4) 선호도·접촉 상태는 이 화면에서 뺐다 (2026-09-20)
check('선호도 칩 없음', await page.evaluate(() =>
  !document.querySelector('[data-of="rate"]') && !document.querySelector('.oc .rs')));
check('상태 칩·배지 없음', await page.evaluate(() =>
  !document.querySelector('[data-of="st"]') && !document.querySelector('.oc__st') && !document.querySelector('[data-st]')));
check('머리말은 회차 기준', await page.evaluate(() => /회차 보냄/.test(document.querySelector('.ot-head__m').textContent)));

// 5) 남은 거르개는 학과 하나
const nComdol = await page.evaluate(() => state.rows.filter(p => p.dept_id === 'comdol').length);
await page.click('[data-of="dept"][data-v="comdol"]');
await page.waitForTimeout(400);
check('학과 필터', await page.evaluate(n => document.querySelectorAll('.oc').length === n, nComdol), `전자공학과 ${nComdol}명`);
await page.click('[data-of="dept"][data-v="전체"]');
await page.waitForTimeout(400);
check('필터 해제', await page.evaluate(() => document.querySelectorAll('.oc').length === state.rows.length));

// 6) 이메일 없는 교수 표시 — 지금은 모두 이메일이 있어 0명이 정상이다
const noMail = await page.evaluate(() => ({
  data: state.rows.filter(p => !p.email).length,
  shown: document.querySelectorAll('.oc__no').length,
}));
check('메일 없는 교수 표시가 데이터와 일치', noMail.data === noMail.shown, `${noMail.shown}명 표시`);

// 8) 메일 보낸 횟수 카운터
await page.click(`[data-open="${k2}"]`);
await page.waitForSelector('.oc__ta', { timeout: 10000 });
await page.click('.oc__d [data-ch="메일"]');
await page.waitForSelector('.mailc', { timeout: 10000 });
check('카운터가 0에서 시작', await page.evaluate(() => document.querySelector('.mailc .counter__n').textContent === '0'));
await page.click('.mailc [data-inc]');
await page.waitForTimeout(500);
check('+ 누르면 1', await page.evaluate(k => mails()[k] === 1, k2));
check('행에 메일 횟수 배지', await page.evaluate(() => /메일 1회/.test(document.querySelector('.oc__mc')?.textContent || '')));
check('localStorage 저장', await page.evaluate(k => {
  try { return (JSON.parse(localStorage.getItem('jnu-mailcnt') || '{}'))[k] === 1; } catch { return false; }
}, k2));
await page.click('.mailc [data-dec]');
await page.waitForTimeout(500);
check('− 누르면 0으로 되돌아감', await page.evaluate(k => !mails()[k], k2));
check('0이면 배지 사라짐', await page.evaluate(() => !document.querySelector('.oc__mc')));

let bad = 0;
for (const [t, v, extra] of checks) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${t}${extra ? '   (' + extra + ')' : ''}`); }
console.log(`\n${checks.length - bad}/${checks.length} 통과`);
await b.close();
process.exit(bad ? 1 : 0);
