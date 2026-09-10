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
  analyzeImage:{type:"OBJECT",required:["text","kind","confidence"],properties:{text:{type:"STRING"},kind:{type:"STRING",enum:["HANDWRITTEN_NOTE","SLIDE","DIAGRAM","TEXT_PAGE","SCREENSHOT","PHOTO","OTHER"]},confidence:{type:"NUMBER"}}}
};

function taskPrompt(task,payload){
  if(task==="summarize")return `Erstelle eine fachlich präzise ${clean(payload.length,20)||"standard"}e Zusammenfassung ausschließlich aus dem bereitgestellten Lernmaterial. Nichts ergänzen, was die Quelle nicht trägt.\n\nTITEL: ${clean(payload.title,300)}\n\nMATERIAL:\n${clean(payload.text)}`;
  if(task==="tutor")return `Beantworte die Frage ausschließlich anhand des Quellenkontexts. Wenn die Quelle nicht reicht, sage das ausdrücklich. Keine erfundenen Fakten. Antworte verständlich und lernorientiert.\n\nFRAGE: ${clean(payload.message,4000)}\n\nLERNZIEL: ${clean(payload.learningGoal,3000)}\n\nQUELLENKONTEXT:\n${clean(payload.context)}`;
  if(task==="generateLearningGoals")return `Erzeuge bis zu 3 atomare, prüfbare Lernziele aus genau dieser Quelle. Jedes Lernziel muss durch den Quelltext getragen sein. answerKey enthält die fachliche Sollantwort aus der Quelle.\n\nSEITE: ${clean(payload.sourcePage,20)}\n\nQUELLE:\n${clean(payload.text)}`;
  if(task==="generateFlashcards")return `Erzeuge pro Lernziel höchstens eine präzise Karteikarte. goalId muss exakt übernommen werden. Frage aktivierend, Antwort knapp aber vollständig.\n\nLERNZIELE:\n${clean(JSON.stringify(payload.goals||[]),30000)}`;
  if(task==="evaluateFreeAnswer")return `Bewerte die freie Antwort fachlich nur gegen Sollantwort und Quellenkontext. Bewerte sinngemäße richtige Formulierungen positiv, aber erfinde keine Anforderungen. score 0 bis 1. confidence beschreibt Sicherheit der Bewertung. Feedback nennt konkret, was richtig ist und was fehlt.\n\nFRAGE: ${clean(payload.question,4000)}\n\nSOLLANTWORT: ${clean(payload.expected,10000)}\n\nQUELLENKONTEXT: ${clean(payload.context,12000)}\n\nANTWORT DES LERNENDEN: ${clean(payload.answer,10000)}`;
  if(task==="analyzeImage")return `Erfasse den gesamten lernrelevanten Inhalt dieses Bildes als zusammenhängenden Text.\n\nRegeln:\n- Lesbaren Text wortgetreu übernehmen, auch Handschrift.\n- Formeln, Diagramme, Tabellen und Skizzen so beschreiben, dass ihr fachlicher Inhalt lernbar wird, inklusive Beschriftungen, Achsen, Beziehungen und Richtungen.\n- Struktur wie Überschriften, Nummerierungen und Aufzählungen erhalten.\n- Nichts ergänzen, interpretieren oder ausschmücken, was das Bild nicht zeigt.\n- Unleserliche Stellen ausdrücklich als [unleserlich] markieren statt zu raten.\n- Enthält das Bild keinen lernrelevanten Inhalt, gib einen leeren text zurück.\n\nkind beschreibt die Art der Vorlage. confidence beschreibt, wie sicher der Inhalt erfasst wurde.${payload.note?`\n\nHINWEIS DES NUTZERS: ${clean(payload.note,2000)}`:""}`;
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
  const body=await response.json();
  if(!response.ok)throw new Error(body?.error?.message||`Gemini Fehler (${response.status})`);
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
    if(task==="health")return json({ok:true,provider:"Cloud-Proxy",model:env.GEMINI_MODEL||null},200,origin,env);
    if(!schemas[task])return json({error:"Unbekannte Aufgabe."},400,origin,env);
    try{
      const result=await callGemini(task,body?.payload||{},env);
      if(task==="evaluateFreeAnswer")result.score=clamp(result.score);
      if("confidence" in result)result.confidence=clamp(result.confidence);
      return json(result,200,origin,env);
    }catch(error){return json({error:String(error?.message||error)},502,origin,env);}
  }
};
