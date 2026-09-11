const GEMINI_BASE="https://generativelanguage.googleapis.com/v1beta/models";
const MAX_INLINE_IMAGE_BASE64=7_000_000;

function cors(origin,env){
  const allowed=String(env.ALLOWED_ORIGIN||"").trim();
  const allow=allowed&&origin===allowed?origin:allowed||"null";
  return {
    "Access-Control-Allow-Origin":allow,
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type,X-Lernapp-Key",
    "Vary":"Origin",
    "Content-Type":"application/json; charset=utf-8"
  };
}

function json(data,status,origin,env){return new Response(JSON.stringify(data),{status,headers:cors(origin,env)});}
function clamp(v){return Math.max(0,Math.min(1,Number(v)||0));}
function clean(value,max=60000){return String(value||"").replace(/\u0000/g,"").slice(0,max);}

const IMAGE_MIME=new Set(["image/jpeg","image/png","image/webp","image/heic","image/heif"]);
// Gedrosselt oder kurzzeitig überlastet: die PWA darf das wiederholen, statt den
// laufenden Import abzubrechen. Andere Fehler bleiben endgültig.
const RETRYABLE_STATUS=new Set([429,503]);

function outputText(body){
  const parts=body?.candidates?.[0]?.content?.parts||[];
  return parts.map(p=>typeof p?.text==="string"?p.text:"").join("").trim();
}

const schemas={
  summarize:{type:"OBJECT",required:["summary","confidence"],properties:{summary:{type:"STRING"},confidence:{type:"NUMBER"}}},
  tutor:{type:"OBJECT",required:["answer","confidence","grounded"],properties:{answer:{type:"STRING"},confidence:{type:"NUMBER"},grounded:{type:"BOOLEAN"}}},
  generateLearningGoals:{type:"OBJECT",required:["goals","confidence"],properties:{goals:{type:"ARRAY",items:{type:"OBJECT",required:["statement","answerKey"],properties:{statement:{type:"STRING"},answerKey:{type:"STRING"}}}},confidence:{type:"NUMBER"}}},
  generateFlashcards:{type:"OBJECT",required:["flashcards","confidence"],properties:{flashcards:{type:"ARRAY",items:{type:"OBJECT",required:["goalId","prompt","answer"],properties:{goalId:{type:"STRING"},prompt:{type:"STRING"},answer:{type:"STRING"}}}},confidence:{type:"NUMBER"}}},
  evaluateFreeAnswer:{type:"OBJECT",required:["score","confidence","feedback"],properties:{score:{type:"NUMBER"},confidence:{type:"NUMBER"},feedback:{type:"STRING"}}},
  analyzeImage:{type:"OBJECT",required:["text","kind","confidence"],properties:{text:{type:"STRING"},kind:{type:"STRING",enum:["HANDWRITTEN_NOTE","SLIDE","DIAGRAM","TEXT_PAGE","SCREENSHOT","PHOTO","OTHER"]},confidence:{type:"NUMBER"}}},
  generateChoiceOptions:{type:"OBJECT",required:["items","confidence"],properties:{items:{type:"ARRAY",items:{type:"OBJECT",required:["id","distractors"],properties:{id:{type:"STRING"},distractors:{type:"ARRAY",items:{type:"STRING"}}}}},confidence:{type:"NUMBER"}}}
};

function taskPrompt(task,payload){
  if(task==="summarize")return `Erstelle eine fachlich präzise ${clean(payload.length,20)||"standard"}e Zusammenfassung ausschließlich aus dem bereitgestellten Lernmaterial. Nichts ergänzen, was die Quelle nicht trägt.\n\nTITEL: ${clean(payload.title,300)}\n\nMATERIAL:\n${clean(payload.text)}`;
  if(task==="tutor")return `Beantworte die Frage ausschließlich anhand des Quellenkontexts. Wenn die Quelle nicht reicht, sage das ausdrücklich. Keine erfundenen Fakten. Antworte verständlich und lernorientiert.\n\nFRAGE: ${clean(payload.message,4000)}\n\nLERNZIEL: ${clean(payload.learningGoal,3000)}\n\nQUELLENKONTEXT:\n${clean(payload.context)}`;
  if(task==="generateLearningGoals")return `Erzeuge bis zu 3 atomare, prüfbare Lernziele aus genau dieser Quelle. Jedes Lernziel muss durch den Quelltext getragen sein. answerKey enthält die fachliche Sollantwort aus der Quelle.\n\nSEITE: ${clean(payload.sourcePage,20)}\n\nQUELLE:\n${clean(payload.text)}`;
  if(task==="generateFlashcards")return `Erzeuge pro Lernziel höchstens eine präzise Karteikarte. goalId muss exakt übernommen werden. Frage aktivierend, Antwort knapp aber vollständig.\n\nLERNZIELE:\n${clean(JSON.stringify(payload.goals||[]),30000)}`;
  if(task==="evaluateFreeAnswer")return `Bewerte die freie Antwort fachlich nur gegen Sollantwort und Quellenkontext. Bewerte sinngemäße richtige Formulierungen positiv, aber erfinde keine Anforderungen. score 0 bis 1. confidence beschreibt Sicherheit der Bewertung. Feedback nennt konkret, was richtig ist und was fehlt.\n\nFRAGE: ${clean(payload.question,4000)}\n\nSOLLANTWORT: ${clean(payload.expected,10000)}\n\nQUELLENKONTEXT: ${clean(payload.context,12000)}\n\nANTWORT DES LERNENDEN: ${clean(payload.answer,10000)}`;
  if(task==="analyzeImage")return `Erfasse den gesamten lernrelevanten Inhalt dieses Bildes als zusammenhängenden Text.\n\nRegeln:\n- Lesbaren Text wortgetreu übernehmen, auch Handschrift.\n- Formeln, Diagramme, Tabellen und Skizzen so beschreiben, dass ihr fachlicher Inhalt lernbar wird, inklusive Beschriftungen, Achsen, Beziehungen und Richtungen.\n- Struktur wie Überschriften, Nummerierungen und Aufzählungen erhalten.\n- Nichts ergänzen, interpretieren oder ausschmücken, was das Bild nicht zeigt.\n- Unleserliche Stellen ausdrücklich als [unleserlich] markieren statt zu raten.\n- Enthält das Bild keinen lernrelevanten Inhalt, gib einen leeren text zurück.\n\nkind beschreibt die Art der Vorlage. confidence beschreibt, wie sicher der Inhalt erfasst wurde.${payload.note?`\n\nHINWEIS DES NUTZERS: ${clean(payload.note,2000)}`:""}`;
  if(task==="generateChoiceOptions")return `Erzeuge zu jeder Frage genau drei falsche Antwortmöglichkeiten für eine Multiple-Choice-Aufgabe.\n\nRegeln:\n- id exakt übernehmen.\n- Jeder Distraktor muss fachlich eindeutig falsch sein, aber im selben Themenfeld liegen und auf den ersten Blick plausibel wirken.\n- Länge, Satzbau und Detailtiefe an die richtige Antwort angleichen, damit die richtige Antwort nicht an der Form erkennbar ist.\n- Keine Variante darf die richtige Antwort sinngemäß wiederholen oder sie nur umformulieren.\n- Keine Meta-Optionen wie „alle Antworten sind richtig“ oder „keine der genannten“.\n- Die drei Distraktoren einer Frage müssen sich voneinander unterscheiden.\n\nFRAGEN:\n${clean(JSON.stringify(payload.items||[]),30000)}`;
  throw new Error("Unbekannte Aufgabe.");
}

function requestParts(task,payload){
  const parts=[{text:taskPrompt(task,payload)}];
  if(task!=="analyzeImage")return parts;
  const mimeType=String(payload.mimeType||"").trim().toLowerCase();
  if(!IMAGE_MIME.has(mimeType))throw new Error("Nicht unterstütztes Bildformat.");
  const data=String(payload.imageBase64||"").replace(/^data:[^,]*,/,"").trim();
  if(!data)throw new Error("Es wurde kein Bild übertragen.");
  if(data.length>MAX_INLINE_IMAGE_BASE64)throw new Error("Das Bild ist zu groß für die Analyse.");
  parts.push({inline_data:{mime_type:mimeType,data}});
  return parts;
}

async function callGemini(task,payload,env){
  if(!env.GEMINI_API_KEY)throw new Error("GEMINI_API_KEY fehlt im Worker-Secret.");
  if(!env.GEMINI_MODEL)throw new Error("GEMINI_MODEL fehlt in der Worker-Konfiguration.");
  const schema=schemas[task];
  if(!schema)throw new Error("Nicht unterstützte KI-Aufgabe.");
  const response=await fetch(`${GEMINI_BASE}/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`,{
    method:"POST",
    headers:{"x-goog-api-key":env.GEMINI_API_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({
      systemInstruction:{parts:[{text:"Du bist die semantische KI-Schicht einer wissenschaftlich orientierten Lernapp. Arbeite strikt quellengebunden und gib nur das angeforderte strukturierte Ergebnis zurück."}]},
      contents:[{role:"user",parts:requestParts(task,payload||{})}],
      generationConfig:{temperature:0.2,maxOutputTokens:8192,responseMimeType:"application/json",responseSchema:schema}
    })
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok){
    const failure=new Error(body?.error?.message||`Gemini Fehler (${response.status})`);
    if(RETRYABLE_STATUS.has(response.status)){
      failure.status=response.status;
      failure.retryAfter=response.headers.get("Retry-After");
    }
    throw failure;
  }
  const blockReason=body?.promptFeedback?.blockReason;
  if(blockReason)throw new Error(`Die Anfrage wurde vom Modell blockiert (${blockReason}).`);
  const finishReason=body?.candidates?.[0]?.finishReason;
  if(finishReason==="MAX_TOKENS")throw new Error("Die Antwort wurde abgeschnitten. Bitte kleineren Abschnitt verarbeiten.");
  const text=outputText(body);
  if(!text)throw new Error(`Die KI hat kein auswertbares Ergebnis geliefert${finishReason?` (${finishReason})`:""}.`);
  let parsed;
  try{parsed=JSON.parse(text);}catch{throw new Error("Die KI-Antwort war kein gültiges JSON.");}
  return {...parsed,provider:"CLOUD",model:body.modelVersion||env.GEMINI_MODEL};
}

// Geraetesynchronisation. Der Worker kennt den Inhalt der Lerndaten nicht und
// speichert sie als undurchsichtigen Stand pro Zugriffsschluessel. Die
// Zusammenfuehrung passiert vollstaendig in der PWA.
const SYNC_MAX_BYTES=20_000_000;

async function syncSlot(accessKey){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(accessKey));
  return `sync:${[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("")}`;
}

function syncStore(env){
  const kv=env.LERNAPP_SYNC;
  if(!kv){
    const failure=new Error("Die Geräte-Synchronisation ist in diesem Worker nicht eingerichtet. Es fehlt die KV-Bindung LERNAPP_SYNC.");
    failure.status=501;
    throw failure;
  }
  return kv;
}

async function syncPull(env,accessKey){
  const stored=await syncStore(env).get(await syncSlot(accessKey),{type:"json"});
  return stored||{revision:0,updatedAt:null,deviceId:null,data:null};
}

// Der Revisionsvergleich verhindert, dass ein Geraet den Stand eines anderen
// ueberschreibt, ohne ihn gesehen zu haben. Bei Konflikt bekommt der Client den
// aktuellen Stand zurueck und fuehrt erneut zusammen.
async function syncPush(env,accessKey,payload){
  const kv=syncStore(env);
  const slot=await syncSlot(accessKey);
  const current=await kv.get(slot,{type:"json"});
  const currentRevision=Number(current?.revision)||0;
  if((Number(payload?.baseRevision)||0)!==currentRevision){
    return {conflict:true,revision:currentRevision,updatedAt:current?.updatedAt||null,data:current?.data||null};
  }
  if(!payload?.data||typeof payload.data!=="object")throw new Error("Es wurden keine Lerndaten zum Hochladen übertragen.");
  const record={
    revision:currentRevision+1,
    updatedAt:new Date().toISOString(),
    deviceId:clean(payload.deviceId,100),
    data:payload.data
  };
  const body=JSON.stringify(record);
  if(body.length>SYNC_MAX_BYTES)throw new Error("Der Lernstand ist zu groß für die Synchronisation. Bitte nicht mehr benötigtes Material löschen.");
  await kv.put(slot,body);
  return {conflict:false,revision:record.revision,updatedAt:record.updatedAt};
}

export default {
  async fetch(request,env){
    const origin=request.headers.get("Origin")||"";
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin,env)});
    if(request.method!=="POST")return json({error:"Nur POST wird unterstützt."},405,origin,env);
    const allowed=String(env.ALLOWED_ORIGIN||"").trim();
    if(allowed&&origin&&origin!==allowed)return json({error:"Origin nicht erlaubt."},403,origin,env);
    const expectedKey=String(env.LERNAPP_ACCESS_KEY||"").trim();
    if(expectedKey&&request.headers.get("X-Lernapp-Key")!==expectedKey)return json({error:"Ungültiger Zugriffsschlüssel."},401,origin,env);
    let body;
    try{body=await request.json();}catch{return json({error:"Ungültiges JSON."},400,origin,env);}
    const task=body?.task;
    if(task==="health")return json({ok:true,provider:"Cloud-Proxy",model:env.GEMINI_MODEL||null,sync:Boolean(env.LERNAPP_SYNC)},200,origin,env);
    if(task==="syncPull"||task==="syncPush"){
      // Ohne persoenlichen Zugriffsschluessel gaebe es nur einen einzigen
      // gemeinsamen Ablageplatz. Fremde Lerndaten waeren dann erreichbar.
      if(!expectedKey)return json({error:"Für die Synchronisation muss im Worker ein LERNAPP_ACCESS_KEY gesetzt sein."},403,origin,env);
      try{
        const result=task==="syncPull"
          ? await syncPull(env,expectedKey)
          : await syncPush(env,expectedKey,body?.payload||{});
        return json(result,200,origin,env);
      }catch(error){
        return json({error:String(error?.message||error)},error?.status||502,origin,env);
      }
    }
    if(!schemas[task])return json({error:"Unbekannte Aufgabe."},400,origin,env);
    try{
      const result=await callGemini(task,body?.payload||{},env);
      if(task==="evaluateFreeAnswer")result.score=clamp(result.score);
      if("confidence" in result)result.confidence=clamp(result.confidence);
      return json(result,200,origin,env);
    }catch(error){
      const headers=cors(origin,env);
      if(error?.retryAfter)headers["Retry-After"]=error.retryAfter;
      return new Response(JSON.stringify({error:String(error?.message||error)}),{status:error?.status||502,headers});
    }
  }
};
