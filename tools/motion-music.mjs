/* 15초 모션 그래픽에 깔 경쾌한 음악을 손수 만든다 (전부 합성 — 저작권 없음).
 *   node motion-music.mjs <영상.mp4> [끝맺음(초)]
 * 128 BPM · 4/4 · 여덟 마디 = 정확히 15.000초. 그래서 마디머리가 장면 전환과 맞는다.
 * 화음 진행 A - E - F#m - D 두 바퀴 (밝은 가장조). */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import ffmpeg from 'ffmpeg-static';

const VIDEO = path.resolve(process.env.MG_ROOT || '..', (process.argv[2] || '').replace(/\\/g, '/'));
const SR = 44100, BPM = 128, BEAT = 60 / BPM, BAR = BEAT * 4, DUR = BAR * 8;   // 15.000초
const N = Math.round(SR * DUR);
const L = new Float64Array(N), R = new Float64Array(N);

let seed = 24681357 >>> 0;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const put = (i, l, r) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } };

/* 음이름 → 주파수 (A4 = 440) */
const NOTE = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
const hz = (n, oct = 4) => 440 * Math.pow(2, (NOTE[n] + (oct - 4) * 12) / 12);

/* 톱니·네모 — 배음을 몇 개만 더해 만든다(에일리어싱을 피하려고) */
function wave(kind, ph) {
  if (kind === 'sine') return Math.sin(ph);
  if (kind === 'tri') return Math.asin(Math.sin(ph)) * (2 / Math.PI);
  let v = 0;
  const H = kind === 'saw' ? 12 : 9;
  for (let k = 1; k <= H; k++) {
    if (kind === 'square' && k % 2 === 0) continue;
    v += Math.sin(ph * k) / k;
  }
  return v * (kind === 'saw' ? .55 : .72);
}
/* 한 음 — 울리다 잦아든다. 저역통과로 모서리를 둥글린다. */
function voice(t0, dur, f, { kind = 'saw', gain = .2, atk = .004, dec = .18, cut = 2600, cutEnv = 0, pan = .5, detune = 0 } = {}) {
  const i0 = Math.round(t0 * SR), n = Math.round(dur * SR);
  let lp = 0, ph = 0, ph2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = t < atk ? t / atk : Math.exp(-(t - atk) / dec);
    if (env < 1e-4) break;
    ph += 2 * Math.PI * f / SR;
    ph2 += 2 * Math.PI * f * Math.pow(2, detune / 1200) / SR;
    let s = wave(kind, ph);
    if (detune) s = (s + wave(kind, ph2)) * .5;
    const c = clamp(cut + cutEnv * env, 60, 18000);
    const a = Math.exp(-2 * Math.PI * c / SR);
    lp = s * (1 - a) + lp * a;
    const v = lp * env * gain;
    put(i0 + i, v * (1 - pan + .5) * .8, v * (pan + .5) * .8);
  }
}
/* 북 */
function kick(t0, gain = .95) {
  const i0 = Math.round(t0 * SR), n = Math.round(.26 * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = i / n;
    const f = 42 + 118 * Math.exp(-28 * t);
    const env = Math.exp(-11 * t);
    const v = Math.sin(2 * Math.PI * f * t) * env * gain + (i < 90 ? rnd() * .20 * (1 - i / 90) : 0);
    put(i0 + i, v, v);
  }
}
function clap(t0, gain = .36) {
  const i0 = Math.round(t0 * SR);
  for (const [off, g] of [[0, .7], [.011, .9], [.023, 1]]) {
    const s = Math.round(off * SR), n = Math.round(.16 * SR);
    let hp = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, env = Math.exp(-(off ? 26 : 40) * t);
      const x = rnd();
      hp = .82 * (hp + x - prev); prev = x;                 // 고역통과로 바삭하게
      const v = hp * env * gain * g;
      put(i0 + s + i, v * .95, v);
    }
  }
}
function hat(t0, open = false, gain = .18) {
  const i0 = Math.round(t0 * SR), n = Math.round((open ? .17 : .045) * SR);
  let hp = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = Math.exp(-(open ? 16 : 70) * t);
    const x = rnd();
    hp = .90 * (hp + x - prev); prev = x;
    const v = hp * env * gain;
    put(i0 + i, v * .85, v);
  }
}
/* 쏴 하고 올라가는 소리 */
function riser(t0, t1, gain = .22) {
  const i0 = Math.round(t0 * SR), i1 = Math.round(t1 * SR);
  let lp = 0;
  for (let i = i0; i < i1; i++) {
    const u = (i - i0) / (i1 - i0);
    const c = 300 + 6500 * u * u;
    const a = Math.exp(-2 * Math.PI * c / SR);
    lp = rnd() * (1 - a) + lp * a;
    const v = lp * Math.pow(u, 1.7) * gain;
    put(i, v, v * .92);
  }
}
function crash(t0, gain = .30) {
  const i0 = Math.round(t0 * SR), n = Math.round(1.6 * SR);
  let hp = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = Math.exp(-2.6 * t);
    const x = rnd();
    hp = .93 * (hp + x - prev); prev = x;
    const v = hp * env * gain;
    put(i0 + i, v, v * .94);
  }
}

/* ---------- 곡 ---------- */
const PROG = [                                   // 마디마다 화음 (두 바퀴)
  { root: ['A', 2], tones: [['A', 4], ['C#', 5], ['E', 5]] },
  { root: ['E', 2], tones: [['E', 4], ['G#', 4], ['B', 4]] },
  { root: ['F#', 2], tones: [['F#', 4], ['A', 4], ['C#', 5]] },
  { root: ['D', 2], tones: [['D', 4], ['F#', 4], ['A', 4]] },
];
for (let bar = 0; bar < 8; bar++) {
  const t0 = bar * BAR, ch = PROG[bar % 4];
  const intro = bar === 0;                        // 첫 마디는 쏴 하고 올라가기만
  const last = bar === 7;

  /* 북·박수·하이햇 */
  if (!intro) {
    for (let b = 0; b < 4; b++) kick(t0 + b * BEAT, b === 0 ? 1 : .88);
    clap(t0 + BEAT); clap(t0 + 3 * BEAT);
    for (let e = 0; e < 8; e++) hat(t0 + e * BEAT / 2, e === 7, e % 2 ? .12 : .2);
  } else {
    hat(t0 + 3 * BEAT, false, .12); hat(t0 + 3.5 * BEAT, false, .16);
  }

  /* 저음 — 통통 튀게 */
  if (!intro) {
    const bf = hz(ch.root[0], ch.root[1]);
    for (const [off, d] of [[0, .36], [.75, .22], [1.5, .3], [2.25, .22], [3, .3], [3.5, .22]])
      voice(t0 + off * BEAT, d, bf, { kind: 'square', gain: .26, dec: .14, cut: 420, cutEnv: 900, pan: .5 });
  }

  /* 화음 한 방 */
  if (!intro) ch.tones.forEach(([n, o], k) =>
    voice(t0, BEAT * 1.1, hz(n, o), { kind: 'saw', gain: .085, atk: .006, dec: .30, cut: 1700, cutEnv: 2200, pan: .35 + k * .15, detune: 7 }));

  /* 또르르 — 16분음표 아르페지오 */
  const arp = [...ch.tones, [ch.tones[1][0], ch.tones[1][1] + 1], [ch.tones[2][0], ch.tones[2][1]], [ch.tones[0][0], ch.tones[0][1] + 1]];
  const steps = intro ? 8 : 16;
  for (let s = 0; s < steps; s++) {
    const [n, o] = arp[(s + bar) % arp.length];
    const tt = t0 + s * (BEAT / (steps / 4));
    const g = intro ? .055 : (s % 4 === 0 ? .11 : .075);
    voice(tt, .22, hz(n, o + 1), { kind: 'tri', gain: g, dec: .075, cut: 5200, pan: s % 2 ? .66 : .34 });
  }

  /* 마디머리 반짝 */
  if (!intro) voice(t0, .5, hz(ch.tones[0][0], ch.tones[0][1] + 2), { kind: 'sine', gain: .06, dec: .18, cut: 9000, pan: .5 });

  if (last) { crash(t0, .26); }
}
riser(0, BAR, .20);
crash(BAR, .34);                                  // 떨어지는 자리
kick(BAR, 1.05);

/* 끝맺음 — 마지막 반 마디는 잦아든다 */
for (let i = Math.round((DUR - .45) * SR); i < N; i++) {
  const u = (i - (DUR - .45) * SR) / (.45 * SR);
  L[i] *= 1 - u; R[i] *= 1 - u;
}

/* 담기 */
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g0 = peak > 0 ? 1 / peak : 1;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
const soft = x => Math.tanh(x * 1.25) * .80;      // 살짝 눌러 붙인다
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(clamp(soft(L[i] * g0), -1, 1) * 32600), 44 + i * 4);
  buf.writeInt16LE(Math.round(clamp(soft(R[i] * g0), -1, 1) * 32600), 46 + i * 4);
}
const wav = VIDEO.replace(/\.mp4$/, '-music.wav');
fs.writeFileSync(wav, buf);
const out = VIDEO.replace(/\.mp4$/, '-sound.mp4');
execFileSync(ffmpeg, ['-y', '-i', VIDEO, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
  '-ac', '2', '-ar', '44100', '-shortest', '-movflags', '+faststart', out], { stdio: 'pipe' });
fs.unlinkSync(wav);
console.log(out, (fs.statSync(out).size / 1048576).toFixed(1) + 'MB');
