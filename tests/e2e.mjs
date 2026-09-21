// End-to-End-Pruefung der in einem Browser pruefbaren Abnahmekriterien aus
// Kapitel 35 der Masterspezifikation. Laeuft gegen die ausgelieferte PWA, nicht
// gegen einzelne Funktionen: Import, Lernziele, Karten, FSRS, Evidence, Mastery,
// Stabilitaet, freie Antwort, Pruefung, Simulation, Selbstcheck und Loeschen.
//
// Aufruf:
//   npx http-server -p 8099 -s .
//   node tests/e2e.mjs [http://127.0.0.1:8099]
//
// Die Abnahmekriterien 18 bis 20 (Offline-Neustart, Moduswechsel und CLOUD am
// echten Proxy) stehen in tests/offline.mjs beziehungsweise brauchen ein
// Deployment und ein echtes Geraet.
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const BASE=process.argv[2]||'http://127.0.0.1:8099';
const PDF=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures','zellbiologie.pdf');
if(!fs.existsSync(PDF)){console.error('Test-PDF fehlt:',PDF);process.exit(1);}
let failures=0;
const browser=await chromium.launch();const ctx=await browser.newContext();const page=await ctx.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const step=(n,ok,extra='')=>{if(!ok)failures++;console.log(`${ok?'OK  ':'FEHL'} ${n}${extra?' · '+extra:''}`);};
await page.goto(BASE,{waitUntil:'networkidle'});
step('1 App startet',await page.isVisible('[data-tab="today"]'));

// 2 Modul vorhanden
const mod=await page.evaluate(async()=>{const o=()=>new Promise(r=>{const q=indexedDB.open("lernapp-pwa",2);q.onsuccess=()=>r(q.result);});const db=await o();return new Promise(r=>{const tx=db.transaction("modules","readonly");const g=tx.objectStore("modules").getAll();g.onsuccess=()=>{r(g.result[0]?.title);db.close();};});});
step('2 Modul angelegt',Boolean(mod),mod);

// 3 PDF importieren (LOCAL, ohne Cloud)
await page.click('[data-tab="library"]');await page.waitForTimeout(400);
await page.setInputFiles('#file-import',PDF);
// Leseart-Rueckfrage beantworten, falls sie erscheint
await page.waitForTimeout(1500);
const askVisible=await page.isVisible('text=Text verwenden').catch(()=>false);
if(askVisible){await page.click('text=Text verwenden');}
await page.waitForFunction(()=>document.body.innerText.includes("zellbiologie.pdf"),{timeout:60000}).catch(()=>{});
await page.waitForTimeout(3000);
const imported=await page.evaluate(async()=>{
  const o=()=>new Promise(r=>{const q=indexedDB.open("lernapp-pwa",2);q.onsuccess=()=>r(q.result);});
  const all=async s=>{const db=await o();return new Promise(r=>{const tx=db.transaction(s,"readonly");const g=tx.objectStore(s).getAll();g.onsuccess=()=>{r(g.result||[]);db.close();};});};
  const docs=await all("documents"),goals=await all("goals"),cards=await all("flashcards");
  return {docs:docs.length,pages:docs[0]?.pages?.length,extraction:docs[0]?.pages?.map(p=>p.extraction),goals:goals.length,cards:cards.length,processing:docs[0]?.processing};
});
step('3 PDF-Import mit Textebene',imported.docs===1&&imported.pages===2&&imported.extraction?.every(x=>x==="PDF_TEXT"),JSON.stringify({seiten:imported.pages,leseart:imported.extraction}));
step('4 Lernziele erzeugt',imported.goals>0,`${imported.goals} Lernziele`);
step('5 Karteikarten erzeugt',imported.cards>0,`${imported.cards} Karten`);
step('6 Verarbeitungsstatus gespeichert',Boolean(imported.processing?.finishedAt),JSON.stringify(imported.processing?.extraction));

// 7 Quellenbezug
const src=await page.evaluate(async()=>{const o=()=>new Promise(r=>{const q=indexedDB.open("lernapp-pwa",2);q.onsuccess=()=>r(q.result);});const db=await o();return new Promise(r=>{const tx=db.transaction("goals","readonly");const g=tx.objectStore("goals").getAll();g.onsuccess=()=>{const x=g.result[0];r({page:x?.sourcePage,snippet:(x?.sourceSnippet||"").slice(0,40),doc:Boolean(x?.documentId)});db.close();};});});
step('7 Lernziel mit Quelle',Boolean(src.doc&&src.page),`Seite ${src.page}: ${src.snippet}…`);

// 7b Highlights priorisieren statt der Reihe nach zu nehmen
await page.click('[data-doc]');await page.waitForTimeout(500);
const highlights=await page.evaluate(()=>[...document.querySelectorAll('.highlight')].map(h=>({
  text:h.childNodes[0]?.textContent?.trim()||'',quelle:h.querySelector('.source')?.textContent||''})));
step('7b Highlights mit Quelle und Begruendung',highlights.length>0&&highlights.every(h=>/Seite \d+ · /.test(h.quelle)),
  `${highlights.length} Highlights, z. B. „${highlights[0]?.text.slice(0,45)}…" (${highlights[0]?.quelle})`);
step('7c Keine Verweis- und Ueberleitungssaetze',!highlights.some(h=>/^(Abbildung|Siehe|Im Folgenden|Vgl\.)/i.test(h.text)));
await page.evaluate(()=>document.querySelector('#modal')?.close());await page.waitForTimeout(200);

// 8 Review mit FSRS
await page.click('[data-tab="learn"]');await page.waitForTimeout(700);
const due=await page.textContent('.hero-value');
await page.click('#start-review');await page.waitForTimeout(400);
await page.click('#reveal');await page.waitForTimeout(200);
await page.click('[data-rate="3"]');await page.waitForTimeout(1200);
const fsrs=await page.evaluate(async()=>{const o=()=>new Promise(r=>{const q=indexedDB.open("lernapp-pwa",2);q.onsuccess=()=>r(q.result);});const all=async s=>{const db=await o();return new Promise(r=>{const tx=db.transaction(s,"readonly");const g=tx.objectStore(s).getAll();g.onsuccess=()=>{r(g.result||[]);db.close();};});};
  const c=(await all("flashcards")).find(x=>x.reviewCount>0);const ev=(await all("evidence"))[0];const m=(await all("mastery")).find(x=>x.evidenceCount>0);
  return {due:c?.dueAt,stability:c?.fsrsCard?.stability,reps:c?.reviewCount,evidence:ev&&{provider:ev.evaluationProvider,policy:ev.evaluationPolicy,source:ev.source,dauer:ev.durationMs>0},mastery:m&&{status:m.status,stability:m.stability}};
});
step('8 FSRS-Review terminiert neu',Boolean(fsrs.due&&fsrs.reps===1&&fsrs.stability>0),`faellig ${String(fsrs.due).slice(0,10)}, Stabilitaet ${Number(fsrs.stability).toFixed(1)} Tage`);
step('9 Evidence vollstaendig',Boolean(fsrs.evidence?.provider&&fsrs.evidence?.policy&&fsrs.evidence?.source&&fsrs.evidence?.dauer),JSON.stringify(fsrs.evidence));
step('10 Mastery und Stabilitaet aktualisiert',Boolean(fsrs.mastery?.status&&fsrs.mastery?.stability),JSON.stringify(fsrs.mastery));

// 11 Selbsttest (freie Antwort, LOCAL)
await page.evaluate(()=>document.querySelector('#modal')?.close());
await page.waitForTimeout(300);
await page.click('[data-tab="library"]');await page.waitForTimeout(600);
await page.click('[data-open-goal]');await page.waitForTimeout(400);
await page.fill('#self-answer','Die Zelle ist die kleinste lebensfaehige Einheit aller bekannten Lebewesen.');
await page.click('#self-submit');await page.waitForTimeout(1500);
const selfResult=await page.textContent('#self-result');
step('11 Freie Antwort bewertet',Boolean(selfResult&&selfResult.includes('%')),selfResult?.replace(/\n/g,' ').slice(0,70));
await page.evaluate(()=>document.querySelector('#modal')?.close());await page.waitForTimeout(300);

// 12 Pruefung anlegen und Readiness
await page.click('[data-tab="progress"]');await page.waitForTimeout(700);
await page.click('#add-exam');await page.waitForTimeout(300);
await page.fill('#new-exam-title','Klausur Zellbiologie');
const d=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
await page.fill('#new-exam-date',d);
await page.click('#save-exam');await page.waitForTimeout(1200);
const prog=await page.evaluate(()=>document.body.innerText);
step('12 Pruefung mit Termin und Bereitschaft',prog.includes('Prüfungsbereitschaft')&&prog.includes('Klausur Zellbiologie'),(prog.match(/Prüfungsbereitschaft[\s\S]{0,12}/)||[''])[0].replace(/\n/g,' '));
step('13 Alle vier Anteile ausgewiesen',['Inhaltsabdeckung','Geprüfte Lernziele','Mastery','Stabilität'].every(x=>prog.includes(x)));

await page.evaluate(()=>document.querySelector('#modal')?.close());await page.waitForTimeout(200);
// 14 Pruefungssimulation inkl. unbeantworteter Frage
await page.click('#start-exam');await page.waitForTimeout(1200);
await page.fill('#exam-answer','Die Zellmembran trennt das Innere der Zelle von der Umgebung.');
await page.click('#exam-submit');await page.waitForTimeout(2000);
await page.click('#exam-finish');await page.waitForTimeout(1500);
const sim=await page.evaluate(async()=>{const o=()=>new Promise(r=>{const q=indexedDB.open("lernapp-pwa",2);q.onsuccess=()=>r(q.result);});const db=await o();return new Promise(r=>{const tx=db.transaction("examSessions","readonly");const g=tx.objectStore("examSessions").getAll();g.onsuccess=()=>{const s=g.result.find(x=>x.status==="COMPLETED");r(s&&{fragen:s.items.length,beantwortet:s.answeredCount,score:s.overallScore,unbeantwortetNull:s.items.filter(i=>!i.answeredAt).every(i=>(i.score??0)===0)});db.close();};});});
step('14 Simulation wertet unbeantwortet als 0',Boolean(sim&&sim.unbeantwortetNull),JSON.stringify(sim));

await page.evaluate(()=>document.querySelector('#modal')?.close());await page.waitForTimeout(200);
// 15 Tagesplan reagiert
await page.click('[data-tab="today"]');await page.waitForTimeout(1200);
const heute=await page.evaluate(()=>document.body.innerText);
step('15 Tagesplan vorhanden',/Tagesplan/.test(heute)&&/Prüfungsbereit|Prüfen|Neu lernen|Wiederholen|Lücke/.test(heute));

// 16 Selbstcheck
const audit=await page.evaluate(async()=>(await window.LernappAudit.run()).map(f=>`${f.status} ${f.label}`));
step('16 Selbstcheck ohne FAIL',audit.every(x=>!x.startsWith('FAIL')),audit.filter(x=>!x.startsWith('OK')).join(' | ')||'alles OK');

await page.evaluate(()=>document.querySelector('#modal')?.close());await page.waitForTimeout(200);
// 17 Material loeschen mit Cascade
await page.click('[data-tab="library"]');await page.waitForTimeout(600);
await page.click('[data-doc]');await page.waitForTimeout(500);
await page.click('#lernapp-delete-material');await page.waitForTimeout(400);
await page.click('#lernapp-delete-confirm');await page.waitForTimeout(2000);
const nach=await page.evaluate(async()=>{const o=()=>new Promise(r=>{const q=indexedDB.open("lernapp-pwa",2);q.onsuccess=()=>r(q.result);});const all=async s=>{const db=await o();return new Promise(r=>{const tx=db.transaction(s,"readonly");const g=tx.objectStore(s).getAll();g.onsuccess=()=>{r(g.result||[]);db.close();};});};
  return {docs:(await all("documents")).length,goals:(await all("goals")).length,cards:(await all("flashcards")).length,evidence:(await all("evidence")).length,mastery:(await all("mastery")).length,gaps:(await all("gaps")).length};});
step('17 Loeschen raeumt vollstaendig auf',Object.values(nach).every(v=>v===0),JSON.stringify(nach));

if(errors.length){failures++;console.log('\nKonsolenfehler: '+JSON.stringify(errors,null,1));}
else console.log('\nKonsolenfehler: keine');
await browser.close();
console.log(failures?`\n${failures} Pruefung(en) fehlgeschlagen.`:'\nAlle Pruefungen bestanden.');
process.exit(failures?1:0);
