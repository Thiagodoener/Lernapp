const GEMINI_BASE="https://generativelanguage.googleapis.com/v1beta/models";
const MAX_INLINE_IMAGE_BASE64=7_000_000;

// Ein fest verdrahteter Modellname ist eine Zeitbombe: Google schaltet aeltere
// Fassungen ab, und dann steht der gesamte Cloud-Pfad. Genau das ist mit
// gemini-2.0-flash passiert. Deshalb wird das Modell zur Laufzeit aufgeloest:
// aus dem, was der Schluessel tatsaechlich anbietet, nach einer Rangfolge.
//
// Die Rangfolge trennt guenstige Fliessbandarbeit von den Aufgaben, bei denen
// Qualitaet zaehlt. Lernziele und Karteikarten sind Extraktion aus vorgegebenem
// Text; Bewertung, Tutor und Bildverstehen tragen die inhaltliche Last.
const MODEL_TIERS={
  guenstig:["flash-lite-latest","flash-lite","flash-latest"],
  stark:["flash-latest","flash","pro-latest"]
};
const TASK_TIER={
  generateLearningGoals:"guenstig",
  generateFlashcards:"guenstig",
  generateChoiceOptions:"guenstig",
  summarize:"stark",
  tutor:"stark",
  evaluateFreeAnswer:"stark",
  analyzeImage:"stark"
};

// Antwortlaenge je Aufgabe statt pauschal 8192: nicht ausgeschoepfte Tokens
// kosten zwar nichts, eine zu kleine Grenze schneidet aber ab, und eine zu
// grosse laedt das Modell zum Ausschweifen ein.
const TASK_MAX_TOKENS={
  summarize:4096,
  tutor:2048,
  generateLearningGoals:4096,
  generateFlashcards:4096,
  evaluateFreeAnswer:1024,
  analyzeImage:4096,
  generateChoiceOptions:2048
};

const MODEL_CACHE_KEY="models:v1";
const MODEL_CACHE_MS=12*60*60*1000;
let modelMemoryCache=null;

async function listModels(env){
  const response=await fetch(`${GEMINI_BASE}?pageSize=200`,{headers:{"x-goog-api-key":env.GEMINI_API_KEY}});
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error(body?.error?.message||`Modellliste nicht abrufbar (${response.status})`),{status:response.status});
  return (body?.models||[])
    .filter(model=>(model.supportedGenerationMethods||[]).includes("generateContent"))
    .map(model=>String(model.name||"").replace(/^models\//,""))
    .filter(Boolean);
}

async function availableModels(env,{refresh=false}={}){
  const now=Date.now();
  if(!refresh&&modelMemoryCache&&now-modelMemoryCache.at<MODEL_CACHE_MS)return modelMemoryCache.models;
  const kv=env.LERNAPP_SYNC;
  if(!refresh&&kv){
    const cached=await kv.get(MODEL_CACHE_KEY,{type:"json"}).catch(()=>null);
    if(cached?.models?.length&&now-Number(cached.at||0)<MODEL_CACHE_MS){
      modelMemoryCache=cached;
      return cached.models;
    }
  }
  const models=await listModels(env);
  // Eine leere Liste wird nicht zwischengespeichert. Sonst haette eine einzelne
  // gestoerte Antwort den Proxy fuer zwoelf Stunden lahmgelegt, obwohl der
  // Schluessel laengst wieder Modelle anbietet.
  if(!models.length)return models;
  const record={at:now,models};
  modelMemoryCache=record;
  if(kv)await kv.put(MODEL_CACHE_KEY,JSON.stringify(record)).catch(()=>{});
  return models;
}

// "flash-lite-latest" soll auch "gemini-flash-lite-latest" treffen, und ein
// blosses "flash" nicht versehentlich "flash-lite". Deshalb zuerst exakt, dann
// als Endung, und Lite nur, wenn Lite gemeint war.
function matchModel(models,wanted){
  const exact=models.find(model=>model===wanted||model===`gemini-${wanted}`);
  if(exact)return exact;
  const lite=wanted.includes("lite");
  const passend=models
    .filter(model=>model.includes(wanted)&&(lite||!model.includes("lite")))
    .sort((a,b)=>b.localeCompare(a,"en",{numeric:true}));
  return passend[0]||null;
}

async function resolveModel(env,task,{refresh=false}={}){
  // Eine ausdrueckliche Vorgabe gewinnt immer: wer ein bestimmtes Modell will,
  // soll es bekommen, auch wenn die Rangfolge etwas anderes vorschlaegt.
  const erzwungen=String(env.GEMINI_MODEL||"").trim();
  if(erzwungen)return erzwungen;
  let models=await availableModels(env,{refresh});
  // Ein zwischengespeicherter Stand kann veraltet sein. Bringt er nichts
  // Brauchbares, wird einmal frisch nachgefragt, bevor aufgegeben wird.
  if(!models.length&&!refresh)models=await availableModels(env,{refresh:true});
  if(!models.length)throw Object.assign(new Error("Der Schlüssel bietet kein Modell an, das Inhalte erzeugen kann."),{code:"NO_MODEL"});
  const eigene=String(env.GEMINI_MODELS||"").split(",").map(x=>x.trim()).filter(Boolean);
  const rangfolge=[...eigene,...(MODEL_TIERS[TASK_TIER[task]||"stark"]||MODEL_TIERS.stark)];
  for(const wanted of rangfolge){
    const treffer=matchModel(models,wanted);
    if(treffer)return treffer;
  }
  return matchModel(models,"flash")||models[0];
}

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
// Die Nutzlast einer Mehrseiten-Anfrage wird hier hart begrenzt. Der Client
// packt bereits auf ein kleineres Mass; diese Grenze ist der Schutz davor, dass
// ein fehlerhafter Client den Proxy mit einem ganzen Buch beschickt.
const MAX_REQUEST_CHARS=180_000;

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
  generateLearningGoals:{type:"OBJECT",required:["goals","confidence"],properties:{goals:{type:"ARRAY",items:{type:"OBJECT",required:["statement","answerKey","sourcePage"],properties:{statement:{type:"STRING"},answerKey:{type:"STRING"},sourcePage:{type:"INTEGER"}}}},confidence:{type:"NUMBER"}}},
  generateFlashcards:{type:"OBJECT",required:["flashcards","confidence"],properties:{flashcards:{type:"ARRAY",items:{type:"OBJECT",required:["goalId","prompt","answer"],properties:{goalId:{type:"STRING"},prompt:{type:"STRING"},answer:{type:"STRING"}}}},confidence:{type:"NUMBER"}}},
  evaluateFreeAnswer:{type:"OBJECT",required:["score","confidence","feedback"],properties:{score:{type:"NUMBER"},confidence:{type:"NUMBER"},feedback:{type:"STRING"}}},
  analyzeImage:{type:"OBJECT",required:["text","kind","confidence"],properties:{text:{type:"STRING"},kind:{type:"STRING",enum:["HANDWRITTEN_NOTE","SLIDE","DIAGRAM","TEXT_PAGE","SCREENSHOT","PHOTO","OTHER"]},confidence:{type:"NUMBER"}}},
  generateChoiceOptions:{type:"OBJECT",required:["items","confidence"],properties:{items:{type:"ARRAY",items:{type:"OBJECT",required:["id","distractors"],properties:{id:{type:"STRING"},distractors:{type:"ARRAY",items:{type:"STRING"}}}}},confidence:{type:"NUMBER"}}}
};

function taskPrompt(task,payload){
  if(task==="summarize")return `Erstelle eine fachlich präzise ${clean(payload.length,20)||"standard"}e Zusammenfassung ausschließlich aus dem bereitgestellten Lernmaterial. Nichts ergänzen, was die Quelle nicht trägt.\n\nTITEL: ${clean(payload.title,300)}\n\nMATERIAL:\n${clean(payload.text)}`;
  if(task==="tutor")return `Beantworte die Frage ausschließlich anhand des Quellenkontexts. Wenn die Quelle nicht reicht, sage das ausdrücklich. Keine erfundenen Fakten. Antworte verständlich und lernorientiert.\n\nFRAGE: ${clean(payload.message,4000)}\n\nLERNZIEL: ${clean(payload.learningGoal,3000)}\n\nQUELLENKONTEXT:\n${clean(payload.context)}`;
  if(task==="generateLearningGoals"){
    // Mehrere Seiten in einem Aufruf: bei einem Skript mit 187 Seiten ist das
    // der Unterschied zwischen knapp 190 Anfragen und rund 15. Jede Seite wird
    // weiterhin einzeln ausgewertet, nur eben im selben Aufruf, und jedes
    // Lernziel traegt die Seite, aus der es stammt.
    const seiten=Array.isArray(payload.pages)&&payload.pages.length
      ? payload.pages
      : [{page:payload.sourcePage,text:payload.text}];
    const proSeite=Math.max(1,Math.min(3,Number(payload.goalsPerPage)||3));
    const block=seiten.map(seite=>`--- SEITE ${clean(seite.page,20)} ---\n${clean(seite.text,40000)}`).join("\n\n");
    return `Erzeuge aus jedem Seitenabschnitt bis zu ${proSeite} atomare, prüfbare Lernziele.\n\nRegeln:\n- Jedes Lernziel muss durch den Text genau der Seite getragen sein, aus der es stammt.\n- sourcePage ist die Nummer dieser Seite, exakt wie in der Überschrift des Abschnitts.\n- answerKey enthält die fachliche Sollantwort aus der Quelle, nicht eine Umschreibung der Frage.\n- Trägt ein Abschnitt keinen Lernstoff, erzeuge für ihn kein Lernziel.\n- Wiederholt ein Abschnitt nur, was ein vorheriger schon sagt, erzeuge kein zweites Lernziel dafür.\n\nTITEL: ${clean(payload.title,300)}\n\n${block}`;
  }
  if(task==="generateFlashcards")return `Erzeuge pro Lernziel höchstens eine präzise Karteikarte. goalId muss exakt übernommen werden. Frage aktivierend, Antwort knapp aber vollständig.\n\nLERNZIELE:\n${clean(JSON.stringify(payload.goals||[]),30000)}`;
  if(task==="evaluateFreeAnswer")return `Bewerte die freie Antwort fachlich nur gegen Sollantwort und Quellenkontext. Bewerte sinngemäße richtige Formulierungen positiv, aber erfinde keine Anforderungen. score 0 bis 1. confidence beschreibt Sicherheit der Bewertung. Feedback nennt konkret, was richtig ist und was fehlt.\n\nFRAGE: ${clean(payload.question,4000)}\n\nSOLLANTWORT: ${clean(payload.expected,10000)}\n\nQUELLENKONTEXT: ${clean(payload.context,12000)}\n\nANTWORT DES LERNENDEN: ${clean(payload.answer,10000)}`;
  if(task==="analyzeImage")return `Erfasse den gesamten lernrelevanten Inhalt dieses Bildes als zusammenhängenden Text.\n\nRegeln:\n- Lesbaren Text wortgetreu übernehmen, auch Handschrift.\n- Formeln, Diagramme, Tabellen und Skizzen so beschreiben, dass ihr fachlicher Inhalt lernbar wird, inklusive Beschriftungen, Achsen, Beziehungen und Richtungen.\n- Struktur wie Überschriften, Nummerierungen und Aufzählungen erhalten.\n- Nichts ergänzen, interpretieren oder ausschmücken, was das Bild nicht zeigt.\n- Unleserliche Stellen ausdrücklich als [unleserlich] markieren statt zu raten.\n- Enthält das Bild keinen lernrelevanten Inhalt, gib einen leeren text zurück.\n\nkind beschreibt die Art der Vorlage. confidence beschreibt, wie sicher der Inhalt erfasst wurde.${payload.note?`\n\nHINWEIS DES NUTZERS: ${clean(payload.note,2000)}`:""}`;
  if(task==="generateChoiceOptions")return `Erzeuge zu jeder Frage genau drei falsche Antwortmöglichkeiten für eine Multiple-Choice-Aufgabe.\n\nRegeln:\n- id exakt übernehmen.\n- Jeder Distraktor muss fachlich eindeutig falsch sein, aber im selben Themenfeld liegen und auf den ersten Blick plausibel wirken.\n- Länge, Satzbau und Detailtiefe an die richtige Antwort angleichen, damit die richtige Antwort nicht an der Form erkennbar ist.\n- Keine Variante darf die richtige Antwort sinngemäß wiederholen oder sie nur umformulieren.\n- Keine Meta-Optionen wie „alle Antworten sind richtig“ oder „keine der genannten“.\n- Die drei Distraktoren einer Frage müssen sich voneinander unterscheiden.\n\nFRAGEN:\n${clean(JSON.stringify(payload.items||[]),30000)}`;
  throw new Error("Unbekannte Aufgabe.");
}

function requestParts(task,payload){
  const prompt=taskPrompt(task,payload);
  if(prompt.length>MAX_REQUEST_CHARS)throw Object.assign(new Error("Die Anfrage ist zu umfangreich. Bitte in kleineren Abschnitten verarbeiten."),{code:"TOO_LARGE",status:413});
  const parts=[{text:prompt}];
  if(task!=="analyzeImage")return parts;
  const mimeType=String(payload.mimeType||"").trim().toLowerCase();
  if(!IMAGE_MIME.has(mimeType))throw new Error("Nicht unterstütztes Bildformat.");
  const data=String(payload.imageBase64||"").replace(/^data:[^,]*,/,"").trim();
  if(!data)throw new Error("Es wurde kein Bild übertragen.");
  if(data.length>MAX_INLINE_IMAGE_BASE64)throw new Error("Das Bild ist zu groß für die Analyse.");
  parts.push({inline_data:{mime_type:mimeType,data}});
  return parts;
}

// Ein abgeschaltetes Modell meldet sich als 404 oder mit genau diesem Satz.
// Daran haengt der Unterschied zwischen "einmal neu aufloesen und weiter" und
// "der Nutzer sieht eine englische Fehlermeldung aus Kalifornien".
function istModellFehler(status,message){
  return status===404||/no longer available|not found|is not supported|nicht mehr/i.test(String(message||""));
}

// Denkschritte kosten Ausgabetokens, oft ein Vielfaches der eigentlichen
// Antwort. Beim Herausziehen von Lernzielen oder Karteikarten aus vorgegebenem
// Text bringen sie nichts, bei Bewertung und Bildverstehen schon.
function thinkingFor(task){
  return TASK_TIER[task]==="guenstig"?{thinkingBudget:0}:null;
}

async function generateOnce(task,payload,env,model,{ohneThinking=false}={}){
  const schema=schemas[task];
  const thinking=ohneThinking?null:thinkingFor(task);
  const generationConfig={
    temperature:0.2,
    maxOutputTokens:TASK_MAX_TOKENS[task]||4096,
    responseMimeType:"application/json",
    responseSchema:schema
  };
  if(thinking)generationConfig.thinkingConfig=thinking;
  const response=await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`,{
    method:"POST",
    headers:{"x-goog-api-key":env.GEMINI_API_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({
      systemInstruction:{parts:[{text:"Du bist die semantische KI-Schicht einer wissenschaftlich orientierten Lernapp. Arbeite strikt quellengebunden und gib nur das angeforderte strukturierte Ergebnis zurück."}]},
      contents:[{role:"user",parts:requestParts(task,payload||{})}],
      generationConfig
    })
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok){
    const nachricht=body?.error?.message||`Gemini Fehler (${response.status})`;
    const failure=new Error(nachricht);
    failure.httpStatus=response.status;
    if(RETRYABLE_STATUS.has(response.status)){
      failure.status=response.status;
      failure.retryAfter=response.headers.get("Retry-After");
      failure.code="THROTTLED";
    }
    if(istModellFehler(response.status,nachricht))failure.code="MODEL_UNAVAILABLE";
    // Ein aelteres Modell kennt thinkingConfig nicht und lehnt die Anfrage ab.
    if(response.status===400&&/thinking/i.test(nachricht))failure.code="NO_THINKING_CONFIG";
    throw failure;
  }
  return body;
}

async function callGemini(task,payload,env){
  if(!env.GEMINI_API_KEY)throw Object.assign(new Error("GEMINI_API_KEY fehlt im Worker-Secret."),{code:"NO_KEY",status:500});
  const schema=schemas[task];
  if(!schema)throw Object.assign(new Error("Nicht unterstützte KI-Aufgabe."),{code:"UNKNOWN_TASK",status:400});

  let model=await resolveModel(env,task);
  let body;
  try{
    body=await generateOnce(task,payload,env,model);
  }catch(error){
    if(error.code==="NO_THINKING_CONFIG"){
      body=await generateOnce(task,payload,env,model,{ohneThinking:true});
    }else if(error.code==="MODEL_UNAVAILABLE"&&!String(env.GEMINI_MODEL||"").trim()){
      // Die zwischengespeicherte Liste ist veraltet. Einmal frisch aufloesen und
      // genau einmal wiederholen, statt den Import scheitern zu lassen.
      const neu=await resolveModel(env,task,{refresh:true});
      if(neu===model)throw error;
      model=neu;
      body=await generateOnce(task,payload,env,model);
    }else throw error;
  }

  const blockReason=body?.promptFeedback?.blockReason;
  if(blockReason)throw Object.assign(new Error(`Die Anfrage wurde vom Modell blockiert (${blockReason}).`),{code:"BLOCKED"});
  const finishReason=body?.candidates?.[0]?.finishReason;
  if(finishReason==="MAX_TOKENS")throw Object.assign(new Error("Die Antwort wurde abgeschnitten. Bitte kleineren Abschnitt verarbeiten."),{code:"TRUNCATED"});
  const text=outputText(body);
  if(!text)throw Object.assign(new Error(`Die KI hat kein auswertbares Ergebnis geliefert${finishReason?` (${finishReason})`:""}.`),{code:"EMPTY"});
  let parsed;
  try{parsed=JSON.parse(text);}catch{throw Object.assign(new Error("Die KI-Antwort war kein gültiges JSON."),{code:"BAD_JSON"});}
  // Die Tokenzahlen sind die einzige belastbare Grundlage fuer eine
  // Kostenschaetzung. Ohne sie koennte die App nur Anfragen zaehlen, und eine
  // Anfrage ueber 40 Seiten kostet ein Vielfaches einer ueber eine Seite.
  const usage=body?.usageMetadata||{};
  return {
    ...parsed,
    provider:"CLOUD",
    model:body.modelVersion||model,
    usage:{
      prompt:Number(usage.promptTokenCount)||0,
      output:Number(usage.candidatesTokenCount)||0,
      thoughts:Number(usage.thoughtsTokenCount)||0,
      cached:Number(usage.cachedContentTokenCount)||0,
      total:Number(usage.totalTokenCount)||0
    }
  };
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
    if(task==="health"){
      // Ein Healthcheck, der nur Variablen liest, haette den abgeschalteten
      // Modellnamen fuer gesund erklaert. Deshalb wird wirklich aufgeloest.
      if(!env.GEMINI_API_KEY)return json({ok:false,error:"GEMINI_API_KEY fehlt im Worker-Secret.",code:"NO_KEY"},500,origin,env);
      try{
        const [guenstig,stark]=await Promise.all([
          resolveModel(env,"generateLearningGoals"),
          resolveModel(env,"evaluateFreeAnswer")
        ]);
        return json({ok:true,provider:"Cloud-Proxy",model:stark,models:{guenstig,stark},
          erzwungen:Boolean(String(env.GEMINI_MODEL||"").trim()),sync:Boolean(env.LERNAPP_SYNC)},200,origin,env);
      }catch(error){
        return json({ok:false,error:String(error?.message||error),code:error?.code||"NO_MODEL"},error?.status===429?429:502,origin,env);
      }
    }
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
      // Der Code ist fuer die PWA: sie uebersetzt ihn in einen deutschen Satz,
      // der sagt, was zu tun ist. Der englische Originaltext bleibt daneben
      // stehen, damit bei der Fehlersuche nichts verloren geht.
      return new Response(JSON.stringify({error:String(error?.message||error),code:error?.code||"UPSTREAM"}),
        {status:error?.status||502,headers});
    }
  }
};
