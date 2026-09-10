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

function localTokens(text){
  return new Set(String(text||"").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x=>x.length>=4));
}

function localTokenScore(expected,actual){
  const e=localTokens(expected),a=localTokens(actual);
  if(!e.size)return 0;
  let hits=0;e.forEach(t=>{if(a.has(t))hits++;});
  return Math.max(0,Math.min(1,hits/e.size));
}

function localTutorAnswer(message,context){
  const clean=String(context||"").replace(/\s+/g," ").trim();
  if(!clean)return "Im hinterlegten Lernmaterial ist für diese Frage kein verwertbarer Quellenkontext vorhanden.";
  const query=localTokens(message);
  const sentences=clean.split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(s=>s.length>=25&&s.length<=900);
  const ranked=sentences.map((sentence,index)=>{
    const tokens=localTokens(sentence);let hits=0;query.forEach(t=>{if(tokens.has(t))hits++;});
    return {sentence,index,score:hits};
  }).sort((a,b)=>b.score-a.score||a.index-b.index);
  const selected=(ranked.some(x=>x.score>0)?ranked.filter(x=>x.score>0):ranked).slice(0,4).map(x=>x.sentence);
  if(!selected.length)return clean.slice(0,1600);
  return `Aus deinem Lernmaterial lassen sich dazu folgende Kernaussagen ableiten:\n\n${selected.map((s,i)=>`${i+1}. ${s}`).join("\n\n")}\n\nLOCAL ordnet hier nur vorhandene Quellenaussagen nach Textbezug ein und ergänzt kein externes Wissen.`;
}

const localProvider={
  id:"LOCAL",
  async summarize({text="",length="standard"}={}){
    const sentences=String(text).replace(/\s+/g," ").split(/(?<=[.!?])\s+/).filter(Boolean);
    const limits={short:3,standard:7,detailed:14};
    return {provider:"LOCAL",summary:sentences.slice(0,limits[length]||7).join(" "),confidence:0.35};
  },
  async tutor({message="",context=""}={}){
    return {provider:"LOCAL",answer:localTutorAnswer(message,context),confidence:0.30,grounded:true,policy:"LOCAL_SOURCE_EXTRACTIVE"};
  },
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
  }
};

let cloudConfig={endpoint:null};
const cloudProvider={
  id:"CLOUD",
  isAvailable(){return Boolean(cloudConfig.endpoint&&navigator.onLine);},
  async call(task,payload){
    if(!cloudConfig.endpoint)throw new Error("Cloud-KI ist noch nicht konfiguriert.");
    const response=await fetch(cloudConfig.endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({task,payload})});
    if(!response.ok)throw new Error(`Cloud-KI Fehler (${response.status})`);
    return response.json();
  },
  summarize(payload){return this.call("summarize",payload);},
  tutor(payload){return this.call("tutor",payload);},
  generateLearningGoals(payload){return this.call("generateLearningGoals",payload);},
  generateFlashcards(payload){return this.call("generateFlashcards",payload);},
  evaluateFreeAnswer(payload){return this.call("evaluateFreeAnswer",payload);}
};

async function selectedProvider(){
  const settings=await readAppSettings();
  const mode=normalizeMode(settings.aiMode);
  if(mode===AI_MODES.LOCAL)return localProvider;
  if(mode===AI_MODES.CLOUD){
    if(!cloudProvider.isAvailable())throw new Error("CLOUD ist gewählt, aber die Cloud-KI ist derzeit nicht verfügbar.");
    return cloudProvider;
  }
  return cloudProvider.isAvailable()?cloudProvider:localProvider;
}

const AIService={
  modes:AI_MODES,
  async getMode(){return normalizeMode((await readAppSettings()).aiMode);},
  async setMode(mode){const normalized=normalizeMode(mode);await writeAppSettings({aiMode:normalized});window.dispatchEvent(new CustomEvent("lernapp:ai-mode-changed",{detail:{mode:normalized}}));return normalized;},
  configureCloud({endpoint=null}={}){cloudConfig={endpoint};},
  async status(){const mode=await this.getMode();const provider=await selectedProvider().catch(()=>null);return {mode,activeProvider:provider?.id||null,cloudAvailable:cloudProvider.isAvailable(),localAvailable:true};},
  async run(method,payload){const provider=await selectedProvider();if(typeof provider[method]!=="function")throw new Error(`AIService-Methode unbekannt: ${method}`);return provider[method](payload);},
  summarize(payload){return this.run("summarize",payload);},
  tutor(payload){return this.run("tutor",payload);},
  generateLearningGoals(payload){return this.run("generateLearningGoals",payload);},
  generateFlashcards(payload){return this.run("generateFlashcards",payload);},
  async evaluateFreeAnswer(payload){
    const mode=await this.getMode();
    if(mode===AI_MODES.LOCAL)return localProvider.evaluateFreeAnswer(payload);
    if(mode===AI_MODES.CLOUD){
      if(!cloudProvider.isAvailable())throw new Error("CLOUD ist gewählt, aber die Cloud-KI ist derzeit nicht verfügbar.");
      return cloudProvider.evaluateFreeAnswer(payload);
    }
    const local=await localProvider.evaluateFreeAnswer(payload);
    if(!cloudProvider.isAvailable())return {...local,policy:"AUTO_LOCAL_FALLBACK"};
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
