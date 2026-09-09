const AI_IMPORT_DB="lernapp-pwa";
const AI_IMPORT_DB_VERSION=2;
const AI_IMPORT_FSRS_W=[0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542];

function aiImportUid(){return crypto.randomUUID();}
function aiImportNow(){return new Date().toISOString();}
function aiImportDayKey(date=new Date()){const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function aiImportToast(message){const el=document.createElement("div");el.className="toast";el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),2400);}

function aiImportOpenDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(AI_IMPORT_DB,AI_IMPORT_DB_VERSION);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function aiImportAll(store){const db=await aiImportOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),req=tx.objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});}
async function aiImportPut(store,value){const db=await aiImportOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value);tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};});}
async function aiImportDelete(store,id){const db=await aiImportOpenDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}

async function aiImportActiveModule(){const modules=await aiImportAll("modules");if(!modules.length)throw new Error("Kein Lernmodul vorhanden.");return modules[0];}

let aiImportTesseractPromise=null;
async function aiImportTesseract(){
  if(window.Tesseract)return window.Tesseract;
  if(!aiImportTesseractPromise){
    aiImportTesseractPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-ai-import-tesseract]');
      if(existing){existing.addEventListener("load",()=>resolve(window.Tesseract),{once:true});existing.addEventListener("error",reject,{once:true});return;}
      const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";script.async=true;script.dataset.aiImportTesseract="1";script.onload=()=>resolve(window.Tesseract);script.onerror=reject;document.head.appendChild(script);
    });
  }
  return aiImportTesseractPromise;
}

async function aiImportExtractPDF(file){
  const pdfjs=await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.mjs";
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const pages=[];let worker=null;
  try{
    for(let p=1;p<=pdf.numPages;p++){
      aiImportToast(`Verarbeite Seite ${p} von ${pdf.numPages}`);
      const page=await pdf.getPage(p),tc=await page.getTextContent();
      let text=tc.items.map(x=>x.str).join(" ").replace(/\s+/g," ").trim();
      let extraction="PDF_TEXT";
      if(text.length<20){
        extraction="OCR";
        const Tesseract=await aiImportTesseract();
        if(!worker)worker=await Tesseract.createWorker("deu+eng",1);
        const viewport=page.getViewport({scale:1.8});
        const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{alpha:false});
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        await page.render({canvasContext:ctx,viewport}).promise;
        const result=await worker.recognize(canvas);
        text=String(result.data.text||"").replace(/\s+/g," ").trim();
        canvas.width=1;canvas.height=1;
      }
      pages.push({page:p,text,extraction});
    }
  }finally{if(worker)await worker.terminate();}
  return pages;
}

async function aiImportExtractFile(file){
  if(file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf"))return aiImportExtractPDF(file);
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

async function aiImportGenerateGoals(pages,documentRecord,module){
  if(!window.AIService)throw new Error("AIService ist nicht verfügbar.");
  const created=[];
  const providerStatus=await window.AIService.status().catch(()=>null);
  const mode=await window.AIService.getMode();
  for(const page of pages){
    const text=String(page.text||"").trim();
    if(text.length<45)continue;
    const result=await window.AIService.generateLearningGoals({text,title:documentRecord.title,sourcePage:page.page,documentId:documentRecord.id});
    const candidates=(result?.goals||[]).slice(0,3);
    for(const candidate of candidates){
      const answerKey=String(candidate.answerKey||candidate.statement||"").trim();
      if(!answerKey)continue;
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
  return created;
}

async function aiImportGenerateCards(goals,module){
  if(!goals.length)return [];
  const result=await window.AIService.generateFlashcards({goals:goals.map(g=>({id:g.id,statement:g.statement,answerKey:g.answerKey}))});
  const byGoal=new Map(goals.map(g=>[g.id,g]));
  const created=[];
  for(const generated of result?.flashcards||[]){
    const goal=byGoal.get(generated.goalId);if(!goal)continue;
    const fsrsCard=await aiImportNewFSRSCard();
    const card={id:aiImportUid(),moduleId:module.id,goalId:goal.id,prompt:String(generated.prompt||goal.statement).trim(),answer:String(generated.answer||goal.answerKey).trim(),dueAt:fsrsCard.due,fsrsCard,reviewCount:0,lapseCount:0,createdAt:aiImportNow(),manual:false,generatedBy:"AIService",aiProvider:result?.provider||goal.aiProvider||"UNKNOWN",aiMode:goal.aiMode,generationConfidence:Number.isFinite(result?.confidence)?result.confidence:null};
    await aiImportPut("flashcards",card);created.push(card);
  }
  return created;
}

async function aiImportStudyFile(file){
  const module=await aiImportActiveModule();
  aiImportToast("Material wird analysiert …");
  const pages=(await aiImportExtractFile(file)).filter(p=>String(p.text||"").trim().length>20);
  if(!pages.length)throw new Error("Aus der Datei konnte kein Text extrahiert werden.");
  const documentRecord={id:aiImportUid(),moduleId:module.id,title:file.name,kind:file.name.split(".").pop()?.toUpperCase()||"TEXT",pages,createdAt:aiImportNow(),status:"READY",generationPipeline:"AIService"};
  let stored=false;
  try{
    await aiImportPut("documents",documentRecord);stored=true;
    aiImportToast("Lernziele werden erstellt …");
    const goals=await aiImportGenerateGoals(pages,documentRecord,module);
    if(!goals.length)throw new Error("Es konnten keine sinnvollen Lernziele erzeugt werden.");
    aiImportToast("Karteikarten werden erstellt …");
    const cards=await aiImportGenerateCards(goals,module);
    const planId=`${module.id}:${aiImportDayKey()}`;
    await aiImportDelete("plans",planId).catch(()=>{});
    aiImportToast(`${goals.length} Lernziele · ${cards.length} Karteikarten erstellt`);
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
