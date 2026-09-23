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
      return { ok: true, on: m === 'on', sms: m === 'on', quota: 87, rows: window.__queued.slice() };
    }
    if (action === 'queue') {
      window.__queued.push({ id: 'abc12345', to: payload.to, key: payload.key, subject: payload.subject,
                             channel: payload.channel || 'mail',
                             sendAt: payload.sendAt, status: 'queued', sentAt: '', error: '' });
      return { ok: true, id: 'abc12345' };
    }
    if (action === 'unqueue') { window.__queued = []; return { ok: true }; }
    return { ok: true };
  };
  Object.assign(OB, { rows: new Map(), on: false, sms: false, quota: null, loaded: false, needDeploy: false });
  location.hash = '#/outreach'; OUT.open = ''; render();
}, mode);

// 예약한 것이 없으면 서버 상태가 어떻든 알림줄을 띄우지 않는다.
// (사람별 초안·예약 화면은 없어졌고, 한 번에 예약하는 것은 t-outreach 가 본다)
const noBanner = async () => await page.evaluate(() => !document.querySelector('.ot-ok, .ot-warn'));
await install('olddeploy'); await page.waitForTimeout(700);
check('옛 배포여도 예약 0이면 조용', await noBanner());
await install('off'); await page.waitForTimeout(700);
check('꺼져 있어도 예약 0이면 조용', await noBanner());
await install('on'); await page.waitForTimeout(700);
check('켜져 있어도 예약 0이면 조용', await noBanner());

// 8) 위쪽 알림줄이 상태를 정확히 말한다.
//    outboxDryRun() 이 OUTBOX 를 'on' 으로 켜므로 연습 모드를 '켜짐' 이라 하면 안 된다.
const banner = async (on, dry, nq, nd) => await page.evaluate(([on, dry, nq, nd]) => {
  const m = new Map();
  for (let i = 0; i < nq; i++) m.set('k' + i, { status: 'queued', sendAt: new Date().toISOString(), key: 'k' + i });
  Object.assign(OB, { loaded: true, needDeploy: nd, on, dry, quota: 97, rows: m });
  renderOutreach();
  const el = document.querySelector('.ot-ok, .ot-warn');
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}, [on, dry, nq, nd]);

check('예약 0 · 꺼짐 — 아무 말 안 함', (await banner(false, false, 0, false)) === '');
check('예약 0 · 켜짐 — 아무 말 안 함', (await banner(true, false, 0, false)) === '');
check('예약 0 · 연습 모드 — 아무 말 안 함', (await banner(true, true, 0, false)) === '');
check('예약 0 · 재배포 필요 — 아무 말 안 함', (await banner(false, false, 0, true)) === '');
const bOff = await banner(false, false, 2, false);
check('예약이 있는데 꺼졌으면 알려 줌', bOff.includes('꺼져 있습니다') && bOff.includes('2건'), bOff);
const bDry = await banner(true, true, 2, false);
check('연습 모드를 켜짐이라 하지 않음', bDry.includes('연습 모드'), bDry);
check('연습 모드는 안 나간다고 못박음', bDry.includes('실제로는 나가지 않습니다'));
const bOn2 = await banner(true, false, 2, false);
check('예약이 있으면 건수를 말함', bOn2.includes('예약 2건'), bOn2);
const bNd = await banner(false, false, 2, true);
check('재배포가 필요하면 그것부터', bNd.includes('다시 배포'), bNd);

let bad = 0;
for (const [t, v, extra] of checks) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${t}${extra ? '   (' + extra + ')' : ''}`); }
console.log(`\n${checks.length - bad}/${checks.length} 통과`);
await b.close();
process.exit(bad ? 1 : 0);
