/* 회차 기능 확인. 로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';

const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
await page.goto('http://127.0.0.1:8080/#/outreach', { waitUntil: 'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
await page.evaluate(() => { location.hash = '#/outreach'; render(); });
await page.waitForTimeout(600);

const checks = [];
const check = (t, v, extra = '') => checks.push([t, v, extra]);

// 1) 갈래가 학과로 자동으로 갈린다
const segs = await page.evaluate(() => {
  const c = {};
  state.rows.forEach(p => { const s = segOf(p); c[s] = (c[s] || 0) + 1; });
  return c;
});
check('갈래 A 전자·통신 11명', segs.A === 11, JSON.stringify(segs));
check('갈래 E 인공지능학과 5명', segs.E === 5);
check('갈래 D 컴퓨터공학과 6명', segs.D === 6);
check('모든 교수가 갈래를 가짐', Object.values(segs).reduce((a, b) => a + b, 0) === 70);

// 2) 1회차가 기본으로 들어 있다
check('1회차 기본 제공', await page.evaluate(() => epNos().length >= 1 && !!epOf(1)));
check('회차 탭이 보임', await page.evaluate(() => !!document.querySelector('[data-ep="1"]')));

// 3) 갈래마다 다른 본문이 조립된다
const bodies = await page.evaluate(() => {
  const pick = s => state.rows.find(p => segOf(p) === s);
  const out = {};
  for (const s of ['A', 'B', 'C', 'D', 'E']) {
    const p = pick(s);
    out[s] = p ? epBody(epOf(1), p, '메일', '') : '';
  }
  return out;
});
check('A 갈래에 캡스톤 문장', /캡스톤디자인/.test(bodies.A));
check('B 갈래에 "학생도 왔습니다"', /학생도 왔습니다/.test(bodies.B));
check('C 갈래에 "없었습니다"', /없었습니다/.test(bodies.C));
check('D(컴공)는 "저희가 해야"', /저희가 해야/.test(bodies.D));
check('E(인공지능)는 역할이 커진다는 쪽', /열두 개로 늘어난다/.test(bodies.E) && !/죄송/.test(bodies.E.split('{')[0].slice(-200)));
check('다섯 갈래가 모두 다름', new Set(Object.values(bodies)).size === 5);

// 4) 학과별 덮어쓰기 (전자 30명 / 통신 10명)
const dept = await page.evaluate(() => {
  const e = state.rows.find(p => p.dept_id === 'comdol');
  const t = state.rows.find(p => p.dept_id === 'telecom');
  return { e: epBody(epOf(1), e, '메일', ''), t: epBody(epOf(1), t, '메일', '') };
});
check('전자공학과는 30명', /30명이 함께했습니다/.test(dept.e));
check('통신공학과는 10명', /10명이 함께했습니다/.test(dept.t));

// 5) 자리표시자 치환
const ph = await page.evaluate(() => {
  const p = state.rows.find(x => x.dept_id === 'mse');
  const ep = { body: '{이름}/{학과}/{개인화}/{연구}', seg: { B: '갈래문장' }, dept: {} };
  return { out: epBody(ep, p, '메일', '연구한줄'), name: p.name, dept: p.dept_name };
});
check('{이름}{학과}{개인화}{연구} 치환',
  ph.out === `${ph.name}/${ph.dept}/갈래문장/연구한줄`, ph.out);

// 6) 발송 기록
const k = await page.evaluate(() => rKey(state.rows[0]));
await page.click(`[data-open="${k}"]`);
await page.waitForSelector('[data-epmark]', { timeout: 10000 });
await page.click('[data-epmark]');
await page.waitForTimeout(500);
check('1회차 보냄으로 표시', await page.evaluate(k2 => epDone(state.rows.find(p => rKey(p) === k2), 1), k));
check('행에 회차 배지', await page.evaluate(() => !!document.querySelector('.oc__ep')));
check('머리말 집계', await page.evaluate(() => /이 회차 발송/.test(document.querySelector('.ot-ep').textContent)));
check('localStorage 저장', await page.evaluate(k2 => {
  try { return (JSON.parse(localStorage.getItem('jnu-epsent') || '{}'))[k2].includes(1); } catch { return false; }
}, k));

// 7) 회차 추가 / 원고 편집 — 기본으로 10회차까지 있으므로 새 회차는 그다음 번호다
const before = await page.evaluate(() => epNos().slice(-1)[0]);
await page.click('[data-epadd]');
await page.waitForTimeout(600);
const added = await page.evaluate(() => OUT.ep);
check('회차 추가', added === before + 1 && await page.evaluate(n => epNos().includes(n), added), `${before}회차 다음 → ${added}회차`);
check('원고 편집 패널 열림', await page.evaluate(() => !!document.querySelector('.ep-edit')));
await page.fill('[data-epf="subject"]', '새 회차 제목');
await page.fill('[data-epf="body"]', '{이름} 교수님, 새 회차입니다. {개인화}');
await page.fill('[data-seg="B"]', '새 갈래 문장');
await page.click('[data-epsave]');
await page.waitForTimeout(600);
check('원고 저장됨', await page.evaluate(n => epOf(n).subject === '새 회차 제목', added));
check('저장 뒤 조립', await page.evaluate(n => {
  const p = state.rows.find(x => segOf(x) === 'B');
  return epBody(epOf(n), p, '메일', '') === `${p.name} 교수님, 새 회차입니다. 새 갈래 문장`;
}, added));
check('1회차 발송 기록은 새 회차에 안 보임', await page.evaluate(() => !document.querySelector('.oc__ep')));

// 8) 채널마다 본문이 다르다 — 문자는 짧게, 카톡은 메일에 가깝게
const ch = await page.evaluate(() => {
  const p = state.rows.find(x => segOf(x) === 'B');
  const e = epOf(1);
  return { mail: epBody(e, p, '메일', ''), sms: epBody(e, p, '문자', ''), kakao: epBody(e, p, '카톡', '') };
});
check('세 채널 본문이 모두 다름', new Set([ch.mail, ch.sms, ch.kakao]).size === 3);
check('문자 < 카톡 < 메일 순으로 짧음', ch.sms.length < ch.kakao.length && ch.kakao.length < ch.mail.length,
  `문자 ${ch.sms.length} / 카톡 ${ch.kakao.length} / 메일 ${ch.mail.length}`);
check('문자에는 사업단 소개 없음', !/AI융합원/.test(ch.sms));
check('카톡에는 사업단 소개 있음', /AI융합원/.test(ch.kakao));
check('세 채널 모두 30개 기업 언급', [ch.mail, ch.sms, ch.kakao].every(t => /30개가 넘는/.test(t)));
check('카톡 본문이 비면 문자로 대신', await page.evaluate(() => {
  const p = state.rows.find(x => segOf(x) === 'B');
  return epBody({ body: 'M', sms: 'S', seg: {} }, p, '카톡', '') === 'S';
}));

let bad = 0;
for (const [t, v, extra] of checks) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${t}${extra ? '   (' + extra + ')' : ''}`); }
console.log(`\n${checks.length - bad}/${checks.length} 통과`);
await b.close();
process.exit(bad ? 1 : 0);
