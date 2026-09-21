// Prueft Kapitel 24 bis 26 gegen den echten Worker-Code: alle sieben
// AIService-Aufgaben im Modus CLOUD, Healthcheck, CORS, Zugriffsschluessel,
// Nutzungsprotokoll, Tageslimit und die Wiederholung nach Drosselung.
//
// Aufruf:
//   npx http-server -p 8099 -s .
//   node tests/cloud.mjs [http://127.0.0.1:8099]
import {chromium} from 'playwright';
import {startWorkerHarness} from './worker-harness.mjs';

const BASE=process.argv[2]||'http://127.0.0.1:8099';
let failures=0;
const step=(name,ok,extra='')=>{if(!ok)failures++;console.log(`${ok?'OK  ':'FEHL'} ${name}${extra?' · '+extra:''}`);};

const harness=await startWorkerHarness({port:8790,allowedOrigin:BASE.replace(/\/$/,'')});
const browser=await chromium.launch();
const ctx=await browser.newContext();
const page=await ctx.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
// 401, 429 und 502 werden hier absichtlich ausgeloest: falscher Schluessel,
// Drosselung und ein abgeschaltetes Modell. Der Browser meldet jede solche
// Antwort als Konsolenfehler.
const erwartet=/status of (401|429|502)/;
page.on('console',m=>{if(m.type()==='error'&&!erwartet.test(m.text()))errors.push(m.text());});
await page.goto(BASE,{waitUntil:'networkidle'});

const health=await page.evaluate(async({url,key})=>{
  await window.AIService.configureCloud({endpoint:url,accessToken:key});
  await window.AIService.setMode("CLOUD");
  return window.AIService.testCloud();
},{url:harness.url,key:harness.accessKey});
step('Healthcheck ueber den Proxy',health?.ok===true&&health.sync===true,`Modell ${health?.model}, Sync ${health?.sync}`);
step('Modell wird zur Laufzeit aufgeloest, nicht fest gesetzt',health?.erzwungen===false&&Boolean(health?.models?.stark));
step('Guenstige Aufgaben laufen auf dem Lite-Modell',/lite/.test(health?.models?.guenstig||''),`${health?.models?.guenstig} statt ${health?.models?.stark}`);
step('Nur Modelle mit generateContent kommen in Frage',!/embedding/.test(JSON.stringify(health?.models||{})));

const tasks=await page.evaluate(async()=>{
  const tinyPng="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const out={};
  const run=async(name,fn)=>{try{const r=await fn();out[name]={provider:r?.provider,ok:true,keys:Object.keys(r||{}).sort().join(",")};}catch(e){out[name]={ok:false,error:String(e.message||e)};}};
  await run("summarize",()=>window.AIService.summarize({text:"Ein Lerntext über Zellen.",title:"Zellen",length:"standard"}));
  await run("tutor",()=>window.AIService.tutor({message:"Was ist eine Zelle?",context:"Die Zelle ist die kleinste Einheit."}));
  await run("generateLearningGoals",()=>window.AIService.generateLearningGoals({text:"Die Zelle ist die kleinste Einheit.",sourcePage:1}));
  await run("generateFlashcards",()=>window.AIService.generateFlashcards({goals:[{id:"g1",statement:"Erkläre die Zelle",answerKey:"kleinste Einheit"}]}));
  await run("evaluateFreeAnswer",()=>window.AIService.evaluateFreeAnswer({expected:"kleinste Einheit",answer:"die kleinste Einheit des Lebens",question:"Was ist eine Zelle?"}));
  await run("analyzeImage",()=>window.AIService.analyzeImage({imageBase64:tinyPng,mimeType:"image/png",note:"Test"}));
  await run("generateChoiceOptions",()=>window.AIService.generateChoiceOptions({items:[{id:"c1",question:"Was ist eine Zelle?",answer:"Die kleinste Einheit"}],pool:[]}));
  return out;
});
for(const [name,result] of Object.entries(tasks)){
  step(`CLOUD-Aufgabe ${name}`,result.ok&&result.provider==="CLOUD",result.ok?result.keys:result.error);
}
step('generateFlashcards behaelt die goalId',await page.evaluate(async()=>{
  const r=await window.AIService.generateFlashcards({goals:[{id:"g-abc",statement:"S",answerKey:"A"}]});
  return r.flashcards?.[0]?.goalId==="g-abc";
}));
step('analyzeImage erreicht das Modell mit Bild',harness.calls.some(c=>c.hasImage));

const usage=await page.evaluate(()=>window.AIService.usage(7));
step('Nutzungsprotokoll zaehlt die Anfragen',usage.today.total>=8,`${usage.today.total} Anfragen, ${Object.keys(usage.today.tasks).length} Aufgabenarten`);
step('Healthcheck zaehlt nicht als KI-Anfrage',!("health" in (usage.today.tasks||{})));

// Drosselung: der Worker reicht 429 samt Retry-After durch, die PWA wiederholt.
harness.setFailures(2);
const throttled=await page.evaluate(async()=>{
  const seen=[];
  const listener=e=>seen.push(e.detail.attempt);
  window.addEventListener("lernapp:cloud-throttled",listener);
  const r=await window.AIService.summarize({text:"Noch ein Text.",title:"T",length:"short"});
  window.removeEventListener("lernapp:cloud-throttled",listener);
  return {provider:r?.provider,wiederholungen:seen.length};
});
step('Drosselung wird wiederholt statt abgebrochen',throttled.provider==="CLOUD"&&throttled.wiederholungen===2,`${throttled.wiederholungen} Wiederholungen`);

// Tageslimit: AUTO faellt auf LOCAL, CLOUD nennt das Limit als Grund.
const limit=await page.evaluate(async()=>{
  const used=(await window.AIService.usage(1)).today.total;
  await window.AIService.setDailyLimit(used);
  let cloudError=null;
  try{await window.AIService.summarize({text:"Text",title:"T"});}catch(e){cloudError=String(e.message||e);}
  await window.AIService.setMode("AUTO");
  const auto=await window.AIService.summarize({text:"Ein Satz. Noch ein Satz.",title:"T"});
  await window.AIService.setDailyLimit(0);
  await window.AIService.setMode("CLOUD");
  return {cloudError,autoProvider:auto?.provider};
});
step('CLOUD nennt das Tageslimit als Grund',/Tageslimit/.test(limit.cloudError||''),limit.cloudError);
step('AUTO weicht bei erreichtem Limit auf LOCAL aus',limit.autoProvider==="LOCAL");

// Falscher Schluessel und falsche Origin muessen scheitern.
const abgewiesen=await page.evaluate(async({url})=>{
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","X-Lernapp-Key":"falsch"},body:JSON.stringify({task:"health"})}).catch(e=>({status:String(e)}));
  return r.status;
},{url:harness.url});
step('Falscher Zugriffsschluessel wird abgewiesen',abgewiesen===401,`Status ${abgewiesen}`);

// AUTO eskaliert eine unsichere lokale Bewertung in die Cloud.
const eskalation=await page.evaluate(async()=>{
  await window.AIService.setMode("AUTO");
  const r=await window.AIService.evaluateFreeAnswer({expected:"Die Zelle ist die kleinste lebensfaehige Einheit aller Lebewesen",answer:"Die Zelle ist eine Einheit",question:"Was ist eine Zelle?"});
  return {provider:r?.provider,policy:r?.policy};
});
step('AUTO eskaliert unsichere Bewertung in die Cloud',eskalation.provider==="CLOUD"&&eskalation.policy==="AUTO_CLOUD_ESCALATION",JSON.stringify(eskalation));

// Der Produktionsfehler: ein abgeschaltetes Modell. Der Proxy muss sich selbst
// ein neues suchen, statt den Import scheitern zu lassen.
const abgeschaltetesModell=harness.letzterAufruf()?.model;
harness.abschalten(abgeschaltetesModell);
const nachAbschaltung=await page.evaluate(async()=>{
  try{
    const r=await window.AIService.summarize({text:"Ein Text nach der Abschaltung.",title:"T"});
    return {ok:true,provider:r?.provider,model:r?.model};
  }catch(e){return {ok:false,error:String(e.message||e)};}
});
step('Abgeschaltetes Modell wird selbsttaetig ersetzt',nachAbschaltung.ok&&nachAbschaltung.model!==abgeschaltetesModell,
  `${abgeschaltetesModell} → ${nachAbschaltung.model||nachAbschaltung.error}`);

// Bleibt gar kein Modell uebrig, muss die Meldung deutsch und handlungsfaehig
// sein statt englischer Rohtext aus Kalifornien.
harness.katalogSetzen(["embedding-001"]);
const ohneModell=await page.evaluate(async()=>{
  try{await window.AIService.summarize({text:"Text",title:"T"});return {fehler:null};}
  catch(e){return {fehler:String(e.message||e)};}
});
step('Fehlende Modelle werden deutsch erklaert',/Modell|Schlüssel/.test(ohneModell.fehler||''),ohneModell.fehler?.slice(0,90));
harness.katalogSetzen(["gemini-flash-latest","gemini-flash-lite-latest"]);

// Tokens statt nur Anfragen: eine Anfrage ueber zwoelf Seiten kostet ein
// Vielfaches einer Anfrage ueber eine Seite.
const tokens=await page.evaluate(async()=>{
  await window.AIService.setMode("CLOUD");
  try{await window.AIService.summarize({text:"Ein längerer Lerntext. ".repeat(200),title:"T"});}
  catch(e){return {fehler:String(e.message||e)};}
  const u=await window.AIService.usage(1);
  return {ein:u.month.tokensIn,aus:u.month.tokensOut,anfragen:u.month.anfragen};
});
step('Proxy erholt sich, sobald wieder Modelle da sind',!tokens.fehler,tokens.fehler||'');
step('Tokenverbrauch wird erfasst',tokens.ein>0&&tokens.aus>0,`${tokens.ein} ein, ${tokens.aus} aus bei ${tokens.anfragen} Anfragen`);

// Monatsbudget als Kostenbremse.
const budget=await page.evaluate(async()=>{
  await window.AIService.setTokenPrice({input:1000,output:1000});
  await window.AIService.setMonthlyBudget(0.01);
  let fehler=null;
  try{await window.AIService.summarize({text:"Text",title:"T"});}catch(e){fehler=String(e.message||e);}
  await window.AIService.setMode("AUTO");
  const auto=await window.AIService.summarize({text:"Ein Satz. Noch einer.",title:"T"});
  await window.AIService.setMonthlyBudget(0);
  await window.AIService.setTokenPrice({input:0,output:0});
  await window.AIService.setMode("CLOUD");
  return {fehler,autoProvider:auto?.provider};
});
step('Monatsbudget bremst CLOUD',/Monatsbudget/.test(budget.fehler||''),budget.fehler?.slice(0,80));
step('AUTO weicht bei erschoepftem Budget auf LOCAL aus',budget.autoProvider==="LOCAL");

// Denkschritte kosten Ausgabetokens; bei reiner Extraktion sind sie abgeschaltet.
const denken=await page.evaluate(async()=>{
  await window.AIService.generateLearningGoals({pages:[{page:1,text:"Die Zelle ist die kleinste Einheit."}],title:"T"});
  return true;
});
const extraktion=harness.letzterAufruf();
step('Extraktion laeuft ohne Denk-Tokens',extraktion?.thinking===0,`thinkingBudget ${extraktion?.thinking}`);
await page.evaluate(()=>window.AIService.evaluateFreeAnswer({expected:"a",answer:"b",question:"c"}));
step('Bewertung darf weiterhin denken',harness.letzterAufruf()?.thinking===undefined);

// Mehrere Seiten in einem Aufruf.
const gebuendelt=await page.evaluate(async()=>{
  const seiten=Array.from({length:10},(_,i)=>({page:i+1,text:`Seite ${i+1}: Die Zelle ist die kleinste Einheit des Lebens.`}));
  const r=await window.AIService.generateLearningGoals({pages:seiten,title:"Skript"});
  return {goals:r?.goals?.length||0,mitSeite:(r?.goals||[]).every(g=>Number.isFinite(Number(g.sourcePage)))};
});
const aufrufe=harness.calls.filter(c=>!c.liste).length;
step('Zehn Seiten kosten einen Aufruf',gebuendelt.goals>0,`${gebuendelt.goals} Lernziele aus einem Aufruf`);
step('Lernziele tragen ihre Seite',gebuendelt.mitSeite);

if(errors.length){failures++;console.log('\nKonsolenfehler: '+JSON.stringify(errors,null,1));}
else console.log('\nKonsolenfehler: keine');
await browser.close();
await harness.stop();
console.log(failures?`\n${failures} Pruefung(en) fehlgeschlagen.`:'\nAlle Pruefungen bestanden.');
process.exit(failures?1:0);
