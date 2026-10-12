/* 15초 세로 모션 그래픽 공용 밑감 (1080x1920 · 30fps).
 * 프레임 번호만 넣으면 같은 그림이 나오도록 짠다 — 한 장씩 떠서 영상으로 묶기 위해서다.
 * 그림은 모두 여기서 만든다(바깥 소재를 쓰지 않는다). */
const W = 1080, H = 1920, FPS = 30, DUR = 15, NF = DUR * FPS;
let G = null, CV = null;
function mgInit(canvas) { CV = canvas; G = canvas.getContext('2d'); return G; }

/* ---------- 잔재주 ---------- */
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (t, a, b) => clamp((t - a) / (b - a));
const smooth = t => t * t * (3 - 2 * t);
const outCubic = t => 1 - Math.pow(1 - t, 3);
const inCubic = t => t * t * t;
const inOutCubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const outBack = t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
/* 씨를 박은 난수 — 돌릴 때마다 같은 그림이어야 한다 */
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

/* ---------- 색 ---------- */
const INK = '#ffffff', DIM = '#a9bac8';
let ACC = '#2fd3a7';          // ARTLab — eco 쪽 초록
const WARN = '#f3a63a';         // 방사성 폐기물 — 호박색
const COOL = '#7fb6ff';

/* ---------- 글자 ---------- */
function text(s, x, y, o = {}) {
  const { size = 40, weight = 600, color = INK, align = 'center', ls = 0, alpha = 1, dy = 0 } = o;
  if (alpha <= .002) return;
  G.save();
  G.globalAlpha = alpha; G.fillStyle = color; G.textBaseline = 'alphabetic';
  G.font = `${weight} ${size}px Inter, "Segoe UI", system-ui, sans-serif`;
  if (ls) {
    const cs = [...s];
    let tot = 0; for (const c of cs) tot += G.measureText(c).width + ls;
    tot -= ls;
    let cx = align === 'center' ? x - tot / 2 : align === 'right' ? x - tot : x;
    G.textAlign = 'left';
    for (const c of cs) { G.fillText(c, cx, y + dy); cx += G.measureText(c).width + ls; }
  } else { G.textAlign = align; G.fillText(s, x, y + dy); }
  G.restore();
}
/* 가로폭에 맞춰 줄을 나눈다 — 긴 논문 제목이 화면 밖으로 나가지 않게 */
function wrap(s, maxW, size, weight = 700) {
  G.save();
  G.font = `${weight} ${size}px Inter, "Segoe UI", system-ui, sans-serif`;
  const out = []; let line = '';
  for (const w of String(s).split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (G.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  G.restore();
  return out;
}
const rise = (t, at, dur = .5) => { const k = outCubic(inv(t, at, at + dur)); return { alpha: k, dy: (1 - k) * 26 }; };
/* 자막 두 줄 — 들어왔다 나간다 */
function caption(t, a, b, l1, l2, o = {}) {
  const al = clamp(inv(t, a, a + .42)) * (1 - inv(t, b - .3, b));
  if (al <= .01) return;
  const r = rise(t, a, .45);
  const y = o.y || 1600;
  if (l1) text(l1, 540, y, { size: o.size || 52, weight: 600, color: DIM, alpha: al * r.alpha, dy: r.dy });
  if (l2) text(l2, 540, y + 66, { size: o.size || 52, weight: 800, color: o.color || INK, alpha: al * r.alpha, dy: r.dy * 1.3 });
}

/* ---------- 바탕 ---------- */
function bg(t, o = {}) {
  const grd = G.createRadialGradient(540, 780, 60, 540, 920, 1280);
  grd.addColorStop(0, o.c0 || '#0e2029'); grd.addColorStop(.55, o.c1 || '#081520'); grd.addColorStop(1, o.c2 || '#04080e');
  G.fillStyle = grd; G.fillRect(0, 0, W, H);
  G.save(); G.globalAlpha = .05 * clamp(inv(t, .3, 2)); G.strokeStyle = '#7fd6c0'; G.lineWidth = 1;
  for (let x = 0; x <= W; x += 60) { G.beginPath(); G.moveTo(x + .5, 0); G.lineTo(x + .5, H); G.stroke(); }
  for (let y = 0; y <= H; y += 60) { G.beginPath(); G.moveTo(0, y + .5); G.lineTo(W, y + .5); G.stroke(); }
  G.restore();
}

/* ---------- 작은 머리글 ---------- */
function eyebrow(t, a, b, s) {
  const al = clamp(inv(t, a, a + .5)) * (1 - inv(t, b - .35, b));
  if (al <= .01) return;
  text(s, 540, 300, { size: 23, weight: 700, color: DIM, alpha: al * .92, ls: 7 });
  G.save(); G.globalAlpha = al * .5; G.strokeStyle = ACC; G.lineWidth = 2;
  G.beginPath(); G.moveTo(498, 328); G.lineTo(582, 328); G.stroke(); G.restore();
}

/* ---------- 사진 ---------- */
function loadImg(src) {
  const im = new Image(); im.src = src;
  return new Promise(r => { if (im.complete && im.naturalWidth) return r(im); im.onload = () => r(im); im.onerror = () => r(null); });
}

/* ---------- 마무리 이름판 (세 시안이 함께 쓴다) ---------- */
function endCard(t, t0, photo) {
  const a = clamp(inv(t, t0, t0 + .5));
  if (a <= .01) return;
  G.save();
  const sc = G.createLinearGradient(0, 160, 0, 1480);
  sc.addColorStop(0, `rgba(4,8,14,${.94 * a})`); sc.addColorStop(.75, `rgba(4,8,14,${.90 * a})`);
  sc.addColorStop(1, 'rgba(4,8,14,0)');
  G.fillStyle = sc; G.fillRect(0, 120, W, 1400);
  G.restore();

  const pk = outCubic(inv(t, t0 + .05, t0 + .6));
  if (photo && pk > .01) {
    const R = 150 * lerp(.88, 1, pk), cx = 540, cy = 540;
    G.save(); G.globalAlpha = pk;
    G.beginPath(); G.arc(cx, cy, R + 9, 0, 7);
    G.strokeStyle = ACC; G.lineWidth = 3.5;
    G.shadowColor = 'rgba(47,211,167,.45)'; G.shadowBlur = 26; G.stroke(); G.shadowBlur = 0;
    G.save(); G.beginPath(); G.arc(cx, cy, R, 0, 7); G.clip();
    const ar = photo.width / photo.height, dh = R * 2.12, dw = dh * ar;
    G.drawImage(photo, cx - dw / 2, cy - dh / 2 - R * .04, dw, dh);
    G.restore(); G.restore();
  }
  const C = window.CARD || {};
  const L = [
    [.32, C.name || 'JAEHYUK KANG', 820, { size: 76, weight: 900, ls: 2 }],
    [.46, C.role || 'Assistant Professor', 880, { size: 33, weight: 700, color: ACC, ls: 4 }],
    [.60, C.dept || 'Nuclear & Energy Engineering', 952, { size: 38, weight: 600 }],
    [.70, C.org || 'Jeju National University', 1004, { size: 33, weight: 400, color: DIM }],
    [.92, C.lab || 'ARTLab', 1118, { size: C.labSize || 44, weight: 900, color: ACC, ls: 3 }],
    [1.02, C.labFull || 'Advanced Radioactive waste eco-Technology Laboratory', 1164, { size: 25, weight: 500, color: DIM, ls: .4 }],
  ];
  for (const [d, s, y, o] of L) { const r = rise(t, t0 + d, .5); text(s, 540, y, Object.assign({ alpha: a * r.alpha, dy: r.dy }, o)); }
  const ru = rise(t, t0 + 1.35, .5);
  G.save(); G.globalAlpha = a * ru.alpha * .55; G.strokeStyle = ACC; G.lineWidth = 2;
  G.beginPath(); G.moveTo(360, 1268 + ru.dy); G.lineTo(720, 1268 + ru.dy); G.stroke(); G.restore();
  text((window.CARD && window.CARD.url) || 'sites.google.com/view/artlab-jk', 540, 1340, { size: 32, weight: 600, alpha: a * ru.alpha, dy: ru.dy, ls: 1 });
}

/* ---------- 끝에서 살짝 어둡게 (반복 재생이 튀지 않게) ---------- */
function tail(t) {
  const f = inv(t, DUR - .35, DUR);
  if (f > 0) { G.fillStyle = `rgba(4,8,14,${f * .22})`; G.fillRect(0, 0, W, H); }
}

/* ---------- 글꼴·사진 준비 ---------- */
async function mgReady(photoSrc) {
  await document.fonts.load('900 76px Inter');
  await document.fonts.load('600 40px Inter');
  await document.fonts.ready;
  return photoSrc ? await loadImg(photoSrc) : null;
}
/* 브라우저에서 그냥 열면 제자리 재생(확인용) */
function mgPlay() {
  if (location.search.includes('still')) return;
  const t0 = performance.now();
  const loop = () => { renderFrame(Math.floor((performance.now() - t0) / 1000 * FPS) % NF); requestAnimationFrame(loop); };
  loop();
}
