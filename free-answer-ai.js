const FREE_AI_DB="lernapp-pwa";
const FREE_AI_DB_VERSION=2;
let freeAICurrentGoalId=null;

function freeAIOpenDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(FREE_AI_DB,FREE_AI_DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function freeAIGet(store,id){const db=await freeAIOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function freeAIAll(store){const db=await freeAIOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function freeAIPut(store,value){const db=await freeAIOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value);tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};});}
async function freeAIDelete(store,id){const db=await freeAIOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
function freeAIUid(){return crypto.randomUUID();}
function freeAINow(){return new Date().toISOString();}
function freeAIClamp(v){return Math.max(0,Math.min(1,Number(v)||0));}
function freeAIToast(message){const el=document.createElement("div");el.className="toast";el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),2400);}
function freeAIEsc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}

async function freeAIRecalcMastery(goalId){
  const ev=(await freeAIAll("evidence")).filter(x=>x.goalId===goalId);
  const existing=await freeAIGet("mastery",goalId);
  const goal=await freeAIGet("goals",goalId);
  const dims=["RECALL","UNDERSTANDING","APPLICATION","TRANSFER"];
  const values={};let confTotal=0,weightTotal=0;
  for(const d of dims){
    const rows=ev.filter(x=>x.dimension===d);let sw=0,ss=0;
    for(const x of rows){const w=freeAIClamp(x.confidence)*(x.independentRecall?1:.5);sw+=w;ss+=freeAIClamp(x.score)*w;confTotal+=freeAIClamp(x.confidence);weightTotal++;}
    values[d.toLowerCase()]=sw?ss/sw:null;
  }
  const available=dims.map(d=>values[d.toLowerCase()]).filter(v=>v!==null);
  const avg=available.length?available.reduce((a,b)=>a+b,0)/available.length:0;
  const confidence=weightTotal?confTotal/weightTotal:0;
  let status="NOT_ASSESSED";
  if(ev.length){if(avg>=.85&&confidence>=.70&&ev.length>=2)status="MASTERED";else if(avg>=.70)status="PROFICIENT";else if(avg>=.45)status="DEVELOPING";else status="WEAK";}
  const mastery={...(existing||{}),id:goalId,goalId,moduleId:existing?.moduleId||goal?.moduleId,...values,confidence,evidenceCount:ev.length,status,updatedAt:freeAINow()};
  await freeAIPut("mastery",mastery);
  await freeAIRecalcGap(goalId,mastery);
  return mastery;
}

async function freeAIRecalcGap(goalId,m){
  const current=(await freeAIAll("gaps")).filter(g=>g.goalId===goalId&&g.status==="OPEN");
  let type=null,severity=0,reason="";
  if(m.status==="NOT_ASSESSED"){type="NOT_ASSESSED";severity=.6;reason="Noch kein belastbarer Wissensnachweis.";}
  else if((m.recall??1)<.5){type="RECALL";severity=1-(m.recall??0);reason="Aktiver Abruf ist noch nicht stabil.";}
  else if((m.understanding??1)<.5){type="UNDERSTANDING";severity=1-(m.understanding??0);reason="Verständnis ist noch nicht stabil.";}
  else if((m.application??1)<.5){type="APPLICATION";severity=1-(m.application??0);reason="Anwendung braucht weitere Übung.";}
  else if((m.transfer??1)<.5){type="TRANSFER";severity=1-(m.transfer??0);reason="Transfer braucht weitere Übung.";}
  else if(m.confidence<.5){type="UNCERTAIN";severity=.5;reason="Wissensstand ist noch unsicher belegt.";}
  for(const g of current){if(g.type!==type)await freeAIPut("gaps",{...g,status:"RESOLVED",resolvedAt:freeAINow()});}
  if(type){const same=current.find(g=>g.type===type);await freeAIPut("gaps",same?{...same,severity,reason,confidence:m.confidence}:{id:freeAIUid(),goalId,moduleId:m.moduleId,type,severity,reason,confidence:m.confidence,status:"OPEN",createdAt:freeAINow()});}
  else for(const g of current)await freeAIPut("gaps",{...g,status:"RESOLVED",resolvedAt:freeAINow()});
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
  const evidence={id:freeAIUid(),goalId:goal.id,moduleId:goal.moduleId,dimension,score,confidence,independentRecall:independentRecall!==false,createdAt:freeAINow(),evaluationProvider:result?.provider||"UNKNOWN",evaluationPolicy:result?.policy||mode,feedback:String(result?.feedback||""),source,...metadata};
  await freeAIPut("evidence",evidence);
  const mastery=await freeAIRecalcMastery(goal.id);
  await freeAIInvalidateTodayPlan(goal.moduleId);
  return {result,evidence,mastery,goal};
}

async function freeAIEvaluateSelfTest(goalId,answer){
  return freeAIEvaluateAndPersist({goalId,answer,dimension:"UNDERSTANDING",source:"SELF_TEST"});
}

document.addEventListener("click",event=>{
  const goalLink=event.target.closest?.("[data-open-goal]");
  if(goalLink?.dataset.openGoal)freeAICurrentGoalId=goalLink.dataset.openGoal;
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
    const {result,mastery}=await freeAIEvaluateSelfTest(freeAICurrentGoalId,answer);
    const score=Math.round(freeAIClamp(result?.score)*100);
    const provider=result?.provider||"UNKNOWN";
    const policy=result?.policy?` · ${freeAIEsc(result.policy)}`:"";
    if(output)output.innerHTML=`<p><strong>${score}% · ${freeAIEsc(provider)}</strong></p><p>${freeAIEsc(result?.feedback||"Antwort wurde ausgewertet.")}</p><p class="small muted">Confidence ${Math.round(freeAIClamp(result?.confidence??.35)*100)}%${policy} · Mastery: ${freeAIEsc(mastery.status)}</p>`;
    freeAIToast(`Antwort ausgewertet · ${provider}`);
  }catch(error){freeAIToast(error.message||"Auswertung fehlgeschlagen.");}
  finally{button.disabled=false;button.textContent=old;}
},true);

window.LernappFreeAnswerAI={evaluateSelfTest:freeAIEvaluateSelfTest,evaluateAndPersist:freeAIEvaluateAndPersist,recalcMastery:freeAIRecalcMastery,invalidateTodayPlan:freeAIInvalidateTodayPlan};
