const LERNAPP_DB_NAME="lernapp-pwa";
const LERNAPP_DB_VERSION=2;
let lernappPendingDocumentId=null;

function lernappOpenDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(LERNAPP_DB_NAME,LERNAPP_DB_VERSION);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function lernappAll(store){const db=await lernappOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly");const r=tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function lernappGet(store,id){const db=await lernappOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly");const r=tx.objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function lernappDeleteMany(store,ids){if(!ids.length)return;const db=await lernappOpenDB();await new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");const os=tx.objectStore(store);ids.forEach(id=>os.delete(id));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});db.close();}

async function deleteDocumentCascade(documentId){
 const documentRecord=await lernappGet("documents",documentId);if(!documentRecord)throw new Error("Material wurde nicht gefunden.");
 const goals=(await lernappAll("goals")).filter(g=>g.documentId===documentId);const goalIds=new Set(goals.map(g=>g.id));
 const cards=(await lernappAll("flashcards")).filter(c=>goalIds.has(c.goalId));const cardIds=new Set(cards.map(c=>c.id));
 const reviews=(await lernappAll("reviews")).filter(r=>goalIds.has(r.goalId)||cardIds.has(r.cardId));
 const evidence=(await lernappAll("evidence")).filter(e=>goalIds.has(e.goalId));
 const mastery=(await lernappAll("mastery")).filter(m=>goalIds.has(m.goalId)||goalIds.has(m.id));
 const gaps=(await lernappAll("gaps")).filter(g=>goalIds.has(g.goalId));
 const plans=(await lernappAll("plans")).filter(p=>(p.tasks||[]).some(t=>goalIds.has(t.goalId)||cardIds.has(t.cardId)));
 const sessions=(await lernappAll("examSessions")).filter(s=>(s.items||[]).some(i=>goalIds.has(i.goalId)));
 await lernappDeleteMany("reviews",reviews.map(x=>x.id));await lernappDeleteMany("evidence",evidence.map(x=>x.id));await lernappDeleteMany("mastery",mastery.map(x=>x.id));await lernappDeleteMany("gaps",gaps.map(x=>x.id));await lernappDeleteMany("flashcards",cards.map(x=>x.id));await lernappDeleteMany("goals",goals.map(x=>x.id));await lernappDeleteMany("plans",plans.map(x=>x.id));await lernappDeleteMany("examSessions",sessions.map(x=>x.id));await lernappDeleteMany("documents",[documentId]);
 return documentRecord;
}
function lernappEscape(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
function lernappToast(message){const el=document.createElement("div");el.className="toast";el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),2200);}
function lernappConfirmDelete(id,title){const modal=document.querySelector("#modal"),box=document.querySelector("#modal-content");if(!modal||!box)return;box.innerHTML=`<div class="eyebrow">MATERIAL LÖSCHEN</div><h2>${lernappEscape(title)}</h2><p>Dieses Material und die daraus erzeugten Lernziele, Karteikarten, Evidenzen, Mastery-Daten, Wissenslücken sowie betroffene Pläne und Prüfungssitzungen werden gelöscht.</p><p class="small muted"><strong>Andere Materialien bleiben erhalten.</strong> Rückgängig ist dies nur über ein zuvor exportiertes Backup.</p><button type="button" class="danger-action" id="lernapp-delete-confirm">Material endgültig löschen</button><button type="button" class="secondary full" id="lernapp-delete-cancel">Abbrechen</button>`;document.querySelector("#lernapp-delete-cancel").onclick=()=>modal.close();document.querySelector("#lernapp-delete-confirm").onclick=async e=>{const b=e.currentTarget;b.disabled=true;b.textContent="Wird gelöscht …";try{const d=await deleteDocumentCascade(id);modal.close();document.querySelector('[data-tab="library"]')?.click();lernappToast(`${d.title||"Material"} wurde gelöscht.`);}catch(err){b.disabled=false;b.textContent="Material endgültig löschen";alert(`Löschen fehlgeschlagen: ${err.message}`);}};}
function lernappEnhance(id){const box=document.querySelector("#modal-content");if(!box||box.querySelector("#lernapp-delete-material"))return false;const h=box.querySelector("h2");if(!h)return false;const section=document.createElement("section");section.className="material-danger-zone";section.innerHTML=`<h3>Material verwalten</h3><p class="small muted">Du kannst dieses Material einschließlich der daraus erzeugten Lerndaten entfernen.</p><button type="button" class="danger-action" id="lernapp-delete-material">Material löschen</button>`;box.appendChild(section);section.querySelector("#lernapp-delete-material").onclick=()=>lernappConfirmDelete(id,h.textContent.trim());return true;}
const style=document.createElement("style");style.textContent=`.material-danger-zone{margin-top:20px;padding-top:16px;border-top:1px solid rgba(239,68,68,.3)}.danger-action{width:100%;background:#b91c1c!important;color:white!important;border-color:#b91c1c!important}.danger-action:disabled{opacity:.55}`;document.head.appendChild(style);
document.addEventListener("click",e=>{const row=e.target.closest?.("[data-doc]");if(row?.dataset.doc)lernappPendingDocumentId=row.dataset.doc;},true);
const target=document.querySelector("#modal-content");if(target)new MutationObserver(()=>{const modal=document.querySelector("#modal");if(lernappPendingDocumentId&&modal?.open&&lernappEnhance(lernappPendingDocumentId))lernappPendingDocumentId=null;}).observe(target,{childList:true,subtree:true});
