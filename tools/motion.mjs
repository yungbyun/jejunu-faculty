/* 모션 그래픽을 한 장씩 떠서 영상으로 묶는다.
 *   node motion.mjs sheet <scene.html 의 저장소 상대경로>   — 눈으로 볼 열여섯 장
 *   node motion.mjs film  <scene.html 의 저장소 상대경로>   — 450장 전부 + mp4 + 표지
 * 로컬 서버(127.0.0.1:8080)가 떠 있어야 한다.
 * 보기: node motion.mjs film motion/jaehyuk-kang/a-immobilize.html */
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import ffmpeg from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';

const MODE = process.argv[2] || 'sheet';
const SCENE = (process.argv[3] || 'motion/chansoo-choi/scene.html').replace(/\\/g, '/');
/* 장면이 어디 있느냐에 따라 뿌리를 바꾼다.
 *   기본    : 저장소 (http://127.0.0.1:8080)
 *   MG_ROOT : 저장소 바깥 폴더 — 그 폴더를 MG_URL 로 띄워 두어야 한다 */
const ROOT_FS = process.env.MG_ROOT || path.resolve('..');
const ROOT_URL = (process.env.MG_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const URL = `${ROOT_URL}/${encodeURI(SCENE)}?still=1`;
const OUT = path.resolve(ROOT_FS, path.dirname(SCENE));
const BASE = path.basename(SCENE, '.html');
const TMP = path.resolve(process.env.TMPDIR || process.env.TEMP || '.', 'mg-' + BASE);

const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })).newPage();
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.sceneReady, null, { timeout: 20000 });
await page.evaluate(() => window.sceneReady);
const hasCanvas = await page.locator('#c').count() > 0;
const canvas = page.locator(hasCanvas ? '#c' : '#stage');

async function shot(f, file) {
  await page.evaluate(n => window.renderFrame(n), f);
  await canvas.screenshot({ path: file, type: 'jpeg', quality: 94 });
}

if (MODE === 'sheet') {
  const picks = [8, 40, 70, 100, 130, 160, 195, 225, 255, 285, 310, 340, 370, 400, 425, 445];
  fs.mkdirSync(TMP, { recursive: true });
  const list = [];
  for (const f of picks) { const p = path.join(TMP, `p${String(f).padStart(3, '0')}.jpg`); await shot(f, p); list.push(p); }
  const fl = path.join(TMP, 'list.txt');
  fs.writeFileSync(fl, list.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
  const sheet = path.join(OUT, BASE + '-sheet.jpg');
  execFileSync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', fl,
    '-vf', 'scale=270:480,tile=4x4:padding=6:color=0x202833', '-frames:v', '1', sheet], { stdio: 'pipe' });
  console.log('장면판:', sheet, '· 오류', errs);
} else {
  const NF = await page.evaluate(() => window.NF);
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  const t0 = Date.now();
  for (let f = 0; f < NF; f++) {
    await shot(f, path.join(TMP, `f${String(f).padStart(4, '0')}.jpg`));
    if (f % 100 === 0) console.log(`  ${f}/${NF}  ${((Date.now() - t0) / 1000).toFixed(0)}초`);
  }
  await shot(Number(process.argv[4] || 240), path.join(OUT, BASE + '-cover.jpg'));   // 인스타 표지용 한 장
  const mp4 = path.join(OUT, BASE + '.mp4');
  execFileSync(ffmpeg, ['-y', '-framerate', '30', '-i', path.join(TMP, 'f%04d.jpg'),
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '18',
    '-preset', 'slow', '-movflags', '+faststart', '-r', '30', mp4], { stdio: 'pipe' });
  console.log(`\n${mp4}  ${(fs.statSync(mp4).size / 1048576).toFixed(1)}MB  ${((Date.now() - t0) / 1000).toFixed(0)}초`);
  console.log('오류', errs);
}
await b.close();
