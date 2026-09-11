const EXAM_AI_DB="lernapp-pwa";
const EXAM_AI_DB_VERSION=2;
let examAITimer=null;

function examAIOpenDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(EXAM_AI_DB,EXAM_AI_DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function examAIAll(store){const db=await examAIOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function examAIPut(store,value){const db=await examAIOpenDB();value={...value,updatedAt:new Date().toISOString()};return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value);tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};});}
function examAINow(){return new Date().toISOString();}
function examAIToast(message){const el=document.createElement("div");el.className="toast";el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),2400);}
function examAIEsc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
function examAIFormatTime(ms){const total=Math.ceil(Math.max(0,ms)/1000),min=Math.floor(total/60),sec=total%60;return `${min}:${String(sec).padStart(2,"0")}`;}
function examAISpeechSupported(){return Boolean(window.SpeechRecognition||window.webkitSpeechRecognition);}
function examAIStartSpeech(textarea){const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R){examAIToast("Spracherkennung wird hier nicht unterstützt. Bitte tippen.");return;}const r=new R();r.lang="de-DE";r.interimResults=true;r.continuous=true;let finalText=textarea.value.trim();r.onresult=e=>{let interim="";for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)finalText+=(finalText?" ":"")+t.trim();else interim+=t;}textarea.value=`${finalText}${interim?" "+interim:""}`.trim();};r.onerror=()=>examAIToast("Spracherkennung beendet. Texteingabe bleibt verfügbar.");r.start();examAIToast("Sprich jetzt deine Antwort.");}

async function examAIActiveSession(){return (await examAIAll("examSessions")).filter(x=>x.status==="IN_PROGRESS").sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt))[0]||null;}

async function examAIComplete(session){
  if(examAITimer){clearInterval(examAITimer);examAITimer=null;}
  let total=0,answered=0;const weak=[];
  for(const item of session.items||[]){const score=Number.isFinite(item.score)?item.score:0;total+=score;if(item.answeredAt)answered++;if(score<.60)weak.push(item.goalId);}
  session.status="COMPLETED";session.completedAt=examAINow();session.overallScore=session.items?.length?total/session.items.length:0;session.answeredCount=answered;session.weakGoalIds=[...new Set(weak)];session.evaluationPipeline="AIService";
  await examAIPut("examSessions",session);
  if(session.moduleId&&window.LernappFreeAnswerAI?.invalidateTodayPlan)await window.LernappFreeAnswerAI.invalidateTodayPlan(session.moduleId).catch(()=>{});
  examAIRenderResult(session);
}

function examAIRenderResult(session){
  const box=document.querySelector("#modal-content");const modal=document.querySelector("#modal");if(!box||!modal)return;
  box.innerHTML=`<div class="eyebrow">PRÜFUNG ABGESCHLOSSEN · AISERVICE</div><div class="hero-value">${Math.round((session.overallScore||0)*100)}%</div><p>${session.answeredCount||0} von ${session.items?.length||0} beantwortet</p><p class="muted">${session.weakGoalIds?.length||0} schwache Lernziele wurden zurück in Mastery und Tagesplanung gespielt.</p><button type="button" class="primary full" id="exam-ai-done">Fertig</button>`;
  document.querySelector("#exam-ai-done").onclick=()=>modal.close();
}

async function examAIRenderQuestion(session){
  if(examAITimer){clearInterval(examAITimer);examAITimer=null;}
  const index=(session.items||[]).findIndex(x=>!x.answeredAt);
  if(index<0)return examAIComplete(session);
  const deadline=new Date(session.startedAt).getTime()+(session.timeLimitMinutes||30)*60000;
  const remaining=Math.max(0,deadline-Date.now());
  if(remaining<=0)return examAIComplete(session);
  const item=session.items[index];const box=document.querySelector("#modal-content"),modal=document.querySelector("#modal");if(!box||!modal)return;
  box.innerHTML=`<div class="row between"><div class="eyebrow">PRÜFUNG ${index+1} / ${session.items.length} · AISERVICE</div><span class="badge" id="exam-timer">${examAIFormatTime(remaining)}</span></div><h2>${examAIEsc(item.prompt)}</h2><div class="source">${examAIEsc(item.dimension)}</div><textarea id="exam-answer" placeholder="Deine Antwort …">${examAIEsc(item.response||"")}</textarea>${examAISpeechSupported()?'<button type="button" class="secondary full" id="exam-speech">🎙 Antwort sprechen</button>':'<p class="small muted">Spracherkennung ist hier nicht verfügbar; Texteingabe funktioniert immer.</p>'}<button type="button" class="primary full" id="exam-submit">Antwort speichern</button><button type="button" class="secondary full" id="exam-finish">Prüfung beenden</button><div id="exam-ai-feedback"></div>`;
  document.querySelector("#exam-speech")?.addEventListener("click",()=>examAIStartSpeech(document.querySelector("#exam-answer")));
  examAITimer=setInterval(async()=>{if(!modal.open){clearInterval(examAITimer);examAITimer=null;return;}const left=Math.max(0,deadline-Date.now());const el=document.querySelector("#exam-timer");if(el)el.textContent=examAIFormatTime(left);if(left<=0){clearInterval(examAITimer);examAITimer=null;await examAIComplete(session);}},1000);
}

async function examAISubmit(){
  const session=await examAIActiveSession();if(!session){examAIToast("Keine aktive Prüfung gefunden.");return;}
  const index=(session.items||[]).findIndex(x=>!x.answeredAt);if(index<0)return examAIComplete(session);
  const item=session.items[index];const textarea=document.querySelector("#exam-answer"),button=document.querySelector("#exam-submit"),feedback=document.querySelector("#exam-ai-feedback");const answer=textarea?.value.trim();
  if(!answer){examAIToast("Bitte antworte oder beende die Prüfung.");return;}
  if(!window.LernappFreeAnswerAI?.evaluateAndPersist){examAIToast("Gemeinsame AI-Bewertung ist nicht verfügbar.");return;}
  button.disabled=true;const old=button.textContent;button.textContent="Wird ausgewertet …";
  try{
    const {result,mastery}=await window.LernappFreeAnswerAI.evaluateAndPersist({goalId:item.goalId,answer,dimension:item.dimension||"UNDERSTANDING",question:item.prompt,context:item.answerKey||"",source:"EXAM_SIMULATION",metadata:{examId:session.examId,examSessionId:session.id,examItemId:item.id}});
    item.response=answer;item.score=Math.max(0,Math.min(1,Number(result?.score)||0));item.answeredAt=examAINow();item.evaluationProvider=result?.provider||"UNKNOWN";item.evaluationConfidence=Math.max(0,Math.min(1,Number(result?.confidence)||0));item.evaluationPolicy=result?.policy||null;item.feedback=String(result?.feedback||"");item.masteryAfter=mastery.status;
    session.items[index]=item;await examAIPut("examSessions",session);
    if(feedback)feedback.innerHTML=`<p><strong>${Math.round(item.score*100)}% · ${examAIEsc(item.evaluationProvider)}</strong></p><p>${examAIEsc(item.feedback||"Antwort wurde ausgewertet.")}</p>`;
    examAIToast(`Antwort ausgewertet · ${item.evaluationProvider}`);
    setTimeout(()=>examAIRenderQuestion(session),450);
  }catch(error){examAIToast(error.message||"Auswertung fehlgeschlagen.");button.disabled=false;button.textContent=old;}
}

document.addEventListener("click",event=>{
  const submit=event.target.closest?.("#exam-submit");
  if(submit){event.preventDefault();event.stopImmediatePropagation();examAISubmit();return;}
  const finish=event.target.closest?.("#exam-finish");
  if(finish){event.preventDefault();event.stopImmediatePropagation();examAIActiveSession().then(s=>s?examAIComplete(s):examAIToast("Keine aktive Prüfung gefunden."));}
},true);

window.LernappExamAI={activeSession:examAIActiveSession,complete:examAIComplete,renderQuestion:examAIRenderQuestion};
