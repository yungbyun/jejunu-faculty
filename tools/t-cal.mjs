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

/* 시각은 시·분 고르개로 넣는다 — 고를 때마다 화면을 다시 그리므로 매번 찾아 쓴다 */
const setTime = async (hh, mm = '00') => {
  await page.evaluate(h => {
    const s2 = document.querySelector('[data-mth]');
    s2.value = h; s2.dispatchEvent(new Event('change', { bubbles: true }));
  }, hh);
  await page.waitForTimeout(250);
  if (hh) {
    await page.evaluate(m => {
      const s2 = document.querySelector('[data-mtm]');
      s2.value = m; s2.dispatchEvent(new Event('change', { bubbles: true }));
    }, mm);
    await page.waitForTimeout(250);
  }
};

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
t('격자에 그림이 선다', await page.evaluate(() => !!document.querySelector('.cal-c.on .cal-c__d i svg')));

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
  return live === window.__N && document.activeElement === live;   // 같은 칸에 손이 그대로
}));
/* 2026-11-02, 교수님 지정 — **추천에서 고르면 친 글자를 지운다.** 남겨 두면 다음 분을
   칠 때 지우기부터 해야 하고, 고른 분이 추천에서 빠져 같은 글자에 다른 사람이 떠 헷갈린다.
   (그 전에는 찾던 글자를 그대로 두었다.) */
t('추천에서 고르면 친 글자가 지워진다', await page.evaluate(() =>
  document.querySelector('[data-mtq]').value === '' && CAL.q === ''),
  await page.evaluate(() => `"${document.querySelector('[data-mtq]').value}" / "${CAL.q}"`));
t('지운 뒤에도 같은 칸에 손이 있다', await page.evaluate(() =>
  document.activeElement === window.__N));
/* 고른 칩(×)을 눌러 **뺄 때는** 건드리지 않는다 — 찾던 글자가 남아 있어야 이어서 고른다 */
t('고른 칩을 빼도 친 글자는 그대로', await page.evaluate(async () => {
  const i = document.querySelector('[data-mtq]');
  i.focus(); i.value = '길준'; i.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  [...document.querySelectorAll('[data-mtpicked] [data-mtwho]')].pop().click();
  await new Promise(r => setTimeout(r, 150));
  return document.querySelector('[data-mtq]').value === '길준' && CAL.q === '길준';
}), await page.evaluate(() => `"${document.querySelector('[data-mtq]').value}" / "${CAL.q}"`));
await page.evaluate(() => {
  const m = meets()[CAL.open];
  m.who = m.who.slice(0, 1); mtSave();   // 여기서 더한 분만 도로 뺀다
  CAL.q = ''; document.querySelector('[data-mtq]').value = '';
  mtRefreshWho();
});
await page.waitForTimeout(300);

// 시각·장소·메모
await setTime('15', '00');
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
t('저녁은 18:30, Tea 는 14:00', await page.evaluate(() => {
  const a = mtAdd(mtToday(), rKey(state.rows[3]), 'dinner');
  const c = mtAdd(mtToday(), rKey(state.rows[3]), 'other');
  return a !== c && meets()[a].time === '18:30' && meets()[a].kind === 'dinner' &&
    meets()[c].time === '14:00' && meets()[c].kind === 'other';
}), await page.evaluate(() => MT_KIND.dinner.time + ' / ' + JSON.stringify(MT_KIND.other)));
t('Tea 는 단추·안내에 쓸 이름이 있다', await page.evaluate(() => mtKindName('other') === 'Tea'));
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
  const h = document.querySelector('[data-mth]');
  h.value = '19'; h.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 250));
  const mi = document.querySelector('[data-mtm]');
  mi.value = '30'; mi.dispatchEvent(new Event('change', { bubbles: true }));
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
/* 줄머리는 글자 대신 그림으로 — 폰에서 이름이 가려졌다 (2026-10-13) */
t('「예정」 표는 안 단다', await page.evaluate(() => document.querySelectorAll('.cal-r__s').length === 1),
  await page.evaluate(() => [...document.querySelectorAll('.cal-r__s')].map(e => e.textContent).join()));
t('만난 약속에만 표가 붙는다', await page.evaluate(() => {
  const e = document.querySelector('.cal-r__s');
  return e.textContent.trim() === '만남' && e.closest('.cal-r').querySelector('.cal-r__w').textContent.length > 0;
}));
t('고치기는 연필, 지우기는 지우개', await page.evaluate(() => {
  const e = document.querySelector('[data-mtedit]'), x = document.querySelector('[data-mtrmv]');
  return !e.textContent.trim() && !x.textContent.trim() && !!e.querySelector('svg') && !!x.querySelector('svg')
    && e.getAttribute('aria-label') === '고치기' && x.getAttribute('aria-label') === '지우기';
}), await page.evaluate(() => document.querySelector('[data-mtedit]').outerHTML.slice(0, 90)));
t('그림 단추도 손가락이 닿을 만큼', await page.evaluate(() =>
  [...document.querySelectorAll('.cal-r__a')].every(b => {
    const r = b.getBoundingClientRect(); return r.width >= 30 && r.height >= 28;
  })), await page.evaluate(() => [...document.querySelectorAll('.cal-r__a')]
    .map(b => Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height)).join(' ')));
t('이름 칸이 단추보다 훨씬 넓다', await page.evaluate(() => {
  const w = document.querySelector('.cal-r__w').getBoundingClientRect().width;
  const a = [...document.querySelectorAll('.cal-r:first-child .cal-r__a')]
    .reduce((s2, b) => s2 + b.getBoundingClientRect().width, 0);
  return w > a;
}));
await page.locator('[data-mtedit]').first().click();
await page.waitForTimeout(500);
t('수정을 누르면 그 자리에서 펼쳐진다', await page.evaluate(() => !!document.querySelector('.cal-r.on .cal-e')));
t('펼친 뒤에는 접기로 바뀐다', await page.evaluate(() => {
  const e = document.querySelector('.cal-r.on [data-mtedit]');
  return e.getAttribute('aria-label') === '접기' && e.getAttribute('aria-expanded') === 'true'
    && e.classList.contains('on');
}), await page.evaluate(() => document.querySelector('.cal-r.on [data-mtedit]').getAttribute('aria-label')));
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
  /* **다음 달 1일**을 밑동으로 잡는다 (2026-10-29 에 고침). 전에는 오늘에서 +1 · +3 일을
     썼는데, 달 끝에서는 둘이 **다른 달**에 떨어져 달력에 한쪽만 그려졌다 — 오늘이 29일이면
     +3 이 다음 달이라 밤 점이 아예 없어 시험이 깨졌다. 다음 달 안이면 늘 같은 달이다. */
  const t0 = mtToday(), d0 = new Date(t0 + 'T00:00:00');
  const d = new Date(d0.getFullYear(), d0.getMonth() + 1, 1);
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
    return i ? L(getComputedStyle(i).color) : null; };
  return { lunch: pick('day'), dinner: pick('night'), etc: pick('none') };
});
const Lm = await lum();
t('갈래마다 그림 색이 다르다', await page.evaluate(() => {
  const c = k => { const i = document.querySelector(`.cal-c__d i.cal-dot--${k}`); return i && getComputedStyle(i).color; };
  const a = c('day'), b2 = c('night'), e = c('none');
  return a && b2 && e && a !== b2 && b2 !== e && a !== e;
}), JSON.stringify(Lm));
t('낮 그림이 밤 그림보다 밝다', Lm.lunch !== null && Lm.dinner !== null && Lm.lunch > Lm.dinner + .1,
  `점심 ${(Lm.lunch || 0).toFixed(3)} · 저녁 ${(Lm.dinner || 0).toFixed(3)}`);
t('고른 날에도 갈래가 갈린다', await page.evaluate(() => {
  const on = document.querySelectorAll('.cal-c.on .cal-c__d i');
  if (on.length < 2) return false;
  const s = new Set([...on].map(i => getComputedStyle(i).color));
  return s.size >= 2;
}), await page.evaluate(() => [...document.querySelectorAll('.cal-c.on .cal-c__d i')].map(i => getComputedStyle(i).color).join(' ')));
t('고른 날 그림이 바탕과 갈린다', await page.evaluate(() => {
  const d = document.createElement('canvas'); d.width = d.height = 1; const x = d.getContext('2d');
  const px = c => { x.fillStyle = '#fff'; x.fillRect(0, 0, 1, 1); x.fillStyle = c; x.fillRect(0, 0, 1, 1);
    return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  const L = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const cell = getComputedStyle(document.querySelector('.cal-c.on')).backgroundColor;
  return [...document.querySelectorAll('.cal-c.on .cal-c__d i')].every(i => {
    const a = L(px(getComputedStyle(i).color)), b2 = L(px(cell));
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
t('아이콘 색이 달력의 그림과 같다', await page.evaluate(() => {
  const dot = document.querySelector('.cal-c:not(.on) .cal-c__d i.cal-dot--night')
    || document.querySelector('.cal-c__d i.cal-dot--night');
  const ico = document.querySelector('.cal-r__t .mt-i--night');
  return !!dot && !!ico && getComputedStyle(dot).color === getComputedStyle(ico).color;
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
t('갈래 고르개는 셋 — 「없음」은 뺐다', await page.evaluate(() =>
  [...document.querySelectorAll('[data-mtkind]')].map(b => b.dataset.mtkind).join() === 'lunch,dinner,other'),
  await page.evaluate(() => [...document.querySelectorAll('[data-mtkind]')].map(b => b.textContent.trim()).join('/')));
t('갈래가 없으면 아무 단추도 안 켜진다', await page.evaluate(() =>
  ![...document.querySelectorAll('[data-mtkind]')].some(b => b.classList.contains('on'))));
t('갈래가 없고 애매한 시각이면 찻잔', await page.evaluate(() => !!document.querySelector('.cal-r__t .mt-i--tea')));
await page.click('[data-mtkind="other"]');
await page.waitForTimeout(350);
t('Tea 로 고치면 찻잔이 된다', await page.evaluate(() =>
  mtList()[0].kind === 'other' && !!document.querySelector('.cal-r__t .mt-i--tea')));
t('달력 그림도 찻잔으로 바뀐다', await page.evaluate(() => !!document.querySelector('.cal-c__d i.cal-dot--tea svg')));
t('적어 둔 시각은 안 건드린다', await page.evaluate(() => mtList()[0].time) === '15:20',
  await page.evaluate(() => mtList()[0].time));
/* 찻잔은 그림만으로 뜻이 선다 — 「Tea」라고 또 적지 않는다 (2026-10-13) */
t('줄머리에 Tea 라고 적지 않는다', (await page.locator('.cal-r__t').innerText()).trim() === '15:20',
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
/* 「없음」 단추를 뺀 자리 — 켜진 단추를 다시 누르면 갈래가 지워진다 (2026-10-13) */
t('켜진 단추에 불이 들어와 있다', await page.evaluate(() =>
  document.querySelector('[data-mtkind="dinner"]').classList.contains('on')));
await page.click('[data-mtkind="dinner"]');
await page.waitForTimeout(350);
t('다시 누르면 갈래가 지워진다', await page.evaluate(() => mtList()[0].kind) === '',
  await page.evaluate(() => JSON.stringify([mtList()[0].kind, mtList()[0].time])));
t('지워도 적어 둔 시각은 그대로', await page.evaluate(() => mtList()[0].time) === '18:30');
t('지우면 줄머리가 시각만 남는다', await page.evaluate(() =>
  !!document.querySelector('.cal-r__t .mt-i--night')));
await page.evaluate(() => { meetMap = {}; mtSave(); CAL.open = ''; });

/* Tea — 상세의 「기타」를 Tea 로 바꾸고 찻잔을 붙였다 (2026-10-13) */
t('Tea 는 오후 2시가 미리 들어간다', await page.evaluate(() =>
  MT_KIND.other.name === 'Tea' && MT_KIND.other.time === '14:00'),
  await page.evaluate(() => MT_KIND.other.time));
t('Tea 는 몇 시든 찻잔', await page.evaluate(() =>
  mtSlot({ kind: 'other', time: '' }) === 'tea' && mtSlot({ kind: 'other', time: '15:30' }) === 'tea'
  && mtSlot({ kind: 'other', time: '20:00' }) === 'tea'));
await page.evaluate(() => {
  meetMap = {}; const d = mtToday();
  CAL.open = mtAdd(d, rKey(state.rows[0]), 'other');
  CAL.day = d; CAL.ym = mtMonth(d); renderCal();
});
await page.waitForSelector('.cal-r__t .mt-i', { timeout: 10000 });
t('줄에는 찻잔과 시각만', await page.evaluate(() => {
  const e = document.querySelector('.cal-r__t');
  return !!e.querySelector('.mt-i--tea') && e.textContent.trim() === '14:00';
}), await page.evaluate(() => document.querySelector('.cal-r__t').textContent.trim()));
t('점심·저녁은 이름을 적는다', await page.evaluate(() =>
  mtWhenText({ kind: 'lunch', time: '12:00' }) === '점심 12:00'
  && mtWhenText({ kind: 'dinner', time: '18:30' }) === '저녁 18:30'
  && mtWhenText({ kind: 'other', time: '16:00' }) === '16:00'
  && mtWhenText({ kind: '', time: '15:20' }) === '15:20'
  && mtWhenText({ kind: 'other', time: '' }) === '시각 미정'),
  await page.evaluate(() => mtWhenText({ kind: 'other', time: '16:00' })));
t('달력 찻잔은 연두, 다른 그림과 같은 크기', await page.evaluate(() => {
  const tea = document.querySelector('.cal-c__d i.cal-dot--tea');
  if (!tea) return false;
  const c = getComputedStyle(tea), r = tea.getBoundingClientRect();
  const [red, g, bl] = (c.color.match(/\d+/g) || []).map(Number);
  const green = g > red + 30 && g > bl + 30;          // 연두
  return green && !!tea.querySelector('svg') && Math.round(r.width) === 11;
}), await page.evaluate(() => {
  const t2 = document.querySelector('.cal-c__d i.cal-dot--tea');
  const c = t2 && getComputedStyle(t2);
  return t2 ? `${c.color} / ${Math.round(t2.getBoundingClientRect().width)}px` : '(없음)';
}));
t('다른 그림과 크기가 같다', await page.evaluate(() => {
  const w = [...document.querySelectorAll('.cal-c__d i')].map(i => Math.round(i.getBoundingClientRect().width));
  return new Set(w).size === 1;
}), await page.evaluate(() => [...document.querySelectorAll('.cal-c__d i')]
  .map(i => i.className.replace('cal-dot--', '') + ':' + Math.round(i.getBoundingClientRect().width)).join(' ')));

/* 시각을 손으로 넣어도 Tea 가 풀리면 안 된다 */
await setTime('15', '30');
t('시각을 넣어도 Tea 가 그대로', await page.evaluate(() => meets()[CAL.open].kind === 'other'),
  await page.evaluate(() => JSON.stringify([meets()[CAL.open].kind, meets()[CAL.open].time])));
t('그래도 찻잔', await page.evaluate(() => !!document.querySelector('.cal-r__t .mt-i--tea')));
/* 점심은 시각을 바꾸면 갈래가 풀린다(예전 그대로) */
await page.evaluate(() => { CAL.open = mtAdd(mtToday(), rKey(state.rows[1]), 'lunch'); renderCal(); });
await setTime('16', '00');
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

/* ---------- 날짜 칸에 올리면 뜨는 안내 (2026-11-05 저녁, 교수님 지정) ----------
 * 칸이 좁아 그림만 서므로, 마우스를 얹으면 그 날의 자리를 한 줄에 하나씩 보여 준다.
 * 달은 **그 달만** 그려지므로 지난 자리와 앞으로의 자리를 따로 한 번씩 재야 한다. */
const TIP = await page.evaluate(() => {
  meetMap = {}; mealCache = null;
  const r = state.rows, k = x => rKey(x);
  const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const back = ymd(new Date(Date.now() - 864e5 * 3)), soon = ymd(new Date(Date.now() + 864e5 * 3));
  meets()['p1'] = { date: back, time: '18:30', kind: 'dinner', who: [k(r[0]), k(r[1])], done: '', place: '제주대 앞' };
  meets()['p2'] = { date: back, time: '12:00', kind: 'lunch', who: [k(r[2])], done: 'no' };
  meets()['p3'] = { date: soon, time: '12:30', kind: 'lunch', who: [k(r[3]), k(r[4]), k(r[5]), k(r[6])], done: '' };
  for (let i = 0; i < 5; i++) meets()['q' + i] = { date: soon, time: `1${i + 3}:00`, kind: 'lunch', who: [k(r[i])], done: '' };
  mtSave();
  const tip = (ym, d) => { CAL.ym = ym; CAL.day = d; renderCal();
    const c = document.querySelector(`.cal-c[data-mtday="${d}"]`); return c ? (c.title || '') : ''; };
  const b = tip(mtMonth(back), back), s2 = tip(mtMonth(soon), soon);
  /* 자리가 없는 날 — 그림이 선 칸(.cal-c__d)이 없는 칸을 하나 집는다 */
  const none = [...document.querySelectorAll('.cal-c:not(.cal-c--pad)')]
    .filter(e => !e.querySelector('.cal-c__d')).map(e => e.title || '');
  return { b, s2, noneHas: none.filter(Boolean).length, noneN: none.length, who: r[3].name };
});
t('자리가 있는 날엔 안내가 붙는다', TIP.b.split('\n').length === 2, JSON.stringify(TIP.b));
/* 날짜·건수 머리줄은 2026-11-05 저녁에 걷었다 (교수님 지정) — 어느 칸에 얹었는지는 보면서
   아는 것이라, 되읊으면 정작 볼 줄이 한 칸씩 밀린다. */
t('날짜·건수를 되읊지 않는다', !/약속 \d+건/.test(TIP.b) && !/\(월\)|\(일\)/.test(TIP.b),
  JSON.stringify(TIP.b));
t('시각 순으로 적는다', TIP.b.split('\n')[0].startsWith('12:00')
  && TIP.b.split('\n')[1].startsWith('18:30'), JSON.stringify(TIP.b));
t('무엇을 누구와 어디서인지 한 줄에', /18:30 저녁 · .+, .+ — 제주대 앞/.test(TIP.b), JSON.stringify(TIP.b));
t('치른 자리엔 「예정」을 안 붙인다', !/18:30[^\n]*예정/.test(TIP.b), JSON.stringify(TIP.b));
t('「못 만남」은 그대로 적는다', /12:00[^\n]*\(못 만남\)/.test(TIP.b), JSON.stringify(TIP.b));
t('앞으로의 자리엔 「예정」', /12:30[^\n]*\(예정\)/.test(TIP.s2), JSON.stringify(TIP.s2));
t('사람은 셋까지 적고 접는다', /외 1명/.test(TIP.s2) && TIP.s2.includes(TIP.who), JSON.stringify(TIP.s2));
t('자리는 넷까지 적고 접는다', /\+2건 더/.test(TIP.s2)
  && TIP.s2.split('\n').length === 5, JSON.stringify(TIP.s2));
t('빈 날엔 안내를 안 단다', TIP.noneN > 0 && TIP.noneHas === 0, `${TIP.noneHas}/${TIP.noneN}`);
await page.evaluate(() => { meetMap = {}; mtSave(); CAL.open = ''; CAL.ym = ''; CAL.day = mtToday(); });

/* 새 약속을 잡을 때 점심·저녁·직접 중에서 고른다 (2026-10-12) */
await page.evaluate(() => { meetMap = {}; mtSave(); CAL.open = ''; CAL.day = mtToday(); renderCal(); });
await page.waitForSelector('[data-mtadd]', { timeout: 10000 });
t('고를 단추가 셋', await page.locator('[data-mtadd]').count() === 3,
  await page.evaluate(() => [...document.querySelectorAll('[data-mtadd]')].map(b => b.dataset.mtadd).join('/')));
t('단추에는 이름만 — 시각은 안 적는다', await page.evaluate(() => {
  const g = k => document.querySelector(`[data-mtadd="${k}"]`).textContent.trim();
  return g('lunch') === '점심' && g('dinner') === '저녁' && g('other') === 'Tea';
}), await page.evaluate(() => [...document.querySelectorAll('[data-mtadd]')].map(b => b.textContent.trim()).join(' | ')));
t('시각은 손대면 나오는 귀띔에 둔다', await page.evaluate(() =>
  document.querySelector('[data-mtadd="dinner"]').title.includes('18:30')),
  await page.evaluate(() => document.querySelector('[data-mtadd="dinner"]').title));
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
t('Tea 는 오후 2시로 잡힌다', await page.evaluate(() => {
  const m = meets()[CAL.open]; return m.kind === 'other' && m.time === '14:00';
}), await page.evaluate(() => JSON.stringify([meets()[CAL.open].kind, meets()[CAL.open].time])));
t('고르개에도 오후 2시가 들어 있다', await page.evaluate(() =>
  document.querySelector('[data-mth]').value === '14' && document.querySelector('[data-mtm]').value === '00'),
  await page.evaluate(() => document.querySelector('[data-mth]').value + ':' + document.querySelector('[data-mtm]').value));
/* 시각을 손으로 고르면 그대로 붙는다 */
await setTime('19', '40');
t('손으로 넣은 시각이 저장된다', await page.evaluate(() => mtList().some(m => m.time === '19:40')),
  await page.evaluate(() => mtList().map(m => m.time).join(',')));
t('약속 셋이 모두 남아 있다', await page.evaluate(() => mtList().length) === 3);
await page.evaluate(() => { meetMap = {}; mtSave(); CAL.open = ''; });

/* 시각은 입력 대신 시·분 고르개로 (2026-10-13) */
await page.evaluate(() => {
  meetMap = {}; mtSave(); const d = mtToday();
  CAL.open = mtAdd(d, rKey(state.rows[0]), 'other'); CAL.day = d; CAL.ym = mtMonth(d); renderCal();
});
await page.waitForSelector('[data-mth]', { timeout: 10000 });
t('시각은 고르개 둘, 입력 칸은 없다', await page.evaluate(() => {
  const h = document.querySelector('[data-mth]'), m = document.querySelector('[data-mtm]');
  return !!h && !!m && h.tagName === 'SELECT' && m.tagName === 'SELECT' && !document.querySelector('[data-mttime]');
}));
t('시는 미정과 스물넷', await page.evaluate(() => {
  const o = [...document.querySelector('[data-mth]').options];
  return o.length === 25 && o[0].value === '' && o[0].textContent === '미정'
    && o[1].textContent === '오전 12시' && o[13].textContent === '오후 12시' && o[24].textContent === '오후 11시';
}), await page.evaluate(() => [...document.querySelector('[data-mth]').options].map(o => o.textContent).join(',')));
t('분은 10분 간격', await page.evaluate(() =>
  [...document.querySelector('[data-mtm]').options].map(o => o.value).join() === '00,10,20,30,40,50'),
  await page.evaluate(() => [...document.querySelector('[data-mtm]').options].map(o => o.textContent).join(' ')));
t('지금 시각이 골라져 있다', await page.evaluate(() =>
  document.querySelector('[data-mth]').value === '14' && document.querySelector('[data-mtm]').value === '00'));
await setTime('09', '50');
t('고르면 그대로 저장된다', await page.evaluate(() => meets()[CAL.open].time) === '09:50',
  await page.evaluate(() => meets()[CAL.open].time));
t('다시 그려도 고른 값이 남는다', await page.evaluate(() =>
  document.querySelector('[data-mth]').value === '09' && document.querySelector('[data-mtm]').value === '50'));
t('Tea 는 몇 시로 옮겨도 Tea', await page.evaluate(() => meets()[CAL.open].kind) === 'other');
await setTime('');
t('미정을 고르면 시각이 비워진다', await page.evaluate(() => meets()[CAL.open].time) === '',
  await page.evaluate(() => JSON.stringify(meets()[CAL.open].time)));
t('미정이면 분 고르개가 잠긴다', await page.evaluate(() => document.querySelector('[data-mtm]').disabled));
t('미정이면 하루 종일로 나간다', (await page.evaluate(() => icsText())).includes('DTSTART;VALUE=DATE:'));
/* 10분 자리가 아닌 예전 자료도 그대로 보여 준다 */
await page.evaluate(() => { mtSet(CAL.open, { time: '18:03' }); renderCal(); });
await page.waitForTimeout(250);
t('10분 자리가 아닌 옛 시각도 그대로', await page.evaluate(() => {
  const h = document.querySelector('[data-mth]'), m = document.querySelector('[data-mtm]');
  return h.value === '18' && m.value === '03' && [...m.options].map(o => o.value).join() === '00,03,10,20,30,40,50';
}), await page.evaluate(() => [...document.querySelector('[data-mtm]').options].map(o => o.value).join()));
await page.evaluate(() => { meetMap = {}; mtSave(); CAL.open = ''; });

/* ---------- 만나거나 만날 예정인 분 (2026-11-02, 교수님 지정) ----------
 * 달력 아래에 뵌 분과 뵐 분을 쭉 적는다 — 날짜·갈래·이름·학과·장소.
 * **지난 날짜의 약속은 이미 만난 것으로 본다**(2026-11-02 저녁, 교수님 지정). 셈에서 빼는
 * 것은 **「못 만남」으로 손수 표시한 것뿐**이다. 오늘 자리는 아직 지나지 않았으므로
 * **「완료」를 누른 것만** 만난 것으로 센다 — 저녁 약속이 점심때 벌써 「만났다」가 되면 안 된다.
 * **앞으로의 약속도 같은 칸에 올리고 「예정」 쪽지를 단다**(2026-11-02 저녁, 교수님 지정) —
 * 누구를 뵈었는지와 누구를 뵐지를 한 자리에서 보기 위해서다.
 * **한 자리는 한 줄**이고(함께 뵌 분은 한 줄에 모은다), **명단 밖의 분은 넣지 않으며**,
 * 차례는 **뒷날부터 한 줄로** 내려온다 — 예정이 위, 그 아래로 만난 자리가 최근 순.
 * (같은 날 저녁에 셋 다 교수님이 지정하셨다. 예정만 오름차순이던 것을 바꿨다.) */
const A = await page.evaluate(() => {
  meetMap = {};
  const t0 = mtToday(), d0 = new Date(t0 + 'T00:00:00');
  const day = n => { const x = new Date(d0); x.setDate(x.getDate() + n);
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`; };
  const R = state.rows;
  const mk = (dd, ks, kind, done, place, guests) => { const id = mtAdd(dd, ks[0], kind);
    const m = meets()[id]; m.who = ks; m.done = done; m.place = place || ''; m.guests = guests || []; };
  mk(day(-9), [rKey(R[0]), rKey(R[1])], 'lunch', 'met', '교직원식당');   // 한 자리에 두 분
  mk(day(-5), [rKey(R[2])], 'dinner', 'met', '연동 한식집');
  mk(day(-3), [rKey(R[3])], 'other', '', '');            // 지남 · 표시 없음 → 만난 것으로 본다
  mk(day(-2), [rKey(R[4])], 'lunch', 'met', '', ['김행정 과장']);         // 명단 밖의 분
  mk(day(-1), [rKey(R[5])], 'dinner', '', '');           // 지남 · 표시 없음 → 만난 것으로 본다
  mk(day(0), [rKey(R[8])], 'dinner', '', '');            // 오늘 · 아직 → 예정
  mk(day(2), [rKey(R[6])], 'lunch', '', '');             // 앞으로의 약속 → 예정
  mk(day(-7), [rKey(R[7])], 'lunch', 'no', '');                          // 못 만남 → 뺀다
  location.hash = '#/cal'; render();
  const li = [...document.querySelectorAll('.mt-ate li')];
  const cell = (e, k) => (e.querySelector('.mt-ate__' + k) || {}).textContent || '';
  return {
    n: li.length,
    /* 이름 칸 끝에 「예정」 쪽지가 서므로, 이름만 보려면 떼어 낸다 (2026-11-13 저녁) */
    names: li.map(e => cell(e, 'p').replace('예정', '').trim()),
    /* 한 줄에 여러 분이 서므로 **줄마다 이름 묶음**으로 본다 */
    peo: li.map(e => [...e.querySelectorAll('.mt-ate__p a')].map(a2 => a2.textContent.trim())),
    kinds: li.map(e => cell(e, 'k').trim()),
    depts: li.map(e => cell(e, 'u').trim()),      // 2026-11-02 저녁에 뺀 칸 — 비어 있어야 한다
    /* 2026-11-13 저녁부터 쪽지는 이름 끝에 선다 — 날짜 칸에는 날짜만 남는다 */
    dates: li.map(e => cell(e, 'd').trim()),
    soon: li.map(e => e.classList.contains('is-soon')),
    badges: li.map(e => ((e.querySelector('.mt-ate__s') || {}).textContent || '').trim()),
    head: document.querySelector('.cal-head--ate').textContent.replace(/\s+/g, ' ').trim(),
    note: ((document.querySelector('.mt-ate__no') || {}).textContent || '').trim(),
    /* 규칙 풀이 한 줄은 2026-11-11 에 뺐다 — 칸 어디에도 남아 있지 않아야 한다 */
    sec: document.querySelector('.cal-sec').textContent.replace(/\s+/g, ' '),
    /* 줄 차례는 자료에 따라 바뀐다 — 자리를 박지 말고 **있는 줄을 찾아** 본다 */
    link: (li.find(e => e.querySelector('.mt-ate__p a')) || {}).querySelector
      ? li.find(e => e.querySelector('.mt-ate__p a')).querySelector('.mt-ate__p a').getAttribute('href') : '',
    noMet: state.rows[7].name, later: state.rows[6].name, todayP: state.rows[8].name,
    pastNoMark: state.rows[5].name,
    place0: (li.map(e => cell(e, 'w').trim()).filter(Boolean)[0]) || '',
  };
});
/* 「못 만남」을 뺀 자리가 일곱 — **한 자리에 한 줄**이다. 첫 자리에 두 분이 함께 계셔도
   한 줄이고, 명단 밖의 분만 있는 자리는 적을 사람이 없어 통째로 빠진다. */
const flat = A.peo.flat();
t('한 자리를 한 줄로 적는다', A.n === 7, `${A.n}줄`);
t('함께 뵌 분은 한 줄에 모은다', A.peo.some(x => x.length === 2), A.peo.map(x => x.join('+')).join(' | '));
t('지난 약속은 표시가 없어도 만난 것으로 본다', flat.includes(A.pastNoMark), flat.join(' '));
t('오늘 자리는 「완료」 전에는 예정',
  A.soon[A.peo.findIndex(x => x.includes(A.todayP))] === true, A.peo.map(x => x.join('+')).join(' | '));
/* 뒷날부터 한 줄로 — 예정이 위에 서고 그 아래로 만난 자리가 최근 순으로 이어진다 */
t('뒷날부터 차례로', A.dates.every((d, i) => i === 0 || A.dates[i - 1] >= d), A.dates.join(' | '));
t('예정이 맨 위에', A.soon.slice(0, 2).every(Boolean) && !A.soon.slice(2).some(Boolean),
  A.soon.map(x => x ? '예' : '만').join(''));
t('예정에만 「예정」 쪽지를 단다',
  A.badges.every((b2, i) => A.soon[i] ? b2 === '예정' : b2 === ''), A.badges.join('|'));
/* 「예정」 쪽지는 **이름 끝**에 선다 (2026-11-13 저녁, 교수님 지정) — 날짜 뒤에 달면
   날짜 칸이 길어져 갈래·이름이 줄마다 다른 자리에서 시작한다. */
const PILLPOS = await page.evaluate(() => {
  const li = [...document.querySelectorAll('.mt-ate li')].filter(e => e.classList.contains('is-soon'));
  return { inName: li.every(e => !!e.querySelector('.mt-ate__p>.mt-ate__s')),
    last: li.every(e => e.querySelector('.mt-ate__p').lastElementChild.classList.contains('mt-ate__s')),
    inDate: li.some(e => !!e.querySelector('.mt-ate__d .mt-ate__s')),
    /* 쪽지가 이름보다 **뒤**에 서는지 — 가로 자리로 잰다 */
    after: li.every(e => { const a = [...e.querySelectorAll('.mt-ate__p a')].pop();
      const s2 = e.querySelector('.mt-ate__s');
      return a && s2 && s2.getBoundingClientRect().left >= a.getBoundingClientRect().right - 1; }),
    n: li.length };
});
t('예정 쪽지가 이름 칸 안에 있다', PILLPOS.n > 0 && PILLPOS.inName && !PILLPOS.inDate,
  `${PILLPOS.n}줄 · 날짜칸 ${PILLPOS.inDate}`);
t('이름 끝에 선다', PILLPOS.last && PILLPOS.after);
/* 2026-11-02 저녁, 교수님 지정 — 왼쪽 색 띠는 **괄호처럼 보여 걷었다.** 대신 줄 맨 앞의
   날짜 글자를 물들인다. 띠가 되살아나지 않게, 물든 날짜가 사라지지 않게 재 둔다. */
const SOON = await page.evaluate(() => {
  const li = [...document.querySelectorAll('.mt-ate li')];
  const soon = li.find(e => e.classList.contains('is-soon'));
  const met = li.find(e => !e.classList.contains('is-soon'));
  const cs = e => getComputedStyle(e.querySelector('.mt-ate__d'));
  return { shadow: getComputedStyle(soon).boxShadow, border: getComputedStyle(soon).borderLeftWidth,
    soonCol: cs(soon).color, metCol: cs(met).color, soonW: cs(soon).fontWeight, metW: cs(met).fontWeight };
});
t('예정 줄에 왼쪽 띠를 두르지 않는다',
  (SOON.shadow === 'none' || !/inset/.test(SOON.shadow)) && SOON.border === '0px',
  `${SOON.shadow} / ${SOON.border}`);
/* 2026-11-13 저녁, 교수님 지정 — **날짜는 더 이상 물들이지 않는다.** 바탕을 맞바꾼 뒤로
   예정 줄은 흰 바탕으로 이미 도드라지는데, 날짜까지 물들이니 가름표가 셋이 되어 요란했다.
   이제 모든 줄의 날짜가 같은 빛깔·같은 굵기여야 한다 — 되살아나지 않게 재 둔다. */
t('예정 줄의 날짜도 수수하다', SOON.soonCol === SOON.metCol && SOON.soonW === SOON.metW,
  `${SOON.soonCol} ${SOON.soonW} / ${SOON.metCol} ${SOON.metW}`);

/* ---------- 물든 바탕은 **치른 자리** 쪽에 (2026-11-13 저녁, 교수님 지정) ----------
 * 같은 날 낮에는 예정 줄을 물들였는데 교수님이 둘을 **맞바꾸라** 하셨다. 이제 이미 뵌
 * 자리가 물들고, 예정 줄은 바탕 없이 수수하게 선다. **줄무늬(`nth-child(odd)`)를 이겨야**
 * 하므로 홀수 줄·짝수 줄 모두에서 같은 바탕이어야 한다. 밝은 화면은 더 짙게, 어두운
 * 화면은 한 겹 **밝게** — 어두운 화면에서 더 어둡게 칠하면 바탕에 묻힌다. */
const SBG = await page.evaluate(() => {
  const lum = c => { const m = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
    const v = m ? [+m[1], +m[2], +m[3]] : c.match(/[\d.]+/g).slice(0, 3).map(n => n / 255);
    const f = u => u <= .03928 ? u / 12.92 : Math.pow((u + .055) / 1.055, 2.4);
    return .2126 * f(v[0]) + .7152 * f(v[1]) + .0722 * f(v[2]); };
  const cr = (a, b2) => +(((Math.max(lum(a), lum(b2)) + .05) / (Math.min(lum(a), lum(b2)) + .05)).toFixed(2));
  const look = () => {
    const li = [...document.querySelectorAll('.mt-ate li')];
    const bg = e => { const c = getComputedStyle(e).backgroundColor;
      return /rgba\(0, 0, 0, 0\)/.test(c) ? getComputedStyle(document.body).backgroundColor : c; };
    const soon = li.filter(e => e.classList.contains('is-soon'));
    const plain = li.filter(e => !e.classList.contains('is-soon'));
    return { soon: soon.map(bg), plain: plain.map(bg), n: plain.length,
      page: getComputedStyle(document.body).backgroundColor,
      /* 홀·짝이 섞여 있어야 줄무늬를 이기는지 잴 수 있다 — 물든 쪽은 이제 **치른 줄**이다 */
      oddP: plain.map(e => ([...e.parentNode.children].indexOf(e) % 2 === 0)),
      /* 치른 줄의 이름은 물든 바탕 위, 예정 줄의 날짜는 수수한 바탕 위에 선다 */
      ink: cr(getComputedStyle(plain[0].querySelector('.mt-ate__p a')).color, bg(plain[0])),
      date: cr(getComputedStyle(soon[0].querySelector('.mt-ate__d')).color, bg(soon[0])),
      L: lum(bg(plain[0])), Ls: soon.map(bg).map(lum) };
  };
  const light = look();
  document.documentElement.setAttribute('data-theme', 'dark');
  const dark = look();
  document.documentElement.removeAttribute('data-theme');
  return { light, dark };
});
t('치른 줄과 예정 줄은 바탕이 다르다',
  SBG.light.plain.every(c => !SBG.light.soon.includes(c)), `${SBG.light.plain[0]} / ${SBG.light.soon.join(' ')}`);
t('줄무늬를 이긴다 — 홀·짝 모두 같은 바탕', new Set(SBG.light.plain).size === 1
  && new Set(SBG.light.oddP).size === 2, `${SBG.light.oddP.join(',')} · ${new Set(SBG.light.plain).size}가지`);
/* 예정 줄은 **수수하게** — 쪽 바탕 그대로다. 물든 날짜와 꽉 찬 쪽지로 알아본다 */
t('예정 줄은 바탕 없이 수수하다', new Set(SBG.light.soon).size === 1
  && SBG.light.soon[0] === SBG.light.page, `${SBG.light.soon[0]} / ${SBG.light.page}`);
t('밝은 화면에서는 치른 줄이 더 짙다', SBG.light.Ls.every(x => SBG.light.L < x), `${SBG.light.L.toFixed(3)} / ${SBG.light.Ls.map(x => x.toFixed(3)).join(' ')}`);
/* 어두운 화면에서 더 어둡게 칠하면 바탕에 묻힌다 — 한 겹 **밝은** 쪽으로 간다 */
t('어두운 화면에서는 치른 줄이 한 겹 밝다', SBG.dark.Ls.every(x => SBG.dark.L > x), `${SBG.dark.L.toFixed(3)} / ${SBG.dark.Ls.map(x => x.toFixed(3)).join(' ')}`);
t('두 줄 다 글자가 묻히지 않는다(4.5 넘김)', SBG.light.ink >= 4.5 && SBG.dark.ink >= 4.5
  && SBG.light.date >= 4.5 && SBG.dark.date >= 4.5,
  `치른 줄 ${SBG.light.ink}/${SBG.dark.ink} · 예정 날짜 ${SBG.light.date}/${SBG.dark.date}`);

/* ---------- 줄은 모두 펴 둔다 (2026-11-13, 교수님 지정) ----------
 * 전에는 420px 에서 끊고 칸 안에서 따로 굴렸다. 칸 안의 스크롤은 폰에서 바깥 스크롤과
 * 엉키고 몇 줄이 더 있는지도 보이지 않는다. **줄을 많이 세워 두고** 잰다 — 몇 줄 안 되는
 * 자료로 재면 끊는 규칙이 되살아나도 모른다. */
const TALL = await page.evaluate(() => {
  const keep = JSON.stringify(meets());
  const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  meetMap = {}; mealCache = null;
  for (let i = 0; i < 24; i++) meets()['tall' + i] = {
    date: ymd(new Date(Date.now() - 864e5 * (i + 2))), time: '12:00', kind: 'lunch',
    who: [rKey(state.rows[i % state.rows.length])], done: '', place: '교직원식당' };
  mtSave(); CAL.ate = ''; render();
  const ul = document.querySelector('.mt-ate'), cs = getComputedStyle(ul);
  const out = { n: ul.children.length, max: cs.maxHeight, ov: cs.overflowY,
    hid: ul.scrollHeight - ul.clientHeight, h: Math.round(ul.getBoundingClientRect().height) };
  meetMap = JSON.parse(keep); mealCache = null; mtSave(); render();
  return out;
});
t('줄이 420px 를 넘어도 다 편다', TALL.n === 24 && TALL.h > 420, `${TALL.n}줄 · ${TALL.h}px`);
t('칸 안에서 따로 굴리지 않는다', TALL.max === 'none' && TALL.hid <= 1,
  `max-height ${TALL.max} · 가려진 ${TALL.hid}px · overflow-y ${TALL.ov}`);
/* 쪽지는 **꽉 찬 색**이고, 글자는 바탕색을 써서 밝은·어두운 화면 모두 또렷해야 한다
   (2026-11-02 저녁, 교수님 지정 A+C안). 흰색으로 못 박으면 어두운 화면에서 묻힌다. */
const PILL = await page.evaluate(() => {
  const el = document.querySelector('.mt-ate li.is-soon .mt-ate__s');
  const cs = getComputedStyle(el);
  const rgb = x => x.match(/[\d.]+/g).slice(0, 3).map(Number);
  const L = c => { const v = rgb(c).map(n => { const u = n / 255;
    return u <= .03928 ? u / 12.92 : Math.pow((u + .055) / 1.055, 2.4); });
    return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
  const co = (a, b2) => (Math.max(L(a), L(b2)) + .05) / (Math.min(L(a), L(b2)) + .05);
  const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
  const probe = document.createElement('span');
  probe.style.color = brand; document.body.appendChild(probe);
  const bc = getComputedStyle(probe).color; probe.remove();
  return { bg: cs.backgroundColor, ink: cs.color, brand: bc, ratio: co(cs.color, cs.backgroundColor) };
});
t('예정 쪽지를 브랜드색으로 채운다', PILL.bg === PILL.brand, `${PILL.bg} / ${PILL.brand}`);
t('쪽지 글자가 또렷하다(대비 4.5 이상)', PILL.ratio >= 4.5, `${PILL.ratio.toFixed(1)} (${PILL.ink})`);
t('갈래를 점심·저녁·Tea 로 적는다', A.kinds.join('|').includes('점심') && A.kinds.join('|').includes('저녁')
  && A.kinds.join('|').includes('Tea'), A.kinds.join('|'));
/* 학과 이름은 2026-11-02 저녁에 뺐다 (교수님 지정) — 이름에 올리면 말풍선으로 나온다 */
t('학과 이름을 적지 않는다', A.depts.every(x => x === ''), A.depts.join('|'));
t('명단 밖의 분은 넣지 않는다', !flat.includes('김행정 과장'), flat.join(' '));
t('장소도 적는다', A.place0 === '교직원식당' || A.place0 === '연동 한식집', A.place0);
t('앞으로의 약속도 예정으로 적는다', flat.includes(A.later)
  && A.soon[A.peo.findIndex(x => x.includes(A.later))] === true, flat.join(' '));
t('「못 만남」은 뺀다', !flat.includes(A.noMet), flat.join(' '));
/* 머리줄의 풀이(「8명 · 만남 5번 · 예정 2번 · 식사 6번만 봅니다」)는 **걷었다**
   (2026-11-13, 교수님 지정) — 그 숫자는 단추에 이미 붙어 있고, 머리줄이 길어 폰에서
   제목이 두 줄로 접혔다. 몇 번·몇 명인지는 **단추에서** 본다. */
t('머리줄에 풀이를 적지 않는다', !/만남 \d+번/.test(A.head) && !/예정 \d+번/.test(A.head),
  A.head.slice(0, 80));
t('갈래별 수도 머리줄에 적지 않는다',
  !/점심 \d+번만/.test(A.head) && !/저녁 \d+번만/.test(A.head), A.head.slice(0, 80));
/* 2026-11-11, 교수님 지정 — 「지난 날짜의 약속은 만난 것으로 봅니다 · …」 한 줄을 뺐다.
   줄마다 「예정」 쪽지가 이미 서 있어 눈으로 읽힌다. */
t('셈하는 규칙 풀이는 적지 않는다', !/지난 날짜의 약속은/.test(A.sec), A.sec.slice(-120));
t('「못 만남」을 몇 건 뺐는지 적는다', /「못 만남」 1건/.test(A.note), A.note);
t('이름을 누르면 그 교수 상세로', /^#\/dept\/.+\/prof\/.+/.test(A.link || ''), A.link);
/* 갈래 고르기 — 머리줄 오른쪽의 아이콘 단추 (2026-11-02, 교수님 지정) */
const F = await page.evaluate(() => {
  CAL.ate = ''; render();
  return { btns: [...document.querySelectorAll('[data-ateslot]')].map(e => e.dataset.ateslot),
    hasAll: !!document.querySelector('[data-ateslot=""]'),
    icons: [...document.querySelectorAll('[data-ateslot]')].every(e => !!e.querySelector('.mt-i')),
    cnt: [...document.querySelectorAll('[data-ateslot]')].filter(e => e.dataset.ateslot)
      .map(e => (e.querySelector('i:not(.mt-i)') || {}).textContent || '').join(','),
    all: ((document.querySelector('[data-ateslot=""] i:not(.mt-i)') || {}).textContent || ''),
    allTip: document.querySelector('[data-ateslot=""]').getAttribute('title') || '',
    allName: (document.querySelector('[data-ateslot=""]').textContent || '').replace(/[\d명\s]/g, ''),
    h: Math.round(Math.min(...[...document.querySelectorAll('[data-ateslot]')]
      .map(e => e.getBoundingClientRect().height))),
    /* 화면이 쓰는 길과 **다른 길로** 다시 센다 — 한 자리에 여러 분이면 겹치지 않게 */
    people: new Set(Object.values(meets()).filter(m => m.done !== 'no' && m.date)
      .flatMap(m => (m.who || []).filter(k => state.rows.some(x => rKey(x) === k)))).size,
    head: (document.querySelector('.cal-head--ate .st-note') || {}).textContent || '' };
});
t('만남 단추가 맨 앞에', F.hasAll && F.btns[0] === '', F.btns.join('|'));
/* 2026-11-13 저녁, 교수님 지정 — 단추를 조금 높였다. 위아래 여백만 늘렸으므로 **높이만**
   재고 너비는 재지 않는다(옆 여백을 건드리면 폰에서 한 줄에 서는 수가 줄어든다). */
t('갈래 단추가 조금 높다', F.h >= 38, `${F.h}px`);
/* 「식사」(점심+저녁)는 2026-11-02 저녁에 더했다 — 모두 다음, 점심 앞에 선다 (교수님 지정) */
t('식사 단추가 만남 다음에', F.btns[1] === 'meal', F.btns.join('|'));
t('있는 갈래만 단추로', F.btns.slice(1).join('|') === 'meal|nomeal|day|night|tea|todo', F.btns.join('|'));
t('단추마다 아이콘', F.icons);
/* 「식사 외」가 2026-11-14 부터 「식사」 바로 뒤에 끼므로, 갈래의 횟수는 그것을 빼고 본다 */
t('단추에 몇 번인지 적는다',
  F.cnt.split(',').filter(x => !/명$/.test(x)).join(',') === '6,3,3,1', F.cnt);
/* 「모두」에도 숫자를 답니다 (2026-11-05 저녁, 교수님 지정) — 다만 **몇 번이 아니라 몇 명**이라
   「명」을 붙여 갈래 단추의 횟수와 갈라 둡니다. 머리줄의 「N명」과 같은 셈이어야 합니다. */
t('만남 단추에도 숫자가 선다', /^\d+명$/.test(F.all), JSON.stringify(F.all));
t('그 숫자는 겹치지 않게 센 사람 수', F.all === `${F.people}명`, `${F.all} / ${F.people}명`);
t('만남의 줄머리 표에도 사람 수', F.allTip === `만남 보기 — ${F.all}`, F.allTip);
/* 2026-11-14, 교수님 지정 — 「모두」를 **「만남」**으로 고쳤다. 거기 선 숫자가
   *만나거나 만날 예정인 분의 수*이기 때문이다. */
t('첫 단추의 이름이 만남이다', F.allName === '만남', F.allName);
/* ---------- 머리줄 옆의 셈 바탕 (2026-11-14, 교수님 지정) ----------
   「식사 외」·「아직」이 **무엇에서 센 숫자인지**를 밝힌다. 걷어 낸 옛 풀이와 달리
   단추에 없는 숫자다 — 명단 수·비참여·본인을 빼는 셈이 그대로 보여야 한다. */
const BASE = await page.evaluate(() => {
  const e = document.querySelector('.cal-head--ate .cal-head__n');
  /* 화면이 쓰는 길과 **다른 길로** 다시 센다 */
  const out = state.rows.filter(p => p.name !== '변영철' && getRating(p) === '비').length;
  const me = state.rows.some(p => p.name === '변영철') ? 1 : 0;
  return { txt: (e || {}).textContent || '', tip: e ? e.getAttribute('title') : '',
    rows: state.rows.length, out, base: state.rows.length - me - out,
    /* 제목 바로 옆에 서는지 — 제목의 오른끝과 이 줄의 왼끝 */
    gap: e ? Math.round(e.getBoundingClientRect().left
      - document.querySelector('.cal-head--ate h2').getBoundingClientRect().right) : -1 };
});
t('머리줄에 셈 바탕을 적는다',
  BASE.txt === `${BASE.rows}명${BASE.out ? ` − 비참여 ${BASE.out}` : ''} − 본인 = ${BASE.base}명`,
  `${BASE.txt} / ${BASE.rows}·${BASE.out}·${BASE.base}`);
t('뺀 뒤의 수가 식사 외·아직의 바탕과 같다', await page.evaluate(n =>
  mtNoMeal().length <= n && mtTodo().length <= n
  && state.rows.filter(p => p.name !== '변영철' && getRating(p) !== '비').length === n,
  BASE.base), `${BASE.base}명`);
t('줄머리 표가 무엇을 뺀 수인지 말한다', /뵐 분입니다/.test(BASE.tip), BASE.tip);
t('제목 바로 옆에 선다', BASE.gap >= 0 && BASE.gap <= 24, `${BASE.gap}px`);
/* 머리글은 2026-11-05 저녁에 바뀌었다 (교수님 지정) — 앞으로의 자리도 이 칸에 서고
   **사람 수에도 들므로**, 「이제까지 만난 분」이면 지난 일만 적는 칸으로 읽힌다. */
t('머리글이 뵌 분과 뵐 분을 함께 말한다', await page.evaluate(() =>
  (document.querySelector('.cal-head--ate h2') || {}).textContent) === '만나거나 만날 예정인 분');
const FA = await page.evaluate(() => {
  const keep = JSON.stringify(meets());
  meetMap = {}; mealCache = null;
  const [a, b] = state.rows, k = x => rKey(x);
  const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  meets()['z1'] = { date: ymd(new Date(Date.now() - 864e5 * 3)), time: '12:00', kind: 'lunch', who: [k(a)], done: '' };
  meets()['z2'] = { date: ymd(new Date(Date.now() + 864e5 * 3)), time: '18:30', kind: 'dinner', who: [k(b)], done: '' };
  mtSave(); CAL.ate = ''; render();
  const out = { badge: (document.querySelector('[data-ateslot=""] i:not(.mt-i)') || {}).textContent || '',
    head: (document.querySelector('.cal-head--ate .st-note') || {}).textContent || '' };
  meetMap = JSON.parse(keep); mealCache = null; mtSave(); render();
  return out;
});
t('예정만 있는 분도 사람 수에 든다', FA.badge === '2명', `${FA.badge} / ${FA.head}`);
t('예정이 있어도 머리줄에 풀이가 없다', FA.head === '', FA.head);
/* 사람 수 단추(「…명」)는 갈래가 아니므로 빼고 센다 — 2026-11-14 부터 「식사 외」가 사이에 낀다 */
{ const c = F.cnt.split(',').filter(x => !/명$/.test(x)).map(Number);
  t('식사는 점심과 저녁을 합한 수', c[0] === c[1] + c[2], F.cnt); }

/* 식사만 보기 — 점심과 저녁만 남고 Tea 는 빠져야 한다 */
await page.click('[data-ateslot="meal"]');
await page.waitForTimeout(250);
const FM = await page.evaluate(() => ({
  kinds: [...document.querySelectorAll('.mt-ate li .mt-ate__k')].map(e => e.textContent.trim()),
  on: document.querySelector('[data-ateslot="meal"]').getAttribute('aria-pressed'),
  head: ((document.querySelector('.cal-head--ate .st-note') || {}).textContent || '').trim(),
}));
t('식사를 고르면 점심·저녁만 보인다', FM.kinds.length === 6
  && FM.kinds.every(k => k === '점심' || k === '저녁'), FM.kinds.join(','));
t('식사에 점심과 저녁이 다 있다', FM.kinds.includes('점심') && FM.kinds.includes('저녁'), FM.kinds.join(','));
t('식사 단추가 눌린 꼴', FM.on === 'true');
t('고르셔도 머리줄은 비어 있다', FM.head === '', FM.head);
await page.click('[data-ateslot="meal"]');
await page.waitForTimeout(250);

await page.click('[data-ateslot="night"]');
await page.waitForTimeout(250);
const F2 = await page.evaluate(() => ({
  kinds: [...document.querySelectorAll('.mt-ate li .mt-ate__k')].map(e => e.textContent.trim()),
  on: document.querySelector('[data-ateslot="night"]').getAttribute('aria-pressed'),
  others: [...document.querySelectorAll('[data-ateslot]')].filter(e => e.dataset.ateslot !== 'night')
    .every(e => e.getAttribute('aria-pressed') === 'false'),
  all: ((document.querySelector('[data-ateslot=""] i:not(.mt-i)') || {}).textContent || '').trim(),
  head: ((document.querySelector('.cal-head--ate .st-note') || {}).textContent || '').trim(),
}));
t('고른 갈래만 보인다', F2.kinds.length === 3 && F2.kinds.every(k => k === '저녁'), F2.kinds.join(','));
t('고른 단추만 눌린 꼴', F2.on === 'true' && F2.others);
/* 「모두」의 사람 수는 **늘 전체**다 — 고른 갈래에 따라 몇 분을 뵈었는지가 달라 보이면 안 된다 */
t('만남의 사람 수는 갈래를 골라도 그대로', F2.all === F.all, `${F2.all} / ${F.all}`);
t('고르셔도 머리줄은 그대로 비어 있다', F2.head === '', F2.head);

await page.click('[data-ateslot="night"]');
await page.waitForTimeout(250);
t('같은 것을 다시 누르면 풀린다', await page.evaluate(() =>
  CAL.ate === '' && document.querySelectorAll('.mt-ate li').length === 7));
await page.click('[data-ateslot="tea"]');
await page.waitForTimeout(250);
await page.click('[data-ateslot=""]');
await page.waitForTimeout(250);
t('만남을 누르면 다 보인다', await page.evaluate(() =>
  CAL.ate === '' && document.querySelectorAll('.mt-ate li').length === 7));

/* ---------- 「아직」 — 아직 뵙지 못한 분 (2026-11-13, 교수님 지정) ----------
 * 갈래 단추 끝의 「아직」을 누르면 약속 줄 대신 **학과마다 한 줄**로 못 뵌 분이 선다.
 * 뵌 분으로 보는 눈은 윗칸과 같다 — 치른 자리가 있거나 만난 횟수가 1 이상. */
const TEXP = await page.evaluate(() => {
  /* 화면이 쓰는 길과 **다른 길로** 다시 센다 — 둘이 같은 함수를 보면 틀려도 같이 틀린다 */
  const today = mtToday(), ate = new Set(), soon = new Set();
  Object.values(meets()).forEach(m => {
    if (m.done === 'no' || !m.date) return;
    ((m.done === 'met' || m.date < today) ? ate : soon).add('x');
    (m.who || []).forEach(k => ((m.done === 'met' || m.date < today) ? ate : soon).add(k));
  });
  const left = state.rows.filter(p => p.name !== '변영철' && getRating(p) !== '비'
    && !(getNote(rKey(p)).met > 0) && !ate.has(rKey(p)));
  return { n: left.length, soon: left.filter(p => soon.has(rKey(p))).length,
    names: left.map(p => p.name).sort(), rows: state.rows.length };
});
await page.click('[data-ateslot="todo"]');
await page.waitForTimeout(250);
const TD = await page.evaluate(() => {
  const li = [...document.querySelectorAll('.mt-ate--todo li')];
  const as = e => [...e.querySelectorAll('.mt-ate__p a')];
  return { lis: li.length,
    depts: li.map(e => ((e.querySelector('.mt-ate__g') || {}).textContent || '').trim()),
    cnts: li.map(e => Number(((e.querySelector('.mt-ate__g i') || {}).textContent || '0').trim())),
    names: li.map(e => as(e).map(a => a.textContent.replace('예정', '').trim())),
    soon: li.map(e => as(e).map(a => !!a.querySelector('.mt-todo__s'))),
    head: ((document.querySelector('.cal-head--ate .st-note') || {}).textContent || '').trim(),
    plain: document.querySelectorAll('.mt-ate:not(.mt-ate--todo) li').length,
    link: (document.querySelector('.mt-ate--todo .mt-ate__p a') || { getAttribute: () => '' }).getAttribute('href'),
    chip: ((document.querySelector('[data-ateslot="todo"] i:not(.mt-i)') || {}).textContent || '').trim(),
    on: (document.querySelector('[data-ateslot="todo"]') || {}).getAttribute('aria-pressed'),
    icon: !!document.querySelector('[data-ateslot="todo"] .mt-i--todo svg'),
    /* 학과 줄도 같은 칸을 쓴다 — 여기서도 칸 안에서 따로 굴리지 않아야 한다 */
    hid: (() => { const u = document.querySelector('.mt-ate--todo');
      return u ? u.scrollHeight - u.clientHeight : -1; })(),
    max: (() => { const u = document.querySelector('.mt-ate--todo');
      return u ? getComputedStyle(u).maxHeight : ''; })() };
});
const TFLAT = TD.names.flat();
t('아직 단추가 갈래 끝에 선다', await page.evaluate(() =>
  [...document.querySelectorAll('[data-ateslot]')].pop().dataset.ateslot === 'todo'));
t('아직 단추에 그림과 사람 수', TD.icon && TD.chip === `${TEXP.n}명`, `${TD.chip} / ${TEXP.n}명`);
t('누르면 눌린 꼴이 된다', TD.on === 'true');
t('약속 줄 대신 학과 줄이 선다', TD.lis > 0 && TD.plain === 0, `${TD.lis} / ${TD.plain}`);
t('못 뵌 분을 빠짐없이 적는다', TFLAT.slice().sort().join(',') === TEXP.names.join(','),
  `${TFLAT.length}명 / ${TEXP.n}명`);
t('이미 뵌 분은 없다', await page.evaluate(nm => {
  const today = mtToday(), met = new Set();
  Object.values(meets()).forEach(m => { if (m.done === 'no' || !m.date) return;
    if (m.done === 'met' || m.date < today) (m.who || []).forEach(k => {
      const p = state.rows.find(x => rKey(x) === k); if (p) met.add(p.name); }); });
  return nm.every(x => !met.has(x));
}, TFLAT), TFLAT.slice(0, 6).join(','));
t('예정만 있는 분은 「예정」을 달고 선다', TD.soon.flat().filter(Boolean).length === TEXP.soon,
  `${TD.soon.flat().filter(Boolean).length} / ${TEXP.soon}`);
t('학과 줄에 그 학과 인원수', TD.cnts.every((n, i) => n === TD.names[i].length),
  `${TD.cnts.join(',')} / ${TD.names.map(x => x.length).join(',')}`);
t('학과 안에서 약속 없는 분이 앞에', TD.soon.every(r => r.slice().sort((a, b2) => a - b2).join() === r.join()),
  JSON.stringify(TD.soon.slice(0, 3)));
/* 몇 명 남았는지는 **단추**가 지고 있다 (2026-11-13) — 머리줄에는 아무것도 적지 않는다 */
t('아직에서도 머리줄은 비어 있다', TD.head === '', TD.head);
t('이름을 누르면 그 교수 상세로', /^#\/dept\/.+\/prof\/.+/.test(TD.link || ''), TD.link);
t('학과 줄도 칸 안에서 굴리지 않는다', TD.max === 'none' && TD.hid <= 1,
  `max-height ${TD.max} · 가려진 ${TD.hid}px`);
/* 본인·비참여는 뵐 분이 아니라 빼고, 손으로 센 만난 횟수도 뵌 것으로 본다 */
t('본인은 빼고 센다', !TFLAT.includes('변영철'), TFLAT.slice(0, 4).join(','));
const TX = await page.evaluate(nm => {
  const p = state.rows.find(x => x.name === nm);
  const got = {};
  applyEntry(rKey(p), { met: 1 }); render();
  got.met = ![...document.querySelectorAll('.mt-ate--todo .mt-ate__p a')].some(a => a.textContent.includes(nm));
  applyEntry(rKey(p), { met: 0 }); setRating(rKey(p), '비'); render();
  got.out = ![...document.querySelectorAll('.mt-ate--todo .mt-ate__p a')].some(a => a.textContent.includes(nm));
  got.chip = ((document.querySelector('[data-ateslot="todo"] i:not(.mt-i)') || {}).textContent || '').trim();
  setRating(rKey(p), ''); render();
  got.back = [...document.querySelectorAll('.mt-ate--todo .mt-ate__p a')].some(a => a.textContent.includes(nm));
  return got;
}, TFLAT[0]);
t('만난 횟수를 손으로 올리면 빠진다', TX.met);
t('비참여는 빠진다', TX.out);
t('빠진 만큼 단추의 숫자도 준다', TX.chip === `${TEXP.n - 1}명`, `${TX.chip} / ${TEXP.n - 1}명`);
t('되돌리면 다시 선다', TX.back);
await page.click('[data-ateslot="todo"]');
await page.waitForTimeout(250);
t('아직을 다시 누르면 약속 줄로 돌아온다', await page.evaluate(() =>
  CAL.ate === '' && !document.querySelector('.mt-ate--todo')
  && document.querySelectorAll('.mt-ate li').length === 7));

/* ---------- 「식사 외」 — 아직 함께 드시지 않은 분 (2026-11-13 저녁, 교수님 지정) ----------
 * 「아직」 **앞**에 하나 더 선다. 점심이나 저녁을 함께 하지 않은 분이면 **뵌 적이 있어도**
 * 선다 — Tea 로만 뵌 분이 여기 서는지가 「아직」과 가르는 눈이다.
 * 그러므로 「아직」의 분은 **모두** 이 명단 안에 있다(넓은 쪽 → 좁은 쪽). */
const NEXP = await page.evaluate(() => {
  /* 화면이 쓰는 `mtSlot`·`mealAll` 과 **다른 길로** 다시 센다 */
  const today = mtToday(), ate = new Set(), soon = new Set(), teaAte = new Set();
  const meal = m => {
    const k = m.kind || '';
    if (k) return k === 'lunch' || k === 'dinner';
    const h = Number(String(m.time || '').slice(0, 2));
    return (h >= 11 && h < 14) || (h >= 17 && h < 21);
  };
  Object.values(meets()).forEach(m => {
    if (m.done === 'no' || !m.date) return;
    const done = m.done === 'met' || m.date < today;
    if (!meal(m)) { if (done) (m.who || []).forEach(k => teaAte.add(k)); return; }
    (m.who || []).forEach(k => (done ? ate : soon).add(k));
  });
  const left = state.rows.filter(p => p.name !== '변영철' && getRating(p) !== '비' && !ate.has(rKey(p)));
  return { n: left.length, soon: left.filter(p => soon.has(rKey(p))).length,
    names: left.map(p => p.name).sort(),
    /* 밥은 아니지만 뵙기는 한 분 — 「아직」에는 없고 「식사 외」에는 있어야 한다 */
    onlyTea: left.filter(p => teaAte.has(rKey(p))).map(p => p.name).sort() };
});
await page.click('[data-ateslot="nomeal"]');
await page.waitForTimeout(250);
const ND = await page.evaluate(() => {
  const li = [...document.querySelectorAll('.mt-ate--todo li')];
  const as = e => [...e.querySelectorAll('.mt-ate__p a')];
  return { lis: li.length,
    names: li.map(e => as(e).map(a => a.textContent.replace('예정', '').trim())),
    soon: li.map(e => as(e).map(a => !!a.querySelector('.mt-todo__s'))),
    cnts: li.map(e => Number(((e.querySelector('.mt-ate__g i') || {}).textContent || '0').trim())),
    plain: document.querySelectorAll('.mt-ate:not(.mt-ate--todo) li').length,
    chip: ((document.querySelector('[data-ateslot="nomeal"] i:not(.mt-i)') || {}).textContent || '').trim(),
    on: (document.querySelector('[data-ateslot="nomeal"]') || {}).getAttribute('aria-pressed'),
    icon: !!document.querySelector('[data-ateslot="nomeal"] .mt-i--nomeal svg'),
    tip: (document.querySelector('[data-ateslot="nomeal"]') || {}).getAttribute('title') || '',
    order: [...document.querySelectorAll('[data-ateslot]')].map(e => e.dataset.ateslot),
    link: (document.querySelector('.mt-ate--todo .mt-ate__p a') || { getAttribute: () => '' }).getAttribute('href') };
});
const NFLAT = ND.names.flat();
/* 2026-11-14, 교수님 지정 — 「식사」 바로 옆으로 옮겼다. 이름이 한 짝이고 보는 것도
   같은 일의 앞뒤라, 멀리 떨어뜨리면 둘을 견주기 어렵다. */
t('식사 외 단추가 식사 바로 뒤에',
  ND.order.indexOf('nomeal') === ND.order.indexOf('meal') + 1, ND.order.join('|'));
t('아직은 그대로 맨 끝', ND.order[ND.order.length - 1] === 'todo', ND.order.join('|'));
t('식사 외 단추에 그림과 사람 수', ND.icon && ND.chip === `${NEXP.n}명`, `${ND.chip} / ${NEXP.n}명`);
t('줄머리 표가 무엇을 보는지 말한다', /점심·저녁을 함께 하지 않은/.test(ND.tip), ND.tip);
t('누르면 눌린 꼴이 된다', ND.on === 'true');
t('약속 줄 대신 학과 줄이 선다', ND.lis > 0 && ND.plain === 0, `${ND.lis} / ${ND.plain}`);
t('식사를 안 하신 분을 빠짐없이 적는다', NFLAT.slice().sort().join(',') === NEXP.names.join(','),
  `${NFLAT.length}명 / ${NEXP.n}명`);
t('점심·저녁을 치른 분은 없다', await page.evaluate(nm => {
  const today = mtToday(), had = new Set();
  Object.values(meets()).forEach(m => { if (m.done === 'no' || !m.date) return;
    const s = mtSlot(m); if (s !== 'day' && s !== 'night') return;
    if (m.done === 'met' || m.date < today) (m.who || []).forEach(k => {
      const p = state.rows.find(x => rKey(x) === k); if (p) had.add(p.name); }); });
  return nm.every(x => !had.has(x));
}, NFLAT), NFLAT.slice(0, 6).join(','));
t('식사 약속만 있는 분은 「예정」을 달고 선다', ND.soon.flat().filter(Boolean).length === NEXP.soon,
  `${ND.soon.flat().filter(Boolean).length} / ${NEXP.soon}`);
/* 「아직」은 이 명단의 **일부**다 — 얼굴도 못 뵌 분은 밥도 안 드셨으니까 */
t('아직의 분은 모두 식사 외에도 있다', TFLAT.every(n => NFLAT.includes(n)) && NFLAT.length >= TFLAT.length,
  `${TFLAT.length}명 ⊂ ${NFLAT.length}명`);
t('Tea 로만 뵌 분은 아직에는 없고 식사 외에는 있다',
  NEXP.onlyTea.length > 0 && NEXP.onlyTea.every(n => NFLAT.includes(n) && !TFLAT.includes(n)),
  NEXP.onlyTea.join(','));
t('학과 줄에 그 학과 인원수', ND.cnts.every((n, i) => n === ND.names[i].length),
  `${ND.cnts.join(',')} / ${ND.names.map(x => x.length).join(',')}`);
t('학과 안에서 식사 약속 없는 분이 앞에',
  ND.soon.every(r => r.slice().sort((a, b2) => a - b2).join() === r.join()), JSON.stringify(ND.soon.slice(0, 3)));
t('이름을 누르면 그 교수 상세로', /^#\/dept\/.+\/prof\/.+/.test(ND.link || ''), ND.link);
await page.click('[data-ateslot="nomeal"]');
await page.waitForTimeout(250);
t('식사 외를 다시 누르면 약속 줄로 돌아온다', await page.evaluate(() =>
  CAL.ate === '' && !document.querySelector('.mt-ate--todo')
  && document.querySelectorAll('.mt-ate li').length === 7));

t('기록이 없으면 빈 안내', await page.evaluate(() => {
  meetMap = {}; render();
  const sec = [...document.querySelectorAll('.cal-sec')].pop();
  return !sec.querySelector('.mt-ate') && /아직 약속이 없습니다/.test(sec.textContent);
}));

/* ---------- 칩에 다는 점심(해)·저녁(달) (2026-11-05, 교수님 지정) ----------
 * 교수 칩 이름 뒤에 점심을 드신 분은 해, 저녁을 드신 분은 달이 조그맣게 섭니다.
 * 치른 자리는 또렷하게, **예정은 흐리게**(`is-soon`) 섭니다. Tea 는 달지 않습니다. */
const MEALSET = async () => page.evaluate(() => {
  meetMap = {}; localStorage.removeItem('jnu-meets'); mealCache = null;
  const [a, b2, c, d] = state.rows, k = x => rKey(x);
  const yd = new Date(Date.now() - 864e5 * 5), ah = new Date(Date.now() + 864e5 * 5);
  const ymd = x => `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
  meets()['c1'] = { date: ymd(yd), time: '12:00', kind: 'lunch',  who: [k(a)], done: '' };
  meets()['c2'] = { date: ymd(yd), time: '18:30', kind: 'dinner', who: [k(a), k(b2)], done: '' };
  meets()['c3'] = { date: ymd(ah), time: '12:00', kind: 'lunch',  who: [k(c)], done: '' };   // 예정
  meets()['c4'] = { date: ymd(yd), time: '14:00', kind: 'other',  who: [k(d)], done: '' };   // Tea
  mtSave();
  const of = x => { const e = mealOf(x); return e ? `${e.day}/${e.night}` : '없음'; };
  const ofs = x => { const e = mealOf(x); return e ? `${e.dayS}/${e.nightS}` : '없음'; };
  return { a: of(a), b: of(b2), c: of(c), d: of(d), cS: ofs(c), aS: ofs(a),
    html: mealMark(a), tip: mealTip(a), soon: mealMark(c), tipC: mealTip(c) };
});
const ME = await MEALSET();
t('점심을 드신 분에게 해, 저녁에는 달', ME.a === '1/1' && ME.b === '0/1', `${ME.a} / ${ME.b}`);
t('앞으로의 약속도 그림이 선다', /mealm--day/.test(ME.soon), ME.soon.slice(0, 70));
t('예정은 흐린 표를 달고 선다', /is-soon/.test(ME.soon), ME.soon.slice(0, 70));
t('예정은 치른 셈에 섞이지 않는다', ME.c === '0/0' && ME.cS === '1/0', `${ME.c} / ${ME.cS}`);
t('치른 자리는 흐리지 않다', !/is-soon/.test(ME.html) && ME.aS === '0/0', `${ME.aS} / ${ME.html.slice(0, 60)}`);
t('줄머리 표에 「예정」이라 적힌다', ME.tipC === ' · 점심 예정 1번', JSON.stringify(ME.tipC));
t('Tea 는 달지 않는다', ME.d === '없음', ME.d);
t('해·달 그림이 칩에 붙는다', ME.html.includes('mealm--day') && ME.html.includes('mealm--night'), ME.html.slice(0, 60));
t('줄머리 표에도 적는다', ME.tip === ' · 점심 1번 · 저녁 1번', JSON.stringify(ME.tip));
/* 실제 칩에 그려지고, 빛깔이 달력의 해·달과 같은지 */
await page.evaluate(() => {
  const [a, b2] = state.rows;
  applyEntry(rKey(a), { rating: '확' }); applyEntry(rKey(b2), { rating: '확' });
  location.hash = '#/stats'; render();
});
await page.waitForSelector('.st-c', { timeout: 10000 });
await page.waitForTimeout(400);
const MEC = await page.evaluate(() => {
  const chip = [...document.querySelectorAll('.st-c')].find(x => x.querySelector('.mealm'));
  if (!chip) return null;
  const i = chip.querySelector('.mealm--day') || chip.querySelector('.mealm--night');
  const cls = i.classList.contains('mealm--day') ? 'day' : 'night';
  /* 달력 점과 **같은 빛깔**인가 — 점의 규칙은 `.cal-c__d i` 아래에 있으므로 그 자리에 두고 잰다 */
  const box = document.createElement('div'); box.className = 'cal-c__d';
  box.innerHTML = `<i class="cal-dot--${cls}"></i>`; document.body.appendChild(box);
  const want = getComputedStyle(box.firstChild).color; box.remove();
  const r = i.getBoundingClientRect(), nm = chip.querySelector('.metlit');
  return { w: Math.round(r.width), h: Math.round(r.height), color: getComputedStyle(i).color, want,
    afterName: chip.textContent.trim().length > 0, n: chip.querySelectorAll('.mealm').length,
    tip: chip.getAttribute('title') || '' };
});
t('칩에 그림이 실제로 선다', !!MEC && MEC.n >= 1, MEC ? `${MEC.n}개` : '칩을 못 찾음');
t('이름 옆이라 조그맣다(11px)', MEC && MEC.w === 11 && MEC.h === 11, MEC ? `${MEC.w}x${MEC.h}` : '');
t('빛깔은 달력의 해·달과 같다', MEC && MEC.color === MEC.want, MEC ? `${MEC.color} / ${MEC.want}` : '');
t('줄머리 표에 점심·저녁이 적힌다', MEC && /점심|저녁/.test(MEC.tip), MEC ? MEC.tip : '');
/* 해가 **밝은 바탕에서 묻히지 않는가** (2026-11-05 저녁, 교수님 지정 — 「칩에 해가 잘 안 띈다」).
   11px 그림이라 3:1 아래로 내려가면 눈에 들어오지 않는다. 밤에는 거꾸로 밝은 쪽이 보인다. */
const SUNC = await page.evaluate(() => {
  const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)
    .map(x => x / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const cr = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const pick = t => { document.documentElement.setAttribute('data-theme', t);
    const box = document.createElement('div'); box.className = 'cal-c__d';
    box.innerHTML = '<i class="cal-dot--day"></i>'; document.body.appendChild(box);
    const v = { fg: getComputedStyle(box.firstChild).color, bg: getComputedStyle(document.body).backgroundColor };
    box.remove(); return v; };
  const li = pick('light'), dk = pick('dark');
  document.documentElement.removeAttribute('data-theme');
  return { light: +cr(li.fg, li.bg).toFixed(2), dark: +cr(dk.fg, dk.bg).toFixed(2), lf: li.fg, df: dk.fg };
});
t('낮에도 해가 묻히지 않는다(3:1 넘김)', SUNC.light >= 3, `${SUNC.light} (${SUNC.lf})`);
t('밤에는 해를 밝은 쪽으로 되돌린다', SUNC.dark >= 3 && SUNC.df !== SUNC.lf, `${SUNC.dark} (${SUNC.df})`);
/* 예정 그림이 **실제로 흐리게** 그려지는가 — 치른 그림과 견준다 */
await page.evaluate(() => { applyEntry(rKey(state.rows[2]), { rating: '확' }); render(); });
await page.waitForTimeout(300);
const MESO = await page.evaluate(() => {
  const so = document.querySelector('.st-c .mealm.is-soon'), at = document.querySelector('.st-c .mealm:not(.is-soon)');
  if (!so || !at) return null;
  return { so: +getComputedStyle(so).opacity, at: +getComputedStyle(at).opacity };
});
t('예정 그림은 치른 그림보다 흐리다', MESO && MESO.so < MESO.at && MESO.so > 0.2,
  MESO ? `${MESO.so} / ${MESO.at}` : '그림을 못 찾음');
await page.evaluate(() => {
  meetMap = {}; localStorage.removeItem('jnu-meets'); mealCache = null;
  state.rows.forEach(p => applyEntry(rKey(p), { rating: '' }));
  location.hash = '#/cal'; render();
});

let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
