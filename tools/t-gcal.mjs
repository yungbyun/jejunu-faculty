/* 식사 약속 → 구글 캘린더 맞추기(apps-script/Code.gs 의 calendarSync).
   구글 서버 없이 가짜 시트·가짜 캘린더로 로직만 확인한다. 브라우저도 서버도 필요 없다.
     node t-gcal.mjs */
import fs from 'fs';
import path from 'path';
const SRC = fs.readFileSync(process.argv[2] || path.resolve('../apps-script/Code.gs'), 'utf8');

const ok = []; const t = (n, v, x = '') => ok.push([n, v, x]);
const OWNER = 'prof@jejunu.ac.kr';

function makeSheets(meets, rows) {
  const settings = [['email', 'key', 'value', 'updated_at'], [OWNER, 'meets', JSON.stringify(meets), new Date()]];
  const ratings = [['email', 'dept_id', 'slug', 'name', 'rating', 'u', 'met', 'memo'], ...rows];
  const sheet = data => ({
    getLastRow: () => data.length,
    getRange: (r, c, nr, nc) => ({ getValues: () => data.slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)) }),
    appendRow: row => data.push(row),
    setFrozenRows: () => {},
  });
  return { settings: sheet(settings), ratings: sheet(ratings) };
}

function makeCal(name) {
  const events = [];
  const mkEvent = (title, start, end, allDay) => {
    const e = {
      _t: title, _s: start, _e: end, _all: allDay, _loc: '', _tags: {}, _dead: false,
      getTitle: () => e._t, setTitle: v => { e._t = v; },
      getLocation: () => e._loc, setLocation: v => { e._loc = v; },
      isAllDayEvent: () => e._all,
      getStartTime: () => e._s,
      setAllDayDate: d => { e._all = true; e._s = d; },
      setTime: (s, en) => { e._all = false; e._s = s; e._e = en; },
      setTag: (k, v) => { e._tags[k] = String(v); }, getTag: k => e._tags[k] || null,
      deleteEvent: () => { e._dead = true; const i = events.indexOf(e); if (i >= 0) events.splice(i, 1); },
    };
    events.push(e); return e;
  };
  const self = {
    _events: events,
    _name: name,
    getName: () => self._name,
    getEvents: (a, b) => events.filter(e => e._s >= a && e._s <= b),
    createEvent: (ti, s, en) => mkEvent(ti, s, en, false),
    createAllDayEvent: (ti, s) => mkEvent(ti, s, null, true),
  };
  return self;
}

function run(meets, rows, existingCal) {
  const sheets = makeSheets(meets, rows);
  const cal = existingCal || makeCal('식사 약속');
  const created = [];
  const env = {
    Session: { getEffectiveUser: () => ({ getEmail: () => OWNER }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheets({}, []).settings) }) },
    CalendarApp: {
      Color: { ORANGE: 'ORANGE' },
      getCalendarsByName: n => (cal.getName() === n ? [cal] : []),
      createCalendar: (n) => { created.push(n); cal._name = n; return cal; },
    },
    Utilities: {
      parseDate: (s, tz, fmt) => {           // 'yyyy-MM-dd HH:mm' 을 한국 시간으로
        const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2})$/.exec(s);
        if (!m) throw new Error('parseDate: ' + s);
        return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5]));
      },
      getUuid: () => 'uuid',
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Logger: { log: () => {} },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) }) }) },
    ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: {} },
    UrlFetchApp: {}, MailApp: {}, PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    SpreadsheetApp_: null,
  };
  const keys = Object.keys(env);
  const fn = new Function(...keys, SRC + '\nreturn { calendarSync, calTitle_, calWanted_ };');
  const api = fn(...keys.map(k => env[k]));
  const res = api.calendarSync(OWNER);
  return { res, cal, created, api };
}

const ROWS = [
  [OWNER, 'nuclear', 'chansoo-choi', '최찬수'],
  [OWNER, 'nuclear', 'jaehyuk-kang', '강재혁'],
  [OWNER, 'nuclear', 'taeseok-kim', '김태석'],
  [OWNER, 'comdol', 'someone', '고동우'],
];
const MEETS = {
  a1: { date: '2026-10-13', time: '12:00', kind: 'lunch', place: '학생회관', memo: '예산 이야기',
        who: ['nuclear/chansoo-choi'], guests: [], done: '', counted: [] },
  a2: { date: '2026-10-14', time: '18:30', kind: 'dinner', place: '', memo: '',
        who: ['nuclear/jaehyuk-kang', 'nuclear/taeseok-kim', 'comdol/someone'], guests: ['행정실 이영수'], done: '', counted: [] },
  a3: { date: '2026-10-15', time: '', kind: '', place: '', memo: '', who: [], guests: [], done: '', counted: [] },
};

/* 1) 처음 — 세 건이 들어간다 */
let r = run(MEETS, ROWS, makeCal(''));
t('캘린더를 새로 만든다', r.created.length === 1 && r.created[0] === '식사 약속');
t('세 건이 들어갔다', r.res.made === 3 && r.res.total === 3, JSON.stringify(r.res));
const ev = r.cal._events.slice().sort((a, b) => a._s - b._s);
t('제목에 해·달과 이름', ev[0]._t === '☀ 점심 · 최찬수', ev[0]._t);
t('여럿이면 「외 N명」', ev[1]._t === '🌙 저녁 · 강재혁 외 3명', ev[1]._t);
t('명단 밖의 분도 센다', ev[1]._t.includes('외 3명'));
t('장소는 넣는다', ev[0]._loc === '학생회관', ev[0]._loc);
t('메모는 넣지 않는다', !JSON.stringify(r.cal._events).includes('예산 이야기'));
t('시각 없으면 하루 종일', ev[2]._all === true && ev[2]._t === '약속', ev[2]._t);
t('12시는 한국 시간으로 꽂힌다', ev[0]._s.toISOString() === '2026-10-13T03:00:00.000Z', ev[0]._s.toISOString());
t('약속 번호를 꼬리표로 단다', ev[0].getTag('mtid') === 'a1');

/* 2) 다시 돌려도 늘지 않는다 */
let r2 = run(MEETS, ROWS, r.cal);
t('다시 돌려도 새로 안 만든다', r2.res.made === 0 && r2.cal._events.length === 3, JSON.stringify(r2.res));

/* 3) 시각·장소를 고치면 따라 고친다 */
const M2 = JSON.parse(JSON.stringify(MEETS));
M2.a1.time = '19:00'; M2.a1.kind = ''; M2.a1.place = '제주시청 앞';
let r3 = run(M2, ROWS, r2.cal);
const e1 = r3.cal._events.find(e => e.getTag('mtid') === 'a1');
t('고치면 따라 고친다', r3.res.fixed === 1 && e1._t === '🌙 최찬수', `${r3.res.fixed} ${e1._t}`);
t('시각도 옮겨진다', e1._s.toISOString() === '2026-10-13T10:00:00.000Z', e1._s.toISOString());
t('장소도 바뀐다', e1._loc === '제주시청 앞');

/* 4) 지운 약속은 캘린더에서도 지운다 */
const M3 = JSON.parse(JSON.stringify(M2)); delete M3.a2;
let r4 = run(M3, ROWS, r3.cal);
t('지우면 캘린더에서도 지운다', r4.res.gone === 1 && r4.cal._events.length === 2, JSON.stringify(r4.res));

/* 5) 하루 종일 → 시각 있는 일정으로 바뀌는 경우 */
const M4 = JSON.parse(JSON.stringify(M3)); M4.a3.time = '08:30';
let r5 = run(M4, ROWS, r4.cal);
const e3 = r5.cal._events.find(e => e.getTag('mtid') === 'a3');
t('하루 종일에서 시각으로 바뀐다', e3._all === false && e3._t.startsWith('☀'), `${e3._all} ${e3._t}`);

/* 6) 남의 계정으로는 건드리지 않는다 */
const sheets = makeSheets(MEETS, ROWS);
let r6 = run(MEETS, ROWS, r5.cal);
t('주인만 맞춘다', r6.res.ok === true);
const api = r6.api;
t('다른 사람이면 건너뛴다', api.calendarSync('남@example.com').skip === 'not owner');

let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
process.exit(bad ? 1 : 0);
