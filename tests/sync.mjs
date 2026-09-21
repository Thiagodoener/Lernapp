// Spielt den Geraeteabgleich aus Kapitel 23 mit zwei unabhaengigen Clients
// gegen den echten Worker-Code durch. Jeder Browserkontext hat eine eigene
// IndexedDB und einen eigenen Geraeteschluessel, verhaelt sich also wie ein
// zweites Geraet.
//
// Aufruf:
//   npx http-server -p 8099 -s .
//   node tests/sync.mjs [http://127.0.0.1:8099]
import {chromium} from 'playwright';
import {startWorkerHarness} from './worker-harness.mjs';

const BASE=process.argv[2]||'http://127.0.0.1:8099';
let failures=0;
const step=(name,ok,extra='')=>{if(!ok)failures++;console.log(`${ok?'OK  ':'FEHL'} ${name}${extra?' · '+extra:''}`);};

const harness=await startWorkerHarness({port:8792,allowedOrigin:BASE.replace(/\/$/,'')});
const browser=await chromium.launch();
const errors=[];

async function openDevice(name){
  const ctx=await browser.newContext();
  const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
  page.on('console',m=>{if(m.type()==='error')errors.push(`${name}: ${m.text()}`);});
  await page.goto(BASE,{waitUntil:'networkidle'});
  await page.evaluate(async({url,key})=>{
    await window.AIService.configureCloud({endpoint:url,accessToken:key});
  },{url:harness.url,key:harness.accessKey});
  return {ctx,page,name};
}

// var statt const: in einem eval sind const-Bindungen auf dessen eigenen
// Block beschraenkt und im umgebenden Code nicht sichtbar.
const helpers=`
  var open=()=>new Promise((res,rej)=>{const r=indexedDB.open("lernapp-pwa",2);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
  var put=async(s,v)=>{const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(s,"readwrite");tx.objectStore(s).put({...v,updatedAt:new Date().toISOString()});tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();rej(tx.error);};});};
  var all=async(s)=>{const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(s,"readonly"),r=tx.objectStore(s).getAll();r.onsuccess=()=>{res(r.result||[]);db.close();};r.onerror=()=>rej(r.error);});};
  var del=async(s,id)=>{const db=await open();await new Promise((res,rej)=>{const tx=db.transaction(s,"readwrite");tx.objectStore(s).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();await window.LernappSync.recordDeletion(s,[id]);};
`;

const a=await openDevice('Gerät A');
const b=await openDevice('Gerät B');

// Gerät A legt Material an und gleicht ab.
await a.page.evaluate(async(h)=>{
  eval(h);
  const mod=(await all("modules"))[0];
  await put("goals",{id:"gA",moduleId:mod.id,documentId:"dA",sourcePage:1,statement:"Ziel von A",createdAt:new Date().toISOString()});
  await window.LernappSync.sync();
},helpers);
step('Gerät A laedt hoch',harness.kvSize()===1);

// Gerät B ist frisch installiert: sein leeres Standardmodul muss dem
// vorhandenen weichen, statt daneben stehen zu bleiben.
const ersterAbgleichB=await b.page.evaluate(async(h)=>{
  eval(h);
  await window.LernappSync.sync();
  return {module:(await all("modules")).length,goals:(await all("goals")).map(g=>g.id)};
},helpers);
step('Leeres Standardmodul weicht dem vorhandenen',ersterAbgleichB.module===1,`${ersterAbgleichB.module} Modul(e)`);
step('Gerät B erhaelt den Stand von A',ersterAbgleichB.goals.join(",")==="gA",ersterAbgleichB.goals.join(","));

// Gerät B ergaenzt ein eigenes Ziel: beide muessen erhalten bleiben.
const nachB=await b.page.evaluate(async(h)=>{
  eval(h);
  const mod=(await all("modules"))[0];
  await put("goals",{id:"gB",moduleId:mod.id,documentId:"dB",sourcePage:1,statement:"Ziel von B",createdAt:new Date().toISOString()});
  await window.LernappSync.sync();
  return {goals:(await all("goals")).map(g=>g.id).sort()};
},helpers);
step('Gerät B behaelt beide Datensaetze',nachB.goals.join(",")==="gA,gB",nachB.goals.join(","));

// Gerät A holt das Ziel von B.
const nachA=await a.page.evaluate(async(h)=>{
  eval(h);
  await window.LernappSync.sync();
  return (await all("goals")).map(g=>g.id).sort();
},helpers);
step('Gerät A holt das Ziel von B',nachA.join(",")==="gA,gB",nachA.join(","));

// Derselbe Datensatz, neuere Fassung gewinnt.
await b.page.evaluate(async(h)=>{
  eval(h);
  const mod=(await all("modules"))[0];
  await put("goals",{id:"gA",moduleId:mod.id,documentId:"dA",sourcePage:1,statement:"Von B ueberarbeitet",createdAt:new Date().toISOString()});
  await window.LernappSync.sync();
},helpers);
const bearbeitet=await a.page.evaluate(async(h)=>{
  eval(h);
  await window.LernappSync.sync();
  return (await all("goals")).find(g=>g.id==="gA")?.statement;
},helpers);
step('Neuere Fassung desselben Datensatzes gewinnt',bearbeitet==="Von B ueberarbeitet",bearbeitet);

// Loeschung auf A darf auf B nicht wieder auferstehen.
await a.page.evaluate(async(h)=>{
  eval(h);
  await del("goals","gB");
  await window.LernappSync.sync();
},helpers);
const nachLoeschung=await b.page.evaluate(async(h)=>{
  eval(h);
  await window.LernappSync.sync();
  return (await all("goals")).map(g=>g.id).sort();
},helpers);
step('Loeschmarke verhindert Wiederauferstehung',nachLoeschung.join(",")==="gA",nachLoeschung.join(","));
const zurueck=await a.page.evaluate(async(h)=>{
  eval(h);
  await window.LernappSync.sync();
  return (await all("goals")).map(g=>g.id).sort();
},helpers);
step('Geloeschtes kommt auch auf A nicht zurueck',zurueck.join(",")==="gA",zurueck.join(","));

// Verbindungsdaten bleiben geraetelokal.
const abgelegt=await a.page.evaluate(async({url,key})=>{
  const stand=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","X-Lernapp-Key":key},
    body:JSON.stringify({task:"syncPull",payload:{}})}).then(r=>r.json());
  const app=(stand?.data?.stores?.settings||[]).find(r=>r.id==="app")||{};
  return {endpoint:app.cloudEndpoint,token:app.cloudAccessToken,felder:Object.keys(app).length};
},{url:harness.url,key:harness.accessKey});
step('Endpunkt und Schluessel liegen nicht beim Proxy',abgelegt.endpoint===undefined&&abgelegt.token===undefined,`${abgelegt.felder} Felder abgelegt`);
const eigeneVerbindung=await Promise.all([a,b].map(d=>d.page.evaluate(()=>window.AIService.getCloudConfig())));
step('Beide Geraete behalten ihre eigene Verbindung',eigeneVerbindung.every(c=>c.endpoint&&c.hasAccessToken));

// Revisionsschutz: ein Stand, den das Geraet nicht gesehen hat, wird nicht ueberschrieben.
const konflikt=await a.page.evaluate(async({url,key})=>{
  const antwort=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","X-Lernapp-Key":key},
    body:JSON.stringify({task:"syncPush",payload:{baseRevision:0,data:{stores:{}},deviceId:"fremd"}})}).then(r=>r.json());
  return antwort;
},{url:harness.url,key:harness.accessKey});
step('Veraltete Revision wird als Konflikt abgewiesen',konflikt?.conflict===true,`Revision ${konflikt?.revision}`);

// Fortschrittsverlauf und Nutzungsprotokoll werden vereinigt statt ueberschrieben.
const vereinigt=await (async()=>{
  await a.page.evaluate(async(h)=>{eval(h);await put("settings",{id:"mastery-history",entries:[{key:"m:2026-09-01",moduleId:"m",date:"2026-09-01",mastery:.4}]});await window.LernappSync.sync();},helpers);
  await b.page.evaluate(async(h)=>{eval(h);await put("settings",{id:"mastery-history",entries:[{key:"m:2026-09-02",moduleId:"m",date:"2026-09-02",mastery:.6}]});await window.LernappSync.sync();},helpers);
  return a.page.evaluate(async(h)=>{eval(h);await window.LernappSync.sync();return ((await all("settings")).find(r=>r.id==="mastery-history")?.entries||[]).map(e=>e.date).sort();},helpers);
})();
step('Fortschrittsverlauf wird vereinigt',vereinigt.join(",")==="2026-09-01,2026-09-02",vereinigt.join(","));

if(errors.length){failures++;console.log('\nKonsolenfehler: '+JSON.stringify(errors,null,1));}
else console.log('\nKonsolenfehler: keine');
await browser.close();
await harness.stop();
console.log(failures?`\n${failures} Pruefung(en) fehlgeschlagen.`:'\nAlle Pruefungen bestanden.');
process.exit(failures?1:0);
