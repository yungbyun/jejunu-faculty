/* 모션 그래픽에 깔 소리를 손수 만든다 (저작권 걱정 없는 원본).
 *   node motion-audio.mjs <영상.mp4> <컷 시각들 쉼표로>   예: 1.85,3.55,5.5,...
 * 바닥 드론 + 장면 바뀔 때 휙 소리 + 쿵 하는 타격 + 작은 딸깍.
 * 만든 wav 를 영상에 얹어 <이름>-sound.mp4 로 저장한다. */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import ffmpeg from 'ffmpeg-static';

const VIDEO = path.resolve(process.env.MG_ROOT || '..', (process.argv[2] || '').replace(/\\/g, '/'));
const CUTS = (process.argv[3] || '').split(',').map(Number).filter(n => !isNaN(n));
const BIG = (process.argv[4] || '').split(',').map(Number).filter(n => !isNaN(n));   // 크게 치는 곳
const SR = 44100, DUR = 15.0, N = Math.round(SR * DUR);
const L = new Float64Array(N), R = new Float64Array(N);

const rnd = (() => { let s = 20261010 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; })();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
/* 살짝 둥글린 소리를 만들기 위한 한 극 저역통과 */
function lp(x, state, cut) { const a = Math.exp(-2 * Math.PI * cut / SR); state.v = x * (1 - a) + state.v * a; return state.v; }
function add(i, l, r) { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } }

/* 1) 바닥 드론 — 낮게 깔린다 */
{
  const st = { v: 0 };
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 1.2) * (1 - clamp((t - 14.3) / .7, 0, 1));
    const s = Math.sin(2 * Math.PI * 55 * t) * .5 + Math.sin(2 * Math.PI * 55.4 * t) * .42
            + Math.sin(2 * Math.PI * 82.5 * t) * .20 + Math.sin(2 * Math.PI * 110 * t) * .12;
    const v = lp(s, st, 220) * .17 * env;
    add(i, v, v * .96);
  }
}
/* 2) 공기 — 아주 옅은 바람 */
{
  const sl = { v: 0 }, sr = { v: 0 };
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 2) * (1 - clamp((t - 14.3) / .7, 0, 1));
    add(i, lp(rnd(), sl, 900) * .016 * env, lp(rnd(), sr, 820) * .016 * env);
  }
}
/* 3) 첫 폭발까지 끌어올리는 소리 */
{
  const t0 = .35, t1 = CUTS[0] || 1.85, st = { v: 0 };
  for (let i = Math.round(t0 * SR); i < Math.round(t1 * SR); i++) {
    const u = (i / SR - t0) / (t1 - t0);
    const env = Math.pow(u, 2.1) * (1 - Math.pow(clamp((u - .93) / .07, 0, 1), .6));
    const nz = lp(rnd(), st, 300 + 5200 * u * u);
    const sw = Math.sin(2 * Math.PI * (170 + 1100 * u * u) * (i / SR));
    const v = (nz * .55 + sw * .18) * .30 * env;
    add(i, v, v * .9);
  }
}
/* 4) 장면이 바뀔 때 — 휙 */
CUTS.forEach((c, k) => {
  const pre = .18, post = .42, i0 = Math.round((c - pre) * SR), i1 = Math.round((c + post) * SR);
  const st = { v: 0 };
  const pan = k % 2 ? .75 : .35;
  for (let i = i0; i < i1; i++) {
    const u = (i - i0) / (i1 - i0);
    const env = u < .3 ? Math.pow(u / .3, 1.6) : Math.pow(1 - (u - .3) / .7, 2.4);
    const cut = 400 + 6000 * Math.sin(Math.PI * clamp(u, 0, 1));
    const v = lp(rnd(), st, cut) * .22 * env;
    add(i, v * (1 - pan + .5), v * (pan + .5) * .9);
  }
});
/* 5) 크게 치는 곳 — 쿵 */
BIG.forEach(c => {
  const i0 = Math.round(c * SR), len = Math.round(.75 * SR), st = { v: 0 };
  for (let i = 0; i < len; i++) {
    const u = i / len, t = i / SR;
    const f = 92 * Math.exp(-7 * u) + 42;                        // 음이 쑥 떨어진다
    const env = Math.exp(-5.2 * u);
    const body = Math.sin(2 * Math.PI * f * t) * env * .52;
    const click = i < SR * .02 ? lp(rnd(), st, 7000) * (1 - i / (SR * .02)) * .30 : 0;
    add(i0 + i, body + click, body * .98 + click * .9);
  }
});
/* 6) 작은 딸깍 — 글자가 뜰 때 */
CUTS.forEach(c => {
  const i0 = Math.round((c + .1) * SR), len = Math.round(.035 * SR), st = { v: 0 };
  for (let i = 0; i < len; i++) {
    const env = Math.pow(1 - i / len, 3);
    const v = (lp(rnd(), st, 5200) * .5 + Math.sin(2 * Math.PI * 2100 * i / SR) * .5) * .085 * env;
    add(i0 + i, v, v);
  }
});

/* 넘치지 않게 눌러 담는다 */
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const gain = peak > 0 ? 0.89 / peak : 1;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
const soft = x => Math.tanh(x * 1.1);                           // 모서리를 둥글린다
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(clamp(soft(L[i] * gain), -1, 1) * 32600), 44 + i * 4);
  buf.writeInt16LE(Math.round(clamp(soft(R[i] * gain), -1, 1) * 32600), 46 + i * 4);
}
const wav = VIDEO.replace(/\.mp4$/, '-bed.wav');
fs.writeFileSync(wav, buf);

const out = VIDEO.replace(/\.mp4$/, '-sound.mp4');
execFileSync(ffmpeg, ['-y', '-i', VIDEO, '-i', wav, '-c:v', 'copy',
  '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '44100', '-shortest', '-movflags', '+faststart', out], { stdio: 'pipe' });
fs.unlinkSync(wav);
console.log(out, (fs.statSync(out).size / 1048576).toFixed(1) + 'MB');
