/* 메모의 굵게(**…**) — 저장은 평문, 보여 줄 때만 굵게.
   로컬 서버(127.0.0.1:8080)가 떠 있어야 한다. */
import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({viewport:{width:1440,height:1000}})).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto('http://127.0.0.1:8080/',{waitUntil:'load'});
await page.waitForFunction(()=>typeof enterApp==='function',null,{timeout:20000});
await page.evaluate(()=>{ if(!document.body.classList.contains('authed')) enterApp(null); });
await page.waitForFunction(()=>typeof state!=='undefined'&&state.rows.length>0,null,{timeout:25000});
const ok=[]; const t=(n,v,x='')=>ok.push([n,v,x]);

// 변환 함수
t('**굵게** 가 <b> 로', await page.evaluate(()=>memoHtml('앞 **여기** 뒤')==='앞 <b>여기</b> 뒤'));
t('HTML 은 먼저 막는다', await page.evaluate(()=>memoHtml('<script>x</script>').indexOf('<script')<0));
t('줄바꿈은 <br>', await page.evaluate(()=>memoHtml('a\nb')==='a<br>b'));
t('여러 군데', await page.evaluate(()=>memoHtml('**하나** 와 **둘**')==='<b>하나</b> 와 <b>둘</b>'));
t('짝이 안 맞으면 그대로', await page.evaluate(()=>memoHtml('**열기만')==='**열기만'));
t('표시 기호 없애기', await page.evaluate(()=>memoPlain('앞 **여기** 뒤')==='앞 여기 뒤'));
t('__밑줄__ 이 <u> 로', await page.evaluate(()=>memoHtml('앞 __여기__ 뒤')==='앞 <u>여기</u> 뒤'));
t('*기울임* 이 <i> 로', await page.evaluate(()=>memoHtml('앞 *여기* 뒤')==='앞 <i>여기</i> 뒤'));
t('굵게와 기울임이 안 섞임', await page.evaluate(()=>memoHtml('**굵게** 와 *기울임*')==='<b>굵게</b> 와 <i>기울임</i>'),
  await page.evaluate(()=>memoHtml('**굵게** 와 *기울임*')));
t('셋 다 지워짐', await page.evaluate(()=>memoPlain('**가** __나__ *다*')==='가 나 다'));

// 드로어에서 실제로
const info = await page.evaluate(()=>{ const p=state.rows[0]; return {k:rKey(p), h:`#/dept/${p.dept_id}/prof/${p.slug}`}; });
await page.evaluate(h=>{ location.hash=h; render(); }, info.h);
await page.waitForSelector('textarea.memo',{timeout:10000});
t('단추 세 개 (굵게·밑줄·기울임)', await page.locator('.memo__b').count()===3,
  await page.evaluate(()=>[...document.querySelectorAll('.memo__b')].map(b=>b.dataset.mk).join(' ')));
t('처음엔 미리보기 숨김', await page.evaluate(()=>document.querySelector('.memo__prev').hidden));

await page.fill('textarea.memo','오고 출신, 강창남 교수 후배.');
await page.evaluate(()=>{ const t=document.querySelector('textarea.memo'); const i=t.value.indexOf('강창남 교수'); t.selectionStart=i; t.selectionEnd=i+'강창남 교수'.length; });
await page.click('[data-mk="**"]');
await page.waitForTimeout(300);
t('단추로 ** 가 붙음', await page.evaluate(()=>document.querySelector('textarea.memo').value)==='오고 출신, **강창남 교수** 후배.',
  await page.evaluate(()=>document.querySelector('textarea.memo').value));
t('미리보기가 보임', await page.evaluate(()=>!document.querySelector('.memo__prev').hidden));
t('미리보기가 굵게', await page.evaluate(()=>document.querySelector('.memo__prev').innerHTML.indexOf('<b>강창남 교수</b>')>=0));

// 다시 누르면 풀린다
await page.evaluate(()=>{ const t=document.querySelector('textarea.memo'); const i=t.value.indexOf('**강창남 교수**'); t.selectionStart=i; t.selectionEnd=i+'**강창남 교수**'.length; });
await page.click('[data-mk="**"]');
await page.waitForTimeout(300);
t('다시 누르면 풀림', await page.evaluate(()=>document.querySelector('textarea.memo').value)==='오고 출신, 강창남 교수 후배.',
  await page.evaluate(()=>document.querySelector('textarea.memo').value));

// Ctrl+B
await page.evaluate(()=>{ const t=document.querySelector('textarea.memo'); t.focus(); t.selectionStart=0; t.selectionEnd=5; });
await page.keyboard.press('Control+b');
await page.waitForTimeout(300);
t('Ctrl+B 도 된다', await page.evaluate(()=>document.querySelector('textarea.memo').value.slice(0,9)==='**오고 출신**'),
  await page.evaluate(()=>document.querySelector('textarea.memo').value));

// 저장되는 값은 평문 그대로
await page.evaluate(()=>document.querySelector('textarea.memo').blur());
await page.waitForTimeout(400);
t('저장값에 ** 가 그대로', await page.evaluate(k=>getNote(k).memo.indexOf('**')>=0, info.k));

// 밑줄·기울임도 같은 방식
await page.fill('textarea.memo','밑줄 칠 곳과 기울일 곳');
await page.evaluate(()=>{ const t=document.querySelector('textarea.memo'); const i=t.value.indexOf('밑줄 칠 곳'); t.selectionStart=i; t.selectionEnd=i+6; });
await page.click('[data-mk="__"]');
await page.waitForTimeout(250);
t('밑줄 단추', await page.evaluate(()=>document.querySelector('textarea.memo').value.startsWith('__밑줄 칠 곳__')),
  await page.evaluate(()=>document.querySelector('textarea.memo').value));
await page.evaluate(()=>{ const t=document.querySelector('textarea.memo'); const i=t.value.indexOf('기울일 곳'); t.selectionStart=i; t.selectionEnd=i+5; });
await page.click('[data-mk="*"]');
await page.waitForTimeout(250);
t('기울임 단추', await page.evaluate(()=>document.querySelector('textarea.memo').value.includes('*기울일 곳*')),
  await page.evaluate(()=>document.querySelector('textarea.memo').value));
t('미리보기에 밑줄·기울임', await page.evaluate(()=>{ const h=document.querySelector('.memo__prev').innerHTML; return h.includes('<u>')&&h.includes('<i>'); }),
  await page.evaluate(()=>document.querySelector('.memo__prev').innerHTML));
await page.evaluate(()=>{ const t=document.querySelector('textarea.memo'); t.focus(); const i=t.value.indexOf('기울일 곳'); t.selectionStart=i-1; t.selectionEnd=i+6; });
await page.keyboard.press('Control+i');
await page.waitForTimeout(250);
t('Ctrl+I 로 풀림', await page.evaluate(()=>!document.querySelector('textarea.memo').value.includes('*기울일 곳*')),
  await page.evaluate(()=>document.querySelector('textarea.memo').value));

// 굵은 것 안쪽만 골라도 풀린다
await page.fill('textarea.memo','앞 **가운데** 뒤');
await page.evaluate(()=>{ const t=document.querySelector('textarea.memo'); const i=t.value.indexOf('가운데'); t.selectionStart=i; t.selectionEnd=i+3; });
await page.click('[data-mk="**"]');
await page.waitForTimeout(250);
t('안쪽만 골라도 풀림', await page.evaluate(()=>document.querySelector('textarea.memo').value)==='앞 가운데 뒤',
  await page.evaluate(()=>document.querySelector('textarea.memo').value));

// 접촉 화면에서도 굵게 보인다.
// 드로어를 먼저 떠나야 한다 — 화면을 옮길 때 열려 있던 메모 칸의 값이 마지막으로 한 번 저장된다.
await page.evaluate(()=>{ location.hash='#/outreach'; render(); });
await page.waitForTimeout(800);
await page.evaluate(k=>applyEntry(k,{memo:'오고 출신, **강창남 교수** 후배.'}), info.k);
await page.evaluate(k=>{ OUT.open=k; renderOutreach(); }, info.k);
await page.waitForSelector('.oc__memo',{timeout:15000});
const ocm = await page.evaluate(()=>document.querySelector('.oc__memo')?.innerHTML ?? '(없음)');
t('접촉 화면에도 굵게', ocm.indexOf('<b>강창남 교수</b>')>=0, ocm);

let bad=0; for(const [n,v,x] of ok){ if(!v) bad++; console.log(`${v?'OK  ':'실패'} ${n}${x?'   ('+x+')':''}`); }
console.log(`\n${ok.length-bad}/${ok.length} 통과`);
console.log('오류:', errs);
await b.close(); process.exit(bad?1:0);
