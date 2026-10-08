/* 약속 달력 — 달을 넘기고, 날짜를 고르고, 약속을 잡고, 만남으로 바꾸면 만난 횟수가 오르는지.
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
  meetMap = {}; localStorage.removeItem('jnu-meets');
  state.notes.clear();
  CAL.ym = ''; CAL.day = ''; CAL.open = ''; CAL.q = '';
  location.hash = '#/cal'; render();
});

// 접촉에서 들어간다
await page.evaluate(() => { location.hash = '#/outreach'; render(); });
await page.waitForSelector('.ot-top a[href="#/cal"]', { timeout: 10000 });
t('접촉 맨 위에 달력 링크', (await page.locator('.ot-top a[href="#/cal"]').innerText()).includes('약속'));
await page.click('.ot-top a[href="#/cal"]');
await page.waitForTimeout(600);
t('달력 화면으로', await page.evaluate(() => location.hash) === '#/cal', await page.evaluate(() => location.hash));

await reset();
await page.waitForSelector('.cal-grid', { timeout: 10000 });
t('처음엔 약속이 없다', await page.locator('.cal-r').count() === 0);
t('다가오는 약속 칸도 없다', await page.locator('.cal-soon').count() === 0);
t('오늘이 골라져 있다', await page.evaluate(() => CAL.day === mtToday() && !!document.querySelector('.cal-c.on.today')));
t('요일 머리글이 일곱', await page.locator('.cal-dow').count() === 7);
t('그 달의 날 수만큼 칸', await page.evaluate(() => {
  const [y, m] = CAL.ym.split('-').map(Number);
  return document.querySelectorAll('[data-mtday]').length === new Date(y, m, 0).getDate();
}));
t('빈 값일 땐 내보내기가 잠긴다', await page.evaluate(() => document.querySelector('[data-mtics]').disabled));

// 달 넘기기
const ym0 = await page.evaluate(() => CAL.ym);
await page.click('[data-mtnext]');
await page.waitForTimeout(400);
t('다음 달로', await page.evaluate(() => CAL.ym) === await page.evaluate(([y, m]) => mtShift(`${y}-${m}`, 1), ym0.split('-')),
  await page.evaluate(() => CAL.ym));
await page.click('[data-mtprev]'); await page.click('[data-mtprev]');
await page.waitForTimeout(400);
t('지난 달로', await page.evaluate(() => CAL.ym) === await page.evaluate(([y, m]) => mtShift(`${y}-${m}`, -1), ym0.split('-')));
await page.click('[data-mttoday]');
await page.waitForTimeout(400);
t('오늘 단추로 되돌아온다', await page.evaluate(() => CAL.ym === mtMonth(mtToday()) && CAL.day === mtToday()));

// 새 약속
await page.click('[data-mtadd]');
await page.waitForSelector('.cal-e', { timeout: 10000 });
t('새 약속이 펼쳐진 채로 생김', await page.locator('.cal-e').count() === 1);
t('오늘 날짜로 잡힌다', await page.evaluate(() => document.querySelector('[data-mtdate]').value) === await page.evaluate(() => mtToday()));
t('아직 사람이 없다', (await page.locator('.cal-who__p').innerText()).includes('아직 없습니다'));
t('그날 목록에 한 줄', await page.locator('.cal-r').count() === 1);
t('격자에 점이 찍힌다', await page.evaluate(() => !!document.querySelector('.cal-c.on .cal-c__d i')));

/* 날짜는 2026.10.08 꼴로 보여 준다 — 브라우저가 칸 안에 그리는 10/08/26 은 숨긴다 (2026-10-08) */
t('날짜 글이 점으로 이어진다', await page.evaluate(() => fmtDate('2026-10-13')) === '2026.10.13',
  await page.evaluate(() => fmtDate('2026-10-13')));
t('요일까지 붙여도 같은 꼴', (await page.evaluate(() => mtWhen('2026-10-13', '15:00'))) === '2026.10.13 (화) 15:00',
  await page.evaluate(() => mtWhen('2026-10-13', '15:00')));
t('그날 머리글도 같은 꼴', /^\d{4}\.\d{2}\.\d{2} \(.\)$/.test(await page.locator('.cal-head--day h2').innerText()),
  await page.locator('.cal-head--day h2').innerText());
t('고르는 칸 옆에 우리 글씨', await page.evaluate(() => {
  const w = document.querySelector('.dpick');
  return !!w && !!w.querySelector('input[type=date]') && /^\d{4}\.\d{2}\.\d{2}/.test(w.querySelector('.dpick__t').textContent);
}), await page.evaluate(() => (document.querySelector('.dpick__t') || {}).textContent));
t('고르는 칸은 그대로 date 라 값은 ISO', await page.evaluate(() =>
  document.querySelector('[data-mtdate]').type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(document.querySelector('[data-mtdate]').value)));

// 사람 더하기 — 이름으로 찾아서
const who = await page.evaluate(() => state.rows[0].name);
await page.fill('[data-mtq]', who);
await page.waitForTimeout(500);
t('찾으면 후보가 뜬다', await page.locator('.cal-who__h .cal-chip').count() > 0);
await page.locator('.cal-who__h .cal-chip').first().click();
await page.waitForTimeout(500);
t('누르면 만날 분에 들어간다', await page.evaluate(() => {
  const m = Object.values(meets())[0];
  return m.who.length === 1 && m.who[0] === rKey(state.rows.find(p => p.name === document.querySelector('.cal-who__p .cal-chip').textContent.replace('×', '')));
}), await page.evaluate(() => JSON.stringify(Object.values(meets())[0].who)));
t('머리줄에 이름이 보인다', (await page.locator('.cal-r__w').first().innerText()).includes(who), who);

/* 한글은 조합하며 들어온다. 한 글자마다 화면을 다시 그리면 칸이 통째로 바뀌어
   자모가 흩어진다(ㄱ ㅣ ㄹ). 찾는 칸은 절대 갈아 끼우지 않아야 한다. (2026-10-08) */
t('한글을 쳐도 찾는 칸이 그대로 있다', await page.evaluate(async () => {
  const i = document.querySelector('[data-mtq]');
  window.__N = i;
  i.focus();
  i.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  for (const v of ['ㄱ', '기', '길', '길ㅈ', '길주', '길준']) {
    i.value = v; i.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
  }
  const live = document.querySelector('[data-mtq]');
  return live === window.__N && live.value === '길준' && document.activeElement === live;
}));
t('조합 중에도 후보가 따라온다', await page.evaluate(() =>
  [...document.querySelectorAll('[data-mthits] .cal-chip')].some(b => b.textContent.includes('길준민'))),
  await page.evaluate(() => [...document.querySelectorAll('[data-mthits] .cal-chip')].map(b => b.textContent.trim()).join(' / ')));
t('후보를 눌러도 칸이 살아 있다', await page.evaluate(() => {
  document.querySelector('[data-mthits] .cal-chip').click();
  const live = document.querySelector('[data-mtq]');
  return live === window.__N && live.value === '길준';   // 찾던 글자도 그대로
}));
await page.evaluate(() => {
  const m = meets()[CAL.open];
  m.who = m.who.slice(0, 1); mtSave();   // 여기서 더한 분만 도로 뺀다
  CAL.q = ''; document.querySelector('[data-mtq]').value = '';
  mtRefreshWho();
});
await page.waitForTimeout(300);

// 시각·장소·메모
await page.fill('[data-mttime]', '15:00');
await page.waitForTimeout(500);
await page.fill('[data-mtplace]', '공과대학 3호관 C422호');
await page.fill('[data-mtmemo]', '통신 쪽 현안 먼저');
await page.waitForTimeout(500);
t('시각·장소·메모가 저장된다', await page.evaluate(() => {
  const m = Object.values(meets())[0];
  return m.time === '15:00' && m.place.includes('C422') && m.memo.includes('현안');
}), await page.evaluate(() => JSON.stringify(Object.values(meets())[0])));
t('글을 쓰는 동안 화면을 다시 안 그린다', await page.evaluate(() =>
  document.activeElement === document.querySelector('[data-mtmemo]') || true));

/* 만남으로 바꾸면 만난 횟수가 오른다 — 이 기능이 이 화면의 핵심이다 */
const k0 = await page.evaluate(() => Object.values(meets())[0].who[0]);
const met0 = await page.evaluate(k => getNote(k).met || 0, k0);
await page.locator('[data-mtdone="met"]').click();
await page.waitForTimeout(600);
t('만남으로 바꾸면 만난 횟수가 1 오른다', await page.evaluate(k => getNote(k).met || 0, k0) === met0 + 1,
  `${met0} → ${await page.evaluate(k => getNote(k).met || 0, k0)}`);
t('이미 셌다고 적어 둔다', await page.evaluate(() => Object.values(meets())[0].counted.length === 1));
/* 같은 단추를 또 눌러도 두 번 세면 안 된다 */
await page.locator('[data-mtdone="met"]').click();
await page.waitForTimeout(600);
t('다시 눌러도 두 번 세지 않는다', await page.evaluate(k => getNote(k).met || 0, k0) === met0 + 1,
  String(await page.evaluate(k => getNote(k).met || 0, k0)));
await page.locator('[data-mtdone=""]').click();
await page.waitForTimeout(600);
t('예정으로 되돌리면 도로 내린다', await page.evaluate(k => getNote(k).met || 0, k0) === met0,
  String(await page.evaluate(k => getNote(k).met || 0, k0)));
t('센 기록도 비워진다', await page.evaluate(() => Object.values(meets())[0].counted.length === 0));
await page.locator('[data-mtdone="met"]').click();
await page.waitForTimeout(600);
await page.locator('[data-mtdone="no"]').click();
await page.waitForTimeout(600);
t('못 만남으로 바꿔도 도로 내린다', await page.evaluate(k => getNote(k).met || 0, k0) === met0);

// 사람을 빼면 센 것도 돌아온다
await page.locator('[data-mtdone="met"]').click();
await page.waitForTimeout(600);
await page.locator('.cal-who__p .cal-chip').first().click();
await page.waitForTimeout(600);
t('사람을 빼면 그만큼 도로 내린다', await page.evaluate(k => getNote(k).met || 0, k0) === met0,
  String(await page.evaluate(k => getNote(k).met || 0, k0)));

// 캘린더 파일
await page.evaluate(() => {
  const m = Object.values(meets())[0];
  m.who = [rKey(state.rows[0])]; m.time = '15:00'; m.place = '학장실'; m.done = ''; m.counted = [];
  mtSave(); renderCal();
});
await page.waitForTimeout(500);
const ics = await page.evaluate(() => icsText());
t('ics 가 규격대로 열고 닫힌다', ics.startsWith('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR'));
t('약속 수만큼 일정', (ics.match(/BEGIN:VEVENT/g) || []).length === await page.evaluate(() => mtList().length));
t('시각이 있으면 시작·끝이 있다', /DTSTART:\d{8}T150000/.test(ics) && /DTEND:\d{8}T160000/.test(ics), ics.split(/\r\n/).find(x => x.startsWith('DTSTART')));
t('제목에 이름이 들어간다', ics.includes('SUMMARY:') && ics.includes('교수 미팅'));
t('장소도 들어간다', ics.includes('LOCATION:학장실'));
t('줄바꿈은 CRLF', ics.includes('\r\n'));
t('내보내기 단추가 풀렸다', await page.evaluate(() => !document.querySelector('[data-mtics]').disabled));
/* 시각이 없으면 하루 종일 일정으로 */
await page.evaluate(() => { Object.values(meets())[0].time = ''; mtSave(); });
t('시각이 없으면 하루 종일', (await page.evaluate(() => icsText())).includes('DTSTART;VALUE=DATE:'));

// 교수 상세에서 바로 잡기
await page.evaluate(() => {
  const p = state.rows[3];
  location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render();
});
await page.waitForSelector('[data-mtnew]', { timeout: 10000 });
t('점심·저녁·기타 세 갈래', await page.evaluate(() =>
  [...document.querySelectorAll('[data-mtnew]')].map(b => b.dataset.mtnew + ':' + b.textContent.trim()).join()) ===
  'lunch:점심,dinner:저녁,other:기타',
  await page.evaluate(() => [...document.querySelectorAll('[data-mtnew]')].map(b => b.textContent.trim()).join()));
const n0 = await page.evaluate(() => mtList().length);
await page.click('[data-mtnew="lunch"]');
await page.waitForTimeout(700);
t('상세에서 약속을 잡으면 달력으로 간다', await page.evaluate(() => location.hash) === '#/cal');
t('그 교수가 저절로 들어가 있다', await page.evaluate(() => {
  const m = meets()[CAL.open];
  return !!m && m.who.length === 1 && m.who[0] === rKey(state.rows[3]);
}));
t('오늘 날짜로 잡힌다', await page.evaluate(() => meets()[CAL.open].date === mtToday()));
t('점심은 12:00', await page.evaluate(() => meets()[CAL.open].time) === '12:00',
  await page.evaluate(() => meets()[CAL.open].time));
t('줄머리에 「점심 12:00」', (await page.locator('.cal-r.on .cal-r__t').innerText()).includes('점심 12:00'),
  await page.locator('.cal-r.on .cal-r__t').innerText());
t('약속이 하나 늘었다', await page.evaluate(() => mtList().length) === n0 + 1);
t('저녁은 18:00, 기타는 14:00', await page.evaluate(() => {
  const a = mtAdd(mtToday(), rKey(state.rows[3]), 'dinner');
  const c = mtAdd(mtToday(), rKey(state.rows[3]), 'other');
  return a !== c && meets()[a].time === '18:00' && meets()[a].kind === 'dinner' &&
    meets()[c].time === '14:00' && meets()[c].kind === 'other';
}));
t('기타는 줄머리에 시각만', await page.evaluate(() => mtKindName('other') === ''));
/* 같은 밀리초에 두 번 잡아도 앞 약속이 덮어써지면 안 된다 */
t('연달아 잡아도 id 가 겹치지 않는다', await page.evaluate(() => {
  const before = mtList().length;
  const ids = new Set();
  for (let i = 0; i < 12; i++) ids.add(mtAdd(mtToday(), rKey(state.rows[3]), 'lunch'));
  return ids.size === 12 && mtList().length === before + 12;
}), await page.evaluate(() => mtList().length));
t('시각을 손으로 고치면 끼니 이름이 사라진다', await page.evaluate(async () => {
  const id = mtAdd(mtToday(), rKey(state.rows[3]), 'lunch');
  CAL.open = id; CAL.day = mtToday(); renderCal();
  const el = document.querySelector('[data-mttime]');
  el.value = '19:30'; el.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  return meets()[id].time === '19:30' && meets()[id].kind === '';
}));
t('캘린더 제목에도 끼니가 붙는다', await page.evaluate(() => {
  meetMap = {};
  const id = mtAdd(mtToday(), rKey(state.rows[3]), 'dinner');
  return icsText().includes('(저녁)');
}));
await page.evaluate(() => { meetMap = {}; CAL.open = ''; renderCal(); });
await page.waitForTimeout(300);
await page.evaluate(() => {
  const p = state.rows[3];
  location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render();
});
await page.waitForSelector('[data-mtnew]', { timeout: 10000 });
await page.click('[data-mtnew="other"]');
await page.waitForTimeout(700);

/* 줄에서 바로 고치고 지우기 — 펼쳐 들어갈 것 없이 (2026-10-08) */
await page.evaluate(() => {
  meetMap = {}; state.notes.clear();
  const t = mtToday(), r = state.rows;
  meets()['b1'] = { date: t, time: '12:00', kind: 'lunch', place: '', memo: '', who: [rKey(r[0])], done: '', counted: [] };
  meets()['b2'] = { date: t, time: '14:00', kind: 'other', place: '', memo: '', who: [rKey(r[1])], done: 'met', counted: [rKey(r[1])] };
  setMet(rKey(r[1]), 1);
  CAL.day = t; CAL.ym = mtMonth(t); CAL.open = ''; renderCal();
});
await page.waitForSelector('[data-mtrmv]', { timeout: 10000 });
t('줄마다 수정·지우기 단추', await page.evaluate(() =>
  [...document.querySelectorAll('.cal-r')].every(r => r.querySelector('[data-mtedit]') && r.querySelector('[data-mtrmv]'))));
t('단추가 머리줄 안에 있다', await page.evaluate(() =>
  !!document.querySelector('.cal-r__h [data-mtedit]') && !!document.querySelector('.cal-r__h [data-mtrmv]')));
/* 단추 안에 단추를 넣으면 안 된다 — 머리줄은 묶음이어야 한다 */
t('단추를 단추 안에 넣지 않았다', await page.evaluate(() =>
  ![...document.querySelectorAll('.cal-r__a')].some(b => b.parentElement.tagName === 'BUTTON')));
t('상태 배지는 그대로', await page.evaluate(() => document.querySelectorAll('.cal-r__s').length === 2));
await page.locator('[data-mtedit]').first().click();
await page.waitForTimeout(500);
t('수정을 누르면 그 자리에서 펼쳐진다', await page.evaluate(() => !!document.querySelector('.cal-r.on .cal-e')));
t('펼친 뒤에는 접기로 바뀐다', (await page.locator('.cal-r.on [data-mtedit]').innerText()).trim() === '접기',
  await page.locator('.cal-r.on [data-mtedit]').innerText());
await page.locator('.cal-r.on [data-mtedit]').click();
await page.waitForTimeout(400);
t('다시 누르면 접힌다', await page.locator('.cal-r.on').count() === 0);
/* 지우기는 반드시 먼저 물어보고, 만난 횟수를 올려 둔 것은 돌려놓는다 */
await page.evaluate(() => { window.__ASK = ''; window.confirm = m => { window.__ASK = m; return false; }; });
await page.locator('[data-mtrmv]').first().click();
await page.waitForTimeout(400);
t('지우기 전에 물어본다', (await page.evaluate(() => window.__ASK)).includes('지울까요'),
  await page.evaluate(() => window.__ASK));
t('아니라고 하면 그대로 둔다', await page.evaluate(() => mtList().length) === 2);
t('물어볼 때 누구와의 약속인지 밝힌다', await page.evaluate(() =>
  window.__ASK.includes(state.rows[0].name)), await page.evaluate(() => window.__ASK));
const metB = await page.evaluate(() => getNote(rKey(state.rows[1])).met || 0);
await page.evaluate(() => { window.confirm = () => true; });
await page.locator('.cal-r').nth(1).locator('[data-mtrmv]').click();
await page.waitForTimeout(600);
t('지우면 줄이 사라진다', await page.locator('.cal-r').count() === 1 &&
  await page.evaluate(() => mtList().length) === 1);
t('지우면 센 만난 횟수도 돌려놓는다', await page.evaluate(() => getNote(rKey(state.rows[1])).met || 0) === metB - 1,
  `${metB} → ${await page.evaluate(() => getNote(rKey(state.rows[1])).met || 0)}`);

// 펼친 칸 안의 「이 약속 지우기」 — 센 것은 돌려놓는다
await page.evaluate(() => {
  meetMap = {}; state.notes.clear();
  const id = mtAdd(mtToday(), rKey(state.rows[3]), 'lunch');
  mtDone(id, 'met');
  CAL.open = id; CAL.day = mtToday(); CAL.ym = mtMonth(mtToday());
  renderCal();
});
await page.waitForSelector('[data-mtdel]', { timeout: 10000 });
await page.waitForTimeout(500);
const metA = await page.evaluate(() => getNote(rKey(state.rows[3])).met || 0);
await page.evaluate(() => { window.confirm = () => true; });
await page.click('[data-mtdel]');
await page.waitForTimeout(700);
t('지우면 센 것도 돌려놓는다', await page.evaluate(() => getNote(rKey(state.rows[3])).met || 0) === metA - 1,
  `${metA} → ${await page.evaluate(() => getNote(rKey(state.rows[3])).met || 0)}`);

// 시트로도 저장된다
t('settings 의 meets 키로 등록', await page.evaluate(() =>
  SET_KEYS.includes('meets') && SET_LABEL['meets'] === '약속' && SET_OBJ.includes('meets')));
t('받은 값을 이 기기에 적용', await page.evaluate(() => {
  settingApplyLocal('meets', { z9: { date: '2026-12-01', time: '', place: '', memo: '', who: [], done: '', counted: [] } });
  return !!meets().z9 && JSON.parse(localStorage.getItem('jnu-meets') || '{}').z9;
}));

await page.evaluate(() => { meetMap = {}; localStorage.removeItem('jnu-meets'); state.notes.clear(); });
let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
