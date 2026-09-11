const AI_IMPORT_DB="lernapp-pwa";
const AI_IMPORT_DB_VERSION=2;
const AI_IMPORT_FSRS_W=[0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542];

function aiImportUid(){return crypto.randomUUID();}
function aiImportNow(){return new Date().toISOString();}
function aiImportDayKey(date=new Date()){const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function aiImportToast(message){const el=document.createElement("div");el.className="toast";el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),2400);}

function aiImportOpenDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(AI_IMPORT_DB,AI_IMPORT_DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function aiImportAll(store){const db=await aiImportOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),req=tx.objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});}
async function aiImportPut(store,value){const db=await aiImportOpenDB();value={...value,updatedAt:new Date().toISOString()};return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value);tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};});}
async function aiImportDelete(store,id){const db=await aiImportOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(id);tx.oncomplete=()=>{db.close();window.LernappSync?.recordDeletion(store,[id]).catch(()=>{});resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}

// Ohne diese Rückmeldung wirkt eine Drosselungspause wie ein eingefrorener Import.
window.addEventListener("lernapp:cloud-throttled",event=>{
  const seconds=Math.round((event.detail?.delayMs||0)/1000);
  aiImportToast(`Kontingent kurz erschöpft, weiter in ${seconds} s …`);
});

async function aiImportActiveModule(){const modules=await aiImportAll("modules");if(!modules.length)throw new Error("Kein Lernmodul vorhanden.");return modules[0];}

const AI_IMPORT_PDF_MIN_CHARS=20;
// PDFs aus iOS Notizen tragen zu Handschrift eine Textebene, in der saemtliche
// Leerzeichen fehlen ("KoerperunterteiltindreigrossenWelten"). Zeichenzahl pro
// Wort trennt das zuverlaessig von echtem Fliesstext: dort sind es rund sieben,
// in einer verklebten Ebene ueber zwanzig. Solche Seiten sind als Text wertlos
// und werden deshalb wie eine Folie ueber das Bild ausgewertet.
const AI_IMPORT_PDF_MAX_CHARS_PER_WORD=15;

function aiImportTextLayerUsable(text){
  const value=String(text||"").trim();
  if(value.length<AI_IMPORT_PDF_MIN_CHARS)return false;
  const words=value.split(/\s+/).filter(Boolean);
  if(!words.length)return false;
  return value.length/words.length<=AI_IMPORT_PDF_MAX_CHARS_PER_WORD;
}

async function aiImportPageTextLayer(page){
  try{
    const content=await page.getTextContent();
    return content.items.map(item=>item.str).join(" ").replace(/\s+/g," ").trim();
  }catch{
    // Eine unlesbare Textebene ist kein Grund, die Seite aufzugeben: sie wird
    // dann als Bild ausgewertet.
    return "";
  }
}

async function aiImportPageImage(page){
  const unscaled=page.getViewport({scale:1});
  const fit=AI_IMPORT_MAX_EDGE/Math.max(unscaled.width,unscaled.height);
  const viewport=page.getViewport({scale:Math.max(1,Math.min(2,fit))});
  const canvas=document.createElement("canvas");
  const context=canvas.getContext("2d",{alpha:false});
  canvas.width=Math.ceil(viewport.width);
  canvas.height=Math.ceil(viewport.height);
  try{
    await page.render({canvasContext:context,viewport}).promise;
    return canvas.toDataURL("image/jpeg",0.85).replace(/^data:[^,]*,/,"");
  }finally{
    canvas.width=1;canvas.height=1;
  }
}

async function aiImportExtractPDF(file){
  if(!window.AIService)throw new Error("AIService ist nicht verfügbar.");
  const pdfjs=await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.mjs";
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const pages=[];
  const failed=[];
  let announcedVision=false;

  for(let number=1;number<=pdf.numPages;number++){
    aiImportToast(`Verarbeite Seite ${number} von ${pdf.numPages}`);
    try{
      const page=await pdf.getPage(number);
      const layer=await aiImportPageTextLayer(page);
      if(aiImportTextLayerUsable(layer)){
        pages.push({page:number,text:layer,extraction:"PDF_TEXT"});
        continue;
      }
      if(!announcedVision){
        announcedVision=true;
        const status=await window.AIService.status().catch(()=>null);
        aiImportToast(status?.activeProvider==="CLOUD"
          ? "Seiten ohne Text werden als Bild gelesen …"
          : "Seiten ohne Text werden lokal per OCR gelesen, das dauert länger …");
      }
      const imageBase64=await aiImportPageImage(page);
      const result=await window.AIService.analyzeImage({imageBase64,mimeType:"image/jpeg",note:`Seite ${number} aus „${file.name}“`});
      const text=String(result?.text||"").replace(/\s+/g," ").trim();
      if(text)pages.push({page:number,text,extraction:result?.provider==="CLOUD"?"AI_VISION":"OCR",imageKind:result?.kind||"OTHER"});
      else if(layer)pages.push({page:number,text:layer,extraction:"PDF_TEXT_UNSICHER"});
    }catch(error){
      // Eine einzelne Seite darf einen Import ueber viele Seiten nicht kosten.
      failed.push({page:number,reason:String(error?.message||error)});
    }
  }

  if(!pages.length){
    const first=failed[0];
    throw new Error(first
      ? `Keine Seite konnte gelesen werden. Seite ${first.page}: ${first.reason}`
      : "Aus der Datei konnte kein Text extrahiert werden.");
  }
  if(failed.length)aiImportToast(`${failed.length} von ${pdf.numPages} Seiten konnten nicht gelesen werden`);
  return pages;
}

const AI_IMPORT_IMAGE_MIME=new Set(["image/jpeg","image/png","image/webp","image/heic","image/heif"]);
const AI_IMPORT_IMAGE_EXT=/\.(jpe?g|png|webp|heic|heif)$/i;
const AI_IMPORT_MAX_EDGE=1600;

function aiImportIsImage(file){
  return AI_IMPORT_IMAGE_MIME.has(String(file.type||"").toLowerCase())||AI_IMPORT_IMAGE_EXT.test(file.name||"");
}

async function aiImportFileToBase64(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  let binary="";
  for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
}

// Verkleinern spart Kontingent und hält die Anfrage unter dem Grössenlimit des Proxys.
// Schlägt das Dekodieren fehl (z. B. HEIC ausserhalb von Safari), gehen die Originalbytes raus.
async function aiImportDownscaleImage(file){
  const declared=String(file.type||"").toLowerCase();
  try{
    const bitmap=await createImageBitmap(file);
    const scale=Math.min(1,AI_IMPORT_MAX_EDGE/Math.max(bitmap.width,bitmap.height));
    const width=Math.max(1,Math.round(bitmap.width*scale));
    const height=Math.max(1,Math.round(bitmap.height*scale));
    const canvas=document.createElement("canvas");
    canvas.width=width;canvas.height=height;
    canvas.getContext("2d",{alpha:false}).drawImage(bitmap,0,0,width,height);
    bitmap.close?.();
    const dataUrl=canvas.toDataURL("image/jpeg",0.85);
    canvas.width=1;canvas.height=1;
    return {imageBase64:dataUrl.replace(/^data:[^,]*,/,""),mimeType:"image/jpeg"};
  }catch{
    return {imageBase64:await aiImportFileToBase64(file),mimeType:AI_IMPORT_IMAGE_MIME.has(declared)?declared:"image/jpeg"};
  }
}

async function aiImportExtractImage(file){
  if(!window.AIService)throw new Error("AIService ist nicht verfügbar.");
  aiImportToast("Bild wird analysiert …");
  const {imageBase64,mimeType}=await aiImportDownscaleImage(file);
  const result=await window.AIService.analyzeImage({imageBase64,mimeType});
  const text=String(result?.text||"").replace(/\s+/g," ").trim();
  if(!text)throw new Error("Aus dem Bild konnte kein lernrelevanter Inhalt gelesen werden.");
  return [{page:1,text,extraction:result?.provider==="CLOUD"?"AI_VISION":"OCR",imageKind:result?.kind||"OTHER"}];
}

async function aiImportExtractFile(file){
  if(file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf"))return aiImportExtractPDF(file);
  if(aiImportIsImage(file))return aiImportExtractImage(file);
  const text=await file.text();
  const paras=text.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean),pages=[];
  for(let i=0;i<paras.length;i+=8)pages.push({page:pages.length+1,text:paras.slice(i,i+8).join("\n\n"),extraction:"TEXT"});
  return pages;
}

async function aiImportNewFSRSCard(){
  const {createEmptyCard}=await import("https://esm.sh/ts-fsrs@5.4.1?bundle");
  const card=createEmptyCard(new Date());
  return {...card,due:new Date(card.due).toISOString(),last_review:card.last_review?new Date(card.last_review).toISOString():null};
}

function aiImportSourcePage(pages,answerKey){
  const needle=String(answerKey||"").toLowerCase().slice(0,80).trim();
  if(needle){const direct=pages.find(p=>String(p.text||"").toLowerCase().includes(needle));if(direct)return direct;}
  return pages[0]||{page:1,text:""};
}

const AI_IMPORT_SKIP_HEADINGS=/(inhaltsverzeichnis|literaturverzeichnis|quellenverzeichnis|abbildungsverzeichnis|tabellenverzeichnis|abkürzungsverzeichnis|stichwortverzeichnis|impressum|table of contents|bibliography)/i;
// Eine Folie oder eine handschriftliche Mitschrift traegt oft nur ein Dutzend
// Woerter und trotzdem den Kern des Stoffes. Mit 40 Woertern als Mindestmass
// fiel genau dieses Material komplett durch die Pruefung.
const AI_IMPORT_MIN_WORDS=12;
// Tabellen mit Naehrwerten, Dosierungen oder Messreihen bestehen zu grossen
// Teilen aus Ziffern und sind trotzdem Lernstoff. Aussortiert werden sollen nur
// Seitenzahl-Wuesten und Register.
const AI_IMPORT_MAX_DIGIT_RATIO=0.3;
const AI_IMPORT_DUPLICATE_THRESHOLD=0.8;
const AI_IMPORT_CARD_BATCH=20;

// Zahlen zaehlen unabhaengig von ihrer Laenge mit: in Lernstoff unterscheiden sich
// Aufzaehlungen, Formeln und Jahreszahlen oft nur durch eine einzelne Ziffer.
function aiImportContentWords(text){
  return new Set(String(text||"").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=4||/^\p{N}+$/u.test(w)));
}

function aiImportSimilarity(a,b){
  if(!a.size||!b.size)return 0;
  let shared=0;
  a.forEach(w=>{if(b.has(w))shared++;});
  return shared/(a.size+b.size-shared);
}

// Verzeichnisse, Register und Seitenzahl-Wüsten tragen keinen Lernstoff. Sie hier
// auszusortieren spart pro übersprungener Seite einen kompletten KI-Aufruf.
function aiImportHasLearningValue(text){
  const value=String(text||"").trim();
  if(AI_IMPORT_SKIP_HEADINGS.test(value.slice(0,200)))return false;
  const words=value.split(/\s+/).filter(Boolean);
  if(words.length<AI_IMPORT_MIN_WORDS)return false;
  const digits=(value.match(/\d/g)||[]).length;
  if(digits/value.length>AI_IMPORT_MAX_DIGIT_RATIO)return false;
  return true;
}

async function aiImportGenerateGoals(pages,documentRecord,module){
  if(!window.AIService)throw new Error("AIService ist nicht verfügbar.");
  const created=[];
  const providerStatus=await window.AIService.status().catch(()=>null);
  const mode=await window.AIService.getMode();
  const accepted=[];
  let skippedPages=0,duplicates=0;
  for(const page of pages){
    const text=String(page.text||"").trim();
    if(page.relevant===false){skippedPages++;continue;}
    const result=await window.AIService.generateLearningGoals({text,title:documentRecord.title,sourcePage:page.page,documentId:documentRecord.id});
    const candidates=(result?.goals||[]).slice(0,3);
    for(const candidate of candidates){
      const answerKey=String(candidate.answerKey||candidate.statement||"").trim();
      if(!answerKey)continue;
      // Dieselbe Aussage taucht in Skripten oft auf mehreren Seiten auf. Ohne
      // diesen Vergleich entstehen daraus mehrere fast identische Karteikarten.
      const fingerprint=aiImportContentWords(`${candidate.statement||""} ${answerKey}`);
      if(accepted.some(known=>aiImportSimilarity(known,fingerprint)>=AI_IMPORT_DUPLICATE_THRESHOLD)){duplicates++;continue;}
      accepted.push(fingerprint);
      const source=aiImportSourcePage([page],answerKey);
      const goal={
        id:aiImportUid(),moduleId:module.id,documentId:documentRecord.id,
        statement:String(candidate.statement||`Erkläre: ${answerKey}`).trim(),
        answerKey,sourcePage:source.page,sourceSnippet:answerKey,
        priority:0.65,examRelevance:0.6,createdAt:aiImportNow(),
        generatedBy:"AIService",aiProvider:result?.provider||providerStatus?.activeProvider||"UNKNOWN",aiMode:mode,
        generationConfidence:Number.isFinite(result?.confidence)?result.confidence:null
      };
      await aiImportPut("goals",goal);
      await aiImportPut("mastery",{id:goal.id,goalId:goal.id,moduleId:module.id,recall:null,understanding:null,application:null,transfer:null,confidence:0,evidenceCount:0,status:"NOT_ASSESSED",updatedAt:aiImportNow()});
      created.push(goal);
    }
  }
  return {goals:created,skippedPages,duplicates};
}

// Alle Lernziele in einem Aufruf zu schicken hat bei grossen Dokumenten
// stillschweigend Karten verloren: die Nutzlast wurde serverseitig gekuerzt.
// Deshalb in Stapeln arbeiten und die Ergebnisse zusammenfuehren.
async function aiImportGenerateCards(goals,module){
  if(!goals.length)return [];
  const byGoal=new Map(goals.map(g=>[g.id,g]));
  const generatedCards=[];
  for(let i=0;i<goals.length;i+=AI_IMPORT_CARD_BATCH){
    const batch=goals.slice(i,i+AI_IMPORT_CARD_BATCH);
    if(goals.length>AI_IMPORT_CARD_BATCH)aiImportToast(`Karteikarten ${i+1} bis ${Math.min(i+AI_IMPORT_CARD_BATCH,goals.length)} von ${goals.length}`);
    const result=await window.AIService.generateFlashcards({goals:batch.map(g=>({id:g.id,statement:g.statement,answerKey:g.answerKey}))});
    for(const generated of result?.flashcards||[])generatedCards.push({generated,confidence:result?.confidence,provider:result?.provider});
  }
  const created=[];
  const seenGoals=new Set();
  for(const {generated,confidence,provider} of generatedCards){
    const goal=byGoal.get(generated.goalId);if(!goal||seenGoals.has(goal.id))continue;
    seenGoals.add(goal.id);
    const fsrsCard=await aiImportNewFSRSCard();
    const card={id:aiImportUid(),moduleId:module.id,goalId:goal.id,prompt:String(generated.prompt||goal.statement).trim(),answer:String(generated.answer||goal.answerKey).trim(),dueAt:fsrsCard.due,fsrsCard,reviewCount:0,lapseCount:0,createdAt:aiImportNow(),manual:false,generatedBy:"AIService",aiProvider:provider||goal.aiProvider||"UNKNOWN",aiMode:goal.aiMode,generationConfidence:Number.isFinite(confidence)?confidence:null};
    await aiImportPut("flashcards",card);created.push(card);
  }
  return created;
}

async function aiImportStudyFile(file){
  const module=await aiImportActiveModule();
  aiImportToast("Material wird analysiert …");
  const pages=(await aiImportExtractFile(file)).filter(p=>String(p.text||"").trim().length>20);
  if(!pages.length)throw new Error("Aus der Datei konnte kein Text extrahiert werden.");
  // Die Relevanzpruefung soll Ballast aus umfangreichen Dokumenten fernhalten.
  // Ein einseitiger Import ist eine bewusste Auswahl des Nutzers, etwa das Foto
  // einer kurzen Mitschrift, und darf nicht wegen seiner Kuerze verworfen werden.
  // Das Ergebnis wird mitgespeichert, weil die Coverage-Berechnung spaeter
  // wissen muss, welche Seiten ueberhaupt Lernstoff tragen sollten.
  const filterBulkPages=pages.length>1;
  for(const page of pages)page.relevant=filterBulkPages?aiImportHasLearningValue(page.text):true;
  // Verwirft die Pruefung jede einzelne Seite, dann liegt der Fehler bei ihr und
  // nicht am Material. Ein paar Aufrufe zu viel sind besser als ein Import, der
  // schweigend nichts erzeugt.
  if(!pages.some(page=>page.relevant))for(const page of pages)page.relevant=true;
  const documentRecord={id:aiImportUid(),moduleId:module.id,title:file.name,kind:file.name.split(".").pop()?.toUpperCase()||"TEXT",pages,createdAt:aiImportNow(),status:"READY",generationPipeline:"AIService"};
  let stored=false;
  try{
    await aiImportPut("documents",documentRecord);stored=true;
    aiImportToast("Lernziele werden erstellt …");
    const {goals,skippedPages,duplicates}=await aiImportGenerateGoals(pages,documentRecord,module);
    if(!goals.length)throw new Error("Es konnten keine sinnvollen Lernziele erzeugt werden.");
    aiImportToast("Karteikarten werden erstellt …");
    const cards=await aiImportGenerateCards(goals,module);
    const planId=`${module.id}:${aiImportDayKey()}`;
    await aiImportDelete("plans",planId).catch(()=>{});
    const filtered=[skippedPages?`${skippedPages} Seiten ohne Lernstoff übersprungen`:null,duplicates?`${duplicates} Dubletten verworfen`:null].filter(Boolean);
    aiImportToast(`${goals.length} Lernziele · ${cards.length} Karteikarten erstellt${filtered.length?` · ${filtered.join(" · ")}`:""}`);
    return documentRecord;
  }catch(error){
    if(stored){
      const goals=(await aiImportAll("goals")).filter(g=>g.documentId===documentRecord.id),ids=new Set(goals.map(g=>g.id));
      const cards=(await aiImportAll("flashcards")).filter(c=>ids.has(c.goalId));
      for(const c of cards)await aiImportDelete("flashcards",c.id).catch(()=>{});
      for(const g of goals){await aiImportDelete("mastery",g.id).catch(()=>{});await aiImportDelete("goals",g.id).catch(()=>{});}
      await aiImportDelete("documents",documentRecord.id).catch(()=>{});
    }
    throw error;
  }
}

const aiImportInput=document.querySelector("#file-import");
if(aiImportInput){
  aiImportInput.addEventListener("change",async event=>{
    const file=event.target.files?.[0];
    if(!file)return;
    event.stopImmediatePropagation();
    event.preventDefault();
    try{
      await aiImportStudyFile(file);
      document.querySelector('[data-tab="library"]')?.click();
    }catch(error){
      alert(`Import fehlgeschlagen: ${error.message}`);
    }finally{
      event.target.value="";
    }
  },true);
}

window.LernappAIImport={importStudyFile:aiImportStudyFile};
