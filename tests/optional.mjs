// Prueft die OPTIONAL-Teile aus Kapitel 2 und 20: Wissenslandkarte und
// erweiterte Gamification. Beide leiten sich aus vorhandenen Daten ab und
// duerfen den Wissensstand nicht beeinflussen.
//
// Aufruf:
//   npx http-server -p 8099 -s .
//   node tests/optional.mjs [http://127.0.0.1:8099]
import {chromium} from 'playwright';

const BASE=process.argv[2]||'http://127.0.0.1:8099';
let failures=0;
const step=(name,ok,extra='')=>{if(!ok)failures++;console.log(`${ok?'OK  ':'FEHL'} ${name}${extra?' · '+extra:''}`);};

const browser=await chromium.launch();
const page=await browser.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(BASE,{waitUntil:'networkidle'});

await page.evaluate(async()=>{
  const open=()=>new Promise(r=>{const q=indexedDB.open("lernapp-pwa",2);q.onsuccess=()=>r(q.result);});
  const put=async(s,v)=>{const db=await open();return new Promise(r=>{const tx=db.transaction(s,"readwrite");tx.objectStore(s).put(v);tx.oncomplete=()=>{db.close();r();};});};
  const all=async s=>{const db=await open();return new Promise(r=>{const tx=db.transaction(s,"readonly");const g=tx.objectStore(s).getAll();g.onsuccess=()=>{r(g.result||[]);db.close();};});};
  const mod=(await all("modules"))[0];const now=new Date().toISOString();
  await put("documents",{id:"dK",moduleId:mod.id,title:"Zellbiologie.pdf",kind:"PDF",status:"READY",createdAt:now,
    pages:[{page:1,text:"x",relevant:true},{page:2,text:"y",relevant:true}]});
  const ziele=[
    ["k1","Erkläre den Aufbau der Zellmembran und ihre Durchlässigkeit"],
    ["k2","Erkläre die Funktion der Zellmembran beim Stoffaustausch"],
    ["k3","Beschreibe die Mitochondrien und ihre Rolle in der Atmungskette"],
    ["k4","Erkläre, wie die Atmungskette in den Mitochondrien ATP erzeugt"],
    ["k5","Vergleiche Zellmembran und Atmungskette hinsichtlich ihrer Aufgaben"]
  ];
  for(const [id,statement] of ziele)
    await put("goals",{id,moduleId:mod.id,documentId:"dK",sourcePage:1,statement,answerKey:statement,createdAt:now});
  for(const id of ["k1","k2","k3"])
    await window.LernappMastery.addEvidence({goalId:id,dimension:"RECALL",score:.9,confidence:.8,provider:"LOCAL",policy:"SELF_RATING",source:"FLASHCARD_REVIEW"});
});

await page.click('[data-tab="progress"]');
await page.waitForTimeout(1200);

const karte=await page.evaluate(()=>({
  knoten:document.querySelectorAll('.map-node').length,
  kanten:document.querySelectorAll('.knowledge-map line').length,
  begriffe:[...document.querySelectorAll('.map-node-label')].map(t=>t.textContent).sort()
}));
step('Karte bildet Begriffe aus mehreren Lernzielen',karte.knoten>=2,karte.begriffe.join(", "));
step('Begriffe mit gemeinsamem Lernziel sind verbunden',karte.kanten>=1,`${karte.kanten} Beziehung(en)`);
step('Aufgabenwoerter sind keine Begriffe',!karte.begriffe.some(b=>/^Erkläre|^Beschreibe|^Vergleiche/.test(b)));

await page.click('.map-node');
await page.waitForTimeout(400);
const begriff=await page.evaluate(()=>({
  text:document.querySelector('#modal-content')?.innerText||'',
  ziele:document.querySelectorAll('#modal-content [data-open-goal]').length
}));
step('Begriff fuehrt zu seinen Lernzielen',begriff.ziele>=2&&/Lernziele · Stand/.test(begriff.text),`${begriff.ziele} Lernziele`);
await page.evaluate(()=>document.querySelector('#modal')?.close());
await page.waitForTimeout(200);

const spiel=await page.evaluate(()=>{
  const t=document.querySelector('#gamification-slot')?.innerText||'';
  return {text:t,stufe:(t.match(/Stufe (\d+)/)||[])[1],xp:Number((t.match(/(\d+) XP/)||[])[1]),
    erreicht:[...document.querySelectorAll('.badge-grid .badge.good')].map(b=>b.textContent.trim())};
});
step('Punkte und Stufe werden ausgewiesen',spiel.xp>0&&Number(spiel.stufe)>=1,`Stufe ${spiel.stufe}, ${spiel.xp} XP`);
step('Meilensteine werden vergeben',spiel.erreicht.includes("Erster Nachweis"),spiel.erreicht.join(", "));
step('Die Grenze aus Kapitel 20 steht dabei',/verändern deinen Wissensstand nicht/.test(spiel.text));

// Die Punkteregel selbst: nur Evidence, gewichtet, Wiedererkennen zaehlt halb.
const regel=await page.evaluate(()=>{
  const g=window.LernappGamification;
  return {
    unabhaengig:g.experienceFor({score:1,confidence:1,independentRecall:true}),
    abhaengig:g.experienceFor({score:1,confidence:1,independentRecall:false}),
    falsch:g.experienceFor({score:0,confidence:.8,independentRecall:true}),
    unsicher:g.experienceFor({score:1,confidence:.35,independentRecall:true}),
    stufen:[0,60,240,540,960].map(x=>g.levelFor(x).level)
  };
});
step('Wiedererkennen zaehlt halb',Math.abs(regel.abhaengig-regel.unabhaengig/2)<1e-9);
step('Falsche Antwort bringt kaum Punkte',regel.falsch<regel.unabhaengig*.2,`${regel.falsch.toFixed(1)} statt ${regel.unabhaengig.toFixed(1)}`);
step('Niedrige Confidence bringt weniger',regel.unsicher<regel.unabhaengig*.5);
step('Stufen wachsen quadratisch',regel.stufen.join(",")==="1,2,3,4,5",regel.stufen.join(","));

// Kap. 20: Oeffnen und Lesen darf nichts bringen.
const ohneAktivitaet=await page.evaluate(async()=>{
  const vorher=Number((document.querySelector('#gamification-slot').innerText.match(/(\d+) XP/)||[])[1]);
  for(const tab of ["today","library","learn","profile","progress"]){
    document.querySelector(`[data-tab="${tab}"]`).click();
    await new Promise(r=>setTimeout(r,320));
  }
  await new Promise(r=>setTimeout(r,600));
  const nachher=Number((document.querySelector('#gamification-slot').innerText.match(/(\d+) XP/)||[])[1]);
  return {vorher,nachher};
});
step('Bloesses Oeffnen bringt keine Punkte',ohneAktivitaet.vorher===ohneAktivitaet.nachher,
  `${ohneAktivitaet.vorher} vor und nach dem Durchklicken`);

// Und der Wissensstand bleibt davon unberuehrt.
const masteryUnveraendert=await page.evaluate(async()=>{
  const open=()=>new Promise(r=>{const q=indexedDB.open("lernapp-pwa",2);q.onsuccess=()=>r(q.result);});
  const db=await open();
  return new Promise(r=>{const tx=db.transaction("mastery","readonly");const g=tx.objectStore("mastery").getAll();
    g.onsuccess=()=>{r(g.result.filter(m=>m.status!=="NOT_ASSESSED").length);db.close();};});
});
step('Wissensstand bleibt unberuehrt',masteryUnveraendert===3,`${masteryUnveraendert} geprüfte Lernziele`);

if(errors.length){failures++;console.log('\nKonsolenfehler: '+JSON.stringify(errors,null,1));}
else console.log('\nKonsolenfehler: keine');
await browser.close();
console.log(failures?`\n${failures} Pruefung(en) fehlgeschlagen.`:'\nAlle Pruefungen bestanden.');
process.exit(failures?1:0);
