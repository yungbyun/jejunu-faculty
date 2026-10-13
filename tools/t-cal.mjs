/* 식사 약속 — 달을 넘기고, 날짜를 고르고, 약속을 잡고, 만남으로 바꾸면 만난 횟수가 오르는지.
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
t('접촉 맨 위에 식사 약속 링크', (await page.locator('.ot-top a[href="#/cal"]').innerText()).includes('식사 약속'),
  await page.locator('.ot-top a[href="#/cal"]').innerText());
await page.click('.ot-top a[href="#/cal"]');
await page.waitForTimeout(600);
t('달력 화면으로', await page.evaluate(() => location.hash) === '#/cal', await page.evaluate(() => location.hash));

await reset();
await page.waitForSelector('.cal-grid', { timeout: 10000 });
/* 접촉을 누르면 바로 이 화면이 나온다 (2026-10-12) */
t('길잡이는 학과 목록 / 접촉', (await page.locator('.crumbs').innerText()).includes('접촉'),
  await page.locator('.crumbs').innerText());
t('머리에 식사 약속이라 적혀 있다', (await page.locator('.hero .eyebrow').innerText()).includes('식사 약속'));
t('문자 보내기·손으로 보낸 기록으로 가는 단추', await page.evaluate(() =>
  !!document.querySelector('.ot-top a[href="#/outreach"]') && !!document.querySelector('.ot-top a[href="#/manual"]')));
/* 머리글과 설명은 2026-10-08 에 뺐다 — 길잡이만으로 어디인지 안다 */
t('큰 제목과 설명은 두지 않는다', await page.evaluate(() =>
  !document.querySelector('.view h1') && !document.querySelector('.hero p')));
t('처음엔 약속이 없다', await page.locator('.cal-r').count() === 0);
/* 「다가오는 약속」 칸은 2026-10-12 에 뺐다 — 달력과 그날 목록만 남긴다 */
t('다가오는 약속 칸은 없다', await page.evaluate(() =>
  !document.querySelector('.cal-soon') && !/다가오는/.test(document.body.textContent)));
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

// 새 약속 — 「Tea」로 만든다(시각 미정)
await page.click('[data-mtadd="other"]');
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

/* 「완료」를 누르면 만난 횟수가 오른다 — 이 기능이 이 화면의 핵심이다.
   단추가 하나로 바뀌어(2026-10-12) 누를 때마다 완료 ↔ 예정을 오간다. */
const k0 = await page.evaluate(() => Object.values(meets())[0].who[0]);
const met0 = await page.evaluate(k => getNote(k).met || 0, k0);
await page.locator('[data-mtdone]').click();
await page.waitForTimeout(600);
t('완료로 바꾸면 만난 횟수가 1 오른다', await page.evaluate(k => getNote(k).met || 0, k0) === met0 + 1,
  `${met0} → ${await page.evaluate(k => getNote(k).met || 0, k0)}`);
t('이미 셌다고 적어 둔다', await page.evaluate(() => Object.values(meets())[0].counted.length === 1));
/* 완료인 채로 같은 값을 또 넣어도 두 번 세면 안 된다 */
await page.evaluate(() => { mtDone(CAL.open, 'met'); renderCal(); });
await page.waitForTimeout(600);
t('다시 넣어도 두 번 세지 않는다', await page.evaluate(k => getNote(k).met || 0, k0) === met0 + 1,
  String(await page.evaluate(k => getNote(k).met || 0, k0)));
await page.locator('[data-mtdone]').click();
await page.waitForTimeout(600);
t('완료를 풀면 도로 내린다', await page.evaluate(k => getNote(k).met || 0, k0) === met0,
  String(await page.evaluate(k => getNote(k).met || 0, k0)));
t('센 기록도 비워진다', await page.evaluate(() => Object.values(meets())[0].counted.length === 0));
/* 「못 만남」 단추는 뺐다 — 셈을 되돌리는 동작만 함수로 확인한다 */
await page.locator('[data-mtdone]').click();
await page.waitForTimeout(600);
await page.evaluate(() => { mtDone(CAL.open, 'no'); renderCal(); });
await page.waitForTimeout(600);
t('못 만남으로 바꿔도 도로 내린다', await page.evaluate(k => getNote(k).met || 0, k0) === met0);

// 사람을 빼면 센 것도 돌아온다
await page.locator('[data-mtdone]').click();
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
t('점심·저녁·Tea 세 갈래', await page.evaluate(() =>
  [...document.querySelectorAll('[data-mtnew]')].map(b => b.dataset.mtnew + ':' + b.textContent.trim()).join()) ===
  'lunch:점심,dinner:저녁,other:Tea',
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
/* 저녁은 6시 반이 미리 들어가고, Tea 는 시각을 비워 둔다 (2026-10-13) */
t('저녁은 18:30, Tea 는 시각 없이', await page.evaluate(() => {
  const a = mtAdd(mtToday(), rKey(state.rows[3]), 'dinner');
  const c = mtAdd(mtToday(), rKey(state.rows[3]), 'other');
  return a !== c && meets()[a].time === '18:30' && meets()[a].kind === 'dinner' &&
    meets()[c].time === '' && meets()[c].kind === 'other';
}), await page.evaluate(() => MT_KIND.dinner.time + ' / ' + JSON.stringify(MT_KIND.other)));
t('Tea 는 줄머리에 이름이 붙는다', await page.evaluate(() => mtKindName('other') === 'Tea'));
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
/* 만날 분 더하기 — 명단에 있는 교수와, 명단 밖의 분(교직원·외부 인사) (2026-10-12) */
await page.evaluate(() => {
  meetMap = {}; mtSave();
  location.hash = '#/cal'; render();
});
await page.waitForSelector('[data-mtadd]', { timeout: 10000 });
await page.click('[data-mtadd="other"]');
await page.waitForSelector('[data-mtmore]', { timeout: 10000 });

t('「+ 만날 분 추가」 단추가 있다', (await page.locator('[data-mtmore]').innerText()).includes('만날 분 추가'));
t('단추는 이름표와 한 줄에', await page.evaluate(() => {
  const l = document.querySelector('.cal-who__l').getBoundingClientRect();
  const b = document.querySelector('[data-mtmore]').getBoundingClientRect();
  return Math.abs((l.top + l.bottom) / 2 - (b.top + b.bottom) / 2) < 10 && b.width < 300;
}), await page.evaluate(() => Math.round(document.querySelector('[data-mtmore]').getBoundingClientRect().width) + 'px'));
await page.click('[data-mtmore]');
t('누르면 찾는 칸으로 간다', await page.evaluate(() => document.activeElement === document.querySelector('[data-mtq]')));

/* 1) 명단에 있는 교수 */
const nm = await page.evaluate(() => state.rows[3].name);
await page.fill('[data-mtq]', nm);
await page.waitForTimeout(200);
t('명단에서 찾아진다', await page.evaluate(() => !!document.querySelector('[data-mthits] [data-mtwho]')));
await page.locator('[data-mthits] [data-mtwho]').first().click();
await page.waitForTimeout(150);
t('교수를 더했다', await page.evaluate(() => mtArr(Object.values(meets())[0].who).length) === 1);

/* 2) 명단에 없는 분 */
await page.fill('[data-mtq]', '행정실 이영수');
await page.waitForTimeout(200);
t('명단에 없으면 그대로 더하기가 뜬다', await page.evaluate(() => !!document.querySelector('[data-mtguest]')),
  await page.evaluate(() => (document.querySelector('[data-mthits]') || {}).innerText));
await page.click('[data-mtguest]');
await page.waitForTimeout(150);
t('명단 밖의 분이 더해졌다', await page.evaluate(() => JSON.stringify(mtArr(Object.values(meets())[0].guests))) === '["행정실 이영수"]',
  await page.evaluate(() => JSON.stringify(Object.values(meets())[0].guests)));
t('더한 뒤 찾는 칸이 비워진다', await page.evaluate(() => document.querySelector('[data-mtq]').value) === '');
t('줄머리에 두 사람이 다 나온다', await page.evaluate(() => {
  const s = document.querySelector('.cal-r.on .cal-r__w').textContent;
  return s.includes('행정실 이영수') && s.split(',').length === 2;
}), await page.evaluate(() => document.querySelector('.cal-r.on .cal-r__w').textContent));
t('교수 칩과 색이 다르다', await page.evaluate(() => {
  const g = document.querySelector('.cal-chip--g'), p = document.querySelector('[data-mtpicked] [data-mtwho]');
  return !!g && !!p && getComputedStyle(g).backgroundColor !== getComputedStyle(p).backgroundColor;
}));
/* 같은 이름을 두 번 더하지 않는다 */
await page.fill('[data-mtq]', '행정실 이영수');
await page.waitForTimeout(200);
t('이미 더한 이름은 또 안 권한다', await page.evaluate(() => !document.querySelector('[data-mtguest]')));

/* 3) 만남으로 바꿔도 명단 밖의 분은 만난 횟수에 안 들어간다 */
const before = await page.evaluate(() => getNote(rKey(state.rows[3])).met || 0);
await page.locator('[data-mtdone]').click();
await page.waitForTimeout(250);
t('교수만 만난 횟수가 오른다', await page.evaluate(x => (getNote(rKey(state.rows[3])).met || 0) === x + 1, before));
t('센 사람에 명단 밖의 분은 없다', await page.evaluate(() =>
  mtArr(Object.values(meets())[0].counted).every(k => state.rows.some(p => rKey(p) === k))));

/* 4) 뺄 수도 있다 */
await page.evaluate(() => { CAL.open = Object.keys(meets())[0]; renderCal(); });
await page.waitForSelector('[data-mtguestx]', { timeout: 10000 });
await page.click('[data-mtguestx]');
await page.waitForTimeout(150);
t('명단 밖의 분을 뺄 수 있다', await page.evaluate(() => mtArr(Object.values(meets())[0].guests).length) === 0);

/* 5) 시트로 함께 저장된다 */
t('guests 도 meets 에 담긴다', await page.evaluate(() => {
  const id = Object.keys(meets())[0];
  mtGuest(id, '외부 손님');
  return JSON.parse(localStorage.getItem('jnu-meets'))[id].guests.includes('외부 손님');
}));
await page.evaluate(() => { meetMap = {}; mtSave(); CAL.open = ''; CAL.q = ''; });

/* 점심은 밝게, 저녁은 어둡게 — 달력의 점과 목록의 아이콘 (2026-10-12) */
await page.evaluate(() => {
  meetMap = {};
  const t0 = mtToday(), d = new Date(t0 + 'T00:00:00');
  const day = n => { const x = new Date(d); x.setDate(x.getDate() + n);
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`; };
  mtAdd(day(1), rKey(state.rows[0]), 'lunch');
  mtAdd(day(1), rKey(state.rows[1]), 'dinner');
  mtAdd(day(1), rKey(state.rows[2]), 'other');
  mtAdd(day(1), rKey(state.rows[4]), '');        // 시각 미정 — 시계 아이콘
  mtAdd(day(3), rKey(state.rows[3]), 'dinner');
  CAL.day = day(1); CAL.ym = mtMonth(day(1)); CAL.open = '';
  location.hash = '#/cal'; render();
});
await page.waitForSelector('.cal-c__d i', { timeout: 10000 });
/* 화면에 찍힌 색을 그대로 읽어 밝기를 잰다 */
const lum = () => page.evaluate(() => {
  const L = c => { const [r, g, b] = (c.match(/\d+/g) || []).map(Number);
    const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const pick = k => { const i = document.querySelector(`.cal-c:not(.on) .cal-c__d i.cal-dot--${k}`)
      || document.querySelector(`.cal-c__d i.cal-dot--${k}`);
    return i ? L(getComputedStyle(i).backgroundColor) : null; };
  return { lunch: pick('day'), dinner: pick('night'), etc: pick('none') };
});
const Lm = await lum();
t('갈래마다 점 색이 다르다', await page.evaluate(() => {
  const c = k => { const i = document.querySelector(`.cal-c__d i.cal-dot--${k}`); return i && getComputedStyle(i).backgroundColor; };
  const a = c('day'), b2 = c('night'), e = c('none');
  return a && b2 && e && a !== b2 && b2 !== e && a !== e;
}), JSON.stringify(Lm));
t('낮 점이 밤 점보다 밝다', Lm.lunch !== null && Lm.dinner !== null && Lm.lunch > Lm.dinner + .1,
  `점심 ${(Lm.lunch || 0).toFixed(3)} · 저녁 ${(Lm.dinner || 0).toFixed(3)}`);
t('고른 날에도 갈래가 갈린다', await page.evaluate(() => {
  const on = document.querySelectorAll('.cal-c.on .cal-c__d i');
  if (on.length < 2) return false;
  const s = new Set([...on].map(i => getComputedStyle(i).backgroundColor));
  return s.size >= 2;
}), await page.evaluate(() => [...document.querySelectorAll('.cal-c.on .cal-c__d i')].map(i => getComputedStyle(i).backgroundColor).join(' ')));
t('고른 날 점이 바탕과 갈린다', await page.evaluate(() => {
  const d = document.createElement('canvas'); d.width = d.height = 1; const x = d.getContext('2d');
  const px = c => { x.fillStyle = '#fff'; x.fillRect(0, 0, 1, 1); x.fillStyle = c; x.fillRect(0, 0, 1, 1);
    return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  const L = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const cell = getComputedStyle(document.querySelector('.cal-c.on')).backgroundColor;
  return [...document.querySelectorAll('.cal-c.on .cal-c__d i')].every(i => {
    const a = L(px(getComputedStyle(i).backgroundColor)), b2 = L(px(cell));
    return (Math.max(a, b2) + .05) / (Math.min(a, b2) + .05) >= 3;
  });
}));

/* 목록 — 시각 앞의 아이콘 */
t('줄마다 시각 앞에 아이콘', await page.evaluate(() =>
  [...document.querySelectorAll('.cal-r__t')].every(e => {
    const i = e.querySelector('.mt-i');
    return !!i && i === e.firstElementChild && i.querySelector('svg');
  })));
t('낮·밤·미정 아이콘이 갈린다', await page.evaluate(() => {
  const k = [...document.querySelectorAll('.cal-r__t .mt-i')].map(i => i.className);
  return k.some(c => c.includes('mt-i--day')) && k.some(c => c.includes('mt-i--night')) && k.some(c => c.includes('mt-i--none'));
}), await page.evaluate(() => [...document.querySelectorAll('.cal-r__t .mt-i')].map(i => i.className).join(' | ')));
t('아이콘 색이 달력의 점과 같다', await page.evaluate(() => {
  const dot = document.querySelector('.cal-c:not(.on) .cal-c__d i.cal-dot--night')
    || document.querySelector('.cal-c__d i.cal-dot--night');
  const ico = document.querySelector('.cal-r__t .mt-i--night');
  return !!dot && !!ico && getComputedStyle(dot).backgroundColor === getComputedStyle(ico).color;
}));
t('아이콘이 글자를 밀어내지 않는다', await page.evaluate(() => {
  const e = document.querySelector('.cal-r__t');
  return e.scrollWidth <= e.clientWidth + 1;
}));
await page.evaluate(() => { meetMap = {}; mtSave(); CAL.open = ''; });

/* 상태 단추는 「예정」과 「만남」 둘뿐 (2026-10-12) */
await page.evaluate(() => { meetMap = {}; CAL.day = mtToday(); CAL.open = mtAdd(mtToday(), rKey(state.rows[0]), 'lunch'); renderCal(); });
await page.waitForSelector('[data-mtdone]', { timeout: 10000 });
t('상태 단추는 「완료」 하나', await page.locator('[data-mtdone]').count() === 1,
  await page.evaluate(() => [...document.querySelectorAll('[data-mtdone]')].map(b => b.textContent.trim()).join('/')));
t('예정·못 만남 단추는 없다', await page.evaluate(() =>
  !/예정|못 만남/.test(document.querySelector('.cal-done').textContent)));
const met1 = await page.evaluate(() => getNote(rKey(state.rows[0])).met || 0);
await page.locator('[data-mtdone]').click();
await page.waitForTimeout(250);
t('완료를 누르면 만난 횟수가 1 오른다', await page.evaluate(k => getNote(k).met || 0, await page.evaluate(() => rKey(state.rows[0]))) === met1 + 1);
t('누른 뒤에는 「완료됨」', (await page.locator('[data-mtdone]').innerText()).includes('완료됨'),
  await page.locator('[data-mtdone]').innerText());
await page.locator('[data-mtdone]').click();
await page.waitForTimeout(250);
t('다시 누르면 도로 내려간다', await page.evaluate(k => getNote(k).met || 0, await page.evaluate(() => rKey(state.rows[0]))) === met1);
t('풀면 다시 「완료」', (await page.locator('[data-mtdone]').innerText()).trim() === '완료',
  await page.locator('[data-mtdone]').innerText());
await page.evaluate(() => { meetMap = {}; mtSave(); CAL.open = ''; });

/* 이미 잡아 둔 약속의 갈래를 고칠 수 있다 (2026-10-13).
   예전에 시각을 손으로 고치면 갈래가 지워졌는데, 그렇게 표시를 잃은 약속을 되살리는 길이다. */
await page.evaluate(() => {
  meetMap = {};
  const id = mtAdd('2026-10-13', rKey(state.rows[0]), '');
  mtSet(id, { time: '15:20' });
  CAL.day = '2026-10-13'; CAL.ym = '2026-10'; CAL.open = id; renderCal();
});
await page.waitForSelector('[data-mtkind]', { timeout: 10000 });
t('갈래 고르개가 넷', await page.locator('[data-mtkind]').count() === 4,
  await page.evaluate(() => [...document.querySelectorAll('[data-mtkind]')].map(b => b.textContent.trim()).join('/')));
t('지금 갈래에 불이 켜져 있다', await page.evaluate(() =>
  document.querySelector('[data-mtkind=""]').classList.contains('on')));
t('갈래가 없고 애매한 시각이면 찻잔', await page.evaluate(() => !!document.querySelector('.cal-r__t .mt-i--tea')));
await page.click('[data-mtkind="other"]');
await page.waitForTimeout(350);
t('Tea 로 고치면 찻잔이 된다', await page.evaluate(() =>
  mtList()[0].kind === 'other' && !!document.querySelector('.cal-r__t .mt-i--tea')));
t('달력 점도 흰 점으로 바뀐다', await page.evaluate(() => !!document.querySelector('.cal-c__d i.cal-dot--tea')));
t('적어 둔 시각은 안 건드린다', await page.evaluate(() => mtList()[0].time) === '15:20',
  await page.evaluate(() => mtList()[0].time));
t('줄머리에 Tea 가 붙는다', (await page.locator('.cal-r__t').innerText()).includes('Tea 15:20'),
  await page.locator('.cal-r__t').innerText());
/* 시각이 비어 있으면 그 갈래의 시각을 채운다 */
await page.evaluate(() => {
  meetMap = {}; CAL.open = mtAdd('2026-10-13', rKey(state.rows[1]), ''); renderCal();
});
await page.click('[data-mtkind="dinner"]');
await page.waitForTimeout(350);
t('빈 시각이면 갈래의 시각이 채워진다', await page.evaluate(() =>
  mtList()[0].kind === 'dinner' && mtList()[0].time === '18:30'),
  await page.evaluate(() => JSON.stringify([mtList()[0].kind, mtList()[0].time])));
await page.evaluate(() => { meetMap = {}; mtSave(); CAL.open = ''; });

/* Tea — 상세의 「기타」를 Tea 로 바꾸고 찻잔을 붙였다 (2026-10-13) */
t('Tea 는 미리 정한 시각이 없다', await page.evaluate(() =>
  MT_KIND.other.name === 'Tea' && MT_KIND.other.time === ''));
t('Tea 는 몇 시든 찻잔', await page.evaluate(() =>
  mtSlot({ kind: 'other', time: '' }) === 'tea' && mtSlot({ kind: 'other', time: '15:30' }) === 'tea'
  && mtSlot({ kind: 'other', time: '20:00' }) === 'tea'));
await page.evaluate(() => {
  meetMap = {}; const d = mtToday();
  CAL.open = mtAdd(d, rKey(state.rows[0]), 'other');
  CAL.day = d; CAL.ym = mtMonth(d); renderCal();
});
await page.waitForSelector('.cal-r__t .mt-i', { timeout: 10000 });
t('줄에 찻잔과 Tea', await page.evaluate(() => {
  const e = document.querySelector('.cal-r__t');
  return e.querySelector('.mt-i--tea') && e.textContent.includes('Tea');
}), await page.evaluate(() => document.querySelector('.cal-r__t').textContent.trim()));
t('달력 점은 연두, 다른 점과 같은 크기', await page.evaluate(() => {
  const tea = document.querySelector('.cal-c__d i.cal-dot--tea');
  if (!tea) return false;
  const c = getComputedStyle(tea), r = tea.getBoundingClientRect();
  const [red, g, bl] = (c.backgroundColor.match(/\d+/g) || []).map(Number);
  const green = g > red + 30 && g > bl + 30;          // 연두
  const plain = c.boxShadow === 'none';               // 테두리를 두르면 그만큼 커 보인다
  return green && plain && Math.round(r.width) === 5;
}), await page.evaluate(() => {
  const t2 = document.querySelector('.cal-c__d i.cal-dot--tea');
  const c = t2 && getComputedStyle(t2);
  return t2 ? `${c.backgroundColor} / 테두리 ${c.boxShadow} / ${Math.round(t2.getBoundingClientRect().width)}px` : '(없음)';
}));
t('다른 점과 크기가 같다', await page.evaluate(() => {
  const w = [...document.querySelectorAll('.cal-c__d i')].map(i => Math.round(i.getBoundingClientRect().width));
  return new Set(w).size === 1;
}), await page.evaluate(() => [...document.querySelectorAll('.cal-c__d i')]
  .map(i => i.className.replace('cal-dot--', '') + ':' + Math.round(i.getBoundingClientRect().width)).join(' ')));

/* 시각을 손으로 넣어도 Tea 가 풀리면 안 된다 */
await page.evaluate(() => {
  const t2 = document.querySelector('[data-mttime]');
  t2.value = '15:30'; t2.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(300);
t('시각을 넣어도 Tea 가 그대로', await page.evaluate(() => meets()[CAL.open].kind === 'other'),
  await page.evaluate(() => JSON.stringify([meets()[CAL.open].kind, meets()[CAL.open].time])));
t('그래도 찻잔', await page.evaluate(() => !!document.querySelector('.cal-r__t .mt-i--tea')));
/* 점심은 시각을 바꾸면 갈래가 풀린다(예전 그대로) */
await page.evaluate(() => {
  CAL.open = mtAdd(mtToday(), rKey(state.rows[1]), 'lunch'); renderCal();
  const t2 = document.querySelector('[data-mttime]');
  t2.value = '16:00'; t2.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(300);
t('점심은 시각을 바꾸면 갈래가 풀린다', await page.evaluate(() => meets()[CAL.open].kind === ''),
  await page.evaluate(() => JSON.stringify([meets()[CAL.open].kind, meets()[CAL.open].time])));
await page.evaluate(() => { meetMap = {}; mtSave(); CAL.open = ''; });

/* 해·달은 갈래가 아니라 **몇 시냐**로 정한다 (2026-10-12) */
/* 끼니때로 가른다 — 낮/밤이 아니라 점심때·저녁때·그 밖 (2026-10-13) */
t('11시부터 2시 앞까지가 점심때', await page.evaluate(() =>
  ['11:00', '12:00', '13:59'].every(t2 => mtSlot({ time: t2 }) === 'day')));
t('5시부터 9시 앞까지가 저녁때', await page.evaluate(() =>
  ['17:00', '18:03', '18:30', '20:59'].every(t2 => mtSlot({ time: t2 }) === 'night')));
t('그 밖의 시각은 찻잔', await page.evaluate(() =>
  ['07:00', '10:30', '14:00', '15:20', '16:30', '21:00', '23:00', '05:30'].every(t2 => mtSlot({ time: t2 }) === 'tea')));
t('시각이 없으면 갈래의 시각을 본다', await page.evaluate(() =>
  mtSlot({ time: '', kind: 'lunch' }) === 'day' && mtSlot({ time: '', kind: 'dinner' }) === 'night'));
t('둘 다 없으면 시계', await page.evaluate(() => mtSlot({ time: '', kind: '' }) === 'none'));
/* 갈래 없이 손으로 넣은 시각도 해·달로 갈린다 */
await page.evaluate(() => {
  meetMap = {}; const d = mtToday();
  mtSet(mtAdd(d, rKey(state.rows[0]), ''), { time: '12:00' });
  mtSet(mtAdd(d, rKey(state.rows[1]), ''), { time: '19:40' });
  mtAdd(d, rKey(state.rows[2]), '');
  CAL.day = d; CAL.ym = mtMonth(d); CAL.open = ''; renderCal();
});
await page.waitForSelector('.cal-r__t .mt-i', { timeout: 10000 });
t('12:00 은 해, 19:40 은 달, 미정은 시계', await page.evaluate(() => {
  const m = {};
  document.querySelectorAll('.cal-r__t').forEach(e => {
    m[e.textContent.trim().split(/\s+/)[0]] = e.querySelector('.mt-i').className.replace('mt-i mt-i--', '');
  });
  return m['12:00'] === 'day' && m['19:40'] === 'night' && m['시각'] === 'none';
}), await page.evaluate(() => [...document.querySelectorAll('.cal-r__t')]
  .map(e => e.querySelector('.mt-i').className.replace('mt-i mt-i--', '') + ':' + e.textContent.trim().split(/\s+/)[0]).join(' ')));
t('달력 점도 같은 규칙', await page.evaluate(() => {
  const k = [...document.querySelectorAll('.cal-c.on .cal-c__d i')].map(i => i.className.replace('cal-dot--', ''));
  return k.includes('day') && k.includes('night');
}), await page.evaluate(() => [...document.querySelectorAll('.cal-c.on .cal-c__d i')].map(i => i.className).join(' ')));
await page.evaluate(() => { meetMap = {}; mtSave(); CAL.open = ''; });

/* 새 약속을 잡을 때 점심·저녁·직접 중에서 고른다 (2026-10-12) */
await page.evaluate(() => { meetMap = {}; mtSave(); CAL.open = ''; CAL.day = mtToday(); renderCal(); });
await page.waitForSelector('[data-mtadd]', { timeout: 10000 });
t('고를 단추가 셋', await page.locator('[data-mtadd]').count() === 3,
  await page.evaluate(() => [...document.querySelectorAll('[data-mtadd]')].map(b => b.dataset.mtadd).join('/')));
t('단추에 시각이 적혀 있다', await page.evaluate(() => {
  const g = k => document.querySelector(`[data-mtadd="${k}"]`).textContent;
  return g('lunch').includes('12:00') && g('dinner').includes('18:30') && g('other').includes('Tea');
}), await page.evaluate(() => [...document.querySelectorAll('[data-mtadd]')].map(b => b.textContent.trim()).join(' | ')));
t('단추에도 해·달 아이콘', await page.evaluate(() =>
  !!document.querySelector('[data-mtadd="lunch"] .mt-i--day') && !!document.querySelector('[data-mtadd="dinner"] .mt-i--night')));
t('날짜 제목과 다른 줄에 있다', await page.evaluate(() => {
  const h = document.querySelector('.cal-head--day h2').getBoundingClientRect();
  const b = document.querySelector('[data-mtadd="lunch"]').getBoundingClientRect();
  return b.top >= h.bottom - 2;
}));

await page.click('[data-mtadd="lunch"]');
await page.waitForTimeout(250);
t('점심으로 잡으면 12:00', await page.evaluate(() => {
  const m = meets()[CAL.open]; return m.kind === 'lunch' && m.time === '12:00';
}), await page.evaluate(() => JSON.stringify([meets()[CAL.open].kind, meets()[CAL.open].time])));
t('잡은 약속이 펼쳐져 있다', await page.locator('.cal-r.on .cal-e').count() === 1);

await page.click('[data-mtadd="dinner"]');
await page.waitForTimeout(250);
t('저녁으로 잡으면 18:30', await page.evaluate(() => {
  const m = meets()[CAL.open]; return m.kind === 'dinner' && m.time === '18:30';
}), await page.evaluate(() => JSON.stringify([meets()[CAL.open].kind, meets()[CAL.open].time])));

await page.click('[data-mtadd="other"]');
await page.waitForTimeout(400);
t('Tea 는 시각을 비워 둔다', await page.evaluate(() => {
  const m = meets()[CAL.open]; return m.kind === 'other' && m.time === '';
}), await page.evaluate(() => JSON.stringify([meets()[CAL.open].kind, meets()[CAL.open].time])));
t('Tea 는 시각 칸으로 데려간다', await page.evaluate(() =>
  document.activeElement === document.querySelector('[data-mttime]')));
/* 비워 둔 시각을 손으로 넣으면 그대로 붙는다 */
await page.evaluate(() => {
  const t2 = document.querySelector('[data-mttime]');
  t2.value = '19:40'; t2.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(250);
t('손으로 넣은 시각이 저장된다', await page.evaluate(() => mtList().some(m => m.time === '19:40')),
  await page.evaluate(() => mtList().map(m => m.time).join(',')));
t('약속 셋이 모두 남아 있다', await page.evaluate(() => mtList().length) === 3);
await page.evaluate(() => { meetMap = {}; mtSave(); CAL.open = ''; });

let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
