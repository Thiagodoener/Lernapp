const AUDIT_DB_NAME="lernapp-pwa";
const AUDIT_DB_VERSION=2;
const AUDIT_STORES=[
  "modules","documents","goals","flashcards","reviews",
  "evidence","mastery","gaps","plans","settings",
  "exams","examSessions"
];
const AUDIT_DUPLICATE_THRESHOLD=0.8;
const AUDIT_SAMPLE=8;

function auditOpenDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(AUDIT_DB_NAME,AUDIT_DB_VERSION);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function auditReadAll(){
  const db=await auditOpenDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(AUDIT_STORES,"readonly");
    const data={};
    for(const store of AUDIT_STORES){
      tx.objectStore(store).getAll().onsuccess=event=>{data[store]=event.target.result||[];};
    }
    tx.oncomplete=()=>{db.close();resolve(data);};
    tx.onerror=()=>{db.close();reject(tx.error);};
  });
}

function auditEsc(value=""){
  return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
}

function auditWords(text){
  return new Set(String(text||"").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=4||/^\p{N}+$/u.test(w)));
}

function auditSimilarity(a,b){
  if(!a.size||!b.size)return 0;
  let shared=0;
  a.forEach(w=>{if(b.has(w))shared++;});
  return shared/(a.size+b.size-shared);
}

function percent(part,total){return total?Math.round((part/total)*100):0;}
function finding(id,label,status,detail,items=[]){return {id,label,status,detail,items};}

// --- Einzelprüfungen -------------------------------------------------------

function auditCoverage(data){
  const goalsByPage=new Set(data.goals.map(g=>`${g.documentId}:${g.sourcePage}`));
  let relevantPages=0,coveredPages=0;
  for(const doc of data.documents){
    for(const page of doc.pages||[]){
      if(page.relevant===false)continue;
      relevantPages++;
      if(goalsByPage.has(`${doc.id}:${page.page}`))coveredPages++;
    }
  }
  const goalsWithCard=new Set(data.flashcards.map(c=>c.goalId));
  const practisable=data.goals.filter(g=>goalsWithCard.has(g.id)).length;
  const assessed=new Set(data.evidence.map(e=>e.goalId));
  const evaluated=data.goals.filter(g=>assessed.has(g.id)).length;

  const source=percent(coveredPages,relevantPages);
  const goalCoverage=percent(practisable,data.goals.length);
  const assessment=percent(evaluated,data.goals.length);
  const weakest=Math.min(source,goalCoverage,assessment);
  return finding("coverage","Coverage",weakest>=60?"OK":weakest>=30?"WARN":"FAIL",
    `Quellen ${source} % · Lernziele mit Karte ${goalCoverage} % · geprüfte Lernziele ${assessment} %`,
    [
      `${coveredPages} von ${relevantPages} lernrelevanten Seiten haben ein Lernziel`,
      `${practisable} von ${data.goals.length} Lernzielen haben mindestens eine Karteikarte`,
      `${evaluated} von ${data.goals.length} Lernzielen haben mindestens eine Evidence`
    ]);
}

function auditOrphans(data){
  const documentIds=new Set(data.documents.map(d=>d.id));
  const goalIds=new Set(data.goals.map(g=>g.id));
  const cardIds=new Set(data.flashcards.map(c=>c.id));
  const moduleIds=new Set(data.modules.map(m=>m.id));
  const problems=[];
  for(const goal of data.goals){
    if(goal.documentId&&!documentIds.has(goal.documentId))problems.push(`Lernziel ohne Material: ${goal.statement||goal.id}`);
    if(goal.moduleId&&!moduleIds.has(goal.moduleId))problems.push(`Lernziel ohne Modul: ${goal.statement||goal.id}`);
  }
  for(const card of data.flashcards)if(!goalIds.has(card.goalId))problems.push(`Karteikarte ohne Lernziel: ${card.prompt||card.id}`);
  for(const item of data.evidence)if(!goalIds.has(item.goalId))problems.push(`Evidence ohne Lernziel: ${item.id}`);
  for(const item of data.mastery)if(!goalIds.has(item.goalId))problems.push(`Mastery ohne Lernziel: ${item.id}`);
  for(const item of data.gaps)if(!goalIds.has(item.goalId))problems.push(`Wissenslücke ohne Lernziel: ${item.id}`);
  for(const item of data.reviews){
    if(item.cardId&&!cardIds.has(item.cardId))problems.push(`Review ohne Karteikarte: ${item.id}`);
    else if(item.goalId&&!goalIds.has(item.goalId))problems.push(`Review ohne Lernziel: ${item.id}`);
  }
  return finding("orphans","Verwaiste Daten",problems.length?"FAIL":"OK",
    problems.length?`${problems.length} Datensätze verweisen auf nicht mehr vorhandene Einträge.`:"Alle Verweise zeigen auf vorhandene Einträge.",
    problems);
}

function auditSourceReferences(data){
  const pagesByDocument=new Map(data.documents.map(d=>[d.id,new Set((d.pages||[]).map(p=>Number(p.page)))]));
  const problems=[];
  for(const goal of data.goals){
    const pages=pagesByDocument.get(goal.documentId);
    if(!pages)continue; // als verwaist bereits erfasst
    if(!pages.has(Number(goal.sourcePage)))problems.push(`Seite ${goal.sourcePage} existiert nicht im Material: ${goal.statement||goal.id}`);
    else if(!String(goal.sourceSnippet||"").trim())problems.push(`Ohne Quellenausschnitt: ${goal.statement||goal.id}`);
  }
  return finding("sourceRefs","Quellenreferenzen",problems.length?"FAIL":"OK",
    problems.length?`${problems.length} Lernziele verweisen auf eine nicht vorhandene Quelle.`:"Alle Lernziele verweisen auf eine vorhandene Quellseite.",
    problems);
}

function auditDuplicates(data){
  const problems=[];
  const byDocument=new Map();
  for(const goal of data.goals){
    const list=byDocument.get(goal.documentId)||[];
    list.push(goal);
    byDocument.set(goal.documentId,list);
  }
  for(const [,goals] of byDocument){
    const seen=[];
    for(const goal of goals){
      const words=auditWords(`${goal.statement||""} ${goal.answerKey||""}`);
      const twin=seen.find(entry=>auditSimilarity(entry.words,words)>=AUDIT_DUPLICATE_THRESHOLD);
      if(twin)problems.push(`Doppeltes Lernziel: ${goal.statement||goal.id}`);
      else seen.push({words});
    }
  }
  const cardsPerGoal=new Map();
  for(const card of data.flashcards)cardsPerGoal.set(card.goalId,(cardsPerGoal.get(card.goalId)||0)+1);
  for(const [goalId,count] of cardsPerGoal){
    if(count>1){
      const manual=data.flashcards.filter(c=>c.goalId===goalId&&c.manual).length;
      // Manuell angelegte Karten sind gewollt; nur automatisch erzeugte Mehrfachkarten sind auffällig.
      if(count-manual>1)problems.push(`${count-manual} automatische Karten für dasselbe Lernziel: ${goalId}`);
    }
  }
  return finding("duplicates","Dubletten",problems.length?"WARN":"OK",
    problems.length?`${problems.length} mögliche Dubletten gefunden.`:"Keine doppelten Lernziele oder Karten gefunden.",
    problems);
}

function auditMasteryInvariants(data){
  const problems=[];
  const masteryByGoal=new Map(data.mastery.map(m=>[m.goalId,m]));
  const evidenceCount=new Map();
  for(const item of data.evidence)evidenceCount.set(item.goalId,(evidenceCount.get(item.goalId)||0)+1);

  for(const goal of data.goals){
    const mastery=masteryByGoal.get(goal.id);
    if(!mastery){problems.push(`Ohne Mastery-Datensatz: ${goal.statement||goal.id}`);continue;}
    const actual=evidenceCount.get(goal.id)||0;
    if((mastery.evidenceCount||0)!==actual)problems.push(`Evidenzzahl stimmt nicht (${mastery.evidenceCount||0} statt ${actual}): ${goal.statement||goal.id}`);
    const values=[mastery.recall,mastery.understanding,mastery.application,mastery.transfer].filter(v=>v!==null&&v!==undefined);
    if(values.some(v=>!Number.isFinite(v)||v<0||v>1))problems.push(`Mastery-Wert außerhalb von 0 bis 1: ${goal.statement||goal.id}`);
    if(!actual&&mastery.status!=="NOT_ASSESSED")problems.push(`Status ${mastery.status} ohne jede Evidence: ${goal.statement||goal.id}`);
    // Kap. 6: MASTERED nur bei ausreichender Evidence und Confidence.
    if(mastery.status==="MASTERED"){
      const average=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
      if(actual<2||(mastery.confidence||0)<0.7||average<0.85)problems.push(`MASTERED ohne ausreichende Belege: ${goal.statement||goal.id}`);
    }
  }
  return finding("mastery","Mastery-Invarianten",problems.length?"FAIL":"OK",
    problems.length?`${problems.length} Verstöße gegen die Mastery-Regeln.`:"Mastery ist mit der Evidence konsistent.",
    problems);
}

function auditFSRS(data){
  const problems=[];
  for(const card of data.flashcards){
    const fsrs=card.fsrsCard;
    if(!fsrs){problems.push(`Karte ohne FSRS-Zustand: ${card.prompt||card.id}`);continue;}
    if(!card.dueAt||Number.isNaN(new Date(card.dueAt).getTime()))problems.push(`Karte ohne gültiges Fälligkeitsdatum: ${card.prompt||card.id}`);
    else if(fsrs.due&&new Date(fsrs.due).getTime()!==new Date(card.dueAt).getTime())problems.push(`Fälligkeit weicht vom FSRS-Zustand ab: ${card.prompt||card.id}`);
    for(const field of ["stability","difficulty"]){
      const value=Number(fsrs[field]);
      if(!Number.isFinite(value)||value<0)problems.push(`${field} ist kein gültiger Wert: ${card.prompt||card.id}`);
    }
    if(Number(card.reviewCount||0)<0||Number(card.lapseCount||0)<0)problems.push(`Negative Zählerstände: ${card.prompt||card.id}`);
  }
  return finding("fsrs","FSRS-Verträge",problems.length?"FAIL":"OK",
    problems.length?`${problems.length} Karten verletzen den FSRS-Vertrag.`:`Alle ${data.flashcards.length} Karten haben einen gültigen FSRS-Zustand.`,
    problems);
}

function auditCascades(data){
  const problems=[];
  const goalsByDocument=new Map();
  for(const goal of data.goals)goalsByDocument.set(goal.documentId,(goalsByDocument.get(goal.documentId)||0)+1);
  for(const doc of data.documents){
    if(!goalsByDocument.get(doc.id))problems.push(`Material ohne Lernziele, Import womöglich abgebrochen: ${doc.title||doc.id}`);
  }
  const cardGoals=new Set(data.flashcards.map(c=>c.goalId));
  const withoutCard=data.goals.filter(g=>!cardGoals.has(g.id));
  if(withoutCard.length)problems.push(`${withoutCard.length} Lernziele ohne Karteikarte`);
  const goalIds=new Set(data.goals.map(g=>g.id));
  for(const plan of data.plans){
    const stale=(plan.tasks||[]).filter(task=>task.goalId&&!goalIds.has(task.goalId));
    if(stale.length)problems.push(`Tagesplan ${plan.date} enthält ${stale.length} Aufgaben zu gelöschten Lernzielen`);
  }
  for(const session of data.examSessions){
    const stale=(session.items||[]).filter(item=>item.goalId&&!goalIds.has(item.goalId));
    if(stale.length)problems.push(`Prüfungssitzung enthält ${stale.length} Aufgaben zu gelöschten Lernzielen`);
  }
  return finding("cascades","Import- und Lösch-Cascades",problems.length?"WARN":"OK",
    problems.length?`${problems.length} Hinweise auf unvollständige Import- oder Löschvorgänge.`:"Keine Reste unvollständiger Vorgänge gefunden.",
    problems);
}

async function auditOfflineCache(){
  if(!("caches" in window))return finding("cache","Offline-Cache","WARN","Dieser Browser stellt keine Cache-API bereit.");
  const names=await caches.keys();
  const own=names.filter(name=>name.startsWith("lernapp-pwa-"));
  if(!own.length)return finding("cache","Offline-Cache","FAIL","Kein Lernapp-Cache vorhanden. Offline-Start ist nicht gesichert.",names);
  // Erwartet wird, was diese Seite tatsächlich lädt, statt einer zweiten Liste
  // neben dem Service Worker, die auseinanderlaufen könnte.
  const expected=[
    ...[...document.querySelectorAll("script[type=module][src]")].map(s=>s.src),
    ...[...document.querySelectorAll('link[rel=stylesheet][href]')].map(l=>l.href)
  ];
  const missing=[];
  for(const url of expected){
    if(!(await caches.match(url)))missing.push(url.replace(location.origin+"/",""));
  }
  return finding("cache","Offline-Cache",missing.length?"WARN":"OK",
    missing.length
      ? `${missing.length} von ${expected.length} Dateien fehlen im Cache ${own.join(", ")}.`
      : `Alle ${expected.length} Dateien liegen im Cache ${own.join(", ")}.`,
    missing);
}

function auditBackup(data){
  const problems=[];
  let payload="";
  try{
    payload=JSON.stringify({version:1,exportedAt:new Date().toISOString(),stores:data});
  }catch(error){
    return finding("backup","Backup und Restore","FAIL",`Die Lerndaten lassen sich nicht als Backup serialisieren: ${error.message}`);
  }
  let restored;
  try{restored=JSON.parse(payload);}
  catch(error){return finding("backup","Backup und Restore","FAIL",`Das erzeugte Backup ist nicht wieder lesbar: ${error.message}`);}
  for(const store of AUDIT_STORES){
    const before=(data[store]||[]).length;
    const after=(restored.stores?.[store]||[]).length;
    if(before!==after)problems.push(`${store}: ${before} vor, ${after} nach dem Wiedereinlesen`);
    if((data[store]||[]).some(row=>row.id===undefined))problems.push(`${store}: Datensatz ohne id würde beim Wiederherstellen verloren gehen`);
  }
  const kilobytes=Math.round(payload.length/1024);
  return finding("backup","Backup und Restore",problems.length?"FAIL":"OK",
    problems.length
      ? `${problems.length} Probleme beim Probelauf des Backups.`
      : `Probelauf erfolgreich · ${AUDIT_STORES.length} Stores · rund ${kilobytes} KB. Es wurde nichts verändert.`,
    problems);
}

async function auditProviderParity(){
  const required=["summarize","tutor","generateLearningGoals","generateFlashcards","evaluateFreeAnswer","analyzeImage"];
  if(!window.AIService)return finding("parity","LOCAL/AUTO/CLOUD-Parität","FAIL","AIService ist nicht verfügbar.");
  const missing=required.filter(name=>typeof window.AIService[name]!=="function");
  if(missing.length)return finding("parity","LOCAL/AUTO/CLOUD-Parität","FAIL",`Diese Aufgaben fehlen in der Abstraktion: ${missing.join(", ")}`,missing);
  const status=await window.AIService.status();
  const detail=`Modus ${status.mode} · aktiv ${status.activeProvider||"keiner"} · LOCAL verfügbar · CLOUD ${status.cloudAvailable?"verfügbar":"nicht verfügbar"}`;
  return finding("parity","LOCAL/AUTO/CLOUD-Parität","OK",`Alle ${required.length} Aufgaben laufen über den AIService. ${detail}`);
}

async function runAudit(){
  const data=await auditReadAll();
  return [
    auditCoverage(data),
    auditOrphans(data),
    auditSourceReferences(data),
    auditDuplicates(data),
    auditMasteryInvariants(data),
    auditFSRS(data),
    auditCascades(data),
    await auditOfflineCache(),
    auditBackup(data),
    await auditProviderParity()
  ];
}

// --- Darstellung -----------------------------------------------------------

function auditBadge(status){
  return ({OK:"good",WARN:"warn",FAIL:"danger"})[status]||"warn";
}

function auditRender(findings){
  const failed=findings.filter(f=>f.status==="FAIL").length;
  const warned=findings.filter(f=>f.status==="WARN").length;
  const summary=failed
    ? `${failed} Prüfungen mit Fehlern${warned?`, ${warned} mit Hinweisen`:""}.`
    : warned?`Keine Fehler, ${warned} Prüfungen mit Hinweisen.`:"Alle Prüfungen ohne Befund.";
  return `<p class="small"><strong>${auditEsc(summary)}</strong></p>
    ${findings.map(f=>`
      <div class="list-item">
        <div class="row between"><span>${auditEsc(f.label)}</span><span class="badge ${auditBadge(f.status)}">${auditEsc(f.status)}</span></div>
        <div class="small muted">${auditEsc(f.detail)}</div>
        ${f.items?.length?`<ul class="audit-items">${f.items.slice(0,AUDIT_SAMPLE).map(item=>`<li>${auditEsc(item)}</li>`).join("")}${f.items.length>AUDIT_SAMPLE?`<li>… und ${f.items.length-AUDIT_SAMPLE} weitere</li>`:""}</ul>`:""}
      </div>`).join("")}
    <p class="small muted">Der Selbstcheck verändert nichts. Auffälligkeiten musst du bewusst beheben, etwa durch erneuten Import oder gezieltes Löschen eines Materials.</p>`;
}

async function injectAuditCard(){
  const content=document.querySelector("#content");
  const profileButton=document.querySelector('[data-tab="profile"]');
  if(!content||!profileButton?.classList.contains("active"))return false;
  if(content.querySelector("#audit-card"))return true;

  // Karte vor dem ersten await einhängen, sonst entsteht sie bei parallelen
  // Aufrufen mehrfach.
  const card=document.createElement("section");
  card.id="audit-card";
  card.className="card";
  card.innerHTML=`
    <div class="eyebrow">QUALITÄTSKONTROLLE</div>
    <h2>Selbstcheck</h2>
    <p class="small muted">Prüft Coverage, verwaiste Daten, Quellenbezüge, Dubletten, Mastery-Invarianten, FSRS-Verträge, Cascades, Offline-Cache, Backup und Provider-Parität. Es werden ausschließlich Befunde gemeldet, nie automatisch Daten geändert.</p>
    <button type="button" class="primary full" id="audit-run">Selbstcheck ausführen</button>
    <div id="audit-output"></div>
  `;
  content.append(card);

  const button=card.querySelector("#audit-run");
  const output=card.querySelector("#audit-output");
  button.onclick=async()=>{
    button.disabled=true;
    const label=button.textContent;
    button.textContent="Prüfe …";
    try{
      output.innerHTML=auditRender(await runAudit());
    }catch(error){
      output.innerHTML=`<p class="small"><strong>Selbstcheck fehlgeschlagen:</strong> ${auditEsc(error.message||String(error))}</p>`;
    }finally{
      button.disabled=false;
      button.textContent=label;
    }
  };
  return true;
}

// Die Gestaltung liegt zentral in styles.css. Ein eigener style-Block hier
// wuerde das Design-System ueberschreiben, weil er spaeter in die Kaskade faellt.

document.addEventListener("click",event=>{
  if(event.target.closest?.('[data-tab="profile"]'))setTimeout(()=>injectAuditCard().catch(()=>{}),0);
},true);
const auditObserver=new MutationObserver(()=>injectAuditCard().catch(()=>{}));
const auditContent=document.querySelector("#content");
if(auditContent)auditObserver.observe(auditContent,{childList:true,subtree:false});
setTimeout(()=>injectAuditCard().catch(()=>{}),0);

window.LernappAudit={run:runAudit};
