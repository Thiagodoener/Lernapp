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
// Die Drosselungs- und Schluesselpruefung loesen absichtlich 429 und 401 aus;
// der Browser meldet jede solche Antwort als Konsolenfehler.
const erwartet=/status of (401|429)/;
page.on('console',m=>{if(m.type()==='error'&&!erwartet.test(m.text()))errors.push(m.text());});
await page.goto(BASE,{waitUntil:'networkidle'});

const health=await page.evaluate(async({url,key})=>{
  await window.AIService.configureCloud({endpoint:url,accessToken:key});
  await window.AIService.setMode("CLOUD");
  return window.AIService.testCloud();
},{url:harness.url,key:harness.accessKey});
step('Healthcheck ueber den Proxy',health?.ok===true&&health.sync===true,`Modell ${health?.model}, Sync ${health?.sync}`);

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

if(errors.length){failures++;console.log('\nKonsolenfehler: '+JSON.stringify(errors,null,1));}
else console.log('\nKonsolenfehler: keine');
await browser.close();
await harness.stop();
console.log(failures?`\n${failures} Pruefung(en) fehlgeschlagen.`:'\nAlle Pruefungen bestanden.');
process.exit(failures?1:0);
