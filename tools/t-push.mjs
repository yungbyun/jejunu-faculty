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
  vipSet = new Set(); localStorage.removeItem('jnu-vip');
  favSet = new Set(); localStorage.removeItem('jnu-fav');
  state.ratings.clear(); state.notes.clear();
  const v = CONFIG.RATINGS.LABELS;
  state.rows.forEach((p, i) => state.ratings.set(rKey(p), v[i % v.length]));
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
/* 2026-10-16 — 공략은 테를 두르지 않는다. 깃발이 주황이라 그것만으로 눈에 든다 */
t('깃발이 공략 색', await page.evaluate(() => {
  const el = document.querySelector('[data-pushkey].on');
  const want = getComputedStyle(document.documentElement).getPropertyValue('--push').trim();
  const hex = x => '#' + x.match(/\d+/g).slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
  return hex(getComputedStyle(el.querySelector('.pushm')).color) === want;
}), await page.evaluate(() => getComputedStyle(document.querySelector('[data-pushkey].on .pushm')).color));
t('테두리는 켜기 전과 같다', await page.evaluate(() => {
  const on = document.querySelector('[data-pushkey].on');
  const off = document.querySelector('[data-pushkey]:not(.on)');
  return !off || getComputedStyle(on).borderTopColor === getComputedStyle(off).borderTopColor;
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

/* 눌렀는지 안 눌렀는지 눈으로 갈려야 한다. 마우스를 올린 모습이 켜진 모습과 같으면
   누른 자리에 커서가 그대로 있는 동안 토글이 된 티가 나지 않는다 (2026-10-04) */
const look = async sel => {
  const read = () => page.evaluate(s => {
    const el = document.querySelector(s), cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, fg: cs.color, bd: cs.borderTopColor };
  }, sel);
  await page.mouse.move(0, 0); await page.waitForTimeout(200);
  const off = await read();
  await page.locator(sel).hover(); await page.waitForTimeout(200);
  const offHover = await read();
  await page.locator(sel).click(); await page.waitForTimeout(300);
  const onHover = await read();          // 누른 자리에 커서가 그대로
  await page.mouse.move(0, 0); await page.waitForTimeout(200);
  const on = await read();
  await page.locator(sel).click(); await page.waitForTimeout(300);
  return { off, offHover, on, onHover };
};
const clear = c => c.replace(/\s/g, '');
for (const [name, sel] of [['강화', '[data-surebtn]'], ['약화', '[data-weakbtn]'], ['공략', '[data-pushbtn]'], ['도움', '[data-vipbtn]']]) {
  const L = await look(sel);
  t(`${name}: 켜면 바탕이 색으로 찬다`, clear(L.on.bg) !== clear(L.off.bg),
    `${L.off.bg} → ${L.on.bg} / ${L.on.fg}`);
  t(`${name}: 마우스만 올린 것과 켜진 것이 다르다`, clear(L.offHover.bg) !== clear(L.on.bg),
    `${L.offHover.bg} vs ${L.on.bg}`);
  t(`${name}: 커서를 둔 채로도 켜진 티가 난다`, clear(L.onHover.bg) !== clear(L.offHover.bg),
    `${L.offHover.bg} vs ${L.onHover.bg}`);
  t(`${name}: 두 번 누르면 꺼진 모습으로 돌아온다`, await page.evaluate(s =>
    !document.querySelector(s).classList.contains('on'), sel));
}

/* 5-2) 강화 — 선호도 위에 한 칸 얹는 표시(확이면 더 확실, 긍이면 더 긍정).
   2026-10-14 에 「확실」에서 이름을 바꿨다 — 선호도 「확(확실)」과 글자가 겹쳤다. */
/* 2026-10-16 — 넷이 되었다. 「도움」은 나를 밀어 주는 분, 「VIP」는 총장님이 청할 수 있는 분 */
t('단추 차례는 강화·약화·공략·도움·VIP', await page.evaluate(() => {
  const b = [...document.querySelectorAll('.d-marks button')];
  return b.length === 5 && b[0].hasAttribute('data-surebtn') && b[1].hasAttribute('data-weakbtn')
    && b[2].hasAttribute('data-pushbtn') && b[3].hasAttribute('data-vipbtn') && b[4].hasAttribute('data-presbtn');
}), await page.evaluate(() => [...document.querySelectorAll('.d-marks button')].map(b => b.dataset.surebtn !== undefined ? 'sure' : b.dataset.pushbtn !== undefined ? 'push' : b.dataset.vipbtn !== undefined ? 'vip' : 'pres').join())); 
t('단추 글자는 강화·약화·공략·도움·VIP', await page.evaluate(() =>
  [...document.querySelectorAll('.d-marks button span')].map(e => e.textContent.trim()).join()) === '강화,약화,공략,도움,VIP',
  await page.evaluate(() => [...document.querySelectorAll('.d-marks button span')].map(e => e.textContent.trim()).join()));
/* 다섯이 폰에서 **한 줄**에 들어가야 한다 (2026-10-25, 교수님 요청) */
for (const w of [390, 360]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(200);
  const lay = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('.d-marks button')];
    const box = document.querySelector('.d-marks').getBoundingClientRect();
    return { rows: new Set(bs.map(e => Math.round(e.getBoundingClientRect().top))).size,
             over: bs.filter(e => e.scrollWidth > e.clientWidth + 1).length,
             out: bs.filter(e => e.getBoundingClientRect().right > box.right + 1).length };
  });
  t(`${w}px 에서 단추 다섯이 한 줄`, lay.rows === 1 && lay.out === 0, JSON.stringify(lay));
  t(`${w}px 에서 글자가 안 잘린다`, lay.over === 0, `${lay.over}개 넘침`);
}
await page.setViewportSize({ width: 1440, height: 1000 });
await page.waitForTimeout(200);

/* 강화와 약화는 짝이라 **함께 설 수 없다** (2026-10-25) */
await page.evaluate(() => { sureSet = new Set(); weakSet = new Set();
  localStorage.removeItem('jnu-sure'); localStorage.removeItem('jnu-weak'); renderDept(state.depts[0]); });
await page.click('[data-surebtn]'); await page.waitForTimeout(300);
await page.click('[data-weakbtn]'); await page.waitForTimeout(300);
t('약화를 켜면 강화가 풀린다', await page.evaluate(() => {
  const p = state.rows[0];
  return isWeak(p) && !isSure(p)
    && document.querySelector('[data-surebtn]').getAttribute('aria-pressed') === 'false'
    && document.querySelector('[data-weakbtn]').getAttribute('aria-pressed') === 'true';
}));
await page.click('[data-surebtn]'); await page.waitForTimeout(300);
t('강화를 켜면 약화가 풀린다', await page.evaluate(() => {
  const p = state.rows[0];
  return isSure(p) && !isWeak(p)
    && document.querySelector('[data-weakbtn]').getAttribute('aria-pressed') === 'false';
}));
/* 무게는 2026-10-25 에 교수님이 정하신 값 — 확 .90(약화 .85) · 긍 .70(강화 .80, 약화 .70)
   · 중 .40(강화 .60, 약화 .30) · 모 .20 · 부 0 */
const wOf = (r, mark) => page.evaluate(([rr, mm]) => {
  const p = state.rows[0], was = getRating(p);
  setRating(rKey(p), rr); sureSet = new Set(); weakSet = new Set();
  if (mm === 'sure') sures().add(rKey(p));
  if (mm === 'weak') weaks().add(rKey(p));
  const w = weightOf(p);
  sureSet = new Set(); weakSet = new Set(); setRating(rKey(p), was || '');
  return w;
}, [r, mark]);
t('확에 약화를 찍으면 .95 → .85', await wOf('확', '') === .95 && await wOf('확', 'weak') === .85,
  `${await wOf('확', '')} → ${await wOf('확', 'weak')}`);
t('중에 약화를 찍으면 .50 → .35', await wOf('중', '') === .5 && await wOf('중', 'weak') === .35,
  `${await wOf('중', '')} → ${await wOf('중', 'weak')}`);
/* 긍의 약화는 교수님이 **그냥 긍과 같은 .70** 으로 정하셨다 — 표시로만 남고 셈은 안 바뀐다 */
t('중에 강화를 찍으면 .50 → .65', await wOf('중', 'sure') === .65, String(await wOf('중', 'sure')));
t('부에 강화를 찍으면 0 → .15', await wOf('부', 'sure') === .15, String(await wOf('부', 'sure')));
t('부에 약화를 찍어도 0 그대로', await wOf('부', 'weak') === 0, String(await wOf('부', 'weak')));
t('확에 강화를 찍어도 .95 그대로 — 꼭대기다', await wOf('확', 'sure') === .95, String(await wOf('확', 'sure')));
t('settings 의 weak 키로도 등록', await page.evaluate(() =>
  SET_KEYS.includes('weak') && SET_LABEL['weak'] === '약화'));
/* ---------- 선호도 안의 차례 (2026-10-25, 교수님 지정) ----------
 * **도움 → 강화 → 보통 → 약화**, 같은 자리면 **이름 오름차순**. */
{
  const O = await page.evaluate(() => {
    state.ratings.clear(); sureSet = new Set(); weakSet = new Set(); vipSet = new Set();
    const rows = state.rows.slice(0, 12);
    rows.forEach(p => setRating(rKey(p), '중'));
    rows.slice(0, 3).forEach(p => vips().add(rKey(p)));
    rows.slice(2, 6).forEach(p => sures().add(rKey(p)));   // 셋째는 도움이면서 강화
    rows.slice(6, 9).forEach(p => weaks().add(rKey(p)));
    sureSave(); weakSave(); vipSave();
    location.hash = '#/stats'; render();
    const names = [...document.querySelectorAll('[data-rslist="중"] li a')].map(e => e.textContent.trim());
    const rank = n => { const p = state.rows.find(x => x.name === n);
      return isVip(p) ? 0 : isSure(p) ? 1 : isWeak(p) ? 3 : 2; };
    return { names, ranks: names.map(rank) };
  });
  t('도움 → 강화 → 보통 → 약화 차례', O.ranks.every((v, i) => i === 0 || O.ranks[i - 1] <= v),
    O.names.map((n, i) => `${n}${O.ranks[i]}`).join(' '));
  t('네 자리가 다 나온다', new Set(O.ranks).size === 4, O.ranks.join(''));
  t('도움이면 강화여도 맨 앞', O.ranks.slice(0, 3).every(v => v === 0), O.ranks.join(''));
  t('같은 자리 안은 이름 오름차순', await page.evaluate(() => {
    const names = [...document.querySelectorAll('[data-rslist="중"] li a')].map(e => e.textContent.trim());
    const rank = n => { const p = state.rows.find(x => x.name === n);
      return isVip(p) ? 0 : isSure(p) ? 1 : isWeak(p) ? 3 : 2; };
    for (let i = 1; i < names.length; i++)
      if (rank(names[i - 1]) === rank(names[i]) && names[i - 1].localeCompare(names[i], 'ko') > 0) return false;
    return true;
  }), O.names.join(' '));
  await page.evaluate(() => { sureSet = new Set(); weakSet = new Set(); vipSet = new Set();
    localStorage.removeItem('jnu-sure'); localStorage.removeItem('jnu-weak'); localStorage.removeItem('jnu-vip'); });
}

/* ---------- 옛 갈래를 사다리로 옮기기 (2026-10-25) ----------
 * 갈래가 여섯에서 셋으로 줄면서 **긍정 → 중간+강화**, **모름 → 부정+강화** 로 옮긴다.
 * 쌓아 둔 자료가 걸린 일이라 꼼꼼히 본다. */
t('갈래는 넷뿐이다', await page.evaluate(() => CONFIG.RATINGS.LABELS.join()) === '확,중,부,비',
  await page.evaluate(() => CONFIG.RATINGS.LABELS.join()));
t('옛 값 긍정은 중간으로 읽는다', await page.evaluate(() => normRating('긍')) === '중');
t('옛 값 모름은 부정으로 읽는다', await page.evaluate(() => normRating('모')) === '부');
t('더 옛 값(상·하)도 그대로 읽는다', await page.evaluate(() =>
  normRating('상') === '확' && normRating('하') === '부'));
t('옮겨진 분은 강화로 찍힌다', await page.evaluate(() => {
  sureSet = new Set(); weakSet = new Set(); ladderPend = new Set();
  const a2 = rKey(state.rows[0]), b2 = rKey(state.rows[1]);
  const v1 = normRatingK(a2, '긍'), v2 = normRatingK(b2, '모');
  const n = applyLadder(false);
  return v1 === '중' && v2 === '부' && n === 2 && sures().has(a2) && sures().has(b2);
}));
t('옮기면서 약화 표시는 지운다', await page.evaluate(() => {
  sureSet = new Set(); weakSet = new Set(); ladderPend = new Set();
  const k2 = rKey(state.rows[2]);
  weaks().add(k2);
  normRatingK(k2, '긍'); applyLadder(false);
  return sures().has(k2) && !weaks().has(k2);
}));
t('두 번 돌려도 그대로 — 되풀이해도 안전하다', await page.evaluate(() => {
  sureSet = new Set(); weakSet = new Set(); ladderPend = new Set();
  const k2 = rKey(state.rows[3]);
  normRatingK(k2, '긍'); applyLadder(false);
  const n1 = sures().size;
  normRatingK(k2, '긍'); const n2 = applyLadder(false);
  return n1 === 1 && sures().size === 1 && n2 === 0;
}));
t('새 값에는 손대지 않는다', await page.evaluate(() => {
  ladderPend = new Set();
  ['확', '중', '부', '비'].forEach((r, i) => normRatingK(rKey(state.rows[i]), r));
  return ladderPend.size === 0;
}));
await page.evaluate(() => { sureSet = new Set(); weakSet = new Set(); ladderPend = new Set();
  localStorage.removeItem('jnu-sure'); localStorage.removeItem('jnu-weak'); });
/* 분석 칩 — 약화는 바탕을 **기본보다 더 비운다** (2026-10-25, 교수님 지정).
   밝은 화면에서는 거의 흰빛, 어두운 화면에서는 바탕 쪽으로 가라앉는다. */
for (const theme of ['light', 'dark']) {
  const C = await page.evaluate(th => {
    document.documentElement.setAttribute('data-theme', th);
    state.ratings.clear(); sureSet = new Set(); weakSet = new Set();
    const rows = state.rows;
    rows.slice(0, 9).forEach(p => setRating(rKey(p), '중'));
    rows.slice(0, 3).forEach(p => sures().add(rKey(p)));
    rows.slice(3, 6).forEach(p => weaks().add(rKey(p)));
    sureSave(); weakSave();
    location.hash = '#/stats'; render();
    const lum = c => { const [r, g, b2] = (c.match(/[\d.]+/g) || []).map(Number);
      return (c.includes('srgb') ? (r + g + b2) / 3 * 255 : (r + g + b2) / 3); };
    const pick = s2 => lum(getComputedStyle(document.querySelector(s2)).backgroundColor);
    const base = lum(getComputedStyle([...document.querySelectorAll('.st-c')]
      .find(e => !e.classList.contains('sure') && !e.classList.contains('weak'))).backgroundColor);
    /* 「덜 실린 쪽」은 밝은 화면에서는 흰 쪽, 어두운 화면에서는 어두운 쪽이다 —
       두 화면을 한 잣대로 보려면 **칸 바탕(--surface)** 과 견주면 된다. */
    const hex = v => { const h = v.trim().replace('#', '');
      const q = h.length === 3 ? h.split('').map(c => c + c) : h.match(/../g);
      return q.slice(0, 3).reduce((a, x) => a + parseInt(x, 16), 0) / 3; };
    const rootv = n => hex(getComputedStyle(document.documentElement).getPropertyValue(n));
    return { base, weak: pick('.st-c.weak'), sure: pick('.st-c.sure'),
             dash: getComputedStyle(document.querySelector('.st-c.weak')).borderTopStyle,
             surface: rootv('--surface') };
  }, theme);
  const toBase = Math.abs(C.weak - C.base), toSurf = Math.abs(C.weak - C.surface);
  t(`${theme}: 약화 바탕이 기본과 다르다`, toBase > 4, `기본 ${C.base.toFixed(0)} / 약화 ${C.weak.toFixed(0)}`);
  t(`${theme}: 약화 바탕이 기본보다 더 비었다`, toSurf < toBase,
    `칸 바탕 ${C.surface.toFixed(0)} / 약화 ${C.weak.toFixed(0)} / 기본 ${C.base.toFixed(0)}`);
  t(`${theme}: 약화는 점선 테두리`, C.dash === 'dashed', C.dash);
  t(`${theme}: 강화와 약화가 또렷이 갈린다`, Math.abs(C.sure - C.weak) > 8,
    `강화 ${C.sure.toFixed(0)} / 약화 ${C.weak.toFixed(0)}`);
}
/* 테마를 되돌리고 **상세로 돌아간다** — 표시(강화·약화)는 그대로 둔다. 뒤의 시험들이
   강화가 찍힌 자료와 열린 상세를 그대로 이어 쓴다. */
await page.evaluate(() => { document.documentElement.removeAttribute('data-theme');
  const p = state.rows[0]; location.hash = `#/dept/${p.dept_id}/prof/${p.slug}`; render(); });
await page.waitForSelector('.d-marks', { timeout: 10000 });
await page.waitForTimeout(250);
await page.evaluate(() => { sureSet = new Set(); weakSet = new Set();
  localStorage.removeItem('jnu-sure'); localStorage.removeItem('jnu-weak'); });

await page.click('[data-surebtn]');
await page.waitForTimeout(400);
t('강화가 켜진다', await page.evaluate(() => sures().size === 1 &&
  document.querySelector('[data-surebtn]').getAttribute('aria-pressed') === 'true'));
t('강화 글자도 그대로', (await page.locator('[data-surebtn] span').innerText()).trim() === '강화');
/* 단추 색도 그 교수의 선호도를 따라간다 — 선호도를 바꾸면 바로 따라와야 한다 (2026-10-14) */
t('단추에 그 선호도 색이 실린다', await page.evaluate(() => {
  const p = state.rows[0], get = () => getComputedStyle(document.querySelector('.d-marks')).getPropertyValue('--rc').trim();
  setRating(rKey(p), '부'); const a = get();
  setRating(rKey(p), '중'); const b = get();
  setRating(rKey(p), ''); const c = get();
  return a === RCOLOR['부'] && b === RCOLOR['중'] && c === '';
}), await page.evaluate(() => getComputedStyle(document.querySelector('.d-marks')).getPropertyValue('--rc')));
t('선호도가 없으면 무채색으로, 글자는 읽힌다', await page.evaluate(() => {
  const btn = document.querySelector('[data-vipbtn]');
  if (!btn.classList.contains('on')) btn.click();
  const cs = getComputedStyle(btn);
  const n = x => { const m = (x.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    return /^color\(/.test(x) ? m.map(v => Math.round(v * 255)) : m.map(Math.round); };
  const L = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
    return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const bg = n(cs.backgroundColor), fg = n(cs.color);
  const [hi, lo] = [L(bg), L(fg)].sort((a, b) => b - a);
  const grey = Math.max(...bg) - Math.min(...bg) < 30;
  btn.click();
  return grey && (hi + .05) / (lo + .05) >= 4.5;
}), await page.evaluate(() => getComputedStyle(document.querySelector('[data-vipbtn]')).backgroundColor));
/* 선호도 「확(확실)」과 글자가 겹치지 않아야 한다 — 이름을 바꾼 까닭이다 */
t('어디에도 「확실」이라는 표시는 없다', await page.evaluate(() =>
  ![...document.querySelectorAll('.d-marks button span, .d-section h3')].some(e => e.textContent.includes('확실'))));
t('칸 이름은 「선호도 추가정보」', await page.evaluate(() =>
  [...document.querySelectorAll('.d-section h3')].some(e => e.textContent.trim() === '선호도 추가정보')),
  await page.evaluate(() => [...document.querySelectorAll('.d-section h3')].map(e => e.textContent.trim()).join('/')));
/* 선호도를 매긴 바로 그 자리에서 덧붙이게 — 선호도 바로 아래다 (2026-10-14) */
t('선호도 바로 아래 칸이다', await page.evaluate(() => {
  const h = [...document.querySelectorAll('.d-section h3')].map(e => e.textContent.trim());
  return h.indexOf('선호도 추가정보') === h.indexOf('선호도') + 1;
}), await page.evaluate(() => [...document.querySelectorAll('.d-section h3')].map(e => e.textContent.trim()).join(' / ')));
t('표식은 위 화살표 — 한 칸 올린다는 뜻', await page.evaluate(() => {
  const d = document.querySelector('[data-surebtn] svg path').getAttribute('d');
  return /^M12 20V5/.test(d);
}), await page.evaluate(() => document.querySelector('[data-surebtn] svg path').getAttribute('d')));
t('공략과는 따로 간다', await page.evaluate(() => sures().size === 1 && pushes().size === 0));
t('선호도도 건드리지 않는다', await page.evaluate(() => {
  const before = getRating(state.rows[0]);
  sureToggle(state.rows[0]); sureToggle(state.rows[0]);   // 켰다 껐다
  return getRating(state.rows[0]) === before && isSure(state.rows[0]);
}));

// 분석 목록 — 바탕이 「얼마나 든든한가」를 말한다(강화 반쯤 · VIP 꽉 · 공략은 테두리)
await page.evaluate(() => { setRating(rKey(state.rows[0]), '중'); location.hash = '#/stats'; render(); });
await page.waitForSelector('.st-c.sure', { timeout: 10000 });
await page.mouse.move(0, 0);
await page.waitForTimeout(300);
t('강화인 칩에만 sure', await page.evaluate(() => document.querySelectorAll('.st-c.sure').length === sures().size));
t('강화는 그 선호도 색을 10% 깐다', await page.evaluate(() => {
  const el = document.querySelector('.st-c.sure'), cs = getComputedStyle(el);
  const rc = cs.getPropertyValue('--rc').trim();          // 그 선호도 색이 칩에 실려 온다
  const base = getComputedStyle(document.querySelector('.st-c:not(.sure):not(.vip)')).backgroundColor;
  /* #rrggbb · rgb(…) · color(srgb 0~1 …) 를 모두 0~255 로 읽는다 */
  const n = x => { x = String(x).trim();
    if (x[0] === '#') { const h = x.slice(1); const q = h.length === 3 ? h.split('').map(c => c + c) : h.match(/../g);
      return q.slice(0, 3).map(v => parseInt(v, 16)); }
    const m = (x.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    return /^color\(/.test(x) ? m.map(v => Math.round(v * 255)) : m.map(Math.round); };
  const want = n(rc).map((v, i) => Math.round(v * .1 + n(base)[i] * .9));
  const got = n(cs.backgroundColor);
  return rc === RCOLOR['중'] && got.every((v, i) => Math.abs(v - want[i]) <= 2);
}), await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.st-c.sure'));
  return cs.getPropertyValue('--rc') + ' → ' + cs.backgroundColor;
}));
t('강화 글자는 흰색이 아니다 — 옅은 바탕이라', await page.evaluate(() =>
  getComputedStyle(document.querySelector('.st-c.sure')).color !== 'rgb(255, 255, 255)'));
t('강화가 아니면 바탕이 회색 그대로', await page.evaluate(() => {
  const el = [...document.querySelectorAll('.st-c')].find(e => !e.classList.contains('sure') && !e.classList.contains('vip'));
  const want = getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim();
  const hex = x => '#' + x.match(/\d+/g).slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
  return !!el && hex(getComputedStyle(el).backgroundColor) === want;
}), await page.evaluate(() => getComputedStyle([...document.querySelectorAll('.st-c')]
  .find(e => !e.classList.contains('sure') && !e.classList.contains('vip'))).backgroundColor));
/* 공략은 테 없이 깃발만 (2026-10-16, 사용자 지정) */
t('공략은 깃발만 — 테는 두르지 않는다', await page.evaluate(() => {
  const p = state.rows[0];
  pushes().add(rKey(p)); pushSave(); render();
  const el = document.querySelector('.st-c.sure.on'), cs = getComputedStyle(el);
  const push = cs.getPropertyValue('--push').trim();
  const hex = x => '#' + x.match(/\d+/g).slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
  return !!el && cs.boxShadow === 'none' && !!el.querySelector('.pushm svg')
    && hex(getComputedStyle(el.querySelector('.pushm')).color) === push;
}), await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.st-c.sure.on'));
  return cs.borderTopColor + ' / ' + cs.boxShadow;
}));
t('테 색도 강화 그대로 — 공략이 끼어들지 않는다', await page.evaluate(() => {
  const on = document.querySelector('.st-c.sure.on');
  const off = [...document.querySelectorAll('.st-c.sure:not(.on)')]
    .find(e => getComputedStyle(e).getPropertyValue('--rc') === getComputedStyle(on).getPropertyValue('--rc'));
  return !off || getComputedStyle(on).borderTopColor === getComputedStyle(off).borderTopColor;
}));
await page.evaluate(() => {
  sureSet = new Set(); localStorage.removeItem('jnu-sure');
  pushSet = new Set(); localStorage.removeItem('jnu-push');
  setRating(rKey(state.rows[0]), '');
});

// 5-3) VIP — 분석 목록에서 그 선호도 색으로 꽉 채운다(2026-10-14, 전에는 두 줄 테두리)
t('도움이 넷째, VIP 가 다섯째', await page.evaluate(() => {
  const b = [...document.querySelectorAll('.d-marks button')];
  return b.length === 5 && b[3].querySelector('span').textContent.trim() === '도움'
    && b[4].querySelector('span').textContent.trim() === 'VIP';
}));
await page.evaluate(() => {
  vipSet = new Set(); pushSet = new Set(); sureSet = new Set();
  const p = state.rows[0];
  setRating(rKey(p), '중'); vips().add(rKey(p)); vipSave();
  location.hash = '#/stats'; render();
});
await page.waitForSelector('.st-c.vip', { timeout: 10000 });
await page.mouse.move(0, 0);
await page.waitForTimeout(300);
t('VIP 인 칩에만 vip', await page.evaluate(() => document.querySelectorAll('.st-c.vip').length === vips().size));
t('VIP 는 그 선호도 색으로 꽉 채운다', await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.st-c.vip'));
  /* #rrggbb · rgb(…) · color(srgb 0~1 …) 를 모두 0~255 로 읽는다 */
  const n = x => { x = String(x).trim();
    if (x[0] === '#') { const h = x.slice(1); const q = h.length === 3 ? h.split('').map(c => c + c) : h.match(/../g);
      return q.slice(0, 3).map(v => parseInt(v, 16)); }
    const m = (x.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    return /^color\(/.test(x) ? m.map(v => Math.round(v * 255)) : m.map(Math.round); };
  const rc = n(cs.getPropertyValue('--rc').trim()), got = n(cs.backgroundColor);
  /* 흰 글자를 얹으려고 7% 만 어둡게 한다 — 그 선호도 색에서 거의 안 벗어나야 한다 */
  return got.every((v, i) => v <= rc[i] + 1 && v >= rc[i] * .9 - 3);
}), await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.st-c.vip'));
  return cs.getPropertyValue('--rc') + ' → ' + cs.backgroundColor;
}));
t('VIP 글자는 흰색', await page.evaluate(() =>
  getComputedStyle(document.querySelector('.st-c.vip')).color === 'rgb(255, 255, 255)'));
t('VIP 는 강화보다 진하다', await page.evaluate(() => {
  const p = state.rows[1];
  setRating(rKey(p), '중'); sures().add(rKey(p)); render();
  const L = el => { const c = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) || [])
      .slice(0, 3).map(v => v > 1.001 ? +v : v * 255);
    const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
    return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const vip = L(document.querySelector('.st-c.vip')), sure = L(document.querySelector('.st-c.sure:not(.vip)'));
  const d = Math.abs(vip - sure);
  sures().delete(rKey(p)); render();
  return d > .05;
}));
/* 세 표시를 한꺼번에 달아도 서로 가리지 않아야 한다 — 바탕은 VIP 가 이기고, 공략은 깃발로 남는다 */
t('셋을 겹쳐 달면 VIP 바탕에 공략 깃발', await page.evaluate(() => {
  const p = state.rows[0];
  pushes().add(rKey(p)); sures().add(rKey(p)); render();
  const el = document.querySelector('.st-c.vip'), cs = getComputedStyle(el);
  /* #rrggbb · rgb(…) · color(srgb 0~1 …) 를 모두 0~255 로 읽는다 */
  const n = x => { x = String(x).trim();
    if (x[0] === '#') { const h = x.slice(1); const q = h.length === 3 ? h.split('').map(c => c + c) : h.match(/../g);
      return q.slice(0, 3).map(v => parseInt(v, 16)); }
    const m = (x.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    return /^color\(/.test(x) ? m.map(v => Math.round(v * 255)) : m.map(Math.round); };
  const rc = n(cs.getPropertyValue('--rc').trim()), got = n(cs.backgroundColor);
  return el.classList.contains('sure') && el.classList.contains('on')
    && got.every((v, i) => v <= rc[i] + 1 && v >= rc[i] * .9 - 3)      // 강화에 안 묻힌다
    && cs.color === 'rgb(255, 255, 255)'
    && cs.boxShadow === 'none'                                         // 테는 두르지 않는다
    && !!el.querySelector('.pushm svg');                               // 공략은 깃발로 남는다
}), await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.st-c.vip'));
  return cs.backgroundColor + ' / ' + cs.boxShadow;
}));
t('진한 바탕에서는 깃발을 옅은 주황으로', await page.evaluate(() => {
  const el = document.querySelector('.st-c.vip .pushm');
  if (!el) return false;
  const c = (getComputedStyle(el).color.match(/\d+/g) || []).map(Number);
  return c[0] > 200 && c[1] > 150 && c[2] > 120;        // 어두운 바탕 위에서도 보이는 밝은 주황
}), await page.evaluate(() => getComputedStyle(document.querySelector('.st-c.vip .pushm')).color));
t('어느 칩에도 테를 두르지 않는다', await page.evaluate(() =>
  [...document.querySelectorAll('.st-c')].every(e => getComputedStyle(e).boxShadow === 'none')),
  await page.evaluate(() => [...document.querySelectorAll('.st-c')]
    .map(e => getComputedStyle(e).boxShadow).find(x => x !== 'none') || '모두 없음'));
t('도움말에 도움이라 적힌다', await page.evaluate(() =>
  (document.querySelector('.st-c.vip').getAttribute('title') || '').includes('도움')));
await page.evaluate(() => {
  vipSet = new Set(); pushSet = new Set(); sureSet = new Set();
  ['jnu-vip', 'jnu-push', 'jnu-sure'].forEach(k => localStorage.removeItem(k));
  setRating(rKey(state.rows[0]), '');
});

/* 5-4) 여섯 선호도 × 두 테마 — 글자가 읽히고, 보통·강화·VIP 가 서로 갈려야 한다 (2026-10-14) */
for (const theme of ['light', 'dark']) {
  const got = await page.evaluate(th => {
    document.documentElement.setAttribute('data-theme', th);
    const R = CONFIG.RATINGS.LABELS;
    sureSet = new Set(); pushSet = new Set(); vipSet = new Set();
    state.rows.forEach((p, i) => applyEntry(rKey(p), { rating: R[i % 6] }));
    R.forEach(r => {
      const ps = state.rows.filter(p => getRating(p) === r);
      if (ps[0]) sures().add(rKey(ps[0]));
      if (ps[1]) vips().add(rKey(ps[1]));
    });
    location.hash = '#/stats'; render();
    const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d');
    const px = (...cs) => { x.clearRect(0, 0, 1, 1); for (const c of cs) { x.fillStyle = c; x.fillRect(0, 0, 1, 1); }
      return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const L = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
    const ratio = (a, b) => { const [hi, lo] = [L(a), L(b)].sort((m, n) => n - m); return (hi + .05) / (lo + .05); };
    const panel = getComputedStyle(document.querySelector('.st-list')).backgroundColor;
    const out = [];
    document.querySelectorAll('.st-list').forEach(list => {
      const pick = sel => list.querySelector(sel);
      const kinds = { 강화: pick('.st-c.sure'), VIP: pick('.st-c.vip'), 보통: pick('.st-c:not(.sure):not(.vip)') };
      const bg = {};
      Object.entries(kinds).forEach(([k, el]) => {
        if (!el) return;
        const cs = getComputedStyle(el);
        bg[k] = px(panel, cs.backgroundColor);
        out.push({ r: list.dataset.rslist, k, text: ratio(bg[k], px(cs.color)) });
      });
      if (bg.강화 && bg.보통) out.push({ r: list.dataset.rslist, k: '강화≠보통', text: 0, sep: ratio(bg.강화, bg.보통) });
      if (bg.VIP && bg.강화) out.push({ r: list.dataset.rslist, k: 'VIP≠강화', text: 0, sep: ratio(bg.VIP, bg.강화) });
      if (kinds.강화 && kinds.보통) {
        const c = e => getComputedStyle(e).borderTopColor;
        out.push({ r: list.dataset.rslist, k: '강화 테≠보통 테', text: 0,
          edge: c(kinds.강화) !== c(kinds.보통) });
      }
    });
    document.documentElement.setAttribute('data-theme', 'light');
    return out;
  }, theme);
  const texts = got.filter(o => !o.sep && o.edge === undefined);
  const seps = got.filter(o => o.sep);
  const edges = got.filter(o => o.edge !== undefined);
  const sure = seps.filter(o => o.k === '강화≠보통'), vip = seps.filter(o => o.k === '도움≠강화');
  t(`${theme}: 여섯 선호도 모두 글자가 읽힌다(4.5 이상)`, texts.every(o => o.text >= 4.5),
    texts.filter(o => o.text < 5).map(o => `${o.r}${o.k} ${o.text.toFixed(2)}`).join(' ') || '모두 5 이상');
  /* 강화 바탕은 교수님이 맞추시는 값이라 아주 옅을 수 있다(지금 10%). 그래서 바탕은 **다르기만**
     하면 되고(1.05), 갈라 주는 몫은 **테두리**(55%)가 거의 다 집니다. 도움과는 넉넉히 떨어져야 한다. */
  t(`${theme}: 강화 바탕이 보통과 다르다(1.05 이상)`, sure.every(o => o.sep >= 1.05),
    sure.map(o => `${o.r} ${o.sep.toFixed(2)}`).join(' '));
  t(`${theme}: 강화 테두리가 보통과 다르다`, edges.every(o => o.edge),
    edges.filter(o => !o.edge).map(o => o.r).join(' ') || '여섯 줄 모두 다름');
  t(`${theme}: 도움은 강화와 또렷이 갈린다(1.25 이상)`, vip.every(o => o.sep >= 1.25),
    vip.map(o => `${o.r} ${o.sep.toFixed(2)}`).join(' '));
}
await page.evaluate(() => {
  vipSet = new Set(); pushSet = new Set(); sureSet = new Set();
  ['jnu-vip', 'jnu-push', 'jnu-sure'].forEach(k => localStorage.removeItem(k));
  state.rows.forEach(p => applyEntry(rKey(p), { rating: '' }));
  document.documentElement.setAttribute('data-theme', 'light');
});

// 6) 시트로도 저장된다
t('settings 의 push 키로 등록', await page.evaluate(() => SET_KEYS.includes('push') && SET_LABEL['push'] === '공략'));
t('settings 의 sure 키로도 등록', await page.evaluate(() => SET_KEYS.includes('sure') && SET_LABEL['sure'] === '강화'));
t('settings 의 vip 키로도 등록', await page.evaluate(() => SET_KEYS.includes('vip') && SET_LABEL['vip'] === '도움'));
/* VIP(총장님이 청할 수 있는 분) — 열쇠는 pres, 보이는 글자만 VIP (2026-10-16) */
t('settings 의 pres 키로도 등록', await page.evaluate(() => SET_KEYS.includes('pres') && SET_LABEL['pres'] === 'VIP'));
t('도움과 VIP 는 따로 담긴다', await page.evaluate(() => {
  const p = state.rows[5];
  vipSet = new Set(); presSet = new Set();
  presToggle(p);
  return isPres(p) && !isVip(p) && settingValue('pres').length === 1 && settingValue('vip').length === 0;
}));
t('VIP 는 바탕을 안 건드리고 테두리만', await page.evaluate(() => {
  const p = state.rows[5];
  sureSet = new Set(); vipSet = new Set(); pushSet = new Set(); presSet = new Set([rKey(p)]);
  applyEntry(rKey(p), { rating: '확' });
  location.hash = '#/stats'; render();
  const el = document.querySelector('.st-c.pres');
  if (!el) return false;
  const cs = getComputedStyle(el);
  const hex = x => '#' + (x.match(/\d+/g) || []).slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
  const plainBg = getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim();
  return hex(cs.backgroundColor) === plainBg        // 바탕은 보통 칩 그대로
    && cs.boxShadow !== 'none'                      // 바깥 줄이 있다
    && hex(cs.borderTopColor) === cs.getPropertyValue('--vip').trim();
}), await page.evaluate(() => {
  const el = document.querySelector('.st-c.pres');
  return el ? getComputedStyle(el).backgroundColor + ' / ' + getComputedStyle(el).boxShadow.slice(0, 50) : '(없음)';
}));
t('VIP 도움말에 VIP 라고 적힌다', await page.evaluate(() =>
  (document.querySelector('.st-c.pres').getAttribute('title') || '').includes('VIP')));
t('도움 도움말은 도움이라 적힌다', await page.evaluate(() => {
  const p = state.rows[5];
  presSet = new Set(); vipSet = new Set([rKey(p)]); render();
  return (document.querySelector('.st-c.vip').getAttribute('title') || '').includes('도움');
}));
await page.evaluate(() => {
  presSet = new Set(); vipSet = new Set(); localStorage.removeItem('jnu-pres');
  applyEntry(rKey(state.rows[5]), { rating: '' });
});
t('받은 값을 이 기기에 적용', await page.evaluate(() => {
  const k = rKey(state.rows[3]);
  settingApplyLocal('push', [k]);
  return isPush(state.rows[3]) && JSON.parse(localStorage.getItem('jnu-push') || '[]')[0] === k;
}));

t('강화도 시트에서 내려받는다', await page.evaluate(() => {
  const k = rKey(state.rows[5]);
  settingApplyLocal('sure', [k]);
  return isSure(state.rows[5]) && JSON.parse(localStorage.getItem('jnu-sure') || '[]')[0] === k;
}));
t('VIP 도 시트에서 내려받는다', await page.evaluate(() => {
  const k = rKey(state.rows[7]);
  settingApplyLocal('vip', [k]);
  return isVip(state.rows[7]) && JSON.parse(localStorage.getItem('jnu-vip') || '[]')[0] === k;
}));
await page.evaluate(() => { pushSet = new Set(); localStorage.removeItem('jnu-push'); sureSet = new Set(); localStorage.removeItem('jnu-sure'); vipSet = new Set(); localStorage.removeItem('jnu-vip'); });
let bad = 0;
for (const [n, v, x] of ok) { if (!v) bad++; console.log(`${v ? 'OK  ' : '실패'} ${n}${x ? '   (' + x + ')' : ''}`); }
console.log(`\n${ok.length - bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close();
process.exit(bad ? 1 : 0);
