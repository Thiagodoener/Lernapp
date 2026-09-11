const QUIZ_DB="lernapp-pwa";
const QUIZ_DB_VERSION=2;
const QUIZ_LENGTH=8;
// Drei Optionen sind das Minimum, das noch eine echte Entscheidung verlangt.
const QUIZ_MIN_DISTRACTORS=2;

function quizOpenDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(QUIZ_DB,QUIZ_DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function quizAll(store){const db=await quizOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function quizGet(store,id){const db=await quizOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function quizPut(store,value){const db=await quizOpenDB();value={...value,updatedAt:new Date().toISOString()};return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value);tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};});}

function quizEsc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
function quizToast(message){const el=document.createElement("div");el.className="toast";el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),2400);}
function quizShowModal(html){const modal=document.querySelector("#modal"),box=document.querySelector("#modal-content");if(!modal||!box)return null;box.innerHTML=html;if(!modal.open)modal.showModal();return box;}

function quizShuffle(list){
  const items=[...list];
  for(let i=items.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [items[i],items[j]]=[items[j],items[i]];
  }
  return items;
}

// Doppelte oder mit der richtigen Antwort identische Optionen wuerden die Frage
// unbeantwortbar machen, deshalb fallen sie hier raus statt erst in der Anzeige.
function quizCleanDistractors(list,answer){
  const seen=new Set([String(answer||"").trim().toLowerCase()]);
  const cleaned=[];
  for(const raw of Array.isArray(list)?list:[]){
    const text=String(raw||"").trim();
    const key=text.toLowerCase();
    if(!text||seen.has(key))continue;
    seen.add(key);
    cleaned.push(text);
  }
  return cleaned;
}

// app.js setzt das aktive Modul immer auf den ersten Datensatz im Store.
async function quizModuleId(){
  const modules=await quizAll("modules");
  return modules[0]?.id||null;
}

async function quizCandidates(){
  const moduleId=await quizModuleId();
  const cards=(await quizAll("flashcards")).filter(card=>
    card.moduleId===moduleId
    && String(card.prompt||"").trim()
    && String(card.answer||"").trim()
  );
  const mastery=await quizAll("mastery");
  const now=Date.now();
  const ranked=cards.map(card=>{
    const m=mastery.find(x=>x.goalId===card.goalId);
    const values=m?[m.recall,m.understanding,m.application,m.transfer].filter(v=>v!==null&&v!==undefined):[];
    const average=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
    const weakness=(!m||m.status==="NOT_ASSESSED")?1:1-average;
    const due=new Date(card.dueAt).getTime()<=now?0.3:0;
    return {card,score:weakness+due};
  }).sort((a,b)=>b.score-a.score);
  return {cards,ranked};
}

async function quizBuild(){
  if(!window.AIService)throw new Error("Der AIService ist nicht verfügbar.");
  const {cards,ranked}=await quizCandidates();
  const pool=cards.map(card=>String(card.answer||"").trim()).filter(Boolean);
  if(pool.length<4)throw new Error("Für ein Quiz braucht es mindestens vier Karteikarten mit Antwort.");

  const items=ranked.slice(0,QUIZ_LENGTH).map(entry=>({
    id:entry.card.id,
    question:entry.card.prompt,
    answer:entry.card.answer
  }));

  let provider="LOCAL";
  const distractors=new Map();
  try{
    const result=await window.AIService.generateChoiceOptions({items,pool});
    provider=result?.provider||"CLOUD";
    for(const entry of result?.items||[]){
      const item=items.find(x=>x.id===entry?.id);
      if(item)distractors.set(item.id,quizCleanDistractors(entry?.distractors,item.answer).slice(0,3));
    }
  }catch(error){
    provider="LOCAL";
  }

  // Was die KI nicht oder unbrauchbar geliefert hat, wird lokal aufgefuellt,
  // damit einzelne fehlende Optionen nicht die ganze Frage kosten.
  const incomplete=items.filter(item=>(distractors.get(item.id)||[]).length<3);
  if(incomplete.length){
    const local=await window.AIService.localChoiceOptions({items:incomplete,pool}).catch(()=>null);
    for(const entry of local?.items||[]){
      const item=items.find(x=>x.id===entry?.id);
      if(!item)continue;
      const merged=[...(distractors.get(item.id)||[]),...(entry?.distractors||[])];
      distractors.set(item.id,quizCleanDistractors(merged,item.answer).slice(0,3));
    }
  }

  const questions=items
    .map(item=>({cardId:item.id,question:item.question,answer:item.answer,distractors:distractors.get(item.id)||[]}))
    .filter(question=>question.distractors.length>=QUIZ_MIN_DISTRACTORS);

  if(!questions.length)throw new Error("Aus diesen Karten ließen sich keine unterscheidbaren Antwortmöglichkeiten bilden.");
  return {questions,provider};
}

// Wiedererkennen ist kein freier Abruf: die Evidence zaehlt deshalb als
// abhaengiger Abruf und wird in der Mastery nur halb gewichtet. Die Confidence
// bleibt niedrig, weil eine richtige Antwort auch geraten sein kann.
async function quizRecordAnswer(cardId,isCorrect){
  const card=await quizGet("flashcards",cardId);
  if(!card?.goalId)return;
  const goal=await quizGet("goals",card.goalId);
  if(!goal)return;
  await quizPut("evidence",{
    id:crypto.randomUUID(),
    goalId:goal.id,
    moduleId:goal.moduleId,
    dimension:"RECALL",
    score:isCorrect?1:0,
    confidence:.45,
    independentRecall:false,
    createdAt:new Date().toISOString(),
    source:"MULTIPLE_CHOICE",
    evaluationProvider:"LOCAL",
    evaluationPolicy:"OBJECTIVE",
    cardId
  });
  await window.LernappFreeAnswerAI?.recalcMastery(goal.id).catch(()=>{});
  await window.LernappFreeAnswerAI?.invalidateTodayPlan(goal.moduleId).catch(()=>{});
}

function quizRun(questions,provider){
  let index=0;
  let correctCount=0;

  function drawResult(){
    const share=questions.length?correctCount/questions.length:0;
    quizShowModal(`
      <div class="eyebrow">QUIZ ABGESCHLOSSEN</div>
      <div class="hero-value">${Math.round(share*100)}%</div>
      <p>${correctCount} von ${questions.length} richtig</p>
      <p class="small muted">Das Ergebnis fließt als Wiedererkennung in deinen Wissensstand ein und zählt dort halb, weil eine ausgewählte Antwort kein freier Abruf ist.</p>
      <button type="button" class="primary full" id="quiz-done">Fertig</button>
    `);
    document.querySelector("#quiz-done").onclick=()=>{
      document.querySelector("#modal")?.close();
      document.querySelector('[data-tab="learn"]')?.click();
    };
  }

  function draw(){
    const question=questions[index];
    const options=quizShuffle([question.answer,...question.distractors]);
    quizShowModal(`
      <div class="row between">
        <div class="eyebrow">QUIZ ${index+1} / ${questions.length}</div>
        <span class="badge">${quizEsc(provider)}</span>
      </div>
      <h2>${quizEsc(question.question)}</h2>
      <div class="quiz-options">
        ${options.map((text,i)=>`<button type="button" class="quiz-option" data-quiz-option="${i}">${quizEsc(text)}</button>`).join("")}
      </div>
      <div id="quiz-feedback"></div>
    `);

    const buttons=[...document.querySelectorAll("[data-quiz-option]")];
    buttons.forEach(button=>{
      button.onclick=async()=>{
        const chosen=options[Number(button.dataset.quizOption)];
        const isCorrect=chosen===question.answer;
        if(isCorrect)correctCount++;
        buttons.forEach((other,i)=>{
          other.disabled=true;
          if(options[i]===question.answer)other.classList.add("correct");
          else if(other===button)other.classList.add("wrong");
        });
        const feedback=document.querySelector("#quiz-feedback");
        if(feedback){
          feedback.innerHTML=`
            <p class="small ${isCorrect?"":"muted"}"><strong>${isCorrect?"Richtig.":"Nicht richtig."}</strong>${isCorrect?"":` Richtig ist: ${quizEsc(question.answer)}`}</p>
            <button type="button" class="primary full" id="quiz-next">${index+1<questions.length?"Weiter":"Ergebnis anzeigen"}</button>
          `;
          document.querySelector("#quiz-next").onclick=()=>{
            index++;
            if(index<questions.length)draw();else drawResult();
          };
        }
        await quizRecordAnswer(question.cardId,isCorrect).catch(()=>{});
      };
    });
  }

  draw();
}

async function injectQuizCard(){
  const slot=document.querySelector("#quiz-slot");
  if(!slot||slot.querySelector("#quiz-card"))return false;

  const card=document.createElement("section");
  card.id="quiz-card";
  card.className="card";
  card.innerHTML=`
    <h2>Multiple Choice</h2>
    <p class="small muted">Wird geladen …</p>
  `;
  slot.appendChild(card);

  const {cards}=await quizCandidates();
  const possible=Math.min(QUIZ_LENGTH,cards.length);
  const ready=cards.length>=4;
  card.innerHTML=`
    <h2>Multiple Choice</h2>
    <p class="small muted">${ready
      ? `${possible} Fragen aus deinen Karteikarten, zuerst aus den schwächsten Lernzielen. Die falschen Antwortmöglichkeiten entstehen aus dem Cloud-Modell, im LOCAL-Modus aus den Antworten deiner übrigen Karten.`
      : "Für ein Quiz braucht es mindestens vier Karteikarten mit Antwort. Importiere dafür weiteres Material."}</p>
    ${ready?`<button type="button" class="primary full" id="quiz-start">Quiz starten</button>`:""}
  `;

  const start=card.querySelector("#quiz-start");
  if(start){
    start.onclick=async()=>{
      start.disabled=true;
      const label=start.textContent;
      start.textContent="Fragen werden vorbereitet …";
      try{
        const {questions,provider}=await quizBuild();
        quizRun(questions,provider);
      }catch(error){
        quizToast(error.message||"Quiz konnte nicht gestartet werden.");
      }finally{
        start.disabled=false;
        start.textContent=label;
      }
    };
  }
  return true;
}

const quizObserver=new MutationObserver(()=>{injectQuizCard().catch(()=>{});});
const quizContent=document.querySelector("#content");
if(quizContent)quizObserver.observe(quizContent,{childList:true,subtree:false});
setTimeout(()=>injectQuizCard().catch(()=>{}),0);

window.LernappQuiz={build:quizBuild,candidates:quizCandidates};
