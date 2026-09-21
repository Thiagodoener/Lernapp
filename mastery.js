// Gemeinsame Lernlogik nach Spec Kap. 6 und 11.
//
// Mastery, Stabilitaet und Wissensluecken lagen bisher doppelt in app.js und in
// free-answer-ai.js. Zwei Fassungen derselben Regel laufen unweigerlich
// auseinander, was Kap. 3.3 (deterministische Kernlogik) und Kap. 32
// (Aenderungen an Lernregeln muessen testbar und dokumentiert sein) verletzt.
// Diese Datei ist die einzige Stelle, an der die Regel steht.

const MASTERY_DB="lernapp-pwa";
const MASTERY_DB_VERSION=2;

function masteryOpenDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(MASTERY_DB,MASTERY_DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function masteryGet(store,id){const db=await masteryOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function masteryAll(store){const db=await masteryOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close();});}
async function masteryPut(store,value){const db=await masteryOpenDB();const row={...value,updatedAt:new Date().toISOString()};return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(row);tx.oncomplete=()=>{db.close();resolve(row);};tx.onerror=()=>{db.close();reject(tx.error);};});}
function masteryUid(){return crypto.randomUUID();}
function masteryNow(){return new Date().toISOString();}
function masteryClamp(v){return Math.max(0,Math.min(1,Number(v)||0));}

const MASTERY_DIMENSIONS=Object.freeze(["RECALL","UNDERSTANDING","APPLICATION","TRANSFER"]);

// Kap. 15: eine Karte gilt als verankert, wenn ihr Intervall 30 Tage erreicht.
const STABILITY_TARGET_DAYS=30;
// Ab dieser Ueberfaelligkeit ist der erreichte Stand nicht mehr belegt, sondern
// am Zerfallen. Sieben Tage, damit ein verpasstes Wochenende noch nichts umwirft.
const STABILITY_OVERDUE_DAYS=7;
const DAY_MS=86400000;

// Kap. 6: Stabilitaet ist eine eigene Groesse neben dem Mastery-Status. Sie
// kommt aus den FSRS-Intervallen der Karten dieses Lernziels, nicht aus der
// Bewertung einzelner Antworten.
function stabilityState(cards=[],now=Date.now()){
  const reviewed=cards.filter(c=>c?.fsrsCard&&Number(c.reviewCount||0)>0);
  if(!reviewed.length)return {state:"UNKNOWN",days:0,reviewedCards:0};
  const days=reviewed.reduce((sum,c)=>sum+Math.max(0,Number(c.fsrsCard?.stability)||0),0)/reviewed.length;
  const overdueDays=reviewed.reduce((max,c)=>{
    const due=new Date(c.dueAt||c.fsrsCard?.due||0).getTime();
    return Number.isFinite(due)?Math.max(max,(now-due)/DAY_MS):max;
  },0);
  const lapsing=reviewed.some(c=>Number(c.fsrsCard?.lapses||c.lapseCount||0)>0&&(Number(c.fsrsCard?.stability)||0)<STABILITY_OVERDUE_DAYS);
  if(overdueDays>STABILITY_OVERDUE_DAYS||lapsing)return {state:"DECAYING",days,reviewedCards:reviewed.length};
  if(days>=STABILITY_TARGET_DAYS)return {state:"STABLE",days,reviewedCards:reviewed.length};
  return {state:"UNSTABLE",days,reviewedCards:reviewed.length};
}

// Kap. 11: die Typen heissen genau so wie in der Spezifikation, damit Befund und
// Regelwerk dieselbe Sprache sprechen.
const GAP_LABELS=Object.freeze({
  CRITICAL_NOT_ASSESSED:"Ungeprüft",
  RECALL_FAILURE:"Abruf",
  UNDERSTANDING_FAILURE:"Verständnis",
  APPLICATION_FAILURE:"Anwendung",
  TRANSFER_FAILURE:"Transfer",
  HIGH_UNCERTAINTY:"Unsicher belegt"
});

function gapLabel(type){return GAP_LABELS[type]||String(type||"");}

function evaluateGap(m){
  if(m.status==="NOT_ASSESSED")return {type:"CRITICAL_NOT_ASSESSED",severity:.6,reason:"Noch kein belastbarer Wissensnachweis."};
  if((m.recall??1)<.5)return {type:"RECALL_FAILURE",severity:1-(m.recall??0),reason:"Aktiver Abruf ist noch nicht stabil."};
  if((m.understanding??1)<.5)return {type:"UNDERSTANDING_FAILURE",severity:1-(m.understanding??0),reason:"Verständnis ist noch nicht stabil."};
  if((m.application??1)<.5)return {type:"APPLICATION_FAILURE",severity:1-(m.application??0),reason:"Anwendung braucht weitere Übung."};
  if((m.transfer??1)<.5)return {type:"TRANSFER_FAILURE",severity:1-(m.transfer??0),reason:"Transfer braucht weitere Übung."};
  if((m.confidence??0)<.5)return {type:"HIGH_UNCERTAINTY",severity:.5,reason:"Wissensstand ist noch unsicher belegt."};
  return null;
}

async function recalcGap(goalId,m){
  const current=(await masteryAll("gaps")).filter(g=>g.goalId===goalId&&g.status==="OPEN");
  const found=evaluateGap(m);
  const type=found?.type||null;
  for(const g of current){
    if(g.type!==type)await masteryPut("gaps",{...g,status:"RESOLVED",resolvedAt:masteryNow()});
  }
  if(!found)return null;
  const same=current.find(g=>g.type===type);
  return masteryPut("gaps",same
    ?{...same,severity:found.severity,reason:found.reason,confidence:m.confidence}
    :{id:masteryUid(),goalId,moduleId:m.moduleId,type,severity:found.severity,reason:found.reason,confidence:m.confidence,status:"OPEN",createdAt:masteryNow()});
}

// Kap. 32: eine angezeigte Antwort ist kein unabhaengiger Abruf. Solche Evidence
// wird halb gewichtet statt verworfen, damit sie den Stand weder beweist noch
// vollstaendig verschwindet.
async function recalcMastery(goalId){
  const [evidenceRows,existing,goal,cards]=await Promise.all([
    masteryAll("evidence"),
    masteryGet("mastery",goalId),
    masteryGet("goals",goalId),
    masteryAll("flashcards")
  ]);
  const ev=evidenceRows.filter(x=>x.goalId===goalId);
  const values={};
  let confTotal=0,weightTotal=0;
  for(const d of MASTERY_DIMENSIONS){
    const rows=ev.filter(x=>x.dimension===d);
    let sw=0,ss=0;
    for(const x of rows){
      const w=masteryClamp(x.confidence)*(x.independentRecall?1:.5);
      sw+=w;ss+=masteryClamp(x.score)*w;
      confTotal+=masteryClamp(x.confidence);weightTotal++;
    }
    values[d.toLowerCase()]=sw?ss/sw:null;
  }
  const available=MASTERY_DIMENSIONS.map(d=>values[d.toLowerCase()]).filter(v=>v!==null);
  const avg=available.length?available.reduce((a,b)=>a+b,0)/available.length:0;
  const confidence=weightTotal?confTotal/weightTotal:0;
  // Kap. 6: MASTERED nur bei ausreichender Evidence und Confidence. Eine
  // niedrig-konfidente lokale Heuristik allein reicht dafuer nie.
  let status="NOT_ASSESSED";
  if(ev.length){
    if(avg>=.85&&confidence>=.70&&ev.length>=2)status="MASTERED";
    else if(avg>=.70)status="PROFICIENT";
    else if(avg>=.45)status="DEVELOPING";
    else status="WEAK";
  }
  const stability=stabilityState(cards.filter(c=>c.goalId===goalId));
  const mastery={
    ...(existing||{}),id:goalId,goalId,
    moduleId:existing?.moduleId||goal?.moduleId,
    ...values,confidence,evidenceCount:ev.length,status,
    stability:stability.state,stabilityDays:stability.days,
    updatedAt:masteryNow()
  };
  await masteryPut("mastery",mastery);
  await recalcGap(goalId,mastery);
  return mastery;
}

// Kap. 10: Evidence muss Herkunft, Bewertungs-Policy und Quelle mitfuehren,
// sonst ist der Wissensstand nicht mehr nachvollziehbar.
async function addEvidence({goalId,dimension,score,confidence,independentRecall=true,provider="LOCAL",policy="OBJECTIVE",feedback="",source="UNSPECIFIED",...rest}={}){
  const goal=await masteryGet("goals",goalId);
  if(!goal)return null;
  await masteryPut("evidence",{
    id:masteryUid(),goalId,moduleId:goal.moduleId,dimension,
    score:masteryClamp(score),confidence:masteryClamp(confidence),
    independentRecall:independentRecall!==false,
    evaluationProvider:provider,evaluationPolicy:policy,
    feedback:String(feedback||""),source,
    createdAt:masteryNow(),...rest
  });
  return recalcMastery(goalId);
}

window.LernappMastery={
  dimensions:MASTERY_DIMENSIONS,
  stabilityTargetDays:STABILITY_TARGET_DAYS,
  stabilityState,
  gapLabel,
  gapTypes:Object.keys(GAP_LABELS),
  recalcMastery,
  recalcGap,
  addEvidence
};
