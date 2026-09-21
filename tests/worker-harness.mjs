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
    case "BOOLEAN":return true;
    default:return schema.enum?.length?schema.enum[0]:"Ersatzantwort des Testproxys";
  }
}

// Die PWA erwartet bei einigen Aufgaben, dass ids aus der Anfrage
// zurueckkommen. Ohne das faende sie ihre eigenen Datensaetze nicht wieder.
function alignWithRequest(result,promptText){
  const ids=[...promptText.matchAll(/"(?:goalId|id)":"([^"]+)"/g)].map(m=>m[1]);
  for(const key of ["flashcards","items"]){
    if(!Array.isArray(result[key]))continue;
    result[key]=ids.length
      ? ids.map((id,index)=>({...result[key][0],...(key==="flashcards"?{goalId:id}:{id}),
          ...(key==="items"?{distractors:[`Falsch A ${index}`,`Falsch B ${index}`,`Falsch C ${index}`]}:{})}))
      : result[key];
  }
  return result;
}

export async function startWorkerHarness({port=8790,accessKey="test-schluessel",allowedOrigin="",failTimes=0}={}){
  const worker=(await import(pathToFileURL(path.resolve('cloud-worker/src/index.js')).href)).default;
  const kv=new Map();
  const calls=[];
  let remainingFailures=failTimes;

  const realFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const url=String(input?.url||input);
    if(!url.startsWith(GEMINI))return realFetch(input,init);
    const body=JSON.parse(init.body);
    const promptText=body.contents[0].parts.map(p=>p.text||"").join(" ");
    calls.push({model:url.split("/").pop().split(":")[0],hasImage:body.contents[0].parts.some(p=>p.inline_data)});
    if(remainingFailures>0){
      remainingFailures--;
      return new Response(JSON.stringify({error:{message:"Kontingent kurzzeitig erschoepft"}}),
        {status:429,headers:{"Retry-After":"1","Content-Type":"application/json"}});
    }
    const result=alignWithRequest(sampleFor(body.generationConfig.responseSchema),promptText);
    return new Response(JSON.stringify({
      candidates:[{content:{parts:[{text:JSON.stringify(result)}]},finishReason:"STOP"}],
      modelVersion:"testmodell"
    }),{status:200,headers:{"Content-Type":"application/json"}});
  };

  const env={
    GEMINI_API_KEY:"test",
    GEMINI_MODEL:"gemini-2.0-flash",
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
    async stop(){globalThis.fetch=realFetch;await new Promise(r=>server.close(r));}
  };
}
