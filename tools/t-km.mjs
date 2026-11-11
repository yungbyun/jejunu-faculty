/* 핵심 메모 — 분석 화면 맨 위의 메모 상자 (2026-11-11, 교수님 지정).
   여기 있던 「AI 에게 묻기」를 걷고 그 자리에 놓았다.
   시트를 부르지 않고, **이 기기에 담기는 것과 그리는 것**을 잰다.
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

const openStats = async () => {
  await page.evaluate(() => {
    kmText = ''; localStorage.removeItem('jnu-keymemo');
    location.hash = '#/stats'; render();
  });
  await page.waitForSelector('.km .memo', { timeout: 10000 });
};
/* 글을 적는다 — 사람이 적는 것과 같은 길(입력기)이라야 저장까지 돈다 */
const type = async txt => {
  await page.evaluate(async s => {
    const ed = document.querySelector('.km .memo');
    ed.focus();
    document.execCommand('insertText', false, s);
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  }, txt);
  await page.waitForTimeout(1100);          // 0.8초 뒤에 담는다
};

/* ---------- 자리 ---------- */
await openStats();
t('메모 상자가 분석 화면에 선다', await page.evaluate(() => !!document.querySelector('.km .memo[contenteditable]')));
t('다른 칸보다 맨 위에 있다', await page.evaluate(() => {
  const secs = [...document.querySelectorAll('.stats .st-sec')];
  return secs.length > 1 && secs[0].classList.contains('km');
}), await page.evaluate(() => [...document.querySelectorAll('.stats .st-sec')].map(x => x.className).join(' | ')));
t('칸 이름은 「핵심 메모」', await page.evaluate(() =>
  (document.querySelector('.km h2') || {}).textContent.trim() === '핵심 메모'));
t('도넛보다 위에 있다', await page.evaluate(() => {
  const a = document.querySelector('.km'), d = document.querySelector('.pie, .st-sec:nth-of-type(2)');
  return !!a && !!d && a.getBoundingClientRect().top < d.getBoundingClientRect().top;
}));
/* 「AI 에게 묻기」는 걷었다 (2026-11-11, 교수님 지정) */
t('묻는 칸은 더 이상 없다', await page.evaluate(() =>
  !document.querySelector('#askQ, .ask, [data-asktip]') && typeof window.askSection === 'undefined'));
t('무엇을 적는 자리인지 적어 둔다', await page.evaluate(() => {
  const n = document.querySelector('.km .km__note');
  return !!n && n.textContent.trim().length > 5;
}), await page.evaluate(() => (document.querySelector('.km .km__note') || {}).textContent || ''));
t('빈 칸에는 보기글이 뜬다', await page.evaluate(() => {
  const ed = document.querySelector('.km .memo');
  return ed.textContent.trim() === '' && (ed.dataset.ph || '').length > 5;
}), await page.evaluate(() => (document.querySelector('.km .memo') || {}).dataset.ph || ''));

/* ---------- 상세 메모와 같은 연장 줄 ---------- */
const BAR = await page.evaluate(() => ({
  cmds: [...document.querySelectorAll('.km [data-cmd]')].map(b2 => b2.dataset.cmd),
  colors: document.querySelectorAll('.km [data-color]').length,
  sb: !!document.querySelector('.km .memo__sb'),
  st: !!document.querySelector('.km .memo__st'),
}));
t('굵게·밑줄·기울임 단추가 선다', BAR.cmds.includes('bold') && BAR.cmds.includes('underline')
  && BAR.cmds.includes('italic'), BAR.cmds.join(','));
t('글자색 단추도 선다', BAR.colors >= 2, String(BAR.colors));
t('넘칠 때 서는 바와 알림 줄도 있다', BAR.sb && BAR.st);

/* ---------- 적으면 담긴다 ---------- */
await type('11/20 교수회의 전에 기계공학과 세 분');
const S = await page.evaluate(() => ({
  mem: keyMemo(), ls: localStorage.getItem('jnu-keymemo'),
  set: JSON.stringify(settingValue('keymemo')),
  st: (document.querySelector('.km .memo__st') || {}).textContent || '',
  key: document.querySelector('.km .memo').dataset.key,
}));
t('적은 글이 담긴다', S.mem === '11/20 교수회의 전에 기계공학과 세 분', S.mem);
t('이 기기에도 담는다', S.ls === S.mem, String(S.ls));
t('설정 값은 { t: … } 꼴', S.set === JSON.stringify({ t: S.mem }), S.set);
t('열쇠는 교수 열쇠와 겹치지 않는다', S.key === '@keymemo' && !S.key.includes('/'), S.key);
t('담은 뒤 알림 줄에 적는다', /저장/.test(S.st), S.st);

/* 꾸밈은 상세 메모와 **같은 평문**으로 담긴다 — 시트를 눈으로 읽을 수 있어야 한다 */
const P = await page.evaluate(async () => {
  const ed = document.querySelector('.km .memo');
  ed.focus();
  const r = document.createRange(); r.selectNodeContents(ed);
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  document.execCommand('styleWithCSS', false, false);
  document.execCommand('bold');
  ed.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(x => setTimeout(x, 1100));
  return { mem: keyMemo(), html: ed.innerHTML };
});
t('굵게는 **별표** 로 담는다', /^\*\*.+\*\*$/.test(P.mem.trim()), P.mem);
t('화면에는 굵은 글씨로 보인다', /<b>|<strong>/i.test(P.html), P.html.slice(0, 80));

/* ---------- 다른 화면에 갔다 와도 ---------- */
await page.evaluate(() => { location.hash = '#/'; render(); });
await page.waitForTimeout(300);
await page.evaluate(() => { location.hash = '#/stats'; render(); });
await page.waitForSelector('.km .memo', { timeout: 10000 });
t('돌아와도 적은 글이 그대로', await page.evaluate(() =>
  /기계공학과 세 분/.test(document.querySelector('.km .memo').textContent)),
  await page.evaluate(() => document.querySelector('.km .memo').textContent));
t('다시 그려도 굵게가 살아 있다', await page.evaluate(() =>
  !!document.querySelector('.km .memo b, .km .memo strong')));

/* ---------- 교수 메모와 섞이지 않는다 ---------- */
t('교수 메모는 건드리지 않는다', await page.evaluate(() =>
  state.rows.every(p => !/기계공학과 세 분/.test(getMemo(p) || ''))));
t('설정 열쇠 목록에 든다', await page.evaluate(() => SET_KEYS.includes('keymemo')
  && SET_OBJ.includes('keymemo') && SET_LABEL['keymemo'] === '핵심 메모'));

/* ---------- 다른 기기에서 고친 것 ---------- */
t('다른 기기에서 내려온 글을 받는다', await page.evaluate(() => {
  document.querySelector('.km .memo').blur();
  settingApplyLocal('keymemo', { t: '다른 기기에서 적은 글' });
  return keyMemo() === '다른 기기에서 적은 글'
    && localStorage.getItem('jnu-keymemo') === '다른 기기에서 적은 글';
}), await page.evaluate(() => keyMemo()));
/* 적고 계시는 동안에는 덮어쓰지 않는다 — 적던 글이 날아가는 것보다 늦게 반영되는 쪽이 낫다 */
t('적고 있을 때는 덮어쓰지 않는다', await page.evaluate(() => {
  const ed = document.querySelector('.km .memo');
  ed.focus();
  settingApplyLocal('keymemo', { t: '뒤늦게 내려온 글' });
  const keep = keyMemo() !== '뒤늦게 내려온 글';
  ed.blur();
  return keep;
}), await page.evaluate(() => keyMemo()));

/* ---------- 좁은 화면 ---------- */
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
t('390px 에서 상자가 안 넘친다', await page.evaluate(() => {
  const box = document.querySelector('.km'), ed = document.querySelector('.km .memo');
  const b2 = box.getBoundingClientRect(), r = ed.getBoundingClientRect();
  return r.right <= b2.right + 1 && r.width > 100 && document.documentElement.scrollWidth <= window.innerWidth + 1;
}));
await page.setViewportSize({ width: 1440, height: 1100 });

await page.evaluate(() => { kmText = ''; localStorage.removeItem('jnu-keymemo'); });

let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
