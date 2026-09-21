// Erweiterte Gamification nach Kapitel 20 (OPTIONAL).
//
// Die Grenze des Kapitels ist bindend: "Keine Belohnung darf dazu führen, dass
// bloßes Öffnen/Lesen als Mastery gewertet wird." Deshalb gilt hier:
//
// - Punkte entstehen ausschliesslich aus Evidence, also aus tatsaechlich
//   erbrachten Lernnachweisen. Ein geoeffneter Bildschirm, eine gelesene
//   Zusammenfassung oder eine Tutorantwort erzeugen nichts.
// - Punkte werden aus den vorhandenen Datensaetzen berechnet, nicht gezaehlt
//   und gespeichert. Ein Zaehler liesse sich durch wiederholtes Oeffnen
//   hochtreiben; eine Ableitung nicht.
// - Eine Evidence ohne unabhaengigen Abruf zaehlt halb, genau wie in der
//   Mastery nach Kapitel 32. Wiedererkennen ist weniger wert als Abrufen.
// - Punkte veraendern weder Mastery noch Lernplan. Sie sind Anzeige, nicht
//   Steuerung.

const GAME_DB="lernapp-pwa";
const GAME_DB_VERSION=2;
const GAME_POINTS_PER_EVIDENCE=10;

function gameOpenDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(GAME_DB,GAME_DB_VERSION);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function gameAll(store){const db=await gameOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).getAll();r.onsuccess=()=>{resolve(r.result||[]);db.close();};r.onerror=()=>reject(r.error);});}
function gameEsc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
function gameDayKey(value){const d=new Date(value||Date.now());return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}

// Ein Nachweis bringt bis zu zehn Punkte, gewichtet mit Ergebnis und
// Confidence. Eine geratene richtige Antwort ist damit deutlich weniger wert
// als eine sicher belegte freie Erklaerung.
function experienceFor(evidence){
  const score=Math.max(0,Math.min(1,Number(evidence.score)||0));
  const confidence=Math.max(0,Math.min(1,Number(evidence.confidence)||0));
  const abruf=evidence.independentRecall?1:.5;
  // Der Sockel von 0,2 haelt den Versuch selbst etwas wert, ohne dass sich mit
  // falschen Antworten nennenswert Punkte sammeln liessen.
  return GAME_POINTS_PER_EVIDENCE*(.2+.8*score)*confidence*abruf;
}

// Die Stufen wachsen quadratisch: der Abstand zur naechsten Stufe steigt, damit
// spaete Stufen etwas bedeuten und nicht nebenbei anfallen.
function levelFor(xp){
  const level=Math.floor(Math.sqrt(Math.max(0,xp)/60))+1;
  const start=60*(level-1)**2;
  const next=60*level**2;
  return {level,start,next,anteil:next>start?(xp-start)/(next-start):0};
}

function badgesFor({evidence,mastery,streak,sessions,coverage,independentShare}){
  const mastered=mastery.filter(m=>m.status==="MASTERED").length;
  return [
    {id:"erster-nachweis",label:"Erster Nachweis",hint:"Eine Lernaktivität ausgewertet",erreicht:evidence.length>=1},
    {id:"zehn-nachweise",label:"Zehn Nachweise",hint:"Zehn ausgewertete Lernaktivitäten",erreicht:evidence.length>=10},
    {id:"fuenfzig-nachweise",label:"Fünfzig Nachweise",hint:"Fünfzig ausgewertete Lernaktivitäten",erreicht:evidence.length>=50},
    {id:"erstes-beherrscht",label:"Erstes Lernziel beherrscht",hint:"Ein Lernziel im Status MASTERED",erreicht:mastered>=1},
    {id:"zehn-beherrscht",label:"Zehn Lernziele beherrscht",hint:"Zehn Lernziele im Status MASTERED",erreicht:mastered>=10},
    {id:"serie-sieben",label:"Sieben Tage am Stück",hint:"Sieben Lerntage in Folge",erreicht:streak>=7},
    {id:"serie-dreissig",label:"Dreißig Tage am Stück",hint:"Dreißig Lerntage in Folge",erreicht:streak>=30},
    {id:"simulation",label:"Prüfung simuliert",hint:"Eine Prüfungssimulation abgeschlossen",erreicht:sessions>=1},
    {id:"abdeckung",label:"Stoff erschlossen",hint:"80 % der lernrelevanten Seiten haben Lernziele",erreicht:coverage>=.8},
    {id:"freier-abruf",label:"Freier Abruf",hint:"Mindestens zwanzig Nachweise, überwiegend ohne Vorlage",erreicht:evidence.length>=20&&independentShare>=.6}
  ];
}

function gameStreak(evidence,reviews){
  const tage=new Set([...evidence.map(e=>gameDayKey(e.createdAt)),...reviews.map(r=>gameDayKey(r.reviewedAt))]);
  if(!tage.size)return 0;
  let cursor=tage.has(gameDayKey())?new Date():new Date(Date.now()-86400000);
  let laenge=0;
  while(tage.has(gameDayKey(cursor))){laenge++;cursor=new Date(cursor.getTime()-86400000);}
  return laenge;
}

async function renderGamification(){
  const slot=document.querySelector("#gamification-slot");
  if(!slot)return;
  const modules=await gameAll("modules");
  const aktiv=modules[0];
  if(!aktiv){slot.innerHTML="";return;}
  const evidence=(await gameAll("evidence")).filter(e=>e.moduleId===aktiv.id);
  const mastery=(await gameAll("mastery")).filter(m=>m.moduleId===aktiv.id);
  const reviews=(await gameAll("reviews")).filter(r=>r.moduleId===aktiv.id);
  const sessions=(await gameAll("examSessions")).filter(s=>s.moduleId===aktiv.id&&s.status==="COMPLETED").length;
  const goals=(await gameAll("goals")).filter(g=>g.moduleId===aktiv.id);
  const documents=(await gameAll("documents")).filter(d=>d.moduleId===aktiv.id);

  const abgedeckt=new Set(goals.map(g=>`${g.documentId}:${g.sourcePage}`));
  let relevante=0,mitZiel=0;
  for(const doc of documents)for(const page of doc.pages||[]){
    if(page.relevant===false)continue;
    relevante++;
    if(abgedeckt.has(`${doc.id}:${page.page}`))mitZiel++;
  }
  const coverage=relevante?mitZiel/relevante:0;
  const independentShare=evidence.length?evidence.filter(e=>e.independentRecall).length/evidence.length:0;

  const xp=Math.round(evidence.reduce((sum,e)=>sum+experienceFor(e),0));
  const stufe=levelFor(xp);
  const streak=gameStreak(evidence,reviews);
  const badges=badgesFor({evidence,mastery,streak,sessions,coverage,independentShare});
  const erreicht=badges.filter(b=>b.erreicht);
  const naechste=badges.find(b=>!b.erreicht);
  const heute=Math.round(evidence.filter(e=>gameDayKey(e.createdAt)===gameDayKey()).reduce((sum,e)=>sum+experienceFor(e),0));
  const anteil=Math.round(Math.max(0,Math.min(1,stufe.anteil))*100);

  slot.innerHTML=`<section class="card"><h2>Fortschrittspunkte</h2>
    <div class="row between"><span>Stufe ${stufe.level}</span><strong>${xp} XP</strong></div>
    <div class="progress-track"><div class="progress-fill" data-xp-fill></div></div>
    <div class="small muted">Noch ${Math.max(0,stufe.next-xp)} XP bis Stufe ${stufe.level+1} · heute ${heute} XP</div>
    <div class="row between spaced-top"><span>Meilensteine</span><strong>${erreicht.length} von ${badges.length}</strong></div>
    <div class="badge-grid">
      ${badges.map(b=>`<span class="badge ${b.erreicht?"good":""}" title="${gameEsc(b.hint)}">${b.erreicht?"":"· "}${gameEsc(b.label)}</span>`).join("")}
    </div>
    ${naechste?`<p class="small muted">Als Nächstes: ${gameEsc(naechste.label)} — ${gameEsc(naechste.hint)}.</p>`:`<p class="small muted">Alle Meilensteine erreicht.</p>`}
    <p class="small muted">Punkte entstehen nur aus ausgewerteten Lernnachweisen und sind mit Ergebnis und Confidence gewichtet; Wiedererkennen zählt halb. Lesen, Öffnen und Tutorantworten bringen nichts und verändern deinen Wissensstand nicht.</p>
  </section>`;
  // Die Breite ist ein Wert, keine Gestaltung; sie kann nicht im Stylesheet
  // stehen. Gesetzt wird sie am Element, nicht als style-Block im Markup.
  const fill=slot.querySelector("[data-xp-fill]");
  if(fill)fill.style.width=`${anteil}%`;
}

window.LernappGamification={render:renderGamification,experienceFor,levelFor,badgesFor};
document.addEventListener("lernapp:progress-rendered",renderGamification);
