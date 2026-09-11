const SYNC_DB="lernapp-pwa";
const SYNC_DB_VERSION=2;
const SYNC_STORES=[
  "modules","documents","goals","flashcards","reviews",
  "evidence","mastery","gaps","plans","settings",
  "exams","examSessions"
];

// Diese Datensaetze liegen im settings-Store, vertragen aber kein einfaches
// "der neuere gewinnt": sie sammeln Eintraege, die sonst geraeteweise verloren
// gingen.
const SYNC_STATE_ID="sync-state";
const TOMBSTONE_ID="sync-tombstones";
const USAGE_ID="ai-usage";
const HISTORY_ID="mastery-history";
const APP_SETTINGS_ID="app";

// Adresse und Zugriffsschluessel gehoeren zu diesem Geraet. Kaemen sie vom
// anderen Geraet zurueck, koennte ein Abgleich die eigene Verbindung kappen.
const DEVICE_LOCAL_FIELDS=["cloudEndpoint","cloudAccessToken"];

const TOMBSTONE_KEEP_DAYS=120;
const SYNC_MAX_BYTES=20_000_000;
const SYNC_INTERVAL_MS=5*60*1000;
const SYNC_MIN_GAP_MS=30*1000;
const SYNC_MAX_ATTEMPTS=3;

const TIME_FIELDS=["updatedAt","lastReviewedAt","completedAt","resolvedAt","answeredAt","startedAt","createdAt"];

function syncOpenDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(SYNC_DB,SYNC_DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function syncAll(store){const db=await syncOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function syncGet(store,id){const db=await syncOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}

// Bewusst ohne updatedAt-Stempel: was hier geschrieben wird, ist ein bereits
// zusammengefuehrter Stand. Ein neuer Stempel wuerde ihn faelschlich als
// juengste Aenderung dieses Geraets ausweisen.
async function syncWriteRaw(changes){
  if(!changes.length)return;
  const db=await syncOpenDB();
  const stores=[...new Set(changes.map(change=>change.store))];
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(stores,"readwrite");
    for(const change of changes){
      const objectStore=tx.objectStore(change.store);
      if(change.type==="delete")objectStore.delete(change.id);
      else objectStore.put(change.value);
    }
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
  });
  db.close();
}

function syncTimestamp(){return new Date().toISOString();}

// Schluessel-unabhaengige Darstellung: dieselben Inhalte ergeben auf beiden
// Geraeten denselben Text, auch wenn die Felder in anderer Reihenfolge stehen.
function stableStringify(value){
  if(Array.isArray(value))return `[${value.map(stableStringify).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function recordTime(record){
  let newest=0;
  for(const field of TIME_FIELDS){
    const value=Date.parse(record?.[field]);
    if(Number.isFinite(value)&&value>newest)newest=value;
  }
  return newest;
}

/* --- Zustand dieses Geraets ---------------------------------------------- */

async function loadState(){
  const stored=await syncGet("settings",SYNC_STATE_ID);
  if(stored?.deviceId)return stored;
  const created={id:SYNC_STATE_ID,deviceId:crypto.randomUUID(),enabled:false,revision:0,lastSyncAt:null};
  await syncWriteRaw([{type:"put",store:"settings",value:created}]);
  return created;
}

async function saveState(patch){
  const current=await loadState();
  const next={...current,...patch,id:SYNC_STATE_ID};
  await syncWriteRaw([{type:"put",store:"settings",value:next}]);
  return next;
}

/* --- Loeschmarken --------------------------------------------------------- */

function pruneTombstones(entries){
  const limit=Date.now()-TOMBSTONE_KEEP_DAYS*86400000;
  return entries.filter(entry=>{
    const at=Date.parse(entry?.deletedAt);
    return Number.isFinite(at)&&at>=limit;
  });
}

function tombstoneMap(entries){
  const map=new Map();
  for(const entry of entries||[]){
    if(!entry?.store||entry?.id===undefined)continue;
    const key=`${entry.store}:${entry.id}`;
    const existing=map.get(key);
    if(!existing||Date.parse(entry.deletedAt)>Date.parse(existing.deletedAt))map.set(key,entry);
  }
  return map;
}

async function writeTombstones(store,ids){
  const record=(await syncGet("settings",TOMBSTONE_ID))||{id:TOMBSTONE_ID,entries:[]};
  const at=syncTimestamp();
  const map=tombstoneMap(record.entries);
  for(const id of ids)map.set(`${store}:${id}`,{store,id,deletedAt:at});
  record.entries=pruneTombstones([...map.values()]);
  record.updatedAt=at;
  await syncWriteRaw([{type:"put",store:"settings",value:record}]);
}

// Alle Loeschmarken liegen in einem Datensatz. Beim Abraeumen eines Imports
// laufen mehrere Loeschungen gleichzeitig; ohne diese Reihung wuerden sie sich
// gegenseitig ueberschreiben, weil jede den Datensatz liest und neu schreibt.
let tombstoneChain=Promise.resolve();

function recordDeletion(store,ids){
  const list=(Array.isArray(ids)?ids:[ids]).filter(id=>id!==undefined&&id!==null);
  if(!list.length)return Promise.resolve();
  tombstoneChain=tombstoneChain.catch(()=>{}).then(()=>writeTombstones(store,list));
  return tombstoneChain;
}

/* --- Zusammenfuehren ------------------------------------------------------ */

async function buildSnapshot(){
  const stores={};
  for(const store of SYNC_STORES){
    const rows=await syncAll(store);
    stores[store]=store==="settings"?rows.filter(row=>row?.id!==SYNC_STATE_ID):rows;
  }
  return {version:1,stores};
}

function mergeAppSettings(local,remote){
  const winner=recordTime(remote)>recordTime(local)?remote:local;
  const merged={...winner};
  // Die Verbindung dieses Geraets bleibt unangetastet, egal welche Seite gewinnt.
  for(const field of DEVICE_LOCAL_FIELDS){
    if(field in (local||{}))merged[field]=local[field];
    else delete merged[field];
  }
  return merged;
}

function mergeUsage(local,remote){
  const days={...(remote?.days||{})};
  for(const [key,value] of Object.entries(local?.days||{})){
    const other=days[key];
    if(!other){days[key]=value;continue;}
    const tasks={...(other.tasks||{})};
    for(const [task,count] of Object.entries(value.tasks||{}))tasks[task]=Math.max(Number(count)||0,Number(tasks[task])||0);
    // Jedes Geraet zaehlt seine eigenen Aufrufe. Das Maximum bleibt monoton,
    // waehrend eine Summe bei jedem erneuten Abgleich weiter anwachsen wuerde.
    days[key]={
      total:Math.max(Number(value.total)||0,Number(other.total)||0),
      ok:Math.max(Number(value.ok)||0,Number(other.ok)||0),
      failed:Math.max(Number(value.failed)||0,Number(other.failed)||0),
      tasks
    };
  }
  return {id:USAGE_ID,days};
}

function mergeHistory(local,remote){
  const older=recordTime(remote)>recordTime(local)?local:remote;
  const newer=older===local?remote:local;
  const byKey=new Map();
  for(const entry of older?.entries||[])if(entry?.key)byKey.set(entry.key,entry);
  for(const entry of newer?.entries||[])if(entry?.key)byKey.set(entry.key,entry);
  const entries=[...byKey.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  return {...(newer||older||{}),id:HISTORY_ID,entries};
}

function mergeTombstones(local,remote){
  const map=tombstoneMap([...(local?.entries||[]),...(remote?.entries||[])]);
  return {
    id:TOMBSTONE_ID,
    entries:pruneTombstones([...map.values()]),
    updatedAt:recordTime(remote)>recordTime(local)?remote?.updatedAt:local?.updatedAt
  };
}

function mergeSnapshots(local,remote){
  const merged={};
  for(const store of SYNC_STORES){
    const rows=new Map();
    for(const row of local?.stores?.[store]||[])if(row?.id!==undefined)rows.set(row.id,row);
    for(const row of remote?.stores?.[store]||[]){
      if(row?.id===undefined)continue;
      const mine=rows.get(row.id);
      if(!mine||recordTime(row)>recordTime(mine))rows.set(row.id,row);
    }
    merged[store]=rows;
  }

  const localSettings=new Map((local?.stores?.settings||[]).map(row=>[row.id,row]));
  const remoteSettings=new Map((remote?.stores?.settings||[]).map(row=>[row.id,row]));
  const special={
    [APP_SETTINGS_ID]:mergeAppSettings,
    [USAGE_ID]:mergeUsage,
    [HISTORY_ID]:mergeHistory,
    [TOMBSTONE_ID]:mergeTombstones
  };
  for(const [id,merge] of Object.entries(special)){
    const mine=localSettings.get(id);
    const theirs=remoteSettings.get(id);
    if(!mine&&!theirs)continue;
    merged.settings.set(id,merge(mine,theirs));
  }
  merged.settings.delete(SYNC_STATE_ID);

  // Ein Datensatz verschwindet nur, wenn er nach seiner letzten Aenderung
  // geloescht wurde. Wurde er danach noch bearbeitet, gewinnt die Bearbeitung.
  for(const entry of merged.settings.get(TOMBSTONE_ID)?.entries||[]){
    const bucket=merged[entry.store];
    const row=bucket?.get(entry.id);
    if(row&&recordTime(row)<=Date.parse(entry.deletedAt))bucket.delete(entry.id);
  }
  return merged;
}

function snapshotFromMerged(merged){
  const stores={};
  for(const store of SYNC_STORES)stores[store]=[...(merged[store]?.values()||[])];
  return {version:1,stores};
}

// Kennzeichen aus Kennung und juengstem Zeitstempel je Datensatz. Stimmt es mit
// dem hochgeladenen Stand ueberein, waere ein erneuter Upload folgenlos.
function fingerprint(snapshot){
  return SYNC_STORES.map(store=>{
    const rows=snapshot?.stores?.[store]||[];
    if(store==="settings"){
      const sorted=[...rows].sort((a,b)=>String(a?.id).localeCompare(String(b?.id)));
      return `settings:${sorted.map(stableStringify).join(",")}`;
    }
    return `${store}:${rows.map(row=>`${row?.id}@${recordTime(row)}`).sort().join(",")}`;
  }).join("|");
}

/* --- Anwenden ------------------------------------------------------------- */

async function applyMerged(merged){
  const changes=[];
  for(const store of SYNC_STORES){
    const desired=merged[store];
    const current=new Map((await syncAll(store)).map(row=>[row?.id,row]));
    for(const id of current.keys()){
      if(store==="settings"&&id===SYNC_STATE_ID)continue;
      if(!desired.has(id))changes.push({type:"delete",store,id});
    }
    for(const [id,row] of desired){
      const mine=current.get(id);
      const differs=store==="settings"
        ? stableStringify(mine)!==stableStringify(row)
        : recordTime(mine)!==recordTime(row);
      if(!mine||differs)changes.push({type:"put",store,value:row});
    }
  }
  await syncWriteRaw(changes);
  return changes.length;
}

// Ein frisch installiertes Geraet legt beim Start ein eigenes leeres Modul an.
// Ohne diese Bereinigung stuenden nach dem ersten Abgleich zwei Module
// nebeneinander und die Lerndaten haetten nur an einem davon gehangen.
async function dropUnusedLocalModules(local,remote){
  const remoteModules=remote?.stores?.modules||[];
  if(!remoteModules.length)return local;
  const remoteIds=new Set(remoteModules.map(module=>module?.id));
  const used=new Set();
  for(const store of SYNC_STORES){
    // Der Tagesplan entsteht beim ersten Start von selbst und ist deshalb kein
    // Beleg dafuer, dass an diesem Modul tatsaechlich gelernt wurde.
    if(store==="modules"||store==="settings"||store==="plans")continue;
    for(const row of local.stores[store]||[])if(row?.moduleId)used.add(row.moduleId);
  }
  const doomed=new Set((local.stores.modules||[]).filter(module=>!remoteIds.has(module?.id)&&!used.has(module?.id)).map(module=>module.id));
  if(!doomed.size)return local;
  const orphanPlans=(local.stores.plans||[]).filter(plan=>doomed.has(plan?.moduleId));
  await recordDeletion("modules",[...doomed]);
  if(orphanPlans.length)await recordDeletion("plans",orphanPlans.map(plan=>plan.id));
  return {
    ...local,
    stores:{
      ...local.stores,
      modules:(local.stores.modules||[]).filter(module=>!doomed.has(module?.id)),
      plans:(local.stores.plans||[]).filter(plan=>!doomed.has(plan?.moduleId)),
      settings:(await syncAll("settings")).filter(row=>row?.id!==SYNC_STATE_ID)
    }
  };
}

/* --- Ablauf --------------------------------------------------------------- */

let running=null;
let lastRunAt=0;
let lastError=null;

async function isConfigured(){
  if(!window.AIService)return false;
  const cfg=await window.AIService.getCloudConfig();
  return Boolean(cfg?.endpoint&&cfg?.hasAccessToken);
}

async function runSync(attempt=1){
  const state=await loadState();
  const pulled=await window.AIService.syncPull();
  const remote=pulled?.data||null;
  const local=await dropUnusedLocalModules(await buildSnapshot(),remote);
  const merged=mergeSnapshots(local,remote);
  const applied=await applyMerged(merged);

  const mergedSnapshot=snapshotFromMerged(merged);
  let revision=Number(pulled?.revision)||0;
  let uploaded=false;

  if(!remote||fingerprint(mergedSnapshot)!==fingerprint(remote)){
    const body=JSON.stringify(mergedSnapshot);
    if(body.length>SYNC_MAX_BYTES)throw new Error("Der Lernstand ist zu groß für die Synchronisation.");
    const result=await window.AIService.syncPush({baseRevision:revision,data:mergedSnapshot,deviceId:state.deviceId});
    if(result?.conflict){
      // Ein anderes Geraet war schneller. Dessen Stand ist jetzt bekannt, also
      // noch einmal von vorn zusammenfuehren statt ihn zu ueberschreiben.
      if(attempt>=SYNC_MAX_ATTEMPTS)throw new Error("Ein anderes Gerät schreibt gerade. Bitte später erneut abgleichen.");
      return runSync(attempt+1);
    }
    revision=Number(result?.revision)||revision;
    uploaded=true;
  }

  await saveState({revision,lastSyncAt:syncTimestamp()});
  if(applied)window.dispatchEvent(new CustomEvent("lernapp:sync-applied",{detail:{changes:applied}}));
  return {applied,uploaded,revision};
}

async function sync({silent=false}={}){
  if(running)return running;
  running=(async()=>{
    if(!(await isConfigured()))throw new Error("Für den Abgleich müssen Proxy-Endpunkt und Zugriffsschlüssel gespeichert sein.");
    if(!navigator.onLine)throw new Error("Ohne Internetverbindung ist kein Abgleich möglich.");
    return runSync();
  })();
  try{
    const result=await running;
    lastError=null;
    lastRunAt=Date.now();
    return result;
  }catch(error){
    lastError=String(error?.message||error);
    lastRunAt=Date.now();
    if(!silent)throw error;
    return null;
  }finally{
    running=null;
    window.dispatchEvent(new CustomEvent("lernapp:sync-state-changed"));
  }
}

async function autoSync(){
  const state=await loadState();
  if(!state.enabled)return;
  if(Date.now()-lastRunAt<SYNC_MIN_GAP_MS)return;
  if(!(await isConfigured()))return;
  await sync({silent:true});
}

/* --- Oberflaeche ---------------------------------------------------------- */

function syncEsc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
function syncToast(message){const el=document.createElement("div");el.className="toast";el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),2400);}

function syncWhen(value){
  const at=Date.parse(value);
  if(!Number.isFinite(at))return "noch nie";
  const minutes=Math.round((Date.now()-at)/60000);
  if(minutes<1)return "gerade eben";
  if(minutes<60)return `vor ${minutes} Minuten`;
  const hours=Math.round(minutes/60);
  if(hours<24)return `vor ${hours} Stunden`;
  return new Date(at).toLocaleDateString("de-DE");
}

async function renderSyncStatus(card){
  const state=await loadState();
  const configured=await isConfigured();
  const status=card.querySelector("#sync-status");
  card.querySelectorAll("[data-sync-mode]").forEach(button=>{
    const on=button.dataset.syncMode==="on";
    const active=on===Boolean(state.enabled);
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  if(!status)return;
  if(!configured){
    status.innerHTML=`<p class="small muted">Noch nicht einsatzbereit: Der Abgleich läuft über deinen eigenen Cloud-Proxy. Trage oben Proxy-Endpunkt und Zugriffsschlüssel ein.</p>`;
    return;
  }
  status.innerHTML=`
    <div class="row between"><span class="small muted">Letzter Abgleich</span><strong class="small">${syncEsc(syncWhen(state.lastSyncAt))}</strong></div>
    <div class="row between"><span class="small muted">Stand</span><strong class="small">Version ${Number(state.revision)||0}</strong></div>
    <div class="row between"><span class="small muted">Dieses Gerät</span><strong class="small">${syncEsc(String(state.deviceId||"").slice(0,8))}</strong></div>
    ${lastError?`<p class="small" style="color:var(--danger)">${syncEsc(lastError)}</p>`:""}
  `;
}

async function injectSyncCard(){
  const slot=document.querySelector("#sync-slot");
  if(!slot||slot.querySelector("#sync-card"))return false;

  const card=document.createElement("section");
  card.id="sync-card";
  card.className="card";
  card.innerHTML=`
    <div class="eyebrow">GERÄTE-SYNCHRONISATION</div>
    <h2>Abgleich zwischen Geräten</h2>
    <p class="small muted">Lernstand, Material und Fortschritt werden über deinen eigenen Cloud-Proxy zwischen deinen Geräten abgeglichen. Es werden keine KI-Anfragen verbraucht. Änderungen beider Geräte werden zusammengeführt; bei derselben Änderung gewinnt die neuere.</p>
    <div class="segmented" role="group" aria-label="Automatischer Abgleich">
      <button type="button" data-sync-mode="on">Automatisch</button>
      <button type="button" data-sync-mode="off">Nur manuell</button>
    </div>
    <div class="stack" style="margin-top:12px">
      <button type="button" class="primary full" id="sync-run">Jetzt abgleichen</button>
    </div>
    <div class="sync-status" id="sync-status" aria-live="polite"></div>
  `;
  slot.appendChild(card);

  card.querySelectorAll("[data-sync-mode]").forEach(button=>{
    button.onclick=async()=>{
      const enabled=button.dataset.syncMode==="on";
      await saveState({enabled});
      await renderSyncStatus(card);
      syncToast(enabled?"Automatischer Abgleich ist an":"Abgleich nur noch auf Knopfdruck");
      if(enabled)autoSync().catch(()=>{});
    };
  });

  card.querySelector("#sync-run").onclick=async event=>{
    const button=event.currentTarget;
    button.disabled=true;
    const label=button.textContent;
    button.textContent="Wird abgeglichen …";
    try{
      const result=await sync();
      syncToast(result?.applied?`${result.applied} Änderungen übernommen`:"Alles bereits aktuell");
    }catch(error){
      syncToast(error.message||"Abgleich fehlgeschlagen.");
    }finally{
      button.disabled=false;
      button.textContent=label;
      await renderSyncStatus(card);
    }
  };

  await renderSyncStatus(card);
  return true;
}

const syncObserver=new MutationObserver(()=>{injectSyncCard().catch(()=>{});});
const syncContent=document.querySelector("#content");
if(syncContent)syncObserver.observe(syncContent,{childList:true,subtree:false});
window.addEventListener("lernapp:cloud-config-changed",()=>{
  const card=document.querySelector("#sync-card");
  if(card)renderSyncStatus(card).catch(()=>{});
});
window.addEventListener("lernapp:sync-state-changed",()=>{
  const card=document.querySelector("#sync-card");
  if(card)renderSyncStatus(card).catch(()=>{});
});

document.addEventListener("visibilitychange",()=>{autoSync().catch(()=>{});});
setInterval(()=>{if(document.visibilityState==="visible")autoSync().catch(()=>{});},SYNC_INTERVAL_MS);
setTimeout(()=>{injectSyncCard().catch(()=>{});autoSync().catch(()=>{});},3000);

window.LernappSync={sync,recordDeletion,state:loadState,snapshot:buildSnapshot,mergeSnapshots,fingerprint};
