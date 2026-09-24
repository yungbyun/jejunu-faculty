/* 직접 보낸 기록 — 날짜별로 누구에게 손수 보냈는지 찍어 두는 화면.
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

// 접촉 맨 위 링크로 들어간다
await page.evaluate(() => { msendMap = {}; localStorage.removeItem('jnu-msend'); location.hash = '#/outreach'; render(); });
await page.waitForSelector('.ot-top a', { timeout: 10000 });
t('접촉 맨 위에 링크', (await page.locator('.ot-top a').innerText()).includes('손으로 보낸'));
await page.click('.ot-top a');
await page.waitForTimeout(600);
t('직접 기록 화면으로', await page.evaluate(() => location.hash) === '#/manual', await page.evaluate(() => location.hash));
t('처음엔 기록 없음', await page.locator('.ms-row').count() === 0);

// 새 기록
await page.click('[data-msadd]');
await page.waitForSelector('.ms-edit', { timeout: 10000 });
t('새 기록이 펼쳐진 채로 생김', await page.locator('.ms-edit').count() === 1);
const today = await page.evaluate(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});
t('날짜는 오늘로 채워짐', await page.evaluate(() => document.querySelector('[data-msdate]').value) === today, today);
t('요일이 함께 보임', /[일월화수목금토]/.test(await page.evaluate(() => document.querySelector('.ms-day').textContent)),
  await page.evaluate(() => document.querySelector('.ms-day').textContent));

// 선호도별로 묶여 있다
await page.evaluate(() => {
  const v = ['확', '긍', '중', '모', '부', '비'];
  state.rows.forEach((p, i) => setRating(rKey(p), v[i % 6]));
  renderManual();
});
await page.waitForTimeout(700);
t('선호도별로 묶임', await page.locator('.ms-g').count() >= 6, String(await page.locator('.ms-g').count()));
t('교수 전원이 칩으로', await page.evaluate(() => document.querySelectorAll('[data-mstoggle]').length === state.rows.length),
  String(await page.evaluate(() => document.querySelectorAll('[data-mstoggle]').length)));

// 이름을 누르면 진한 바탕
await page.locator('[data-mstoggle]').first().click();
await page.waitForTimeout(300);
t('누르면 켜진 모양', await page.evaluate(() => document.querySelector('[data-mstoggle]').classList.contains('on')));
t('바탕이 선호도 색으로 찬다', await page.evaluate(() => {
  const el = document.querySelector('[data-mstoggle].on');
  const cs = getComputedStyle(el);
  return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.color === 'rgb(255, 255, 255)';
}), await page.evaluate(() => getComputedStyle(document.querySelector('[data-mstoggle].on')).backgroundColor));
t('머리말 인원이 1', await page.evaluate(() => document.querySelector('[data-mscount]').textContent) === '1');
t('시트로도 저장', await page.evaluate(() => {
  const r = Object.values(msends())[0];
  return !!r && r.who.length === 1;
}));
t('누를 때 화면이 다시 안 그려진다', await page.evaluate(() => document.querySelectorAll('.ms-edit').length === 1));
await page.locator('[data-mstoggle]').first().click();
await page.waitForTimeout(300);
t('두 번째는 노랑(따로 안 보내도 됨)', await page.evaluate(() => {
  const el = document.querySelector('[data-mstoggle]');
  return !el.classList.contains('on') && el.classList.contains('na');
}));
t('노랑 바탕에 검은 글자', await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('[data-mstoggle].na'));
  return cs.backgroundColor === 'rgb(245, 197, 24)' && cs.color !== 'rgb(255, 255, 255)';
}), await page.evaluate(() => getComputedStyle(document.querySelector('[data-mstoggle].na')).backgroundColor));
t('보냄에서 빠지고 생략으로 간다', await page.evaluate(() => {
  const r = Object.values(msends())[0];
  return r.who.length === 0 && r.na.length === 1;
}));
t('머리말에 생략 인원', (await page.evaluate(() =>
  document.querySelector('.ms-row__n').textContent)).includes('생략 1'),
  await page.evaluate(() => document.querySelector('.ms-row__n').textContent));
await page.locator('[data-mstoggle]').first().click();
await page.waitForTimeout(300);
t('세 번째는 해제', await page.evaluate(() => {
  const el = document.querySelector('[data-mstoggle]');
  return !el.classList.contains('on') && !el.classList.contains('na');
}));
t('두 목록에서 모두 빠진다', await page.evaluate(() => {
  const r = Object.values(msends())[0];
  return r.who.length === 0 && r.na.length === 0;
}));
// 전원 표시는 생략으로 둔 사람을 건드리지 않는다
await page.locator('[data-mstoggle]').first().click();
await page.locator('[data-mstoggle]').first().click();
await page.waitForTimeout(400);
await page.click('[data-msall]');
await page.waitForTimeout(600);
t('전원 표시가 생략을 건드리지 않음', await page.evaluate(() => {
  const r = Object.values(msends())[0];
  return r.na.length === 1 && r.who.length === state.rows.length - 1;
}), await page.evaluate(() => JSON.stringify({ who: Object.values(msends())[0].who.length, na: Object.values(msends())[0].na.length })));
await page.click('[data-msnone]');
await page.waitForTimeout(600);
t('모두 풀기는 생략도 푼다', await page.evaluate(() => {
  const r = Object.values(msends())[0];
  return r.who.length === 0 && r.na.length === 0;
}));

// 날짜·메모
await page.fill('[data-msdate]', '2026-09-25');
await page.waitForTimeout(600);
t('날짜를 바꾸면 요일도 바뀐다', (await page.evaluate(() => document.querySelector('.ms-day').textContent)).includes('금'),
  await page.evaluate(() => document.querySelector('.ms-day').textContent));
await page.fill('[data-msmemo]', '1회차 문자');
await page.waitForTimeout(500);
t('메모 저장', await page.evaluate(() => Object.values(msends())[0].memo === '1회차 문자'));

// 기록이 쌓이고 최근 날짜가 위로
await page.click('[data-msadd]');
await page.waitForTimeout(600);
await page.fill('[data-msdate]', '2026-10-01');
await page.waitForTimeout(600);
t('기록 두 건', await page.locator('.ms-row').count() === 2);
t('최근 날짜가 위', (await page.locator('.ms-row__d').first().innerText()).includes('2026-10-01'),
  await page.locator('.ms-row__d').first().innerText());

// 회차 발송 기록과 섞이지 않는다
t('회차 발송 기록은 그대로', await page.evaluate(() => !state.rows.some(p => epDone(p, 1))));

// 지우기
await page.evaluate(() => { window.confirm = () => true; });
await page.click('[data-msdel]');
await page.waitForTimeout(700);
t('기록 지우기', await page.locator('.ms-row').count() === 1);

await page.evaluate(() => { msendMap = {}; localStorage.removeItem('jnu-msend'); });
let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
