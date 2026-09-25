/* 공략(선거일까지 꼭 만날 사람) — 선호도·관심 교수와 따로 두는 표시.
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

const reset = () => page.evaluate(() => {
  pushSet = new Set(); localStorage.removeItem('jnu-push');
  sureSet = new Set(); localStorage.removeItem('jnu-sure');
  favSet = new Set(); localStorage.removeItem('jnu-fav');
  state.ratings.clear(); state.notes.clear();
  const v = ['확', '긍', '중', '모', '부', '비'];
  state.rows.forEach((p, i) => state.ratings.set(rKey(p), v[i % 6]));
  location.hash = '#/stats'; render();
});
await reset();
await page.waitForSelector('#pushPick', { timeout: 10000 });

// 1) 처음엔 아무도 없다
t('처음엔 공략이 없다', await page.locator('.st-c.on').count() === 0);
t('공략만 보기는 잠겨 있다', await page.evaluate(() => document.querySelector('#pushOnly').disabled));
t('평소에는 칩이 링크', await page.evaluate(() =>
  document.querySelectorAll('.st-list li a').length > 0 && !document.querySelector('[data-pushkey]')));

// 2) 고르기 모드
await page.click('#pushPick');
await page.waitForTimeout(500);
t('고르기 모드에서는 칩이 단추', await page.evaluate(() =>
  document.querySelectorAll('[data-pushkey]').length === state.rows.length &&
  !document.querySelector('.st-list li a')));
t('무엇을 하는지 적혀 있다', (await page.locator('.st-note').first().innerText()).includes('공략'));
const hash0 = await page.evaluate(() => location.hash);
await page.locator('[data-pushkey]').first().click();
await page.waitForTimeout(400);
t('눌러도 상세로 가지 않는다', await page.evaluate(() => location.hash) === hash0,
  await page.evaluate(() => location.hash));
t('누르면 켜진 모양', await page.evaluate(() => document.querySelector('[data-pushkey]').classList.contains('on')));
t('깃발이 이름 왼쪽에', await page.evaluate(() => {
  const el = document.querySelector('[data-pushkey].on');
  return el.firstElementChild && el.firstElementChild.classList.contains('pushm');
}));
await page.mouse.move(0, 0);   // :hover 가 걸려 있으면 테두리가 brand 색으로 바뀐다
await page.waitForTimeout(200);
t('테두리가 공략 색', await page.evaluate(() => {
  const el = document.querySelector('[data-pushkey].on');
  const want = getComputedStyle(document.documentElement).getPropertyValue('--push').trim();
  const hex = x => '#' + x.match(/\d+/g).slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
  return hex(getComputedStyle(el).borderTopColor) === want;
}), await page.evaluate(() => getComputedStyle(document.querySelector('[data-pushkey].on')).borderTopColor));
t('저장된다', await page.evaluate(() => pushes().size === 1));
t('누를 때 화면을 다시 그리지 않는다', await page.evaluate(() => !!document.querySelector('.st-note')));
t('줄머리에 공략 인원', await page.evaluate(() =>
  !!document.querySelector('.st-list .n--push') &&
  document.querySelector('.st-list .n--push').textContent.trim().endsWith('1')));
t('공략만 보기 숫자도 따라온다', await page.evaluate(() =>
  document.querySelector('#pushOnly .n').textContent === '1' && !document.querySelector('#pushOnly').disabled));
await page.locator('[data-pushkey]').first().click();
await page.waitForTimeout(400);
t('다시 누르면 풀린다', await page.evaluate(() => pushes().size === 0 && !document.querySelector('.st-list .n--push')));

// 3) 공략만 보기
await page.evaluate(() => {
  state.rows.forEach((p, i) => { if (i % 5 === 0) pushes().add(rKey(p)); });
  pushSave(); renderStats();
});
await page.waitForTimeout(500);
await page.click('#pushPick');           // 고르기 끝내기
await page.click('#pushOnly');
await page.waitForTimeout(500);
t('공략만 보기로 줄어든다', await page.evaluate(() =>
  document.querySelectorAll('.st-list li').length === pushes().size),
  await page.evaluate(() => `${document.querySelectorAll('.st-list li').length} / ${pushes().size}`));
t('줄머리 인원은 전체 그대로', await page.evaluate(() => {
  const box = document.querySelector('.st-list');
  const r = box.dataset.rslist;
  return box.querySelector('h3 .n').textContent === String(state.rows.filter(p => getRating(p) === r).length);
}));
await page.click('#pushOnly');
await page.waitForTimeout(400);
t('되돌리면 전원이 다시 나온다', await page.evaluate(() =>
  document.querySelectorAll('.st-list li').length === state.rows.length));

// 4) 선호도·관심 교수와 섞이지 않는다
t('선호도는 건드리지 않는다', await page.evaluate(() => {
  const p = state.rows.find(isPush);
  return !!getRating(p);
}));
t('관심 교수와 따로 간다', await page.evaluate(() => favs().size === 0 && pushes().size > 0));

// 5) 상세 페이지의 단추
await page.evaluate(() => {
  pushSet = new Set(); localStorage.removeItem('jnu-push');
  const p = state.rows[0];
  location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render();
});
await page.waitForSelector('[data-pushbtn]', { timeout: 10000 });
t('상세에 공략 단추', (await page.locator('[data-pushbtn] span').innerText()).trim() === '공략',
  await page.locator('[data-pushbtn] span').innerText());
await page.click('[data-pushbtn]');
await page.waitForTimeout(400);
t('상세에서 켜진다', await page.evaluate(() => pushes().size === 1 &&
  document.querySelector('[data-pushbtn]').getAttribute('aria-pressed') === 'true'));
t('글자는 켜나 끄나 같다', (await page.locator('[data-pushbtn] span').innerText()).trim() === '공략',
  await page.locator('[data-pushbtn] span').innerText());
await page.click('[data-pushbtn]');
await page.waitForTimeout(400);
t('상세에서 풀린다', await page.evaluate(() => pushes().size === 0));

// 5-2) 확실 — 선호도 '확' 과는 다른, 지금 이 시점의 결론
t('상세에 확실 단추가 공략 앞에', await page.evaluate(() => {
  const marks = document.querySelector('.d-marks');
  const b = [...marks.querySelectorAll('button')];
  return b.length === 2 && b[0].hasAttribute('data-surebtn') && b[1].hasAttribute('data-pushbtn');
}));
t('단추 글자는 확실·공략', await page.evaluate(() =>
  [...document.querySelectorAll('.d-marks button span')].map(e => e.textContent.trim()).join()) === '확실,공략',
  await page.evaluate(() => [...document.querySelectorAll('.d-marks button span')].map(e => e.textContent.trim()).join()));
await page.click('[data-surebtn]');
await page.waitForTimeout(400);
t('확실이 켜진다', await page.evaluate(() => sures().size === 1 &&
  document.querySelector('[data-surebtn]').getAttribute('aria-pressed') === 'true'));
t('확실 글자도 그대로', (await page.locator('[data-surebtn] span').innerText()).trim() === '확실');
t('공략과는 따로 간다', await page.evaluate(() => sures().size === 1 && pushes().size === 0));
t('선호도도 건드리지 않는다', await page.evaluate(() => {
  const before = getRating(state.rows[0]);
  sureToggle(state.rows[0]); sureToggle(state.rows[0]);   // 켰다 껐다
  return getRating(state.rows[0]) === before && isSure(state.rows[0]);
}));

// 분석 목록에서 이름 바탕이 진한 색으로 찬다
await page.evaluate(() => { setRating(rKey(state.rows[0]), '중'); location.hash = '#/stats'; render(); });
await page.waitForSelector('.st-c.sure', { timeout: 10000 });
await page.mouse.move(0, 0);
await page.waitForTimeout(300);
t('확실인 칩에만 sure', await page.evaluate(() => document.querySelectorAll('.st-c.sure').length === sures().size));
t('바탕이 진한 색으로 찬다', await page.evaluate(() => {
  const el = document.querySelector('.st-c.sure');
  const want = getComputedStyle(document.documentElement).getPropertyValue('--sure').trim();
  const hex = x => '#' + x.match(/\d+/g).slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
  return hex(getComputedStyle(el).backgroundColor) === want && getComputedStyle(el).color === 'rgb(255, 255, 255)';
}), await page.evaluate(() => getComputedStyle(document.querySelector('.st-c.sure')).backgroundColor));
t('확실이 아니면 바탕이 비어 있다', await page.evaluate(() => {
  const el = [...document.querySelectorAll('.st-c')].find(e => !e.classList.contains('sure'));
  return !!el && getComputedStyle(el).color !== 'rgb(255, 255, 255)';
}));
/* 확실이면서 공략일 때 — 진한 바탕에 주황 테는 안 보이므로 깃발만 남긴다 */
t('확실+공략이면 깃발이 흰색', await page.evaluate(() => {
  const p = state.rows[0];
  pushes().add(rKey(p)); pushSave(); render();
  const el = document.querySelector('.st-c.sure.on');
  return !!el && getComputedStyle(el.querySelector('.pushm')).color === 'rgb(255, 255, 255)';
}));
await page.evaluate(() => {
  sureSet = new Set(); localStorage.removeItem('jnu-sure');
  pushSet = new Set(); localStorage.removeItem('jnu-push');
  setRating(rKey(state.rows[0]), '');
});

// 6) 시트로도 저장된다
t('settings 의 push 키로 등록', await page.evaluate(() => SET_KEYS.includes('push') && SET_LABEL['push'] === '공략'));
t('settings 의 sure 키로도 등록', await page.evaluate(() => SET_KEYS.includes('sure') && SET_LABEL['sure'] === '확실'));
t('받은 값을 이 기기에 적용', await page.evaluate(() => {
  const k = rKey(state.rows[3]);
  settingApplyLocal('push', [k]);
  return isPush(state.rows[3]) && JSON.parse(localStorage.getItem('jnu-push') || '[]')[0] === k;
}));

t('확실도 시트에서 내려받는다', await page.evaluate(() => {
  const k = rKey(state.rows[5]);
  settingApplyLocal('sure', [k]);
  return isSure(state.rows[5]) && JSON.parse(localStorage.getItem('jnu-sure') || '[]')[0] === k;
}));
await page.evaluate(() => { pushSet = new Set(); localStorage.removeItem('jnu-push'); sureSet = new Set(); localStorage.removeItem('jnu-sure'); });
let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
