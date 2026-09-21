const FREE_AI_DB="lernapp-pwa";
const FREE_AI_DB_VERSION=2;
let freeAICurrentGoalId=null;
let freeAIAnswerStartedAt=null;

function freeAIOpenDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(FREE_AI_DB,FREE_AI_DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function freeAIGet(store,id){const db=await freeAIOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function freeAIAll(store){const db=await freeAIOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function freeAIDelete(store,id){const db=await freeAIOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(id);tx.oncomplete=()=>{db.close();window.LernappSync?.recordDeletion(store,[id]).catch(()=>{});resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
function freeAIClamp(v){return Math.max(0,Math.min(1,Number(v)||0));}
function freeAIToast(message){const el=document.createElement("div");el.className="toast";el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),2400);}
function freeAIEsc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}

// Die Mastery- und Gap-Regel steht in mastery.js. Eine zweite Fassung hier
// waere genau die Doppelpflege, die Kap. 32 verbietet.
async function freeAIRecalcMastery(goalId){
  if(!window.LernappMastery)throw new Error("Lernlogik (mastery.js) ist nicht verfügbar.");
  return window.LernappMastery.recalcMastery(goalId);
}

async function freeAIInvalidateTodayPlan(moduleId){
  const plans=(await freeAIAll("plans")).filter(p=>p.moduleId===moduleId);
  const today=new Date();const key=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  for(const p of plans.filter(p=>p.date===key))await freeAIDelete("plans",p.id).catch(()=>{});
}

// independentRecall darf nur dann true bleiben, wenn der Lernende die Antwort
// nicht unmittelbar vorher angezeigt bekommen hat. Spec Kap. 32: Antwort
// anzeigen ist kein unabhaengiger Abruf. Die Mastery-Gewichtung halbiert solche
// Evidence, statt sie zu verwerfen.
async function freeAIEvaluateAndPersist({goalId,answer,dimension="UNDERSTANDING",question="",context="",source="SELF_TEST",independentRecall=true,metadata={}}={}){
  if(!window.AIService)throw new Error("AIService ist nicht verfügbar.");
  const goal=await freeAIGet("goals",goalId);
  if(!goal)throw new Error("Lernziel wurde nicht gefunden.");
  const result=await window.AIService.evaluateFreeAnswer({expected:goal.answerKey||goal.sourceSnippet||"",answer,context:context||goal.sourceSnippet||"",question:question||goal.statement||"",goalId,dimension,source});
  const score=freeAIClamp(result?.score);
  const confidence=freeAIClamp(result?.confidence??.35);
  const mode=await window.AIService.getMode();
  if(!window.LernappMastery)throw new Error("Lernlogik (mastery.js) ist nicht verfügbar.");
  const mastery=await window.LernappMastery.addEvidence({
    goalId:goal.id,dimension,score,confidence,
    independentRecall:independentRecall!==false,
    provider:result?.provider||"UNKNOWN",
    policy:result?.policy||mode,
    feedback:String(result?.feedback||""),
    source,...metadata
  });
  const evidence={goalId:goal.id,moduleId:goal.moduleId,dimension,score,confidence,independentRecall:independentRecall!==false,evaluationProvider:result?.provider||"UNKNOWN",evaluationPolicy:result?.policy||mode,feedback:String(result?.feedback||""),source};
  await freeAIInvalidateTodayPlan(goal.moduleId);
  return {result,evidence,mastery,goal};
}

async function freeAIEvaluateSelfTest(goalId,answer){
  return freeAIEvaluateAndPersist({goalId,answer,dimension:"UNDERSTANDING",source:"SELF_TEST"});
}

document.addEventListener("click",event=>{
  const goalLink=event.target.closest?.("[data-open-goal]");
  if(goalLink?.dataset.openGoal){freeAICurrentGoalId=goalLink.dataset.openGoal;freeAIAnswerStartedAt=null;}
},true);

// Kap. 19: gemessen wird ab der ersten Eingabe, nicht ab dem Oeffnen des
// Lernziels. Sonst zaehlte auch das Lesen der Quelle als Antwortzeit.
document.addEventListener("input",event=>{
  if(event.target?.id==="self-answer"&&freeAIAnswerStartedAt===null)freeAIAnswerStartedAt=Date.now();
},true);

document.addEventListener("click",async event=>{
  const button=event.target.closest?.("#self-submit");
  if(!button||!freeAICurrentGoalId)return;
  event.preventDefault();event.stopImmediatePropagation();
  const textarea=document.querySelector("#self-answer");
  const output=document.querySelector("#self-result");
  const answer=textarea?.value.trim();
  if(!answer){freeAIToast("Bitte gib zuerst eine Antwort ein.");return;}
  button.disabled=true;const old=button.textContent;button.textContent="Wird ausgewertet …";
  try{
    const durationMs=freeAIAnswerStartedAt?Date.now()-freeAIAnswerStartedAt:null;
    const {result,mastery}=await freeAIEvaluateAndPersist({goalId:freeAICurrentGoalId,answer,dimension:"UNDERSTANDING",source:"SELF_TEST",metadata:{durationMs}});
    freeAIAnswerStartedAt=null;
    const score=Math.round(freeAIClamp(result?.score)*100);
    const provider=result?.provider||"UNKNOWN";
    const policy=result?.policy?` · ${freeAIEsc(result.policy)}`:"";
    if(output)output.innerHTML=`<p><strong>${score}% · ${freeAIEsc(provider)}</strong></p><p>${freeAIEsc(result?.feedback||"Antwort wurde ausgewertet.")}</p><p class="small muted">Confidence ${Math.round(freeAIClamp(result?.confidence??.35)*100)}%${policy} · Mastery: ${freeAIEsc(mastery.status)}</p>`;
    freeAIToast(`Antwort ausgewertet · ${provider}`);
  }catch(error){freeAIToast(error.message||"Auswertung fehlgeschlagen.");}
  finally{button.disabled=false;button.textContent=old;}
},true);

window.LernappFreeAnswerAI={evaluateSelfTest:freeAIEvaluateSelfTest,evaluateAndPersist:freeAIEvaluateAndPersist,recalcMastery:freeAIRecalcMastery,invalidateTodayPlan:freeAIInvalidateTodayPlan};
