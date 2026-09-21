// Prueft die Anforderungen aus Kapitel 27 und 28 auf iPhone- und
// iPad-Geometrie sowie den Safari-Rueckfall aus Kapitel 4.
//
// Wichtige Einschraenkung: hier laeuft Chromium mit iPhone- und
// iPad-Kennwerten, nicht WebKit. Geometrie, Touchziele, Standalone-Anzeige
// und der ReadableStream-Nachbau sind damit pruefbar, das Verhalten der
// Safari-Engine selbst nicht. Abnahmekriterium 1 bis 20 aus Kapitel 35 bleibt
// am echten Geraet zu erledigen.
//
// Aufruf:
//   npx http-server -p 8099 -s .
//   node tests/mobile.mjs [http://127.0.0.1:8099]
import {chromium, devices} from 'playwright';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const BASE=process.argv[2]||'http://127.0.0.1:8099';
const PDF=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures','zellbiologie.pdf');
let failures=0;
const step=(name,ok,extra='')=>{if(!ok)failures++;console.log(`${ok?'OK  ':'FEHL'} ${name}${extra?' · '+extra:''}`);};

const browser=await chromium.launch();

for(const [label,descriptor] of [["iPhone",devices['iPhone 13']],["iPad",devices['iPad (gen 7)']]]){
  console.log(`\n— ${label} (${descriptor.viewport.width}×${descriptor.viewport.height}) —`);
  const ctx=await browser.newContext({...descriptor,isMobile:true,hasTouch:true});
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(BASE,{waitUntil:'networkidle'});

  const breite=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,fenster:window.innerWidth}));
  step('Kein waagerechter Ueberlauf',breite.doc<=breite.fenster+1,`${breite.doc} zu ${breite.fenster}`);

  // Gemessen wird die treffbare Flaeche, nicht die sichtbare: nach den HIG darf
  // ein Bedienelement zierlich aussehen, solange sein Ziel 44 px erreicht.
  const ziele=await page.evaluate(()=>{
    const wirksam=el=>{
      const eigen=el.getBoundingClientRect();
      let breite=eigen.width, hoehe=eigen.height;
      const label=el.closest('label');
      if(label){const r=label.getBoundingClientRect();breite=Math.max(breite,r.width);hoehe=Math.max(hoehe,r.height);}
      const nach=getComputedStyle(el,'::after');
      if(nach.content&&nach.content!=='none'){
        hoehe=Math.max(hoehe,parseFloat(nach.height)||0);
        breite=Math.max(breite,parseFloat(nach.width)||0);
      }
      return {breite,hoehe};
    };
    const klein=[];
    for(const el of document.querySelectorAll('.tabbar button, button, input[type=checkbox]')){
      const eigen=el.getBoundingClientRect();
      if(eigen.width===0&&eigen.height===0)continue;
      const {breite,hoehe}=wirksam(el);
      if(hoehe<44||breite<44)klein.push(`${el.id||el.className||el.tagName}: ${Math.round(breite)}×${Math.round(hoehe)}`);
    }
    return klein;
  });
  step('Touchziele mindestens 44 px',ziele.length===0,ziele.slice(0,3).join(' | ')||'alle ausreichend');

  const safe=await page.evaluate(()=>{
    const tab=getComputedStyle(document.querySelector('.tabbar'));
    const top=getComputedStyle(document.querySelector('.topbar'));
    return {unten:tab.paddingBottom||tab.height,obenPadding:top.paddingTop,position:tab.position};
  });
  step('Tab-Bar liegt fest am unteren Rand',safe.position==='fixed'||safe.position==='sticky',safe.position);

  // Grosser Titel weicht beim Scrollen dem kompakten Titel.
  await page.click('[data-tab="progress"]');
  await page.waitForTimeout(600);
  const titel=await page.evaluate(async()=>{
    window.scrollTo(0,400);
    await new Promise(r=>setTimeout(r,350));
    const condensed=document.querySelector('.topbar').classList.contains('condensed');
    window.scrollTo(0,0);
    return condensed;
  });
  step('Grosser Titel weicht beim Scrollen',titel);

  const theme=await page.evaluate(()=>({
    schema:getComputedStyle(document.documentElement).colorScheme,
    theme:document.documentElement.dataset.theme,
    statusleiste:document.querySelector('#theme-color')?.getAttribute('content')
  }));
  step('Erscheinungsbild und Statusleiste gesetzt',Boolean(theme.theme&&theme.statusleiste),`${theme.theme}, ${theme.statusleiste}`);

  // Dunkles Erscheinungsbild umschalten (Kap. 27).
  const dunkel=await page.evaluate(async()=>{
    localStorage.setItem("lernapp-appearance","dark");
    window.dispatchEvent(new Event("storage"));
    document.documentElement.dataset.theme="dark";
    await new Promise(r=>setTimeout(r,120));
    return {hintergrund:getComputedStyle(document.body).backgroundColor,theme:document.documentElement.dataset.theme};
  });
  step('Dunkles Erscheinungsbild greift',dunkel.theme==="dark"&&/rgb\(([0-9]{1,2}), ?([0-9]{1,2}), ?([0-9]{1,2})\)/.test(dunkel.hintergrund),dunkel.hintergrund);

  if(errors.length){failures++;console.log('  Konsolenfehler: '+JSON.stringify(errors));}
  await ctx.close();
}

// Safari-Rueckfall: ohne asynchrone Iteration ueber ReadableStream brach der
// PDF-Import ab. compat.js baut sie nach, das muss pruefbar bleiben.
console.log('\n— Safari-Rueckfall ohne ReadableStream-Iteration —');
{
  const ctx=await browser.newContext({...devices['iPhone 13'],isMobile:true,hasTouch:true});
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    // Zustand wie in Safari herstellen, bevor irgendein Skript laeuft.
    delete ReadableStream.prototype[Symbol.asyncIterator];
    delete ReadableStream.prototype.values;
    window.__ohneIteration=true;
  });
  await page.goto(BASE,{waitUntil:'networkidle'});
  const nachgebaut=await page.evaluate(()=>typeof ReadableStream.prototype[Symbol.asyncIterator]==="function"&&window.__ohneIteration===true);
  step('compat.js baut die Iteration nach',nachgebaut);

  await page.click('[data-tab="library"]');
  await page.waitForTimeout(400);
  await page.setInputFiles('#file-import',PDF);
  await page.waitForTimeout(1200);
  if(await page.isVisible('text=Text verwenden').catch(()=>false))await page.click('text=Text verwenden');
  await page.waitForFunction(()=>document.body.innerText.includes("zellbiologie.pdf"),{timeout:60000}).catch(()=>{});
  await page.waitForTimeout(2500);
  const importiert=await page.evaluate(async()=>{
    const db=await new Promise(r=>{const q=indexedDB.open("lernapp-pwa",2);q.onsuccess=()=>r(q.result);});
    return new Promise(r=>{const tx=db.transaction("goals","readonly");const g=tx.objectStore("goals").getAll();g.onsuccess=()=>{r(g.result.length);db.close();};});
  });
  step('PDF-Import gelingt ohne native Iteration',importiert>0,`${importiert} Lernziele`);
  if(errors.length){failures++;console.log('  Konsolenfehler: '+JSON.stringify(errors));}
  await ctx.close();
}

await browser.close();
console.log(failures?`\n${failures} Pruefung(en) fehlgeschlagen.`:'\nAlle Pruefungen bestanden.');
process.exit(failures?1:0);
