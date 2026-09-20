/* 모든 화면에서 콘솔 오류가 없는지 확인 */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport:{width:1440,height:900} })).newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.goto('http://127.0.0.1:8080/', { waitUntil:'load' });
await page.waitForFunction(() => typeof enterApp === 'function', null, {timeout:20000});
await page.evaluate(() => { if (!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(() => typeof state !== 'undefined' && state.rows.length>0, null, {timeout:25000});
for (const h of ['#/','#/dept/comdol','#/dept/comdol/prof/'+await page.evaluate(()=>state.depts.find(d=>d.id==='comdol').profs[0].slug),'#/stats','#/outreach','#/quiz','#/']) {
  await page.evaluate(x => { location.hash = x; render(); }, h);
  await page.waitForTimeout(900);
  console.log('  ' + h.padEnd(40) + ' 렌더 OK');
}
const real = errs.filter(e => !/401|Failed to load resource|gviz|accounts\.google|photo/i.test(e));
console.log(real.length ? '\n콘솔 오류:\n' + real.join('\n') : '\n콘솔 오류 없음 (시트 401·사진 404 같은 정상 항목은 제외)');
await b.close();
process.exit(real.length ? 1 : 0);
