/* AI 에게 묻기 — 분석 화면 맨 위의 묻는 칸 (2026-11-09, 교수님 지정).
   서버를 부르지 않고 `ratingsApi` 를 가짜로 바꿔 친다 — 모델 값은 매번 달라지므로,
   재는 것은 **무엇을 들려주고 무엇을 그리는가**다.
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

/* 가짜 서버 — 마지막으로 보낸 것을 창에 적어 두고, 정해 둔 답을 돌려준다 */
const stub = (reply, ms = 0) => page.evaluate(([r, w]) => {
  window.__ask = [];
  window.ratingsApi = async (action, payload, wait) => {
    window.__ask.push({ action, payload, wait });
    if (w) await new Promise(x => setTimeout(x, w));
    return r;
  };
}, [reply, ms]);

const openStats = async () => {
  await page.evaluate(() => { ASK.q = ''; ASK.a = ''; ASK.err = ''; ASK.busy = false; location.hash = '#/stats'; render(); });
  await page.waitForSelector('.ask #askQ', { timeout: 10000 });
};

/* ---------- 자리 ---------- */
await openStats();
t('묻는 칸이 분석 화면에 선다', await page.evaluate(() => !!document.querySelector('.ask #askQ')));
/* 「맨 위에 넣어 줘」 — 길 안내(crumbs) 다음, 다른 어느 칸보다 앞 */
t('다른 칸보다 맨 위에 있다', await page.evaluate(() => {
  const secs = [...document.querySelectorAll('.stats .st-sec')];
  return secs.length > 1 && secs[0].classList.contains('ask');
}), await page.evaluate(() => [...document.querySelectorAll('.stats .st-sec')].map(x => x.className).join(' | ')));
t('도넛보다 위에 있다', await page.evaluate(() => {
  const a = document.querySelector('.ask'), d = document.querySelector('.pie, .st-sec:nth-of-type(2)');
  return !!a && !!d && a.getBoundingClientRect().top < d.getBoundingClientRect().top;
}));
t('제안 물음이 함께 선다', await page.evaluate(() =>
  document.querySelectorAll('[data-asktip]').length === ASK_TIPS.length && ASK_TIPS.length >= 3));
t('무엇을 함께 보내는지 적어 둔다', await page.evaluate(() => {
  const n = document.querySelector('.ask .ask__note');
  return !!n && /메모/.test(n.textContent) && /학력|논문/.test(n.textContent);
}), await page.evaluate(() => (document.querySelector('.ask .ask__note') || {}).textContent || ''));

/* ---------- 빈 물음 ---------- */
await stub({ ok: true, text: '답' });
await page.click('#askGo'); await page.waitForTimeout(200);
t('빈 물음은 보내지 않는다', await page.evaluate(() => window.__ask.length === 0));

/* ---------- 들려주는 자료 ---------- */
await page.evaluate(async () => {
  await loadEdu();
  const [a, b2] = state.rows;
  applyEntry(rKey(a), { rating: '중', met: 2, memo: '**학장 선거**에 뜻이 있다고 하셨다 {빨강:조심}' });
  applyEntry(rKey(b2), { rating: '확', met: 0, memo: '' });
  sureSet = new Set(); weakSet = new Set(); weaks().add(rKey(a)); weakSave();
  pushSet = null; localStorage.removeItem('jnu-push');
  hireSave([[rKey(a), rKey(b2)]]);
  meetMap = {}; mealCache = null;
  meets()['k1'] = { date: `${new Date().getFullYear()}-01-05`, time: '12:00', kind: 'lunch', who: [rKey(a)], done: '', place: '학교 앞' };
  mtSave();
  render();
});
await page.waitForSelector('.ask #askQ', { timeout: 10000 });
await stub({ ok: true, text: '**둘**입니다\n- 식품생명공학과 박은진\n- 컴퓨터공학과 변영철' });
await page.fill('#askQ', '내 질문');
await page.click('#askGo');
await page.waitForFunction(() => window.__ask.length > 0, null, { timeout: 10000 });
await page.waitForTimeout(400);
const C = await page.evaluate(() => {
  const s = window.__ask[0], ctx = s.payload.ctx, [a, b2] = state.rows;
  return { action: s.action, q: s.payload.q, wait: s.wait, len: ctx.length,
    name: ctx.includes(a.name), rank: ctx.includes(a.rank),
    rate: /선호도 중간\+약화/.test(ctx), sureName: ctx.includes(b2.name),
    memo: ctx.includes('학장 선거에 뜻이 있다고 하셨다 조심'),
    mark: /\*\*|\{빨강:/.test(ctx),
    met: /만남 2번/.test(ctx), edu: /학부 /.test(ctx),
    paper: ctx.includes(String(a.paper1 || '').split('|')[0].trim()),
    hire: /# 입사 동기 묶음/.test(ctx), alum: /# 같은 대학을 나온 분/.test(ctx),
    meal: /# 식사 약속/.test(ctx) && /01-05 12:00 점심/.test(ctx),
    dept: /# 학과별/.test(ctx), me: /변영철/.test(ctx), today: /오늘: \d{4}-\d{2}-\d{2}/.test(ctx),
    phone: ctx.includes(a.phone || '\u0000'), mail: ctx.includes(a.email || '\u0000') };
});
t('행동은 ask 다', C.action === 'ask', C.action);
t('적은 물음을 그대로 보낸다', C.q === '내 질문', C.q);
t('이 길만 더 기다린다(60초)', C.wait === 60000, String(C.wait));
t('오늘 날짜와 내가 누구인지부터', C.today && C.me);
t('학과별 셈을 적는다', C.dept);
t('교수 이름·직급·선호도·표시', C.name && C.rank && C.rate, JSON.stringify([C.name, C.rank, C.rate]));
t('만난 횟수도', C.met);
t('메모는 표시를 턴 맨글로', C.memo && !C.mark, JSON.stringify([C.memo, C.mark]));
t('학력(동문)을 싣는다', C.edu);
t('논문 제목을 싣는다', C.paper);
t('입사 동기 묶음을 따로 적는다', C.hire);
t('같은 대학 묶음을 따로 적는다', C.alum);
t('식사 약속도 적는다', C.meal);
t('전화번호·메일은 넣지 않는다', !C.phone && !C.mail, JSON.stringify([C.phone, C.mail]));
t('자료가 너무 길지 않다', C.len > 2000 && C.len <= 120000, `${C.len}자`);

/* ---------- 답 그리기 ---------- */
const A = await page.evaluate(() => {
  const box = document.querySelector('.ask__out');
  return { b: box.querySelectorAll('b').length, li: box.querySelectorAll('li').length,
    txt: box.textContent.replace(/\s+/g, ' ').trim(), html: box.innerHTML };
});
t('굵게는 굵게, 목록은 목록으로', A.b === 1 && A.li === 2, JSON.stringify([A.b, A.li]));
t('별표는 글자로 남지 않는다', !A.txt.includes('**'), A.txt);
t('답에 이름이 보인다', A.txt.includes('박은진') || A.txt.includes('변영철'), A.txt);

/* 남이 보낸 글이라도 꾸밈은 못 들어온다 */
await stub({ ok: true, text: '<img src=x onerror=alert(1)> **굵게**' });
await page.fill('#askQ', '꾸밈 시험');
await page.click('#askGo');
await page.waitForTimeout(600);
t('답 안의 태그는 글자로만', await page.evaluate(() => {
  const box = document.querySelector('.ask__out');
  return !box.querySelector('img') && box.textContent.includes('<img');
}), await page.evaluate(() => document.querySelector('.ask__out').innerHTML.slice(0, 80)));

/* ---------- 기다리는 동안 ---------- */
await stub({ ok: true, text: '늦게 온 답' }, 1200);
await page.fill('#askQ', '느린 물음');
await page.click('#askGo');
await page.waitForTimeout(300);
const B = await page.evaluate(() => ({
  dis: document.querySelector('#askGo').disabled,
  label: document.querySelector('#askGo').textContent.trim(),
  wait: /생각하는 중/.test(document.querySelector('.ask__out').textContent),
}));
t('묻는 동안 단추가 잠긴다', B.dis, JSON.stringify(B));
t('기다리는 중이라고 알린다', B.wait && /묻는 중/.test(B.label), JSON.stringify(B));
await page.waitForTimeout(1500);
t('답이 오면 단추가 풀린다', await page.evaluate(() =>
  !document.querySelector('#askGo').disabled && /늦게 온 답/.test(document.querySelector('.ask__out').textContent)));

/* ---------- 말썽 ---------- */
await stub({ error: 'bad action' });
await page.fill('#askQ', '배포 안 된 때');
await page.click('#askGo'); await page.waitForTimeout(500);
t('배포가 안 됐으면 그렇다고 적는다', await page.evaluate(() => {
  const e = document.querySelector('.ask__err');
  return !e.hidden && /배포/.test(e.textContent);
}), await page.evaluate(() => document.querySelector('.ask__err').textContent));
t('말썽일 때 답 칸은 비운다', await page.evaluate(() =>
  document.querySelector('.ask__out').textContent.trim() === ''));
await stub({ error: '요청이 몰렸습니다. 잠시 뒤 다시 눌러 주세요' });
await page.fill('#askQ', '몰린 때');
await page.click('#askGo'); await page.waitForTimeout(500);
t('서버가 한 말을 그대로 보여 준다', await page.evaluate(() =>
  /몰렸습니다/.test(document.querySelector('.ask__err').textContent)));

/* ---------- 제안 물음 ---------- */
await stub({ ok: true, text: '제안에 대한 답' });
await page.click('[data-asktip]'); await page.waitForTimeout(600);
t('제안을 누르면 그대로 묻는다', await page.evaluate(() => {
  const last = window.__ask[window.__ask.length - 1];
  return last.payload.q === ASK_TIPS[0] && document.querySelector('#askQ').value === ASK_TIPS[0];
}), await page.evaluate(() => (window.__ask[window.__ask.length - 1] || {}).payload.q));

/* ---------- 다른 화면에 갔다 와도 ---------- */
await page.evaluate(() => { location.hash = '#/'; render(); });
await page.waitForTimeout(300);
await page.evaluate(() => { location.hash = '#/stats'; render(); });
await page.waitForSelector('.ask #askQ', { timeout: 10000 });
t('돌아오면 물음과 답이 그대로', await page.evaluate(() =>
  document.querySelector('#askQ').value === ASK_TIPS[0]
  && /제안에 대한 답/.test(document.querySelector('.ask__out').textContent)));

/* 좁은 화면에서도 칸이 넘치지 않는다 */
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
t('390px 에서 묻는 칸이 안 넘친다', await page.evaluate(() => {
  const box = document.querySelector('.ask'), ta = document.querySelector('#askQ');
  const b2 = box.getBoundingClientRect(), r = ta.getBoundingClientRect();
  return r.right <= b2.right + 1 && r.width > 100 && document.documentElement.scrollWidth <= window.innerWidth + 1;
}));
await page.setViewportSize({ width: 1440, height: 1100 });

await page.evaluate(() => {
  state.rows.forEach(p => applyEntry(rKey(p), { rating: '', met: 0, memo: '' }));
  sureSet = new Set(); weakSet = new Set();
  localStorage.removeItem('jnu-sure'); localStorage.removeItem('jnu-weak');
  localStorage.removeItem('jnu-hire'); hireCache = null;
  meetMap = {}; localStorage.removeItem('jnu-meets'); mealCache = null;
});

let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
