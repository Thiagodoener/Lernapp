// Prüft den Import eines mehrseitigen Skriptes über den echten Worker-Code:
// wie viele KI-Aufrufe er kostet, ob die Seitenzuordnung stimmt und was
// passiert, wenn die Cloud mitten im Import ausfällt.
//
// Aufruf:
//   npx http-server -p 8099 -s .
//   node tests/import.mjs [http://127.0.0.1:8099]
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {startWorkerHarness} from './worker-harness.mjs';

const BASE=process.argv[2]||'http://127.0.0.1:8099';
const PDF=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures','skript-24-seiten.pdf');
let failures=0;
const step=(name,ok,extra='')=>{if(!ok)failures++;console.log(`${ok?'OK  ':'FEHL'} ${name}${extra?' · '+extra:''}`);};

const harness=await startWorkerHarness({port:8793,allowedOrigin:BASE.replace(/\/$/,'')});
const browser=await chromium.launch();
const ctx=await browser.newContext();
const page=await ctx.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&!/status of (429|502)/.test(m.text()))errors.push(m.text());});
await page.goto(BASE,{waitUntil:'networkidle'});

await page.evaluate(async({url,key})=>{
  await window.AIService.configureCloud({endpoint:url,accessToken:key});
  await window.AIService.setMode("CLOUD");
},{url:harness.url,key:harness.accessKey});

await page.click('[data-tab="library"]');
await page.waitForTimeout(400);
const vorher=harness.calls.filter(c=>!c.liste).length;
await page.setInputFiles('#file-import',PDF);
await page.waitForTimeout(1500);
if(await page.isVisible('text=Text verwenden').catch(()=>false))await page.click('text=Text verwenden');
await page.waitForFunction(()=>document.body.innerText.includes("skript-24-seiten.pdf"),{timeout:90000}).catch(()=>{});
await page.waitForTimeout(3000);

const stand=await page.evaluate(async()=>{
  const open=()=>new Promise(r=>{const q=indexedDB.open("lernapp-pwa",2);q.onsuccess=()=>r(q.result);});
  const all=async s=>{const db=await open();return new Promise(r=>{const tx=db.transaction(s,"readonly");const g=tx.objectStore(s).getAll();g.onsuccess=()=>{r(g.result||[]);db.close();};});};
  const docs=await all("documents"), goals=await all("goals"), cards=await all("flashcards");
  return {seiten:docs[0]?.pages?.length||0,processing:docs[0]?.processing,goals:goals.length,cards:cards.length,
    seitenZahlen:[...new Set(goals.map(g=>g.sourcePage))].sort((a,b)=>a-b)};
});
const aufrufe=harness.calls.filter(c=>!c.liste).length-vorher;
step('24 Seiten importiert',stand.seiten===24,`${stand.seiten} Seiten, ${stand.goals} Lernziele, ${stand.cards} Karten`);
// Ungebuendelt waere es ein Aufruf je Seite plus die Kartenstapel.
step('Gebuendelt statt Seite fuer Seite',aufrufe<stand.seiten,`${aufrufe} Aufrufe statt ${stand.seiten}+ ohne Buendelung`);
step('Lernziele verteilen sich ueber die Seiten',stand.seitenZahlen.length>=5,`Seiten ${stand.seitenZahlen.slice(0,8).join(", ")} …`);
step('Verarbeitungsstatus nennt die Aufrufe',Number.isFinite(stand.processing?.aiRequests),`${stand.processing?.aiRequests} Aufrufe protokolliert`);
step('Fortschrittszeile ist wieder weg',!(await page.isVisible('.import-progress')));

const usage=await page.evaluate(()=>window.AIService.usage(1));
step('Tokens des Imports sind erfasst',usage.month.tokensIn>0,`${usage.month.tokensIn} Eingabe-Tokens für das ganze Skript`);

// Faellt die Cloud aus, darf kein halbfertiges Material zurueckbleiben und
// keine Einblendung weiterlaufen.
harness.katalogSetzen([]);
await page.setInputFiles('#file-import',PDF);
await page.waitForTimeout(1200);
if(await page.isVisible('text=Text verwenden').catch(()=>false))await page.click('text=Text verwenden');
await page.waitForSelector('#import-failure-close',{timeout:90000}).catch(()=>{});
const fehler=await page.evaluate(()=>({
  sheet:Boolean(document.querySelector('#import-failure-close')),
  text:document.querySelector('#modal-content')?.innerText||'',
  fortschritt:Boolean(document.querySelector('.import-progress'))
}));
step('Fehlschlag erscheint als Blatt, nicht als Browserdialog',fehler.sheet);
step('Fehlschlag erklaert den naechsten Schritt',/LOCAL|Verbindung testen|Modell/.test(fehler.text),fehler.text.split("\n").find(z=>z.length>40)?.slice(0,80));
step('Keine Fortschrittszeile mehr im Hintergrund',!fehler.fortschritt);
await page.click('#import-failure-close').catch(()=>{});
await page.waitForTimeout(500);

const rest=await page.evaluate(async()=>{
  const open=()=>new Promise(r=>{const q=indexedDB.open("lernapp-pwa",2);q.onsuccess=()=>r(q.result);});
  const all=async s=>{const db=await open();return new Promise(r=>{const tx=db.transaction(s,"readonly");const g=tx.objectStore(s).getAll();g.onsuccess=()=>{r(g.result||[]);db.close();};});};
  return {docs:(await all("documents")).length};
});
step('Kein halbfertiges Material zurueckgeblieben',rest.docs===1,`${rest.docs} Dokument(e)`);

if(errors.length){failures++;console.log('\nKonsolenfehler: '+JSON.stringify(errors,null,1));}
else console.log('\nKonsolenfehler: keine');
await browser.close();
await harness.stop();
console.log(failures?`\n${failures} Pruefung(en) fehlgeschlagen.`:'\nAlle Pruefungen bestanden.');
process.exit(failures?1:0);
