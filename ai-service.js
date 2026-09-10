const AI_MODES = Object.freeze({ AUTO: "AUTO", LOCAL: "LOCAL", CLOUD: "CLOUD" });
const DB_NAME = "lernapp-pwa";
const DB_VERSION = 2;

async function openSettingsDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function readAppSettings(){
  const db=await openSettingsDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("settings","readonly");
    const r=tx.objectStore("settings").get("app");
    r.onsuccess=()=>resolve(r.result||{id:"app",dailyMinutes:30,aiMode:AI_MODES.AUTO});
    r.onerror=()=>reject(r.error);
    tx.oncomplete=()=>db.close();
  });
}

async function writeAppSettings(patch){
  const db=await openSettingsDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction("settings","readwrite");
    const store=tx.objectStore("settings");
    const getReq=store.get("app");
    getReq.onsuccess=()=>{
      const current=getReq.result||{id:"app",dailyMinutes:30,createdAt:new Date().toISOString()};
      store.put({...current,...patch,id:"app",updatedAt:new Date().toISOString()});
    };
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
  });
}

function normalizeMode(value){
  return Object.values(AI_MODES).includes(value)?value:AI_MODES.AUTO;
}

function normalizeEndpoint(value){
  const raw=String(value||"").trim();
  if(!raw)return null;
  try{
    const url=new URL(raw);
    if(url.protocol!=="https:" && !["localhost","127.0.0.1"].includes(url.hostname))return null;
    return url.toString().replace(/\/$/,"");
  }catch{return null;}
}

function localTokenScore(expected,actual){
  const tokens=text=>new Set(String(text||"").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x=>x.length>=4));
  const e=tokens(expected),a=tokens(actual);
  if(!e.size)return 0;
  let hits=0;e.forEach(t=>{if(a.has(t))hits++;});
  return Math.max(0,Math.min(1,hits/e.size));
}

const TESSERACT_SRC="https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";
let tesseractPromise=null;

function loadTesseract(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(!tesseractPromise){
    tesseractPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector("script[data-lernapp-tesseract]");
      if(existing){existing.addEventListener("load",()=>resolve(window.Tesseract),{once:true});existing.addEventListener("error",reject,{once:true});return;}
      const script=document.createElement("script");
      script.src=TESSERACT_SRC;script.async=true;script.dataset.lernappTesseract="1";
      script.onload=()=>resolve(window.Tesseract);
      script.onerror=()=>reject(new Error("OCR-Bibliothek konnte nicht geladen werden."));
      document.head.appendChild(script);
    }).catch(error=>{tesseractPromise=null;throw error;});
  }
  return tesseractPromise;
}

function localTutor({message="",context=""}={}){
  const terms=[...String(message).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x=>x.length>=4)];
  const chunks=String(context).split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);
  const ranked=chunks.map(text=>({text,score:terms.reduce((n,t)=>n+(text.toLowerCase().includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score);
  const selected=ranked.filter(x=>x.score>0).slice(0,3);
  if(!selected.length){
    return {provider:"LOCAL",answer:"Im bereitgestellten Lernmaterial finde ich dazu keine ausreichend passende Stelle. Formuliere die Frage näher am Lernziel oder prüfe die Quelle direkt.",confidence:0.2,grounded:true};
  }
  return {provider:"LOCAL",answer:`Aus deinem Lernmaterial passen dazu vor allem diese Stellen:\n\n${selected.map(x=>x.text).join("\n\n")}`,confidence:0.3,grounded:true};
}

const localProvider={
  id:"LOCAL",
  async summarize({text="",length="standard"}={}){
    const sentences=String(text).replace(/\s+/g," ").split(/(?<=[.!?])\s+/).filter(Boolean);
    const limits={short:3,standard:7,detailed:14};
    return {provider:"LOCAL",summary:sentences.slice(0,limits[length]||7).join(" "),confidence:0.35};
  },
  async tutor(payload={}){return localTutor(payload);},
  async generateLearningGoals({text=""}={}){
    const sentences=String(text).replace(/\s+/g," ").split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(s=>s.length>=45);
    return {provider:"LOCAL",goals:sentences.slice(0,12).map((s,i)=>({id:`local-${i+1}`,statement:`Erkläre: ${s}`,answerKey:s})),confidence:0.35};
  },
  async generateFlashcards({goals=[]}={}){
    return {provider:"LOCAL",flashcards:goals.map(g=>({goalId:g.id,prompt:g.statement||"Erkläre den Inhalt.",answer:g.answerKey||""})),confidence:0.35};
  },
  async evaluateFreeAnswer({expected="",answer=""}={}){
    const score=localTokenScore(expected,answer);
    return {provider:"LOCAL",score,confidence:0.35,feedback:score>=0.7?"Wesentliche Inhalte sind enthalten.":score>=0.4?"Ein Teil der wesentlichen Inhalte ist enthalten; zentrale Begriffe oder Zusammenhänge fehlen noch.":"Es fehlen noch wichtige Begriffe oder Zusammenhänge."};
  },
  async analyzeImage({imageBase64="",mimeType=""}={}){
    const data=String(imageBase64).replace(/^data:[^,]*,/,"").trim();
    if(!data)throw new Error("Es wurde kein Bild übergeben.");
    const Tesseract=await loadTesseract();
    const worker=await Tesseract.createWorker("deu+eng",1);
    try{
      const result=await worker.recognize(`data:${mimeType||"image/jpeg"};base64,${data}`);
      const text=String(result?.data?.text||"").replace(/\s+/g," ").trim();
      return {provider:"LOCAL",text,kind:"OTHER",confidence:Math.min(0.4,Math.max(0,Number(result?.data?.confidence)||0)/100*0.4)};
    }finally{await worker.terminate().catch(()=>{});}
  }
};

const CLOUD_RETRY_STATUS=new Set([429,503]);
const CLOUD_MAX_ATTEMPTS=4;
const CLOUD_BASE_DELAY_MS=2000;

function cloudRetryDelay(attempt,retryAfter){
  const seconds=Number(retryAfter);
  if(Number.isFinite(seconds)&&seconds>0)return Math.min(seconds*1000,60000);
  return CLOUD_BASE_DELAY_MS*2**(attempt-1);
}

async function cloudConfig(){
  const settings=await readAppSettings();
  return {
    endpoint:normalizeEndpoint(settings.cloudEndpoint),
    accessToken:String(settings.cloudAccessToken||"").trim()||null
  };
}

const cloudProvider={
  id:"CLOUD",
  async isAvailable(){const cfg=await cloudConfig();return Boolean(cfg.endpoint&&navigator.onLine);},
  async call(task,payload){
    const cfg=await cloudConfig();
    if(!cfg.endpoint)throw new Error("Cloud-KI ist noch nicht konfiguriert.");
    if(!navigator.onLine)throw new Error("Cloud-KI ist offline nicht verfügbar.");
    const headers={"Content-Type":"application/json"};
    if(cfg.accessToken)headers["X-Lernapp-Key"]=cfg.accessToken;
    const request=JSON.stringify({task,payload});
    // Das kostenlose Kontingent drosselt nach wenigen Anfragen pro Minute. Ohne
    // Wiederholung würde ein umfangreicher Import mittendrin komplett scheitern.
    for(let attempt=1;;attempt++){
      const response=await fetch(cfg.endpoint,{method:"POST",headers,body:request});
      let body=null;
      try{body=await response.json();}catch{}
      if(response.ok)return body;
      if(!CLOUD_RETRY_STATUS.has(response.status)||attempt>=CLOUD_MAX_ATTEMPTS)throw new Error(body?.error||`Cloud-KI Fehler (${response.status})`);
      const delay=cloudRetryDelay(attempt,response.headers.get("Retry-After"));
      window.dispatchEvent(new CustomEvent("lernapp:cloud-throttled",{detail:{delayMs:delay,attempt,task}}));
      await new Promise(resolve=>setTimeout(resolve,delay));
    }
  },
  summarize(payload){return this.call("summarize",payload);},
  tutor(payload){return this.call("tutor",payload);},
  generateLearningGoals(payload){return this.call("generateLearningGoals",payload);},
  generateFlashcards(payload){return this.call("generateFlashcards",payload);},
  evaluateFreeAnswer(payload){return this.call("evaluateFreeAnswer",payload);},
  analyzeImage(payload){return this.call("analyzeImage",payload);}
};

async function selectedProvider(){
  const settings=await readAppSettings();
  const mode=normalizeMode(settings.aiMode);
  if(mode===AI_MODES.LOCAL)return localProvider;
  if(mode===AI_MODES.CLOUD){
    if(!(await cloudProvider.isAvailable()))throw new Error("CLOUD ist gewählt, aber die Cloud-KI ist derzeit nicht verfügbar.");
    return cloudProvider;
  }
  return (await cloudProvider.isAvailable())?cloudProvider:localProvider;
}

const AIService={
  modes:AI_MODES,
  async getMode(){return normalizeMode((await readAppSettings()).aiMode);},
  async setMode(mode){const normalized=normalizeMode(mode);await writeAppSettings({aiMode:normalized});window.dispatchEvent(new CustomEvent("lernapp:ai-mode-changed",{detail:{mode:normalized}}));return normalized;},
  async getCloudConfig(){const cfg=await cloudConfig();return {endpoint:cfg.endpoint,hasAccessToken:Boolean(cfg.accessToken)};},
  async configureCloud({endpoint=null,accessToken=undefined}={}){
    const normalized=normalizeEndpoint(endpoint);
    if(endpoint && !normalized)throw new Error("Bitte eine gültige HTTPS-Adresse für den Cloud-Endpunkt eingeben.");
    const patch={cloudEndpoint:normalized};
    if(accessToken!==undefined)patch.cloudAccessToken=String(accessToken||"").trim()||null;
    await writeAppSettings(patch);
    window.dispatchEvent(new CustomEvent("lernapp:cloud-config-changed"));
    return this.getCloudConfig();
  },
  async clearCloud(){await writeAppSettings({cloudEndpoint:null,cloudAccessToken:null});window.dispatchEvent(new CustomEvent("lernapp:cloud-config-changed"));},
  async testCloud(){
    const cfg=await cloudConfig();
    if(!cfg.endpoint)throw new Error("Noch kein Cloud-Endpunkt gespeichert.");
    const headers={"Content-Type":"application/json"};
    if(cfg.accessToken)headers["X-Lernapp-Key"]=cfg.accessToken;
    const started=performance.now();
    const response=await fetch(cfg.endpoint,{method:"POST",headers,body:JSON.stringify({task:"health",payload:{}})});
    let body=null;try{body=await response.json();}catch{}
    if(!response.ok)throw new Error(body?.error||`Verbindung fehlgeschlagen (${response.status})`);
    return {...body,latencyMs:Math.round(performance.now()-started)};
  },
  async status(){const mode=await this.getMode();const available=await cloudProvider.isAvailable();const provider=await selectedProvider().catch(()=>null);return {mode,activeProvider:provider?.id||null,cloudAvailable:available,localAvailable:true};},
  async run(method,payload){const provider=await selectedProvider();if(typeof provider[method]!=="function")throw new Error(`AIService-Methode unbekannt: ${method}`);return provider[method](payload);},
  summarize(payload){return this.run("summarize",payload);},
  tutor(payload){return this.run("tutor",payload);},
  generateLearningGoals(payload){return this.run("generateLearningGoals",payload);},
  generateFlashcards(payload){return this.run("generateFlashcards",payload);},
  analyzeImage(payload){return this.run("analyzeImage",payload);},
  async evaluateFreeAnswer(payload){
    const mode=await this.getMode();
    if(mode===AI_MODES.LOCAL)return localProvider.evaluateFreeAnswer(payload);
    if(mode===AI_MODES.CLOUD){
      if(!(await cloudProvider.isAvailable()))throw new Error("CLOUD ist gewählt, aber die Cloud-KI ist derzeit nicht verfügbar.");
      return cloudProvider.evaluateFreeAnswer(payload);
    }
    const local=await localProvider.evaluateFreeAnswer(payload);
    if(!(await cloudProvider.isAvailable()))return {...local,policy:"AUTO_LOCAL_FALLBACK"};
    const uncertain=local.score>0.2&&local.score<0.9;
    if(!uncertain)return {...local,policy:"AUTO_LOCAL_CONFIDENT"};
    try{
      const cloud=await cloudProvider.evaluateFreeAnswer({...payload,localPrefilter:{score:local.score,confidence:local.confidence}});
      return {...cloud,policy:"AUTO_CLOUD_ESCALATION",localPrefilter:local};
    }catch(error){
      return {...local,policy:"AUTO_CLOUD_FAILED_FALLBACK",cloudError:String(error?.message||error)};
    }
  }
};

window.AIService=AIService;
window.LernappAIModes=AI_MODES;
window.LernappTesseract=loadTesseract;
