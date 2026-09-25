/* 저장 바 — 못 올린 것이 있을 때 무엇을 알려 주고, 눌렀을 때 실제로 듣는지.
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length > 0, null, { timeout: 25000 });
const ok = []; const t = (n, v, x = '') => ok.push([n, v, x]);

const arm = () => page.evaluate(() => {
  state.session = { email: 'a@b.com' };
  sync.authNeeded = false; sync.authHidden = false;
  sync.running = false; sync.runAt = 0;
  sync.dirty.clear(); sync.dirtyS.clear();
  sync.dirtyS.set('sure', ['x/y']); sync.dirtyS.set('push', ['x/y']);
  sync.lastError = 'HTTP 404';
  delete document.querySelector('.savebar')?.dataset.sig;
  updateSaveBar();
});
await arm();
await page.waitForSelector('#retrySave', { timeout: 10000 });

t('무엇이 막혔는지 이름으로 적는다', (await page.locator('.savebar').innerText()).includes('확실 · 공략'),
  await page.locator('.savebar').innerText());
t('몇 건인지도 적는다', (await page.locator('.savebar').innerText()).includes('미저장 2건'));
t('오류도 그대로 보인다', (await page.locator('.savebar').innerText()).includes('HTTP 404'));

/* 이 바는 저장할 때마다 자주 다시 그려진다. 그때마다 innerHTML 을 갈아 끼우면
   누르는 순간 단추가 사라져 클릭이 먹히지 않는다 — 실제로 겪은 일이다. */
t('자주 다시 그려도 단추가 그대로', await page.evaluate(() => {
  const before = document.querySelector('#retrySave');
  for (let i = 0; i < 50; i++) updateSaveBar();
  return document.querySelector('#retrySave') === before;
}));
t('내용이 바뀌면 다시 그린다', await page.evaluate(() => {
  const before = document.querySelector('#retrySave');
  sync.lastError = 'HTTP 500'; updateSaveBar();
  return document.querySelector('#retrySave') !== before &&
    document.querySelector('.savebar').innerText.includes('500');
}));

// 눌렀을 때 — 되든 안 되든 결과를 알려 줘야 한다
await arm();
await page.evaluate(() => { CONFIG.RATINGS.API_URL = 'http://127.0.0.1:8080/없는주소'; });
await page.click('#retrySave');
await page.waitForTimeout(1800);
t('눌러도 조용히 끝나지 않는다', (await page.evaluate(() => document.getElementById('dataStatus').textContent)).includes('남았습니다'),
  await page.evaluate(() => document.getElementById('dataStatus').textContent));
t('멈춘 채로 남지 않는다', await page.evaluate(() => sync.running === false));

// 사람이 알아볼 수 없는 말은 풀어 준다
t('404 를 풀어 준다', (await page.evaluate(() => syncHint('HTTP 404'))).includes('배포 주소'));
t('401 을 풀어 준다', (await page.evaluate(() => syncHint('HTTP 401'))).includes('로그인'));
t('시간 초과를 풀어 준다', (await page.evaluate(() => syncHint('응답 없음(20초)'))).includes('연결'));
t('알 수 없는 말은 덧붙이지 않는다', await page.evaluate(() => syncHint('저장 실패')) === '');

// 요청에 시간 제한이 있어야 한 번 멈춰도 되살아난다
t('요청에 시간 제한이 있다', await page.evaluate(() => typeof API_TIMEOUT === 'number' && API_TIMEOUT > 0 && API_TIMEOUT <= 60000),
  String(await page.evaluate(() => API_TIMEOUT)));
t('멈춘 동기화는 시간이 지나면 풀린다', await page.evaluate(async () => {
  sync.running = true; sync.runAt = Date.now() - (API_TIMEOUT + 60000);
  const before = sync.runAt;
  await syncRatings();
  return sync.runAt !== before;   // 새로 돌았다
}));

// 아무리 해도 안 올라가는 것은 버릴 수 있어야 한다
await arm();
await page.evaluate(() => { window.confirm = () => true; });
await page.click('#dropSave');
await page.waitForTimeout(500);
t('버리면 남은 것이 없다', await page.evaluate(() => sync.dirtyS.size + sync.dirty.size) === 0);
t('버리면 바도 사라진다', await page.evaluate(() => document.querySelector('.savebar').hidden));
t('버리기 전에 물어본다', await page.evaluate(() => {
  let asked = '';
  window.confirm = m => { asked = m; return false; };
  sync.dirtyS.set('sure', ['x/y']); dropSave();
  return asked.includes('버릴까요') && sync.dirtyS.size === 1;   // 아니라고 하면 그대로 둔다
}));

await page.evaluate(() => { sync.dirtyS.clear(); saveSetDirty(); sync.dirty.clear(); saveDirty(); });
let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
