// Faehrt den echten Cloud-Proxy aus cloud-worker/src/index.js in Node.
//
// Getestet wird damit der Worker-Code selbst: CORS, Zugriffsschluessel,
// Tasktabelle, responseSchema, Drosselung samt Retry-After und der
// Geraeteabgleich ueber KV. Nur das Modell dahinter ist ersetzt, weil ein
// echter Aufruf einen Google-Schluessel und Kontingent braucht. Die Antwort
// des Ersatzes wird aus dem responseSchema gebildet, das der Worker selbst
// mitschickt: was der Worker nicht anfordert, kann der Test auch nicht liefern.
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const GEMINI="https://generativelanguage.googleapis.com";

function sampleFor(schema,depth=0){
  if(!schema)return null;
  switch(schema.type){
    case "OBJECT":{
      const out={};
      for(const [key,value] of Object.entries(schema.properties||{}))out[key]=sampleFor(value,depth+1);
      return out;
    }
    case "ARRAY":return [sampleFor(schema.items,depth+1),sampleFor(schema.items,depth+1)];
    case "NUMBER":return 0.8;
    case "INTEGER":return 1;
    case "BOOLEAN":return true;
    default:return schema.enum?.length?schema.enum[0]:"Ersatzantwort des Testproxys";
  }
}

// Die PWA erwartet bei einigen Aufgaben, dass ids aus der Anfrage
// zurueckkommen. Ohne das faende sie ihre eigenen Datensaetze nicht wieder.
function alignWithRequest(result,promptText){
  const ids=[...promptText.matchAll(/"(?:goalId|id)":"([^"]+)"/g)].map(m=>m[1]);
  // Eine Mehrseiten-Anfrage traegt Seitenmarken. Das Ersatzmodell verteilt seine
  // Lernziele darauf, sonst liesse sich die Seitenzuordnung nicht pruefen.
  const seiten=[...promptText.matchAll(/--- SEITE (\d+) ---/g)].map(m=>Number(m[1]));
  if(Array.isArray(result.goals)&&seiten.length){
    result.goals=seiten.map((page,index)=>({...result.goals[0],sourcePage:page,
      statement:`Lernziel zu Seite ${page}`,answerKey:`Sollantwort ${index+1} zu Seite ${page}`}));
  }
  for(const key of ["flashcards","items"]){
    if(!Array.isArray(result[key]))continue;
    result[key]=ids.length
      ? ids.map((id,index)=>({...result[key][0],...(key==="flashcards"?{goalId:id}:{id}),
          ...(key==="items"?{distractors:[`Falsch A ${index}`,`Falsch B ${index}`,`Falsch C ${index}`]}:{})}))
      : result[key];
  }
  return result;
}

// Der Modellkatalog, den der Schluessel angeblich anbietet. Genau hier lag der
// Produktionsfehler: gemini-2.0-flash war abgeschaltet, stand aber fest in der
// Konfiguration. Der Katalog laesst sich zur Laufzeit aendern, damit der
// Rueckfall pruefbar ist.
const STANDARD_KATALOG=[
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-pro-latest",
  "embedding-001"
];

export async function startWorkerHarness({port=8790,accessKey="test-schluessel",allowedOrigin="",failTimes=0,katalog=STANDARD_KATALOG}={}){
  const worker=(await import(pathToFileURL(path.resolve('cloud-worker/src/index.js')).href)).default;
  const kv=new Map();
  const calls=[];
  let remainingFailures=failTimes;

  let modelle=[...katalog];
  let abgeschaltet=new Set();

  const realFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const url=String(input?.url||input);
    if(!url.startsWith(GEMINI))return realFetch(input,init);

    // Modellliste: nur embedding-001 kann kein generateContent, damit der
    // Worker seine Filterung wirklich anwenden muss.
    if(!init||init.method!=="POST"){
      calls.push({liste:true});
      return new Response(JSON.stringify({models:modelle.map(name=>({
        name:`models/${name}`,
        supportedGenerationMethods:name.startsWith("embedding")?["embedContent"]:["generateContent"]
      }))}),{status:200,headers:{"Content-Type":"application/json"}});
    }

    const modell=url.split("/").pop().split(":")[0];
    // Ein Modell, das nicht mehr im Katalog steht, antwortet wie ein
    // abgeschaltetes. Sonst wuerde ein veralteter Zwischenspeicher im Worker
    // unbemerkt weiterbedient und der Rueckfall nie geprueft.
    if(abgeschaltet.has(modell)||!modelle.includes(modell)){
      return new Response(JSON.stringify({error:{message:`This model models/${modell} is no longer available. Please update your code to use models/gemini-3.6-flash for the latest features and improvements.`}}),
        {status:404,headers:{"Content-Type":"application/json"}});
    }
    const body=JSON.parse(init.body);
    const promptText=body.contents[0].parts.map(p=>p.text||"").join(" ");
    calls.push({model:modell,hasImage:body.contents[0].parts.some(p=>p.inline_data),
      thinking:body.generationConfig?.thinkingConfig?.thinkingBudget,
      maxTokens:body.generationConfig?.maxOutputTokens,
      promptLength:promptText.length});
    if(remainingFailures>0){
      remainingFailures--;
      return new Response(JSON.stringify({error:{message:"Kontingent kurzzeitig erschoepft"}}),
        {status:429,headers:{"Retry-After":"1","Content-Type":"application/json"}});
    }
    const result=alignWithRequest(sampleFor(body.generationConfig.responseSchema),promptText);
    return new Response(JSON.stringify({
      candidates:[{content:{parts:[{text:JSON.stringify(result)}]},finishReason:"STOP"}],
      modelVersion:modell,
      usageMetadata:{
        promptTokenCount:Math.ceil(promptText.length/4),
        candidatesTokenCount:Math.ceil(JSON.stringify(result).length/4),
        totalTokenCount:Math.ceil((promptText.length+JSON.stringify(result).length)/4)
      }
    }),{status:200,headers:{"Content-Type":"application/json"}});
  };

  const env={
    GEMINI_API_KEY:"test",
    LERNAPP_ACCESS_KEY:accessKey,
    ALLOWED_ORIGIN:allowedOrigin,
    LERNAPP_SYNC:{
      async get(key,options){const raw=kv.get(key);if(raw===undefined)return null;return options?.type==="json"?JSON.parse(raw):raw;},
      async put(key,value){kv.set(key,value);}
    }
  };

  const server=http.createServer(async(req,res)=>{
    const chunks=[];
    for await (const chunk of req)chunks.push(chunk);
    const request=new Request(`http://127.0.0.1:${port}${req.url}`,{
      method:req.method,
      headers:req.headers,
      body:["GET","HEAD"].includes(req.method)?undefined:Buffer.concat(chunks)
    });
    const response=await worker.fetch(request,env);
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));

  return {
    url:`http://127.0.0.1:${port}`,
    accessKey,
    calls,
    kvSize:()=>kv.size,
    setFailures:n=>{remainingFailures=n;},
    // Ein Modell abschalten, wie Google es mit gemini-2.0-flash getan hat.
    abschalten:name=>{abgeschaltet.add(name);modelle=modelle.filter(m=>m!==name);kv.delete("models:v1");},
    // Ein neuer Katalog beschreibt eine neue Lage: was wieder darin steht, gilt
    // auch wieder als verfuegbar.
    katalogSetzen:liste=>{modelle=[...liste];abgeschaltet=new Set();kv.delete("models:v1");},
    letzterAufruf:()=>calls.filter(c=>!c.liste).at(-1),
    async stop(){globalThis.fetch=realFetch;await new Promise(r=>server.close(r));}
  };
}
