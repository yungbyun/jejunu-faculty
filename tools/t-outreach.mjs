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

// 1) 성향 칩 — 켜고 끄기
const firstKey = await page.evaluate(() => rKey(state.rows[0]));
await page.click(`[data-tr="${firstKey}"][data-v="연"]`);
check('성향 칩으로 연 지정', await page.evaluate(k => traits()[k] === '연', firstKey));
check('localStorage 저장', await page.evaluate(k => {
  try { return (JSON.parse(localStorage.getItem('jnu-trait') || '{}'))[k] === '연'; } catch { return false; }
}, firstKey));
await page.click(`[data-tr="${firstKey}"][data-v="연"]`);
check('같은 값 다시 누르면 해제', await page.evaluate(k => !traits()[k], firstKey));

// 2) 일괄 지정
await page.click('[data-fill="연"]');
check('미지정을 모두 연으로', await page.evaluate(() => state.rows.every(p => traitOf(p))));
check('일괄 후 버튼 사라짐', await page.evaluate(() => !document.querySelector('[data-fill]')));

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
check('연구 한 줄이 본문에 반영', await page.evaluate(() => {
  const one = document.querySelector('.oc__one')?.textContent.replace('연구 한 줄', '').trim();
  const ta = document.querySelector('.oc__ta').value;
  return !one || one.includes('대신했습니다') || ta.includes(one);
}));
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

// 4) 접촉 상태
await page.click(`.oc__d [data-st="${k2}"][data-v="보냄"]`);
await page.waitForTimeout(400);
check('상태 보냄 저장', await page.evaluate(k => (contacts()[k] || {}).st === '보냄', k2));
check('머리말 집계 반영', await page.evaluate(() => /보냄 1/.test(document.querySelector('.ot-head__m').textContent)));

// 5) 필터
await page.click('[data-of="st"][data-v="보냄"]');
await page.waitForTimeout(400);
check('상태 필터', await page.evaluate(() => document.querySelectorAll('.oc').length === 1));
await page.click('[data-of="st"][data-v="전체"]');
await page.waitForTimeout(400);
check('필터 해제', await page.evaluate(() => document.querySelectorAll('.oc').length === 70));

// 6) 이메일 없는 교수 표시
check('메일 없는 교수 표시', await page.evaluate(() => {
  const n = state.rows.filter(p => !p.email).length;
  return document.querySelectorAll('.oc__no').length === n && n > 0;
}), );

let bad = 0;
for (const [t, v, extra] of checks) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${t}${extra ? '   (' + extra + ')' : ''}`); }
console.log(`\n${checks.length - bad}/${checks.length} 통과`);
await b.close();
process.exit(bad ? 1 : 0);
