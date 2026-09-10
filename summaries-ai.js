const SUMMARY_DB_NAME="lernapp-pwa";
const SUMMARY_DB_VERSION=2;
let summaryPendingDocumentId=null;

function summaryOpenDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(SUMMARY_DB_NAME,SUMMARY_DB_VERSION);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function summaryGetDocument(id){
  const db=await summaryOpenDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("documents","readonly");
    const req=tx.objectStore("documents").get(id);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
    tx.oncomplete=()=>db.close();
  });
}

async function summarySaveDocument(documentRecord){
  const db=await summaryOpenDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("documents","readwrite");
    tx.objectStore("documents").put(documentRecord);
    tx.oncomplete=()=>{db.close();resolve(documentRecord);};
    tx.onerror=()=>{db.close();reject(tx.error);};
  });
}

function summaryEsc(value=""){
  return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
}

function summaryToast(message){
  const el=document.createElement("div");
  el.className="toast";
  el.textContent=message;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),2200);
}

// Der Proxy begrenzt den Quelltext auf 60.000 Zeichen. Abschnitte bleiben mit
// Sicherheitsabstand darunter, damit die Prompt-Rahmung mit hineinpasst.
const SUMMARY_SECTION_CHARS=40000;
const SUMMARY_MAX_SECTIONS=40;
const SUMMARY_MAX_REDUCE_ROUNDS=4;

// Seitengrenzen bleiben nach Möglichkeit erhalten, damit ein Abschnitt nicht
// mitten in einem Satz beginnt und der Quellenbezug lesbar bleibt.
function summarySections(documentRecord){
  const sections=[];
  let current="";
  for(const page of documentRecord?.pages||[]){
    const text=String(page.text||"").trim();
    if(!text)continue;
    if(text.length>=SUMMARY_SECTION_CHARS){
      if(current){sections.push(current);current="";}
      for(let i=0;i<text.length;i+=SUMMARY_SECTION_CHARS)sections.push(text.slice(i,i+SUMMARY_SECTION_CHARS));
      continue;
    }
    if(current.length+text.length+2>SUMMARY_SECTION_CHARS){sections.push(current);current=text;}
    else current=current?`${current}\n\n${text}`:text;
  }
  if(current)sections.push(current);
  return sections;
}

// Teilzusammenfassungen so lange bündeln, bis sie gemeinsam in einen Aufruf
// passen. Erst der letzte Durchgang wendet die vom Nutzer gewählte Länge an;
// die Zwischenstufen bleiben ausführlich, damit unterwegs nichts verloren geht.
async function summaryReduce(texts,length,documentRecord,onProgress){
  let level=texts;
  for(let round=1;;round++){
    const merged=level.join("\n\n");
    if(level.length===1||merged.length<=SUMMARY_SECTION_CHARS){
      return window.AIService.summarize({text:merged,length,title:documentRecord.title,documentId:documentRecord.id});
    }
    if(round>SUMMARY_MAX_REDUCE_ROUNDS)throw new Error("Das Material ließ sich nicht auf eine Zusammenfassung verdichten.");
    const groups=[];
    let current=[],size=0;
    for(const text of level){
      if(size+text.length>SUMMARY_SECTION_CHARS&&current.length){groups.push(current);current=[];size=0;}
      current.push(text);size+=text.length+2;
    }
    if(current.length)groups.push(current);
    if(groups.length>=level.length)throw new Error("Das Material ließ sich nicht auf eine Zusammenfassung verdichten.");
    const next=[];
    for(const [index,group] of groups.entries()){
      onProgress?.(`Verdichte ${index+1}/${groups.length}`);
      const result=await window.AIService.summarize({text:group.join("\n\n"),length:"detailed",title:documentRecord.title,documentId:documentRecord.id});
      const text=String(result?.summary||"").trim();
      if(text)next.push(text);
    }
    if(!next.length)throw new Error("Es wurde keine Zusammenfassung erzeugt.");
    level=next;
  }
}

async function summarizeDocument(documentRecord,length,onProgress){
  const sections=summarySections(documentRecord);
  const truncatedSections=Math.max(0,sections.length-SUMMARY_MAX_SECTIONS);
  const used=sections.slice(0,SUMMARY_MAX_SECTIONS);
  if(used.length<=1){
    const result=await window.AIService.summarize({text:used[0]||"",length,title:documentRecord.title,documentId:documentRecord.id});
    return {...result,sections:used.length,truncatedSections};
  }
  const partials=[];
  for(const [index,section] of used.entries()){
    onProgress?.(`Abschnitt ${index+1}/${used.length}`);
    const result=await window.AIService.summarize({text:section,length:"detailed",title:documentRecord.title,documentId:documentRecord.id});
    const text=String(result?.summary||"").trim();
    if(text)partials.push(text);
  }
  if(!partials.length)throw new Error("Es wurde keine Zusammenfassung erzeugt.");
  const final=await summaryReduce(partials,length,documentRecord,onProgress);
  return {...final,sections:used.length,truncatedSections};
}

function summaryLengthLabel(length){
  return ({short:"Kurz",standard:"Standard",detailed:"Ausführlich"})[length]||"Standard";
}

function renderStoredSummary(section,entry){
  const output=section.querySelector("#ai-summary-output");
  if(!output)return;
  if(!entry){
    output.innerHTML='<p class="small muted">Noch keine Zusammenfassung für diese Länge erstellt.</p>';
    return;
  }
  const confidence=Number.isFinite(entry.confidence)?` · Vertrauen ${Math.round(entry.confidence*100)} %`:"";
  const sections=entry.sections>1?` · aus ${entry.sections} Abschnitten zusammengeführt`:"";
  // Ein abgeschnittenes Material muss sichtbar sein, sonst wirkt die
  // Zusammenfassung vollständiger als sie ist.
  const truncated=entry.truncatedSections>0
    ? `<div class="source">Achtung: ${entry.truncatedSections} weitere Abschnitte wurden nicht einbezogen. Das Material ist für einen Durchgang zu umfangreich.</div>`
    : "";
  output.innerHTML=`
    <div class="answer ai-summary-answer">${summaryEsc(entry.summary||"")}</div>
    <div class="source">${summaryEsc(entry.provider||"LOCAL")}${confidence} · ${summaryEsc(summaryLengthLabel(entry.length))}${sections}</div>
    ${truncated}
  `;
}

async function generateDocumentSummary(documentId,length,section){
  if(!window.AIService){
    throw new Error("AIService ist noch nicht verfügbar.");
  }
  const documentRecord=await summaryGetDocument(documentId);
  if(!documentRecord)throw new Error("Material wurde nicht gefunden.");
  const totalChars=summarySections(documentRecord).reduce((sum,s)=>sum+s.length,0);
  if(totalChars<20)throw new Error("Für dieses Material ist nicht genug Text vorhanden.");

  const button=section.querySelector(`[data-summary-length="${length}"]`);
  const buttons=[...section.querySelectorAll("[data-summary-length]")];
  buttons.forEach(b=>b.disabled=true);
  const oldText=button?.textContent;
  if(button)button.textContent="Erstelle …";

  try{
    const result=await summarizeDocument(documentRecord,length,progress=>{
      if(button)button.textContent=progress;
    });
    const entry={
      summary:String(result?.summary||"").trim(),
      provider:result?.provider||"UNKNOWN",
      confidence:Number.isFinite(result?.confidence)?result.confidence:null,
      length,
      sections:result?.sections||1,
      truncatedSections:result?.truncatedSections||0,
      generatedAt:new Date().toISOString(),
      aiMode:await window.AIService.getMode()
    };
    if(!entry.summary)throw new Error("Es wurde keine Zusammenfassung erzeugt.");
    documentRecord.aiSummaries={...(documentRecord.aiSummaries||{}),[length]:entry};
    await summarySaveDocument(documentRecord);
    renderStoredSummary(section,entry);
    section.querySelectorAll("[data-summary-length]").forEach(b=>b.classList.toggle("active",b.dataset.summaryLength===length));
    summaryToast(`Zusammenfassung · ${summaryLengthLabel(length)} · ${entry.provider}`);
  }finally{
    buttons.forEach(b=>b.disabled=false);
    if(button)button.textContent=oldText;
  }
}

async function injectSummarySection(documentId){
  const box=document.querySelector("#modal-content");
  const modal=document.querySelector("#modal");
  if(!box||!modal?.open)return false;
  if(box.querySelector("#ai-summary-section"))return true;
  const heading=box.querySelector("h2");
  if(!heading)return false;

  const documentRecord=await summaryGetDocument(documentId);
  if(!documentRecord)return false;
  const mode=window.AIService?await window.AIService.getMode():"AUTO";
  const section=document.createElement("section");
  section.id="ai-summary-section";
  section.className="ai-summary-section";
  section.innerHTML=`
    <div class="eyebrow">KI-ZUSAMMENFASSUNG · ${summaryEsc(mode)}</div>
    <h3>Zusammenfassung erstellen</h3>
    <p class="small muted">Die Zusammenfassung läuft ausschließlich über die zentrale AIService-Schnittstelle. LOCAL bleibt komplett kostenfrei.</p>
    <div class="ai-summary-actions">
      <button type="button" class="secondary" data-summary-length="short">Kurz</button>
      <button type="button" class="secondary" data-summary-length="standard">Standard</button>
      <button type="button" class="secondary" data-summary-length="detailed">Ausführlich</button>
    </div>
    <div id="ai-summary-output"><p class="small muted">Wähle eine Länge.</p></div>
  `;

  const dangerZone=box.querySelector(".material-danger-zone");
  if(dangerZone)box.insertBefore(section,dangerZone);else box.appendChild(section);

  section.querySelectorAll("[data-summary-length]").forEach(button=>{
    button.onclick=async()=>{
      const length=button.dataset.summaryLength;
      const stored=(await summaryGetDocument(documentId))?.aiSummaries?.[length];
      if(stored){
        renderStoredSummary(section,stored);
        section.querySelectorAll("[data-summary-length]").forEach(b=>b.classList.toggle("active",b.dataset.summaryLength===length));
        return;
      }
      try{
        await generateDocumentSummary(documentId,length,section);
      }catch(error){
        summaryToast(error.message||"Zusammenfassung fehlgeschlagen.");
      }
    };
  });

  const preferred=documentRecord.aiSummaries?.standard||documentRecord.aiSummaries?.short||documentRecord.aiSummaries?.detailed;
  if(preferred){
    renderStoredSummary(section,preferred);
    section.querySelectorAll("[data-summary-length]").forEach(b=>b.classList.toggle("active",b.dataset.summaryLength===preferred.length));
  }
  return true;
}

const summaryStyle=document.createElement("style");
summaryStyle.textContent=`
.ai-summary-section{margin-top:20px;padding-top:16px;border-top:1px solid var(--line)}
.ai-summary-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.ai-summary-actions button.active{background:var(--accent);color:var(--card)}
.ai-summary-answer{white-space:pre-wrap;margin-top:10px}
@media (max-width:420px){.ai-summary-actions{grid-template-columns:1fr}}
`;
document.head.appendChild(summaryStyle);

document.addEventListener("click",event=>{
  const row=event.target.closest?.("[data-doc]");
  if(row?.dataset.doc)summaryPendingDocumentId=row.dataset.doc;
},true);

const summaryModalContent=document.querySelector("#modal-content");
if(summaryModalContent){
  new MutationObserver(()=>{
    if(!summaryPendingDocumentId)return;
    const modal=document.querySelector("#modal");
    if(!modal?.open)return;
    injectSummarySection(summaryPendingDocumentId)
      .then(ok=>{if(ok)summaryPendingDocumentId=null;})
      .catch(()=>{});
  }).observe(summaryModalContent,{childList:true,subtree:true});
}
