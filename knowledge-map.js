// Wissenslandkarte nach Kapitel 2 (OPTIONAL) und dem Wissensmodell aus
// Kapitel 5: Concept und ConceptRelationship.
//
// Die Karte wird aus den vorhandenen Lernzielen abgeleitet, nicht zusaetzlich
// gespeichert. Kapitel 29 raet von neuen Stores ab, und Kapitel 5 laesst
// vereinfachte lokale Repraesentationen ausdruecklich zu. Sie kostet damit auch
// keinen KI-Aufruf, was Kapitel 3.5 entspricht.
//
// Ein Konzept ist ein Fachbegriff, der in mindestens zwei Lernzielen desselben
// Moduls vorkommt. Eine Beziehung besteht zwischen zwei Konzepten, die sich ein
// Lernziel teilen. Das ist bewusst deterministisch: eine geratene
// Begriffshierarchie waere schlechter als gar keine, weil sie den Lernplan in
// eine falsche Richtung lenken wuerde.

const MAP_DB="lernapp-pwa";
const MAP_DB_VERSION=2;
const MAP_MIN_GOALS=2;
const MAP_MAX_CONCEPTS=14;
const MAP_STOPWORDS=new Set([
  "erkläre","erklaere","beschreibe","nenne","begründe","begruende","welche","welcher","welches",
  "warum","wieso","inwiefern","bedeutung","zusammenhang","zusammenhänge","beispiel","beispiele",
  "aufgabe","inhalt","inhalte","seite","kapitel","folgende","folgenden","dabei","zwischen",
  "dass","werden","wurde","wird","sind","haben","können","koennen","sowie","durch","einer","eines","einem"
]);

function mapOpenDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(MAP_DB,MAP_DB_VERSION);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function mapAll(store){const db=await mapOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).getAll();r.onsuccess=()=>{resolve(r.result||[]);db.close();};r.onerror=()=>reject(r.error);});}
function mapEsc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}

function mapTerms(text){
  const words=String(text||"").split(/[^\p{L}\p{N}ß-]+/u).filter(Boolean);
  const terms=new Set();
  for(const word of words){
    const clean=word.replace(/^[-]+|[-]+$/g,"");
    if(clean.length<5)continue;
    const lower=clean.toLowerCase();
    if(MAP_STOPWORDS.has(lower))continue;
    if(/^\d+$/.test(clean))continue;
    terms.add(lower);
  }
  return terms;
}

// Aus Lernzielen werden Konzepte und ihre Beziehungen. Ein Konzept traegt die
// Lernziele, in denen es vorkommt, damit die Karte kein Selbstzweck bleibt,
// sondern zum Lernziel fuehrt.
function buildKnowledgeMap(goals,mastery){
  const byTerm=new Map();
  for(const goal of goals){
    for(const term of mapTerms(`${goal.statement||""} ${goal.answerKey||""}`)){
      if(!byTerm.has(term))byTerm.set(term,new Set());
      byTerm.get(term).add(goal.id);
    }
  }
  const masteryByGoal=new Map(mastery.map(m=>[m.goalId,m]));
  const value=goalId=>{
    const m=masteryByGoal.get(goalId);
    const werte=m?[m.recall,m.understanding,m.application,m.transfer].filter(v=>v!==null&&v!==undefined):[];
    return werte.length?werte.reduce((a,b)=>a+b,0)/werte.length:0;
  };
  const concepts=[...byTerm.entries()]
    .filter(([,goalIds])=>goalIds.size>=MAP_MIN_GOALS)
    .map(([term,goalIds])=>{
      const ids=[...goalIds];
      const offen=ids.filter(id=>!masteryByGoal.get(id)||masteryByGoal.get(id).status==="NOT_ASSESSED").length;
      return {
        id:term,
        label:term.charAt(0).toUpperCase()+term.slice(1),
        goalIds:ids,
        mastery:ids.reduce((sum,id)=>sum+value(id),0)/ids.length,
        ungeprueft:offen
      };
    })
    .sort((a,b)=>b.goalIds.length-a.goalIds.length||a.label.localeCompare(b.label))
    .slice(0,MAP_MAX_CONCEPTS);

  const index=new Map(concepts.map((c,i)=>[c.id,i]));
  const relationships=[];
  for(let i=0;i<concepts.length;i++){
    for(let j=i+1;j<concepts.length;j++){
      const gemeinsam=concepts[i].goalIds.filter(id=>concepts[j].goalIds.includes(id)).length;
      if(gemeinsam)relationships.push({from:i,to:j,weight:gemeinsam});
    }
  }
  return {concepts,relationships,index};
}

function mapColor(concept){
  if(concept.mastery>=.7)return "var(--good)";
  if(concept.mastery>=.45)return "var(--warn)";
  if(concept.mastery>0)return "var(--danger)";
  return "var(--muted)";
}

// Kreisfoermige Anordnung statt einer Kraftsimulation: sie ist deterministisch,
// braucht keine Bibliothek und bleibt auf einem Telefon lesbar.
function mapSvg(map){
  const size=300,center=size/2,radius=size/2-46;
  const punkte=map.concepts.map((concept,i)=>{
    const winkel=(i/map.concepts.length)*Math.PI*2-Math.PI/2;
    return {x:center+Math.cos(winkel)*radius,y:center+Math.sin(winkel)*radius,concept};
  });
  const kanten=map.relationships.map(rel=>{
    const a=punkte[rel.from],b=punkte[rel.to];
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="var(--line)" stroke-width="${Math.min(3,rel.weight)}"/>`;
  }).join("");
  const knoten=punkte.map(({x,y,concept})=>{
    const r=Math.min(22,10+concept.goalIds.length*2);
    return `<g class="map-node" data-concept="${mapEsc(concept.id)}" tabindex="0" role="button"
       aria-label="${mapEsc(concept.label)}, ${concept.goalIds.length} Lernziele">
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${mapColor(concept)}" fill-opacity=".22" stroke="${mapColor(concept)}" stroke-width="1.5"/>
      <text x="${x.toFixed(1)}" y="${(y+4).toFixed(1)}" text-anchor="middle" class="map-node-count">${concept.goalIds.length}</text>
      <text x="${x.toFixed(1)}" y="${(y+r+13).toFixed(1)}" text-anchor="middle" class="map-node-label">${mapEsc(concept.label.slice(0,14))}</text>
    </g>`;
  }).join("");
  return `<svg viewBox="0 0 ${size} ${size}" class="knowledge-map" role="img" aria-label="Wissenslandkarte des Moduls">${kanten}${knoten}</svg>`;
}

async function renderKnowledgeMap(){
  const slot=document.querySelector("#map-slot");
  if(!slot)return;
  const modules=await mapAll("modules");
  const aktiv=modules[0];
  if(!aktiv){slot.innerHTML="";return;}
  const goals=(await mapAll("goals")).filter(g=>g.moduleId===aktiv.id);
  const map=buildKnowledgeMap(goals,await mapAll("mastery"));
  if(!map.concepts.length){
    slot.innerHTML=`<section class="card"><h2>Wissenslandkarte</h2>
      <div class="empty">Sobald mehrere Lernziele denselben Fachbegriff behandeln, zeigt die Karte, wie sie zusammenhängen.</div></section>`;
    return;
  }
  const schwach=map.concepts.filter(c=>c.mastery<.45).length;
  slot.innerHTML=`<section class="card"><h2>Wissenslandkarte</h2>
    <p class="small muted">${map.concepts.length} Begriffe aus deinen Lernzielen, verbunden, wo sie gemeinsam vorkommen. Die Größe zeigt, wie oft ein Begriff auftaucht, die Farbe deinen Stand.</p>
    ${mapSvg(map)}
    <p class="small muted">${schwach} Begriff${schwach===1?"":"e"} mit schwachem oder fehlendem Nachweis. Tippe einen Begriff an, um seine Lernziele zu sehen.</p>
  </section>`;
  slot.querySelectorAll("[data-concept]").forEach(node=>{
    const oeffnen=()=>{
      const concept=map.concepts.find(c=>c.id===node.dataset.concept);
      if(!concept)return;
      const box=document.querySelector("#modal-content"),modal=document.querySelector("#modal");
      if(!box||!modal)return;
      const ziele=goals.filter(g=>concept.goalIds.includes(g.id));
      box.innerHTML=`<div class="eyebrow">BEGRIFF</div><h2>${mapEsc(concept.label)}</h2>
        <p class="small muted">${concept.goalIds.length} Lernziele · Stand ${Math.round(concept.mastery*100)} %${concept.ungeprueft?` · ${concept.ungeprueft} davon ungeprüft`:""}</p>
        ${ziele.map(g=>`<div class="list-item clickable" data-open-goal="${mapEsc(g.id)}"><div class="row between"><strong>${mapEsc(g.statement||"")}</strong><span class="list-row-chevron" aria-hidden="true">›</span></div><div class="source">Seite ${mapEsc(String(g.sourcePage??"–"))}</div></div>`).join("")}`;
      modal.showModal();
    };
    node.addEventListener("click",oeffnen);
    node.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();oeffnen();}});
  });
}

window.LernappKnowledgeMap={render:renderKnowledgeMap,build:buildKnowledgeMap};
document.addEventListener("lernapp:progress-rendered",renderKnowledgeMap);
