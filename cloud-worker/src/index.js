const OPENAI_URL="https://api.openai.com/v1/responses";

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

function outputText(body){
  if(typeof body?.output_text==="string")return body.output_text;
  for(const item of body?.output||[]){
    if(item?.type!=="message")continue;
    for(const part of item.content||[]){if(part?.type==="output_text"&&typeof part.text==="string")return part.text;}
  }
  return "";
}

const schemas={
  summarize:{type:"object",additionalProperties:false,required:["summary","confidence"],properties:{summary:{type:"string"},confidence:{type:"number",minimum:0,maximum:1}}},
  tutor:{type:"object",additionalProperties:false,required:["answer","confidence","grounded"],properties:{answer:{type:"string"},confidence:{type:"number",minimum:0,maximum:1},grounded:{type:"boolean"}}},
  generateLearningGoals:{type:"object",additionalProperties:false,required:["goals","confidence"],properties:{goals:{type:"array",maxItems:12,items:{type:"object",additionalProperties:false,required:["statement","answerKey"],properties:{statement:{type:"string"},answerKey:{type:"string"}}}},confidence:{type:"number",minimum:0,maximum:1}}},
  generateFlashcards:{type:"object",additionalProperties:false,required:["flashcards","confidence"],properties:{flashcards:{type:"array",maxItems:30,items:{type:"object",additionalProperties:false,required:["goalId","prompt","answer"],properties:{goalId:{type:"string"},prompt:{type:"string"},answer:{type:"string"}}}},confidence:{type:"number",minimum:0,maximum:1}}},
  evaluateFreeAnswer:{type:"object",additionalProperties:false,required:["score","confidence","feedback"],properties:{score:{type:"number",minimum:0,maximum:1},confidence:{type:"number",minimum:0,maximum:1},feedback:{type:"string"}}}
};

function taskPrompt(task,payload){
  if(task==="summarize")return `Erstelle eine fachlich präzise ${clean(payload.length,20)||"standard"}e Zusammenfassung ausschließlich aus dem bereitgestellten Lernmaterial. Nichts ergänzen, was die Quelle nicht trägt.\n\nTITEL: ${clean(payload.title,300)}\n\nMATERIAL:\n${clean(payload.text)}`;
  if(task==="tutor")return `Beantworte die Frage ausschließlich anhand des Quellenkontexts. Wenn die Quelle nicht reicht, sage das ausdrücklich. Keine erfundenen Fakten. Antworte verständlich und lernorientiert.\n\nFRAGE: ${clean(payload.message,4000)}\n\nLERNZIEL: ${clean(payload.learningGoal,3000)}\n\nQUELLENKONTEXT:\n${clean(payload.context)}`;
  if(task==="generateLearningGoals")return `Erzeuge bis zu 3 atomare, prüfbare Lernziele aus genau dieser Quelle. Jedes Lernziel muss durch den Quelltext getragen sein. answerKey enthält die fachliche Sollantwort aus der Quelle.\n\nSEITE: ${clean(payload.sourcePage,20)}\n\nQUELLE:\n${clean(payload.text)}`;
  if(task==="generateFlashcards")return `Erzeuge pro Lernziel höchstens eine präzise Karteikarte. goalId muss exakt übernommen werden. Frage aktivierend, Antwort knapp aber vollständig.\n\nLERNZIELE:\n${clean(JSON.stringify(payload.goals||[]),30000)}`;
  if(task==="evaluateFreeAnswer")return `Bewerte die freie Antwort fachlich nur gegen Sollantwort und Quellenkontext. Bewerte sinngemäße richtige Formulierungen positiv, aber erfinde keine Anforderungen. score 0 bis 1. confidence beschreibt Sicherheit der Bewertung. Feedback nennt konkret, was richtig ist und was fehlt.\n\nFRAGE: ${clean(payload.question,4000)}\n\nSOLLANTWORT: ${clean(payload.expected,10000)}\n\nQUELLENKONTEXT: ${clean(payload.context,12000)}\n\nANTWORT DES LERNENDEN: ${clean(payload.answer,10000)}`;
  throw new Error("Unbekannte Aufgabe.");
}

async function callOpenAI(task,payload,env){
  if(!env.OPENAI_API_KEY)throw new Error("OPENAI_API_KEY fehlt im Worker-Secret.");
  if(!env.OPENAI_MODEL)throw new Error("OPENAI_MODEL fehlt in der Worker-Konfiguration.");
  const schema=schemas[task];
  if(!schema)throw new Error("Nicht unterstützte KI-Aufgabe.");
  const response=await fetch(OPENAI_URL,{
    method:"POST",
    headers:{"Authorization":`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      model:env.OPENAI_MODEL,
      store:false,
      instructions:"Du bist die semantische KI-Schicht einer wissenschaftlich orientierten Lernapp. Arbeite strikt quellengebunden und gib nur das angeforderte strukturierte Ergebnis zurück.",
      input:taskPrompt(task,payload||{}),
      text:{format:{type:"json_schema",name:`lernapp_${task}`,strict:true,schema}}
    })
  });
  const body=await response.json();
  if(!response.ok)throw new Error(body?.error?.message||`OpenAI Fehler (${response.status})`);
  const text=outputText(body);
  if(!text)throw new Error("Die KI hat kein auswertbares Ergebnis geliefert.");
  let parsed;
  try{parsed=JSON.parse(text);}catch{throw new Error("Die KI-Antwort war kein gültiges JSON.");}
  return {...parsed,provider:"CLOUD",model:body.model||env.OPENAI_MODEL};
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
    if(task==="health")return json({ok:true,provider:"Cloud-Proxy",model:env.OPENAI_MODEL||null},200,origin,env);
    if(!schemas[task])return json({error:"Unbekannte Aufgabe."},400,origin,env);
    try{
      const result=await callOpenAI(task,body?.payload||{},env);
      if(task==="evaluateFreeAnswer"){result.score=clamp(result.score);result.confidence=clamp(result.confidence);}
      return json(result,200,origin,env);
    }catch(error){return json({error:String(error?.message||error)},502,origin,env);}
  }
};
