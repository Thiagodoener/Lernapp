const TUTOR_DB_NAME="lernapp-pwa";
const TUTOR_DB_VERSION=2;
let tutorCurrentGoalId=null;

function tutorOpenDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(TUTOR_DB_NAME,TUTOR_DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function tutorGet(store,id){const db=await tutorOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function tutorPut(store,value){const db=await tutorOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value);tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};});}
async function tutorDelete(store,id){const db=await tutorOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
function tutorUid(){return crypto.randomUUID();}
function tutorNow(){return new Date().toISOString();}
function tutorEsc(value=""){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
function tutorToast(message){const el=document.createElement("div");el.className="toast";el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),2400);}

async function tutorThread(goalId){
  return (await tutorGet("settings",`tutor:${goalId}`))||{id:`tutor:${goalId}`,goalId,messages:[],createdAt:tutorNow()};
}

async function tutorContext(goal){
  const source=[];
  source.push(`[Lernziel] ${goal.statement||""}`);
  if(goal.sourceSnippet)source.push(`[Quelle Seite ${goal.sourcePage||"?"}] ${goal.sourceSnippet}`);
  const documentRecord=goal.documentId?await tutorGet("documents",goal.documentId):null;
  if(documentRecord?.pages?.length){
    const target=Number(goal.sourcePage)||1;
    const relevant=documentRecord.pages
      .filter(page=>Math.abs((Number(page.page)||1)-target)<=1)
      .slice(0,3);
    for(const page of relevant){
      const text=String(page.text||"").replace(/\s+/g," ").trim();
      if(text)source.push(`[Material: ${documentRecord.title||"Dokument"} · Seite ${page.page}] ${text.slice(0,5000)}`);
    }
  }
  return source.join("\n\n").slice(0,14000);
}

function tutorRenderMessages(section,thread){
  const box=section.querySelector("#tutor-messages");
  if(!box)return;
  if(!thread.messages.length){
    box.innerHTML='<p class="small muted">Noch keine Tutor-Frage. Der Tutor verwendet den Quellenkontext dieses Lernziels.</p>';
    return;
  }
  box.innerHTML=thread.messages.slice(-12).map(message=>`
    <div class="tutor-message ${message.role}">
      <div class="small muted">${message.role==="user"?"Du":`Tutor · ${tutorEsc(message.provider||"")}`}</div>
      <div>${tutorEsc(message.text||"")}</div>
      ${message.role==="assistant"&&Number.isFinite(message.confidence)?`<div class="source">Confidence ${Math.round(message.confidence*100)}%${message.policy?` · ${tutorEsc(message.policy)}`:""}</div>`:""}
    </div>
  `).join("");
  box.scrollTop=box.scrollHeight;
}

async function tutorAsk(goalId,message,section){
  if(!window.AIService)throw new Error("AIService ist nicht verfügbar.");
  const goal=await tutorGet("goals",goalId);
  if(!goal)throw new Error("Lernziel wurde nicht gefunden.");
  const context=await tutorContext(goal);
  const thread=await tutorThread(goalId);
  const prior=thread.messages.slice(-8).map(m=>({role:m.role,text:m.text}));
  const mode=await window.AIService.getMode();
  const result=await window.AIService.tutor({
    message,
    context,
    goalId:goal.id,
    documentId:goal.documentId||null,
    learningGoal:goal.statement||"",
    sourcePage:goal.sourcePage||null,
    history:prior,
    instruction:"Antworte ausschließlich auf Basis des bereitgestellten Lernmaterials. Wenn die Quelle die Frage nicht trägt, sage das klar. Keine erfundenen Fakten."
  });
  const userMessage={id:tutorUid(),role:"user",text:message,createdAt:tutorNow()};
  const assistantMessage={id:tutorUid(),role:"assistant",text:String(result?.answer||"").trim()||"Keine Antwort erzeugt.",provider:result?.provider||"UNKNOWN",confidence:Number.isFinite(result?.confidence)?result.confidence:null,policy:result?.policy||mode,grounded:result?.grounded!==false,createdAt:tutorNow()};
  thread.messages.push(userMessage,assistantMessage);
  thread.updatedAt=tutorNow();
  await tutorPut("settings",thread);
  tutorRenderMessages(section,thread);
  return assistantMessage;
}

async function tutorInject(goalId){
  const modal=document.querySelector("#modal");
  const box=document.querySelector("#modal-content");
  if(!modal?.open||!box)return false;
  if(box.querySelector("#tutor-ai-section"))return true;
  const heading=box.querySelector("h2");
  if(!heading||!String(heading.textContent||"").includes("Lernziel"))return false;
  const goal=await tutorGet("goals",goalId);
  if(!goal)return false;
  const mode=window.AIService?await window.AIService.getMode():"AUTO";
  const thread=await tutorThread(goalId);
  const section=document.createElement("section");
  section.id="tutor-ai-section";
  section.className="tutor-ai-section";
  section.innerHTML=`
    <hr>
    <div class="row between"><div><div class="eyebrow">KI-TUTOR · ${tutorEsc(mode)}</div><h3>Frage zum Lernstoff</h3></div><button type="button" class="secondary" id="tutor-clear">Verlauf löschen</button></div>
    <p class="small muted">Der Tutor erhält nur den Quellenkontext dieses Lernziels. LOCAL bleibt vollständig kostenfrei; AUTO/CLOUD können später eine semantisch stärkere Antwort liefern.</p>
    <div id="tutor-messages" class="tutor-messages"></div>
    <textarea id="tutor-input" placeholder="Zum Beispiel: Erkläre mir den Zusammenhang einfacher …"></textarea>
    <button type="button" class="primary full" id="tutor-send">Tutor fragen</button>
  `;
  box.appendChild(section);
  tutorRenderMessages(section,thread);
  const input=section.querySelector("#tutor-input");
  const send=section.querySelector("#tutor-send");
  send.onclick=async()=>{
    const message=input.value.trim();
    if(!message){tutorToast("Bitte gib zuerst eine Frage ein.");return;}
    send.disabled=true;const old=send.textContent;send.textContent="Tutor denkt …";
    try{await tutorAsk(goalId,message,section);input.value="";tutorToast("Tutor-Antwort erstellt");}
    catch(error){tutorToast(error.message||"Tutor-Antwort fehlgeschlagen.");}
    finally{send.disabled=false;send.textContent=old;}
  };
  section.querySelector("#tutor-clear").onclick=async()=>{
    await tutorDelete("settings",`tutor:${goalId}`).catch(()=>{});
    tutorRenderMessages(section,{messages:[]});
    tutorToast("Tutor-Verlauf gelöscht");
  };
  return true;
}

document.addEventListener("click",event=>{
  const link=event.target.closest?.("[data-open-goal]");
  if(link?.dataset.openGoal)tutorCurrentGoalId=link.dataset.openGoal;
},true);

const tutorModalContent=document.querySelector("#modal-content");
if(tutorModalContent){
  new MutationObserver(()=>{
    if(!tutorCurrentGoalId)return;
    tutorInject(tutorCurrentGoalId).catch(()=>{});
  }).observe(tutorModalContent,{childList:true,subtree:false});
}

const tutorStyle=document.createElement("style");
tutorStyle.textContent=`
.tutor-ai-section{margin-top:10px}
.tutor-messages{display:grid;gap:8px;max-height:320px;overflow:auto;margin:10px 0}
.tutor-message{padding:11px 12px;border-radius:13px;white-space:pre-wrap;line-height:1.45}
.tutor-message.user{background:var(--accent);color:var(--card);margin-left:12%}
.tutor-message.assistant{background:var(--soft);margin-right:5%}
.tutor-message.user .muted{color:inherit;opacity:.72}
#tutor-input{min-height:90px;margin:4px 0 8px}
`;
document.head.appendChild(tutorStyle);

window.LernappTutorAI={ask:tutorAsk,contextForGoal:async goalId=>{const goal=await tutorGet("goals",goalId);return goal?tutorContext(goal):"";}};
