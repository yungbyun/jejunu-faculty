/* 예약 발송 UI 확인. 서버는 부르지 않고 ratingsApi 를 가짜로 바꿔 끼운다.
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';

const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
await page.goto('http://127.0.0.1:8080/#/outreach', { waitUntil: 'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });

const checks = [];
const check = (t, v, extra = '') => checks.push([t, v, extra]);

/* 가짜 서버를 끼운다. window.__calls 에 호출을 기록한다. */
const install = (mode) => page.evaluate(m => {
  window.__calls = [];
  state.session = { email: 'ycb@jejunu.ac.kr' };
  window.__queued = [];
  window.ratingsApi = async (action, payload) => {
    window.__calls.push({ action, payload });
    if (action === 'outbox') {
      if (m === 'olddeploy') return { error: 'bad action' };
      return { ok: true, on: m === 'on', quota: 87, rows: window.__queued.slice() };
    }
    if (action === 'queue') {
      window.__queued.push({ id: 'abc12345', to: payload.to, key: payload.key, subject: payload.subject,
                             sendAt: payload.sendAt, status: 'queued', sentAt: '', error: '' });
      return { ok: true, id: 'abc12345' };
    }
    if (action === 'unqueue') { window.__queued = []; return { ok: true }; }
    return { ok: true };
  };
  Object.assign(OB, { rows: new Map(), on: false, quota: null, loaded: false, needDeploy: false });
  location.hash = '#/outreach'; OUT.open = ''; render();
}, mode);

// 1) 서버가 아직 옛 버전일 때
await install('olddeploy');
await page.waitForTimeout(700);
check('옛 배포면 재배포 안내', await page.evaluate(() => /다시 배포/.test(document.querySelector('.ot-warn')?.textContent || '')));

// 2) 서버는 새 버전인데 보내기가 꺼져 있을 때
await install('off');
await page.waitForTimeout(700);
check('보내기 꺼짐 경고', await page.evaluate(() => /꺼져 있습니다/.test(document.querySelector('.ot-warn')?.textContent || '')));

// 3) 켜져 있을 때
await install('on');
await page.waitForTimeout(700);
check('보내기 켜짐 표시', await page.evaluate(() => /켜짐/.test(document.querySelector('.ot-ok')?.textContent || '')));
check('남은 한도 표시', await page.evaluate(() => /87통/.test(document.querySelector('.ot-ok')?.textContent || '')));

// 4) 초안 패널의 예약 줄
const k = await page.evaluate(() => rKey(state.rows.find(p => p.email)));
await page.click(`[data-open="${k}"]`);
await page.waitForSelector('.oc__ta', { timeout: 10000 });
check('예약 입력칸이 나옴', await page.evaluate(() => !!document.querySelector('.oc__at')));
check('기본값은 내일 오전 9시', await page.evaluate(() => {
  const v = document.querySelector('.oc__at').value;
  const d = new Date(); d.setDate(d.getDate() + 1);
  return v.endsWith('T09:00') && v.startsWith(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
}), await page.evaluate(() => document.querySelector('.oc__at').value));

// 5) 예약하기
await page.click('[data-queue]');
await page.waitForTimeout(800);
const call = await page.evaluate(() => (window.__calls.find(c => c.action === 'queue') || {}).payload);
check('queue 호출됨', !!call);
check('받는 주소가 그 교수', await page.evaluate(k2 => {
  const p = state.rows.find(x => rKey(x) === k2);
  return (window.__calls.find(c => c.action === 'queue') || {}).payload.to === p.email;
}, k));
check('본문이 초안 그대로', !!call && call.body && call.body.includes('교수님께'));
check('sendAt 이 UTC ISO', !!call && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(call.sendAt), call && call.sendAt);
check('예약 뒤 목록 갱신', await page.evaluate(() => obCount() === 1));
check('행에 예약 배지', await page.evaluate(() => !!document.querySelector('.oc__ob--q')));
check('머리말에 예약 수', await page.evaluate(() => /예약 1/.test(document.querySelector('.ot-head__m').textContent)));

// 6) 취소 — 예약 뒤에도 패널은 열린 채로 남는다
await page.waitForSelector('[data-unq]', { timeout: 10000 });
check('예약된 상태면 취소 버튼', true);
await page.click('[data-unq]');
await page.waitForTimeout(900);
check('취소되면 배지 사라짐', await page.evaluate(() => !document.querySelector('.oc__ob--q') && obCount() === 0));

// 7) 메일이 아닌 채널에서는 예약 줄이 없다
await page.waitForSelector('.oc__ta', { timeout: 10000 });
await page.click('.oc__d [data-ch="문자"]');
await page.waitForTimeout(500);
check('문자 채널에는 예약 줄 없음', await page.evaluate(() => !document.querySelector('.oc__at')));

let bad = 0;
for (const [t, v, extra] of checks) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${t}${extra ? '   (' + extra + ')' : ''}`); }
console.log(`\n${checks.length - bad}/${checks.length} 통과`);
await b.close();
process.exit(bad ? 1 : 0);
