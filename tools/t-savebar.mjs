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

t('무엇이 막혔는지 이름으로 적는다', (await page.locator('.savebar').innerText()).includes('강화 · 공략'),
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
/* 새 버전 알림 — 저장 바와 따로 뜬다 (2026-10-13).
   예전에는 같은 바를 써서, 미저장이 하나라도 있으면 아예 안 뜨고
   저장이 한 번만 일어나도 지워졌다. */
{
  const fs = await import('fs');
  const VER = '../version.json';
  const keep = fs.readFileSync(VER, 'utf8');
  try {
  
  t('처음엔 새 버전 알림이 없다', await page.evaluate(()=>!document.querySelector('.verbar')));

  /* 서버의 version.json 만 새 것으로 바꾼다 */
  fs.writeFileSync(VER, '{"v": "9999-test"}');
  await page.evaluate(()=>checkVersion()); await page.waitForTimeout(400);
  t('새 판이 올라오면 알린다', await page.evaluate(()=>{const v=document.querySelector('.verbar');
    return !!v && !v.hidden && /새 버전/.test(v.textContent);}),
    await page.evaluate(()=>(document.querySelector('.verbar')||{}).textContent||'(안 뜸)'));

  /* 미저장이 있어도 떠야 한다 — 예전에는 이때 아예 안 떴다 */
  await page.evaluate(()=>{ document.querySelector('.verbar').remove(); $verBar=null;
    sync.dirty.set('x',{rating:'확'}); sync.dirtyS.set('meets','{}'); updateSaveBar(); });
  await page.evaluate(()=>checkVersion()); await page.waitForTimeout(400);
  t('미저장이 있어도 알린다', await page.evaluate(()=>{const v=document.querySelector('.verbar');
    return !!v && !v.hidden;}), '예전에는 이때 아예 안 떴다');

  /* 저장 바가 다시 그려져도 알림이 안 지워져야 한다 */
  await page.evaluate(()=>{ for(let i=0;i<5;i++) updateSaveBar(); });
  await page.waitForTimeout(200);
  t('저장 바를 다시 그려도 안 지워진다', await page.evaluate(()=>{const v=document.querySelector('.verbar');
    return !!v && !v.hidden;}));
  t('저장 바도 함께 보인다', await page.evaluate(()=>{const s=document.querySelector('.savebar');
    return !!s && !s.hidden && /미저장/.test(s.textContent);}),
    await page.evaluate(()=>(document.querySelector('.savebar')||{}).textContent||'(없음)'));

  /* 눌렀을 때 진짜로 새로 받는지 — 주소에 ?r= 이 붙으며 다시 불러온다 */
  const before = page.url();
  await page.click('.verbar #reloadNew');
  await page.waitForTimeout(1200);
  t('누르면 다시 불러온다', page.url() !== before && /[?&]r=\d+/.test(page.url()), page.url().slice(0, 48));
  } finally { fs.writeFileSync(VER, keep); }
}

/* 잘 되고 있을 때의 알림은 짧아야 한다 — 시각·건수까지 적으면 글이 길어 눈에 거슬린다 (2026-10-14) */
await page.evaluate(() => {
  sync.dirty.clear(); sync.dirtyS.clear(); sync.queue.clear(); sync.busyS.clear();
  sync.authNeeded = false; sync.lastError = '';
  sync.savedAt = Date.now();
  delete document.querySelector('.savebar')?.dataset.sig;
  updateSaveBar();
});
await page.waitForTimeout(200);
t('저장되면 「저장됨 ✓」 넉 자만', await page.evaluate(() =>
  document.querySelector('.savebar').textContent.trim()) === '저장됨 ✓',
  await page.evaluate(() => document.querySelector('.savebar').textContent));
await page.evaluate(() => { sync.queue.set('x/y', { next: undefined }); updateSaveBar(); });
await page.waitForTimeout(200);
t('저장 중에도 「저장 중…」만', await page.evaluate(() =>
  document.querySelector('.savebar').textContent.trim()) === '저장 중…',
  await page.evaluate(() => document.querySelector('.savebar').textContent));
t('건수·시각은 안 적는다', await page.evaluate(() =>
  !/\d/.test(document.querySelector('.savebar').textContent)));
/* 색도 눈에 덜 띄어야 한다 — 파랑·초록 알약이 아니라 무채색. 막힌 것만 빨강 (2026-10-14) */
for (const theme of ['light', 'dark']) {
  const look = await page.evaluate(th => {
    document.documentElement.setAttribute('data-theme', th);
    const bar = document.querySelector('.savebar');
    const n = x => { const m = (x.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      return /^color\(/.test(x) ? m.map(v => Math.round(v * 255)) : m.map(Math.round); };
    const L = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
    const read = () => { const cs = getComputedStyle(bar), bg = n(cs.backgroundColor), fg = n(cs.color);
      const [hi, lo] = [L(bg), L(fg)].sort((a, b) => b - a);
      return { bg, grey: Math.max(...bg) - Math.min(...bg), text: (hi + .05) / (lo + .05) }; };
    const set = fn => { sync.dirty.clear(); sync.dirtyS.clear(); sync.queue.clear(); sync.busyS.clear();
      sync.authNeeded = false; sync.lastError = ''; sync.savedAt = 0; fn();
      delete bar.dataset.sig; updateSaveBar(); };
    set(() => { sync.savedAt = Date.now(); }); const ok = read();
    set(() => sync.queue.set('x/y', { next: undefined })); const busy = read();
    set(() => { sync.dirtyS.set('sure', ['x/y']); sync.lastError = 'HTTP 404'; }); const warn = read();
    set(() => {});
    document.documentElement.setAttribute('data-theme', 'light');
    return { ok, busy, warn };
  }, theme);
  t(`${theme}: 저장 알림은 무채색`, look.ok.grey < 20 && look.busy.grey < 20,
    `저장됨 ${look.ok.bg.join(',')} / 저장 중 ${look.busy.bg.join(',')}`);
  t(`${theme}: 그래도 글자는 읽힌다(4.5 이상)`, look.ok.text >= 4.5 && look.busy.text >= 4.5,
    `${look.ok.text.toFixed(2)} / ${look.busy.text.toFixed(2)}`);
  t(`${theme}: 막혔을 때만 빨강으로 눈에 띈다`, look.warn.bg[0] - Math.max(look.warn.bg[1], look.warn.bg[2]) > 60,
    look.warn.bg.join(','));
}
await page.evaluate(() => { sync.queue.clear(); sync.savedAt = 0; sync.dirty.clear(); sync.dirtyS.clear();
  sync.lastError = ''; delete document.querySelector('.savebar')?.dataset.sig; updateSaveBar(); });

let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
