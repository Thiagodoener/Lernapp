const DB_NAME = "lernapp-pwa";
const DB_VERSION = 2;
const STORES = [
  "modules","documents","goals","flashcards","reviews",
  "evidence","mastery","gaps","plans","settings",
  "exams","examSessions"
];

const state = {
  tab: "today",
  moduleId: null,
  installPrompt: null,
};

const FSRS6_W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194,
  0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
  1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542
];

let fsrsModulePromise = null;
let tesseractPromise = null;

async function getFSRSModule() {
  if (!fsrsModulePromise) {
    fsrsModulePromise = import(
      "https://esm.sh/ts-fsrs@5.4.1?bundle"
    );
  }
  return fsrsModulePromise;
}

function serializeFSRSCard(card) {
  return {
    ...card,
    due: new Date(card.due).toISOString(),
    last_review: card.last_review
      ? new Date(card.last_review).toISOString()
      : null
  };
}

function hydrateFSRSCard(card) {
  if (!card) return null;
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review
      ? new Date(card.last_review)
      : undefined
  };
}

async function newFSRSState() {
  const { createEmptyCard } = await getFSRSModule();
  return serializeFSRSCard(
    createEmptyCard(new Date())
  );
}

async function scheduleFSRS(storedCard, rating) {
  const { fsrs, Rating } = await getFSRSModule();
  const scheduler = fsrs({
    w: FSRS6_W,
    request_retention: 0.9,
    maximum_interval: 36500,
    enable_fuzz: true,
    enable_short_term: true,
    learning_steps: ["1m", "10m"],
    relearning_steps: ["10m"]
  });
  const gradeMap = {
    1: Rating.Again,
    2: Rating.Hard,
    3: Rating.Good,
    4: Rating.Easy
  };
  const base = storedCard
    ? hydrateFSRSCard(storedCard)
    : hydrateFSRSCard(await newFSRSState());
  const result = scheduler.next(
    base,
    new Date(),
    gradeMap[rating] || Rating.Good
  );
  return {
    card: serializeFSRSCard(result.card),
    log: {
      ...result.log,
      due: new Date(result.log.due).toISOString(),
      review: new Date(result.log.review).toISOString()
    }
  };
}

async function loadScriptOnce(src, globalName) {
  if (window[globalName]) return window[globalName];
  const existing = document.querySelector(
    `script[data-lib="${globalName}"]`
  );
  if (existing) {
    await new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
    return window[globalName];
  }
  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  script.dataset.lib = globalName;
  document.head.appendChild(script);
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });
  return window[globalName];
}

async function getTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = loadScriptOnce(
      "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js",
      "Tesseract"
    );
  }
  return tesseractPromise;
}

function speechSupported() {
  return Boolean(
    window.SpeechRecognition
    || window.webkitSpeechRecognition
  );
}

function startSpeechInto(textarea) {
  const Recognition =
    window.SpeechRecognition
    || window.webkitSpeechRecognition;
  if (!Recognition) {
    toast("Spracherkennung wird hier nicht unterstützt. Bitte tippen.");
    return;
  }
  const recognition = new Recognition();
  recognition.lang = "de-DE";
  recognition.interimResults = true;
  recognition.continuous = true;
  let finalText = textarea.value.trim();

  recognition.onresult = event => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalText += (finalText ? " " : "") + transcript.trim();
      } else {
        interim += transcript;
      }
    }
    textarea.value = `${finalText}${interim ? " " + interim : ""}`.trim();
  };
  recognition.onerror = () => {
    toast("Spracherkennung beendet. Texteingabe bleibt verfügbar.");
  };
  recognition.onend = () => {
    textarea.dataset.listening = "false";
  };
  textarea.dataset.listening = "true";
  recognition.start();
  toast("Sprich jetzt deine Antwort.");
}

const $ = (sel) => document.querySelector(sel);
const content = $("#content");
const title = $("#screen-title");
const modal = $("#modal");
const modalContent = $("#modal-content");

function uid() {
  return crypto.randomUUID();
}
function nowISO() { return new Date().toISOString(); }
function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function esc(s="") {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}
function clamp(v,min=0,max=1){ return Math.max(min,Math.min(max,v)); }
function tokenize(text) {
  return new Set(
    String(text).toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(x => x.length >= 4)
  );
}
function scoreText(expected, actual) {
  const e = tokenize(expected), a = tokenize(actual);
  if (!e.size) return 0;
  let hit = 0;
  e.forEach(t => { if (a.has(t)) hit++; });
  return hit / e.size;
}
function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}
function showModal(html) {
  modalContent.innerHTML = html;
  modal.showModal();
}
function closeModal(){ modal.close(); }
window.closeModal = closeModal;

function openDB() {
  return new Promise((resolve,reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          db.createObjectStore(s, {keyPath:"id"});
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(store, mode="readonly") {
  const db = await openDB();
  return db.transaction(store, mode).objectStore(store);
}
async function put(store, value) {
  const os = await tx(store,"readwrite");
  return new Promise((resolve,reject)=>{
    const r=os.put(value); r.onsuccess=()=>resolve(value); r.onerror=()=>reject(r.error);
  });
}
async function get(store,id) {
  const os=await tx(store);
  return new Promise((resolve,reject)=>{
    const r=os.get(id); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
}
async function all(store) {
  const os=await tx(store);
  return new Promise((resolve,reject)=>{
    const r=os.getAll(); r.onsuccess=()=>resolve(r.result||[]); r.onerror=()=>reject(r.error);
  });
}
async function del(store,id) {
  const os=await tx(store,"readwrite");
  return new Promise((resolve,reject)=>{
    const r=os.delete(id); r.onsuccess=()=>resolve(); r.onerror=()=>reject(r.error);
  });
}
async function clearStore(store) {
  const os=await tx(store,"readwrite");
  return new Promise((resolve,reject)=>{
    const r=os.clear(); r.onsuccess=()=>resolve(); r.onerror=()=>reject(r.error);
  });
}

async function ensureSettings() {
  let s = await get("settings","app");
  if (!s) {
    s = {id:"app", dailyMinutes:30, createdAt:nowISO()};
    await put("settings",s);
  }
  return s;
}
async function ensureDefaultModule() {
  const modules = await all("modules");
  if (modules.length) {
    if (!state.moduleId) state.moduleId = modules[0].id;
    return;
  }
  const m = {id:uid(), title:"Mein Studium", createdAt:nowISO()};
  await put("modules",m);
  state.moduleId=m.id;
}
async function activeModule() {
  await ensureDefaultModule();
  return get("modules",state.moduleId);
}

function extractSentences(text) {
  return text
    .replace(/\s+/g," ")
    .split(/(?<=[.!?])\s+/)
    .map(s=>s.trim())
    .filter(s=>s.length>=45 && s.length<=700);
}
function chunks(arr,n) {
  const out=[];
  for(let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n));
  return out;
}
function dimensionFromIndex(i) {
  return ["UNDERSTANDING","RECALL","APPLICATION","TRANSFER"][i%4];
}

async function extractPDF(file) {
  const pdfjs = await import(
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.mjs"
  );
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  let ocrWorker = null;

  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      let text = tc.items
        .map(x => x.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      let extraction = "PDF_TEXT";

      if (text.length < 20) {
        extraction = "OCR";
        toast(`OCR · Seite ${p} von ${pdf.numPages}`);
        const Tesseract = await getTesseract();
        if (!ocrWorker) {
          ocrWorker = await Tesseract.createWorker(
            "deu+eng",
            1,
            {
              logger: message => {
                if (
                  message.status === "recognizing text"
                  && Number.isFinite(message.progress)
                ) {
                  document.documentElement.style.setProperty(
                    "--ocr-progress",
                    `${Math.round(message.progress * 100)}%`
                  );
                }
              }
            }
          );
        }
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({
          canvasContext: ctx,
          viewport
        }).promise;
        const result = await ocrWorker.recognize(canvas);
        text = String(result.data.text || "")
          .replace(/\s+/g, " ")
          .trim();
        canvas.width = 1;
        canvas.height = 1;
      }

      pages.push({
        page: p,
        text,
        extraction
      });
    }
  } finally {
    if (ocrWorker) {
      await ocrWorker.terminate();
    }
  }
  return pages;
}
async function extractFile(file) {
  if (file.type==="application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractPDF(file);
  }
  const text = await file.text();
  const paras = text.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);
  const grouped = chunks(paras,8);
  return grouped.map((g,i)=>({page:i+1,text:g.join("\n\n")}));
}
async function importStudyFile(file) {
  const module = await activeModule();
  toast("Datei wird verarbeitet …");
  const pages = await extractFile(file);
  const usable = pages.filter(p=>p.text.trim().length>20);
  if (!usable.length) throw new Error("Aus der Datei konnte kein Text extrahiert werden.");

  const document = {
    id:uid(), moduleId:module.id, title:file.name,
    kind:file.name.split(".").pop()?.toUpperCase() || "TEXT",
    pages:usable, createdAt:nowISO(), status:"READY"
  };
  await put("documents",document);

  let goalIndex=0;
  for (const page of usable) {
    const candidates = extractSentences(page.text).slice(0,3);
    for (const sentence of candidates) {
      const goal = {
        id:uid(), moduleId:module.id, documentId:document.id,
        statement:`Erkläre: ${sentence}`,
        answerKey:sentence, sourcePage:page.page,
        sourceSnippet:sentence, priority:0.65,
        examRelevance:0.6, createdAt:nowISO()
      };
      await put("goals",goal);

      const fsrsCard = await newFSRSState();
      const card = {
        id:uid(), moduleId:module.id, goalId:goal.id,
        prompt:`Was ist die Kernaussage? ${sentence.slice(0,120)}${sentence.length>120?"…":""}`,
        answer:sentence,
        dueAt:fsrsCard.due,
        fsrsCard,
        reviewCount:0,
        lapseCount:0,
        createdAt:nowISO(), manual:false
      };
      await put("flashcards",card);

      await put("mastery",{
        id:goal.id, goalId:goal.id, moduleId:module.id,
        recall:null, understanding:null, application:null, transfer:null,
        confidence:0, evidenceCount:0, status:"NOT_ASSESSED", updatedAt:nowISO()
      });
      goalIndex++;
    }
  }
  await generatePlan();
  toast(`${goalIndex} Lernziele erstellt`);
  return document;
}

async function addEvidence(goalId, dimension, score, confidence, independentRecall=true) {
  const goal = await get("goals",goalId);
  if (!goal) return;
  await put("evidence",{
    id:uid(), goalId, moduleId:goal.moduleId, dimension,
    score:clamp(score), confidence:clamp(confidence),
    independentRecall, createdAt:nowISO()
  });
  await recalcMastery(goalId);
}
async function recalcMastery(goalId) {
  const ev = (await all("evidence")).filter(x=>x.goalId===goalId);
  const existing = await get("mastery",goalId);
  const dims = ["RECALL","UNDERSTANDING","APPLICATION","TRANSFER"];
  const values={};
  let confTotal=0, weightTotal=0;

  for (const d of dims) {
    const rows=ev.filter(x=>x.dimension===d);
    let sw=0, ss=0;
    for (const x of rows) {
      const w=x.confidence*(x.independentRecall?1:0.5);
      sw+=w; ss+=x.score*w;
      confTotal+=x.confidence; weightTotal++;
    }
    values[d.toLowerCase()] = sw ? ss/sw : null;
  }
  const available=dims.map(d=>values[d.toLowerCase()]).filter(v=>v!==null);
  const avg=available.length?available.reduce((a,b)=>a+b,0)/available.length:0;
  const confidence=weightTotal?confTotal/weightTotal:0;
  let status="NOT_ASSESSED";
  if (ev.length) {
    if (avg>=0.85 && confidence>=0.70 && ev.length>=2) status="MASTERED";
    else if (avg>=0.70) status="PROFICIENT";
    else if (avg>=0.45) status="DEVELOPING";
    else status="WEAK";
  }
  const mastery={
    ...(existing||{}), id:goalId, goalId,
    moduleId:(existing?.moduleId)||((await get("goals",goalId))?.moduleId),
    ...values, confidence, evidenceCount:ev.length, status, updatedAt:nowISO()
  };
  await put("mastery",mastery);
  await recalcGap(goalId,mastery);
}
async function recalcGap(goalId,m) {
  const current=(await all("gaps")).filter(g=>g.goalId===goalId && g.status==="OPEN");
  let type=null, severity=0, reason="";
  if (m.status==="NOT_ASSESSED") {
    type="NOT_ASSESSED"; severity=.6; reason="Noch kein belastbarer Wissensnachweis.";
  } else if ((m.recall??1)<.5) {
    type="RECALL"; severity=1-(m.recall??0); reason="Aktiver Abruf ist noch nicht stabil.";
  } else if ((m.understanding??1)<.5) {
    type="UNDERSTANDING"; severity=1-(m.understanding??0); reason="Verständnis ist noch nicht stabil.";
  } else if ((m.application??1)<.5) {
    type="APPLICATION"; severity=1-(m.application??0); reason="Anwendung braucht weitere Übung.";
  } else if ((m.transfer??1)<.5) {
    type="TRANSFER"; severity=1-(m.transfer??0); reason="Transfer braucht weitere Übung.";
  } else if (m.confidence<.5) {
    type="UNCERTAIN"; severity=.5; reason="Wissensstand ist noch unsicher belegt.";
  }
  for (const g of current) {
    if (g.type!==type) await put("gaps",{...g,status:"RESOLVED",resolvedAt:nowISO()});
  }
  if (type) {
    const same=current.find(g=>g.type===type);
    await put("gaps", same ? {...same,severity,reason,confidence:m.confidence} : {
      id:uid(),goalId,moduleId:m.moduleId,type,severity,reason,
      confidence:m.confidence,status:"OPEN",createdAt:nowISO()
    });
  } else {
    for (const g of current) await put("gaps",{...g,status:"RESOLVED",resolvedAt:nowISO()});
  }
}

async function rateCard(card,rating,answerRevealed=true) {
  const scheduled = await scheduleFSRS(
    card.fsrsCard,
    rating
  );
  const nextCard = scheduled.card;
  await put("flashcards", {
    ...card,
    fsrsCard: nextCard,
    dueAt: nextCard.due,
    reviewCount: nextCard.reps,
    lapseCount: nextCard.lapses,
    lastReviewedAt: nowISO()
  });
  await put("reviews", {
    id:uid(),
    cardId:card.id,
    goalId:card.goalId,
    moduleId:card.moduleId,
    rating,
    answerRevealed,
    independentRecall:!answerRevealed,
    fsrsLog:scheduled.log,
    reviewedAt:nowISO()
  });
  const score={1:0,2:.45,3:.75,4:.95}[rating];
  const conf={1:.60,2:.55,3:.60,4:.65}[rating];
  await addEvidence(
    card.goalId,
    "RECALL",
    score,
    conf,
    !answerRevealed
  );
  await generatePlan();
}
async function createManualCard(goalId,prompt,answer) {
  const goal=await get("goals",goalId);
  const fsrsCard = await newFSRSState();
  const card={
    id:uid(),
    moduleId:goal.moduleId,
    goalId,
    prompt,
    answer,
    dueAt:fsrsCard.due,
    fsrsCard,
    reviewCount:0,
    lapseCount:0,
    manual:true,
    createdAt:nowISO()
  };
  await put("flashcards",card);
  toast("Karte gespeichert");
}
const READINESS_WEIGHTS = Object.freeze({content:.25, assessment:.20, mastery:.40, stability:.15});
const STABILITY_TARGET_DAYS = 30;
const EXAM_HORIZON_DAYS = 30;

function daysUntil(dateKey) {
  const target = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target - new Date(`${dayKey()}T00:00:00`)) / 86400000);
}

// Nutzerprüfungen tragen einen Termin. Die Datensätze der Prüfungssimulation
// liegen im selben Store, haben aber keinen, und bleiben so unterscheidbar.
async function scheduledExams(moduleId) {
  return (await all("exams"))
    .filter(e => e.moduleId === moduleId && e.date)
    .sort((a,b) => a.date.localeCompare(b.date));
}

async function nextExam(moduleId) {
  return (await scheduledExams(moduleId)).find(e => (daysUntil(e.date) ?? -1) >= 0) || null;
}

function scopeDocumentIds(exam) { return exam?.examScope?.documentIds || []; }

function goalsInScope(exam, goals) {
  const ids = scopeDocumentIds(exam);
  return ids.length ? goals.filter(g => ids.includes(g.documentId)) : goals;
}

function masteryValue(m) {
  const values = m ? [m.recall,m.understanding,m.application,m.transfer].filter(v => v!==null && v!==undefined) : [];
  return values.length ? values.reduce((a,b)=>a+b,0) / values.length : 0;
}

// Anteil der lernrelevanten Quellseiten, aus denen mindestens ein Lernziel
// entstanden ist. Seiten ohne Lernstoff zählen nicht als Lücke. Importe von vor
// dieser Kennzeichnung gelten als relevant, damit Coverage eher zu niedrig als
// zu hoch ausfällt: das Ziel ist, blinde Flecken zu finden, nicht 100 % zu zeigen.
function contentCoverage(documents, goals) {
  const covered = new Set(goals.map(g => `${g.documentId}:${g.sourcePage}`));
  let relevantPages = 0, coveredPages = 0;
  for (const doc of documents) {
    for (const page of doc.pages || []) {
      if (page.relevant === false) continue;
      relevantPages++;
      if (covered.has(`${doc.id}:${page.page}`)) coveredPages++;
    }
  }
  return {relevantPages, coveredPages, ratio: relevantPages ? coveredPages/relevantPages : 0};
}

function assessmentCoverage(goals, evidence) {
  const assessed = new Set(evidence.map(e => e.goalId));
  const assessedGoals = goals.filter(g => assessed.has(g.id)).length;
  return {assessedGoals, totalGoals: goals.length, ratio: goals.length ? assessedGoals/goals.length : 0};
}

// Stabilität aus den FSRS-Intervallen: eine Karte gilt als verankert, wenn ihr
// Intervall den Zielhorizont erreicht.
function stabilityScore(cards) {
  if (!cards.length) return 0;
  return cards.reduce((sum,c) => sum + Math.min(1,(Number(c.fsrsCard?.stability)||0)/STABILITY_TARGET_DAYS), 0) / cards.length;
}

async function examReadiness(exam) {
  const module = await activeModule();
  const scopeIds = scopeDocumentIds(exam);
  const goals = goalsInScope(exam, (await all("goals")).filter(g => g.moduleId === module.id));
  const goalIds = new Set(goals.map(g => g.id));
  const documents = (await all("documents"))
    .filter(d => d.moduleId === module.id && (!scopeIds.length || scopeIds.includes(d.id)));
  const mastery = await all("mastery");
  const content = contentCoverage(documents, goals);
  const assessment = assessmentCoverage(goals, (await all("evidence")).filter(e => goalIds.has(e.goalId)));
  const masteryRatio = goals.length
    ? goals.reduce((sum,g) => sum + masteryValue(mastery.find(m => m.goalId === g.id)), 0) / goals.length
    : 0;
  const stability = stabilityScore((await all("flashcards")).filter(c => goalIds.has(c.goalId)));
  const score = READINESS_WEIGHTS.content*content.ratio
    + READINESS_WEIGHTS.assessment*assessment.ratio
    + READINESS_WEIGHTS.mastery*masteryRatio
    + READINESS_WEIGHTS.stability*stability;
  return {exam, goalCount:goals.length, content, assessment, mastery:masteryRatio, stability, score};
}

// Ein neuer Object Store würde eine Versionserhöhung erfordern, die in allen
// Modulen gleichzeitig erfolgen müsste; ein einzelner Datensatz im settings-Store
// erreicht dasselbe ohne Migrationsrisiko. Spec Kap. 5 lässt vereinfachte lokale
// Repräsentationen ausdrücklich zu.
const SNAPSHOT_RECORD_ID = "mastery-history";
const SNAPSHOT_KEEP_DAYS = 180;

async function recordProgressSnapshot(moduleId, values) {
  const record = (await get("settings", SNAPSHOT_RECORD_ID)) || {id:SNAPSHOT_RECORD_ID, entries:[]};
  const key = `${moduleId}:${dayKey()}`;
  // Innerhalb eines Tages gewinnt der jeweils neueste Stand.
  const entries = (record.entries||[]).filter(e => e.key !== key);
  entries.push({key, moduleId, date:dayKey(), ...values});
  entries.sort((a,b) => a.date.localeCompare(b.date));
  record.entries = entries.slice(-SNAPSHOT_KEEP_DAYS);
  await put("settings", record);
  return record.entries.filter(e => e.moduleId === moduleId);
}

// Feste Skala von 0 bis 100 %: eine automatische Skalierung würde kleine
// Schwankungen wie große Fortschritte aussehen lassen.
function sparkline(values) {
  if (values.length < 2) return "";
  const width=100, height=28;
  const points=values.map((v,i) => {
    const x=(i/(values.length-1))*width;
    const y=height-Math.max(0,Math.min(1,v))*height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}"/></svg>`;
}

function trendRow(label, snapshots, field) {
  const series=snapshots.map(s => s[field]).filter(v => typeof v === "number");
  if (!series.length) return "";
  const current=series[series.length-1];
  const delta=Math.round((current-series[0])*100);
  const note=series.length<2
    ? "Verlauf wird ab dem nächsten Lerntag sichtbar"
    : `${delta>0?"+":""}${delta} Prozentpunkte seit ${snapshots[0].date}`;
  return `<div class="list-item">
    <div class="row between"><span>${label}</span><strong>${Math.round(current*100)}%</strong></div>
    <div class="small muted">${esc(note)}</div>
    ${sparkline(series)}
  </div>`;
}

async function generatePlan() {
  const module=await activeModule();
  const settings=await ensureSettings();
  const goals=(await all("goals")).filter(x=>x.moduleId===module.id);
  const mastery=await all("mastery");
  const gaps=(await all("gaps")).filter(x=>x.moduleId===module.id && x.status==="OPEN");
  const cards=(await all("flashcards")).filter(x=>x.moduleId===module.id);
  const evidence=await all("evidence");
  const exam=await nextExam(module.id);
  const daysLeft=exam?daysUntil(exam.date):null;
  // Je näher der Termin rückt, desto stärker verschiebt sich der Plan auf den
  // Prüfungsstoff. Ohne Termin bleibt die Reihenfolge unverändert.
  const urgency=daysLeft===null?0:Math.max(0,Math.min(1,(EXAM_HORIZON_DAYS-daysLeft)/EXAM_HORIZON_DAYS));
  const scopeGoalIds=new Set(goalsInScope(exam,goals).map(g=>g.id));
  const assessedGoalIds=new Set(evidence.map(e=>e.goalId));
  const examWeight=goalId=>{
    if(!exam) return 0;
    if(!scopeGoalIds.has(goalId)) return -20*urgency;
    // Ungeprüfter Prüfungsstoff wiegt am schwersten: dort fehlt jede Evidence.
    return 30*urgency + (assessedGoalIds.has(goalId)?0:15*urgency);
  };
  const candidates=[];

  for (const gap of gaps) {
    const goal=goals.find(g=>g.id===gap.goalId);
    if(goal) candidates.push({
      id:uid(),type:"GAP_REPAIR",goalId:goal.id,title:goal.statement,
      minutes:8,score:85+gap.severity*25+examWeight(goal.id),reason:"Wissenslücke"
    });
  }
  for (const card of cards.filter(c=>new Date(c.dueAt)<=new Date() && (c.reviewCount||0)>0)) {
    const goal=goals.find(g=>g.id===card.goalId);
    if(goal) candidates.push({
      id:uid(),type:"REVIEW",goalId:goal.id,cardId:card.id,
      title:card.prompt,minutes:4,score:78+examWeight(goal.id),reason:"Wiederholung fällig"
    });
  }
  for (const goal of goals) {
    const m=mastery.find(x=>x.goalId===goal.id);
    if (!m || ["NOT_ASSESSED","WEAK","DEVELOPING"].includes(m.status)) {
      const inScope=exam&&scopeGoalIds.has(goal.id);
      candidates.push({
        id:uid(),type:"LEARN",goalId:goal.id,title:goal.statement,
        minutes:8,score:(m?.status==="WEAK"?82:65)+examWeight(goal.id),
        reason:m?.status==="WEAK"?"Schwachstelle":inScope?"Prüfungsstoff, noch nicht geprüft":"Noch nicht geprüft"
      });
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  const chosen=[], usedGoals=new Set();
  let used=0;
  for(const c of candidates) {
    if(usedGoals.has(c.goalId)) continue;
    if(used+c.minutes>settings.dailyMinutes) continue;
    chosen.push({...c,status:"OPEN"}); used+=c.minutes; usedGoals.add(c.goalId);
  }
  const id=`${module.id}:${dayKey()}`;
  await put("plans",{id,moduleId:module.id,date:dayKey(),minutes:settings.dailyMinutes,tasks:chosen,
    examId:exam?.id||null,daysUntilExam:daysLeft,createdAt:nowISO()});
  return get("plans",id);
}

async function streak() {
  const module=await activeModule();
  const ev=(await all("evidence")).filter(x=>x.moduleId===module.id);
  const rev=(await all("reviews")).filter(x=>x.moduleId===module.id);
  const days=new Set([...ev.map(x=>dayKey(x.createdAt)),...rev.map(x=>dayKey(x.reviewedAt))]);
  if(!days.size) return {current:0,longest:0,today:false};
  const sorted=[...days].sort();
  let longest=1,r=1;
  for(let i=1;i<sorted.length;i++){
    const prev=new Date(sorted[i-1]+"T12:00:00"), cur=new Date(sorted[i]+"T12:00:00");
    if(Math.round((cur-prev)/86400000)===1){r++;longest=Math.max(longest,r)} else r=1;
  }
  const today=dayKey(), yesterday=dayKey(new Date(Date.now()-86400000));
  let cursor=days.has(today)?new Date():new Date(Date.now()-86400000), current=0;
  while(days.has(dayKey(cursor))){ current++; cursor=new Date(cursor.getTime()-86400000); }
  return {current,longest,today:days.has(today)};
}


function examDimension(index) {
  return [
    "RECALL",
    "UNDERSTANDING",
    "APPLICATION",
    "TRANSFER"
  ][index % 4];
}

async function createExamSession() {
  const module = await activeModule();
  const goals = (await all("goals"))
    .filter(g => g.moduleId === module.id);
  const mastery = await all("mastery");

  const ranked = goals
    .map(g => {
      const m = mastery.find(x => x.goalId === g.id);
      const values = m
        ? [m.recall,m.understanding,m.application,m.transfer]
            .filter(v => v !== null && v !== undefined)
        : [];
      const avg = values.length
        ? values.reduce((a,b)=>a+b,0) / values.length
        : 0;
      const weakness = m?.status === "NOT_ASSESSED"
        ? 1.1
        : 1 - avg;
      return {
        goal:g,
        score:weakness + (g.examRelevance||.5)
      };
    })
    .sort((a,b)=>b.score-a.score)
    .slice(0, Math.min(12, goals.length));

  if (!ranked.length) {
    toast("Noch keine Lernziele für eine Prüfung vorhanden.");
    return null;
  }

  const exam = {
    id:uid(),
    moduleId:module.id,
    title:"Prüfungssimulation",
    questionCount:ranked.length,
    timeLimitMinutes:30,
    createdAt:nowISO()
  };
  await put("exams", exam);

  const session = {
    id:uid(),
    examId:exam.id,
    moduleId:module.id,
    status:"IN_PROGRESS",
    startedAt:nowISO(),
    timeLimitMinutes:30,
    items:ranked.map((entry,index)=>({
      id:uid(),
      goalId:entry.goal.id,
      prompt:examPrompt(entry.goal,index),
      answerKey:entry.goal.answerKey,
      dimension:examDimension(index),
      response:"",
      score:null,
      answeredAt:null
    }))
  };
  await put("examSessions",session);
  return session;
}

function examPrompt(goal,index) {
  const type = examDimension(index);
  if (type === "RECALL") {
    return `Gib die Kernaussage aus dem Lernziel aktiv wieder: ${goal.statement}`;
  }
  if (type === "APPLICATION") {
    return `Wie würdest du dieses Wissen praktisch anwenden? ${goal.statement}`;
  }
  if (type === "TRANSFER") {
    return `Übertrage das Prinzip auf eine neue Situation: ${goal.statement}`;
  }
  return goal.statement;
}

async function completeExam(session) {
  let total = 0;
  let answered = 0;
  const weakGoalIds = [];

  for (const item of session.items) {
    const score = item.score ?? 0;
    total += score;
    if (item.answeredAt) answered++;
    if (score < .60) weakGoalIds.push(item.goalId);
  }

  session.status = "COMPLETED";
  session.completedAt = nowISO();
  session.overallScore = session.items.length
    ? total / session.items.length
    : 0;
  session.answeredCount = answered;
  session.weakGoalIds = [...new Set(weakGoalIds)];
  await put("examSessions",session);
  await generatePlan();
  return session;
}

async function submitExamItem(session,index,response) {
  const item = session.items[index];
  const score = scoreText(item.answerKey,response);
  item.response = response;
  item.score = score;
  item.answeredAt = nowISO();
  await addEvidence(
    item.goalId,
    item.dimension,
    score,
    .35,
    true
  );
  await put("examSessions",session);
  return score;
}

async function startExamUI(existing=null) {
  const session = existing || await createExamSession();
  if (!session) return;

  let index = session.items.findIndex(x => !x.answeredAt);
  if (index < 0) {
    await completeExam(session);
    return showExamResult(session);
  }

  const deadline = new Date(session.startedAt).getTime()
    + session.timeLimitMinutes * 60000;

  async function draw() {
    if (session.status === "COMPLETED") {
      return showExamResult(session);
    }
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining <= 0) {
      await completeExam(session);
      return showExamResult(session);
    }

    const item = session.items[index];
    showModal(`
      <div class="row between">
        <div class="eyebrow">PRÜFUNG ${index+1} / ${session.items.length}</div>
        <span class="badge" id="exam-timer">${formatTime(remaining)}</span>
      </div>
      <h2>${esc(item.prompt)}</h2>
      <div class="source">${esc(item.dimension)}</div>
      <textarea id="exam-answer" placeholder="Deine Antwort …">${esc(item.response||"")}</textarea>
      ${speechSupported()
        ? `<button type="button" class="secondary full" id="exam-speech">🎙 Antwort sprechen</button>`
        : `<p class="small muted">Spracherkennung ist in diesem Browser nicht verfügbar; Texteingabe funktioniert immer.</p>`
      }
      <button type="button" class="primary full" id="exam-submit">Antwort speichern</button>
      <button type="button" class="secondary full" id="exam-finish">Prüfung beenden</button>
    `);

    const timer = setInterval(async()=>{
      if (!modal.open) {
        clearInterval(timer);
        return;
      }
      const left=Math.max(0,deadline-Date.now());
      const el=$("#exam-timer");
      if(el)el.textContent=formatTime(left);
      if(left<=0){
        clearInterval(timer);
        await completeExam(session);
        showExamResult(session);
      }
    },1000);

    $("#exam-speech")?.addEventListener(
      "click",
      ()=>startSpeechInto($("#exam-answer"))
    );
    $("#exam-submit").onclick=async()=>{
      const answer=$("#exam-answer").value.trim();
      if(!answer){
        toast("Bitte antworte oder beende die Prüfung.");
        return;
      }
      const score=await submitExamItem(session,index,answer);
      toast(`Antwort erfasst · ${Math.round(score*100)}% Baseline`);
      const next=session.items.findIndex((x,i)=>i>index&&!x.answeredAt);
      if(next>=0){
        index=next;
        draw();
      } else {
        await completeExam(session);
        showExamResult(session);
      }
    };
    $("#exam-finish").onclick=async()=>{
      await completeExam(session);
      showExamResult(session);
    };
  }

  draw();
}

function formatTime(ms) {
  const total=Math.ceil(ms/1000);
  const min=Math.floor(total/60);
  const sec=total%60;
  return `${min}:${String(sec).padStart(2,"0")}`;
}

function showExamResult(session) {
  showModal(`
    <div class="eyebrow">PRÜFUNG ABGESCHLOSSEN</div>
    <div class="hero-value">${Math.round((session.overallScore||0)*100)}%</div>
    <p>${session.answeredCount||0} von ${session.items.length} beantwortet</p>
    <p class="muted">${session.weakGoalIds?.length||0} schwache Lernziele wurden zurück in Mastery und Tagesplanung gespielt.</p>
    <button type="button" class="primary full" onclick="closeModal()">Fertig</button>
  `);
}

async function latestActiveExam() {
  const module=await activeModule();
  return (await all("examSessions"))
    .filter(x=>x.moduleId===module.id && x.status==="IN_PROGRESS")
    .sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt))[0] || null;
}

async function render() {
  document.querySelectorAll(".tabbar button").forEach(b=>b.classList.toggle("active",b.dataset.tab===state.tab));
  const names={today:"Heute",library:"Bibliothek",learn:"Lernen",progress:"Fortschritt",profile:"Profil"};
  title.textContent=names[state.tab];
  if(state.tab==="today") return renderToday();
  if(state.tab==="library") return renderLibrary();
  if(state.tab==="learn") return renderLearn();
  if(state.tab==="progress") return renderProgress();
  return renderProfile();
}

async function renderToday() {
  const module=await activeModule();
  let plan=await get("plans",`${module.id}:${dayKey()}`) || await generatePlan();
  const s=await streak();
  const mastery=(await all("mastery")).filter(x=>x.moduleId===module.id);
  const assessed=mastery.filter(x=>x.status!=="NOT_ASSESSED");
  const avg=assessed.length ? assessed.map(m=>{
    const a=[m.recall,m.understanding,m.application,m.transfer].filter(v=>v!==null);
    return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  }).reduce((a,b)=>a+b,0)/assessed.length : 0;
  const done=plan.tasks.filter(t=>t.status==="DONE").length;
  const upcoming=await nextExam(module.id);
  const readiness=upcoming?await examReadiness(upcoming):null;

  content.innerHTML=`
    <section class="card hero">
      <div class="eyebrow">${esc(module.title)}</div>
      <div class="hero-value">${done}/${plan.tasks.length}</div>
      <div class="muted">Aufgaben heute · ${plan.minutes} Minuten geplant</div>
    </section>
    <div class="grid">
      <section class="card metric"><span class="muted small">Lernserie</span><strong>${s.current}</strong><span class="small">Tage · Bestwert ${s.longest}</span></section>
      <section class="card metric"><span class="muted small">Mastery</span><strong>${Math.round(avg*100)}%</strong><span class="small">${assessed.length} Lernziele geprüft</span></section>
      ${readiness?`<section class="card metric"><span class="muted small">Prüfungsbereit</span><strong>${Math.round(readiness.score*100)}%</strong><span class="small">${esc(readiness.exam.title)} · ${esc(examCountdown(readiness.exam))}</span></section>`:""}
    </div>
    <section class="card">
      <div class="row between"><h2>Tagesplan</h2><button class="secondary" id="regen-plan">Neu planen</button></div>
      ${plan.tasks.length?plan.tasks.map((t,i)=>`
        <div class="list-item task">
          <input class="task-check" type="checkbox" data-task="${i}" ${t.status==="DONE"?"checked":""} aria-label="Aufgabe abschließen">
          <div class="clickable" data-open-goal="${t.goalId}">
            <strong>${esc(t.title)}</strong>
            <div class="small muted">${esc(t.reason)} · ${t.minutes} Min</div>
          </div>
          <span class="badge">${esc(t.type)}</span>
        </div>`).join(""):`<div class="empty">Importiere Lernmaterial in der Bibliothek.</div>`}
    </section>
    <section class="card">
      <h2>Heute sinnvoll</h2>
      <p class="muted">Arbeite zuerst die priorisierten Aufgaben ab. Reviews terminieren Wiederholungen; Selbsttests aktualisieren den Wissensstand.</p>
    </section>`;
  $("#regen-plan")?.addEventListener("click",async()=>{await generatePlan();renderToday()});
  content.querySelectorAll("[data-task]").forEach(el=>el.addEventListener("change",async e=>{
    const idx=Number(e.target.dataset.task); plan.tasks[idx].status=e.target.checked?"DONE":"OPEN";
    await put("plans",plan); renderToday();
  }));
  bindGoalLinks();
}

async function renderLibrary() {
  const module=await activeModule();
  const docs=(await all("documents")).filter(x=>x.moduleId===module.id);
  const goals=(await all("goals")).filter(x=>x.moduleId===module.id);
  content.innerHTML=`
    <section class="card">
      <div class="row between"><div><h2>${esc(module.title)}</h2><div class="muted small">${docs.length} Dokumente · ${goals.length} Lernziele</div></div>
      <button class="primary" id="import-file">Material importieren</button></div>
    </section>
    <section class="card">
      <h2>Material</h2>
      ${docs.length?docs.map(d=>`
        <div class="list-item clickable" data-doc="${d.id}">
          <div class="row between"><div><h3>${esc(d.title)}</h3><div class="muted small">${d.pages.length} Seiten/Abschnitte · lokal gespeichert</div></div><span>›</span></div>
        </div>`).join(""):`<div class="empty">Noch kein Material. Importiere PDF, TXT oder Markdown.</div>`}
    </section>
    <section class="card">
      <h2>Lernziele</h2>
      ${goals.slice(0,50).map(g=>`<div class="list-item clickable" data-open-goal="${g.id}"><strong>${esc(g.statement)}</strong><div class="source">Quelle · Seite ${g.sourcePage}</div></div>`).join("")}
    </section>`;
  $("#import-file").onclick=()=>$("#file-import").click();
  content.querySelectorAll("[data-doc]").forEach(el=>el.onclick=()=>openDocument(el.dataset.doc));
  bindGoalLinks();
}

async function openDocument(id) {
  const d=await get("documents",id);
  const sentences=d.pages.flatMap(p=>extractSentences(p.text).slice(0,3).map(text=>({text,page:p.page})));
  showModal(`
    <h2>${esc(d.title)}</h2>
    <div class="pill-row">
      <button type="button" class="secondary summary-level" data-level="3">Kurz</button>
      <button type="button" class="secondary summary-level" data-level="6">Standard</button>
      <button type="button" class="secondary summary-level" data-level="12">Detailliert</button>
    </div>
    <div id="summary-body"></div>
    <hr>
    <h3>Wichtige Inhalte</h3>
    ${sentences.slice(0,12).map(x=>`<div class="highlight">${esc(x.text)}<div class="source">Quelle · Seite ${x.page}</div></div>`).join("")}
  `);
  const body=$("#summary-body");
  const draw=n=>body.innerHTML=sentences.slice(0,n).map(x=>`<p>${esc(x.text)}</p>`).join("");
  draw(6);
  modalContent.querySelectorAll(".summary-level").forEach(b=>b.onclick=()=>draw(Number(b.dataset.level)));
}

async function openGoal(id) {
  const g=await get("goals",id);
  const m=await get("mastery",id);
  const gap=(await all("gaps")).find(x=>x.goalId===id && x.status==="OPEN");
  showModal(`
    <h2>Lernziel</h2>
    <p class="question">${esc(g.statement)}</p>
    <div class="source">Quelle · Seite ${g.sourcePage}</div>
    <div class="answer">${esc(g.sourceSnippet)}</div>
    <hr>
    <div class="row between"><strong>Status</strong><span class="badge ${m?.status==="MASTERED"?"good":m?.status==="WEAK"?"danger":"warn"}">${esc(m?.status||"NOT_ASSESSED")}</span></div>
    <p class="small muted">Evidence ${m?.evidenceCount||0} · Confidence ${Math.round((m?.confidence||0)*100)}%</p>
    ${gap?`<p class="small"><strong>Wissenslücke:</strong> ${esc(gap.reason)}</p>`:""}
    <hr>
    <h3>Selbsttest</h3>
    <p>Erkläre den Inhalt ohne in die Quelle zu schauen.</p>
    <textarea id="self-answer" placeholder="Deine Erklärung …"></textarea>
    ${speechSupported()
      ? `<button type="button" class="secondary full" id="self-speech">🎙 Erklärung sprechen</button>`
      : ""
    }
    <button type="button" class="primary full" id="self-submit">Antwort auswerten</button>
    <div id="self-result"></div>
    <hr>
    <h3>Eigene Karteikarte</h3>
    <label>Frage</label><input id="card-prompt">
    <label>Antwort</label><textarea id="card-answer"></textarea>
    <button type="button" class="secondary full" id="card-save">Karte speichern</button>
  `);
  $("#self-speech")?.addEventListener(
    "click",
    ()=>startSpeechInto($("#self-answer"))
  );
  $("#self-submit").onclick=async()=>{
    const answer=$("#self-answer").value.trim();
    if(!answer)return;
    const score=scoreText(g.answerKey,answer);
    await addEvidence(g.id,"UNDERSTANDING",score,.35,true);
    $("#self-result").innerHTML=`<p><strong>Baseline-Score: ${Math.round(score*100)}%</strong></p><p class="small muted">Konservative lokale Textauswertung; keine semantische KI.</p>`;
    await generatePlan();
  };
  $("#card-save").onclick=async()=>{
    const p=$("#card-prompt").value.trim(),a=$("#card-answer").value.trim();
    if(!p||!a)return;
    await createManualCard(g.id,p,a); $("#card-prompt").value="";$("#card-answer").value="";
  };
}

function bindGoalLinks(){
  content.querySelectorAll("[data-open-goal]").forEach(el=>el.onclick=()=>openGoal(el.dataset.openGoal));
}

async function renderLearn() {
  const module=await activeModule();
  const cards=(await all("flashcards")).filter(x=>x.moduleId===module.id && new Date(x.dueAt)<=new Date());
  content.innerHTML=`
    <section class="card hero">
      <div class="eyebrow">WIEDERHOLEN</div>
      <div class="hero-value">${cards.length}</div>
      <div class="muted">Karten aktuell fällig</div>
    </section>
    <section class="card">
      ${cards.length?`<button class="primary full" id="start-review">Review starten</button>`:`<div class="empty">Aktuell ist keine Karte fällig.</div>`}
    </section>
    <section class="card">
      <h2>Review-Regel</h2>
      <p class="muted">Bewerte erst nach dem Anzeigen der Antwort. Diese Selbsteinschätzung steuert die nächste Wiederholung, zählt aber nicht als unabhängiger Abruf.</p>
    </section>`;
  $("#start-review")?.addEventListener("click",()=>reviewCard(cards,0));
}
async function reviewCard(cards,index) {
  if(index>=cards.length){ closeModal(); toast("Reviews erledigt"); return renderLearn(); }
  const card=cards[index];
  showModal(`
    <div class="eyebrow">KARTE ${index+1} / ${cards.length}</div>
    <h2>${esc(card.prompt)}</h2>
    <div id="review-answer" class="hidden answer">${esc(card.answer)}</div>
    <button type="button" class="primary full" id="reveal">Antwort anzeigen</button>
    <div id="ratings" class="hidden">
      <p class="small muted">Wie gut konntest du es <strong>vor</strong> dem Anzeigen abrufen?</p>
      <div class="rating-grid">
        <button type="button" class="secondary" data-rate="1">Nochmal</button>
        <button type="button" class="secondary" data-rate="2">Schwer</button>
        <button type="button" class="secondary" data-rate="3">Gut</button>
        <button type="button" class="secondary" data-rate="4">Sehr sicher</button>
      </div>
    </div>`);
  $("#reveal").onclick=()=>{$("#review-answer").classList.remove("hidden");$("#ratings").classList.remove("hidden");$("#reveal").classList.add("hidden")};
  modalContent.querySelectorAll("[data-rate]").forEach(b=>b.onclick=async()=>{
    await rateCard(card,Number(b.dataset.rate),true); reviewCard(cards,index+1);
  });
}

function progressBar(label,value,note="") {
  const percent=Math.round(Math.max(0,Math.min(1,value))*100);
  return `<div class="list-item"><div class="row between"><span>${label}</span><strong>${percent}%</strong></div>
    <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
    ${note?`<div class="small muted">${esc(note)}</div>`:""}</div>`;
}

function examCountdown(exam) {
  const days=daysUntil(exam.date);
  if(days===null) return "Ohne gültiges Datum";
  if(days<0) return "Termin vorbei";
  if(days===0) return "Heute";
  if(days===1) return "Morgen";
  return `In ${days} Tagen`;
}

async function showExamForm() {
  const module=await activeModule();
  const documents=(await all("documents")).filter(d=>d.moduleId===module.id);
  showModal(`
    <div class="eyebrow">PRÜFUNG ANLEGEN</div>
    <h2>Neue Prüfung</h2>
    <label class="small muted" for="new-exam-title">Titel</label>
    <input id="new-exam-title" type="text" placeholder="z. B. Klausur Zellbiologie">
    <label class="small muted" for="new-exam-date">Termin</label>
    <input id="new-exam-date" type="date" min="${dayKey()}">
    <p class="small muted">Prüfungsstoff auswählen. Ohne Auswahl zählt das gesamte Modul.</p>
    ${documents.length
      ? documents.map(d=>`<label class="list-item"><input type="checkbox" class="exam-scope-option" value="${esc(d.id)}"> ${esc(d.title)}</label>`).join("")
      : `<div class="empty">Noch kein Material importiert.</div>`}
    <button type="button" class="primary full" id="save-exam">Prüfung speichern</button>`);
  $("#save-exam").onclick=async()=>{
    const title=$("#new-exam-title").value.trim();
    const date=$("#new-exam-date").value;
    if(!date){toast("Bitte einen Termin wählen.");return;}
    const documentIds=[...document.querySelectorAll(".exam-scope-option:checked")].map(x=>x.value);
    await put("exams",{
      id:uid(),moduleId:module.id,title:title||"Prüfung",date,
      examScope:{documentIds},createdAt:nowISO()
    });
    await generatePlan();
    closeModal();
    toast("Prüfung gespeichert");
    renderProgress();
  };
}

async function renderProgress() {
  const module=await activeModule();
  const goals=(await all("goals")).filter(x=>x.moduleId===module.id);
  const ms=(await all("mastery")).filter(x=>x.moduleId===module.id);
  const gaps=(await all("gaps")).filter(x=>x.moduleId===module.id && x.status==="OPEN");
  const documents=(await all("documents")).filter(d=>d.moduleId===module.id);
  const evidence=await all("evidence");
  const exams=await scheduledExams(module.id);
  const upcoming=await nextExam(module.id);
  const readiness=upcoming?await examReadiness(upcoming):null;
  const moduleContent=contentCoverage(documents,goals);
  const moduleAssessment=assessmentCoverage(goals,evidence);
  const s=await streak();
  const dims=["recall","understanding","application","transfer"];
  const dimLabels={recall:"Abruf",understanding:"Verständnis",application:"Anwendung",transfer:"Transfer"};
  const averages={};
  for(const d of dims){
    const v=ms.map(m=>m[d]).filter(x=>x!==null&&x!==undefined);
    averages[d]=v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
  }
  const mastered=ms.filter(x=>x.status==="MASTERED").length;
  const overallMastery=goals.length
    ? goals.reduce((sum,g)=>sum+masteryValue(ms.find(m=>m.goalId===g.id)),0)/goals.length
    : 0;
  const history=await recordProgressSnapshot(module.id,{
    mastery:overallMastery,
    contentCoverage:moduleContent.ratio,
    assessmentCoverage:moduleAssessment.ratio,
    readiness:readiness?readiness.score:null
  });
  content.innerHTML=`
    <div class="grid">
      <section class="card metric"><span class="muted small">Beherrscht</span><strong>${mastered}</strong><span class="small">von ${goals.length} Lernzielen</span></section>
      <section class="card metric"><span class="muted small">Offene Lücken</span><strong>${gaps.length}</strong><span class="small">werden priorisiert</span></section>
    </div>
    ${readiness?`<section class="card">
      <div class="row between"><h2>Prüfungsbereitschaft</h2><span class="badge ${readiness.score>=.75?"good":readiness.score>=.5?"warn":"danger"}">${Math.round(readiness.score*100)}%</span></div>
      <p class="small muted">${esc(readiness.exam.title)} · ${esc(examCountdown(readiness.exam))} · ${readiness.goalCount} Lernziele im Prüfungsstoff</p>
      ${progressBar("Inhaltsabdeckung",readiness.content.ratio,`Gewicht 25 % · ${readiness.content.coveredPages} von ${readiness.content.relevantPages} Seiten`)}
      ${progressBar("Geprüfte Lernziele",readiness.assessment.ratio,`Gewicht 20 % · ${readiness.assessment.assessedGoals} von ${readiness.assessment.totalGoals} Lernzielen`)}
      ${progressBar("Mastery",readiness.mastery,"Gewicht 40 %")}
      ${progressBar("Stabilität",readiness.stability,"Gewicht 15 % · aus den FSRS-Intervallen")}
      <p class="small muted">Prüfungsbereitschaft steuert das Lernen und ist keine Bestehensgarantie.</p>
    </section>`:""}
    <section class="card">
      <h2>Abdeckung im Modul</h2>
      ${progressBar("Inhaltsabdeckung",moduleContent.ratio,`${moduleContent.coveredPages} von ${moduleContent.relevantPages} lernrelevanten Seiten haben Lernziele`)}
      ${progressBar("Assessment-Abdeckung",moduleAssessment.ratio,`${moduleAssessment.assessedGoals} von ${moduleAssessment.totalGoals} Lernzielen wurden mindestens einmal geprüft`)}
      <p class="small muted">Seiten ohne Lernstoff, etwa Verzeichnisse, zählen nicht als Lücke.</p>
    </section>
    <section class="card">
      <div class="row between"><h2>Prüfungen</h2><button class="secondary" id="add-exam">Anlegen</button></div>
      ${exams.length?exams.map(e=>`<div class="list-item">
        <div class="row between"><strong>${esc(e.title)}</strong><span class="badge">${esc(examCountdown(e))}</span></div>
        <div class="small muted">${esc(e.date)} · ${scopeDocumentIds(e).length?`${scopeDocumentIds(e).length} Materialien im Stoff`:"gesamtes Modul"}</div>
        <button type="button" class="secondary full" data-delete-exam="${esc(e.id)}">Prüfung entfernen</button>
      </div>`).join(""):`<div class="empty">Kein Termin eingetragen. Mit Termin priorisiert der Tagesplan den Prüfungsstoff.</div>`}
    </section>
    <section class="card"><h2>Wissensdimensionen</h2>
      ${dims.map(d=>`<div class="list-item"><div class="row between"><span>${dimLabels[d]}</span><strong>${Math.round(averages[d]*100)}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${averages[d]*100}%"></div></div></div>`).join("")}
    </section>
    <section class="card">
      <h2>Verlauf</h2>
      ${trendRow("Mastery",history,"mastery")}
      ${trendRow("Inhaltsabdeckung",history,"contentCoverage")}
      ${trendRow("Geprüfte Lernziele",history,"assessmentCoverage")}
      ${trendRow("Prüfungsbereitschaft",history,"readiness")}
      <p class="small muted">Ein Messpunkt pro Lerntag, an dem du den Fortschritt geöffnet hast.</p>
    </section>
    <section class="card"><h2>Lernserie</h2><div class="row between"><span>Aktuell</span><strong>${s.current} Tage</strong></div><div class="row between"><span>Bestwert</span><strong>${s.longest} Tage</strong></div></section>
    <section class="card">
      <h2>Prüfungssimulation</h2>
      <p class="small muted">Bis zu 12 priorisierte Fragen, 30 Minuten. Unbeantwortete Fragen zählen als 0; Schwächen fließen zurück in Mastery und Tagesplan.</p>
      <button class="primary full" id="start-exam">Prüfung starten</button>
      <button class="secondary full" id="resume-exam">Aktive Prüfung fortsetzen</button>
    </section>
    <section class="card"><h2>Wissenslücken</h2>
      ${gaps.length?gaps.slice(0,20).map(g=>`<div class="list-item clickable" data-open-goal="${g.goalId}"><strong>${esc(g.type)}</strong><div class="small muted">${esc(g.reason)}</div></div>`).join(""):`<div class="empty">Keine offenen Wissenslücken.</div>`}
    </section>`;
  $("#add-exam")?.addEventListener("click",()=>showExamForm());
  content.querySelectorAll("[data-delete-exam]").forEach(button=>{
    button.onclick=async()=>{
      await del("exams",button.dataset.deleteExam);
      await generatePlan();
      toast("Prüfung entfernt");
      renderProgress();
    };
  });
  $("#start-exam")?.addEventListener(
    "click",
    ()=>startExamUI()
  );
  const activeExam = await latestActiveExam();
  const resume = $("#resume-exam");
  if (resume) {
    resume.classList.toggle(
      "hidden",
      !activeExam
    );
    resume.onclick = () => startExamUI(activeExam);
  }
  bindGoalLinks();
}

async function exportBackup() {
  const data={version:1,exportedAt:nowISO(),stores:{}};
  for(const s of STORES) data.stores[s]=await all(s);
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url;a.download=`lernapp-backup-${dayKey()}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importBackup(file) {
  const data=JSON.parse(await file.text());
  if(!data?.stores) throw new Error("Ungültiges Lernapp-Backup.");
  for(const s of STORES) {
    await clearStore(s);
    for(const item of data.stores[s]||[]) await put(s,item);
  }
  state.moduleId=(await all("modules"))[0]?.id||null;
  toast("Backup wiederhergestellt");
  render();
}

async function renderProfile() {
  const settings=await ensureSettings();
  const module=await activeModule();
  const counts={};
  for(const s of ["documents","goals","flashcards","evidence"]) counts[s]=(await all(s)).filter(x=>!x.moduleId||x.moduleId===module.id).length;
  content.innerHTML=`
    <section class="card">
      <h2>Personal PWA</h2>
      <p class="muted">Die Lernkerndaten liegen lokal auf diesem Gerät im Browser. Kein Backend und kein Apple-Developer-Abo sind für diesen Modus erforderlich.</p>
      <span class="badge good">Offline-first</span>
    </section>
    <section class="card">
      <h2>Lernzeit</h2>
      <label>Minuten pro Tag</label>
      <input id="daily-minutes" type="number" min="5" max="240" value="${settings.dailyMinutes}">
      <button class="primary full" id="save-settings">Speichern</button>
    </section>
    <section class="card">
      <h2>Auf iPhone/iPad installieren</h2>
      <ol class="small muted">
        <li>Diese Seite in Safari öffnen.</li>
        <li>Auf „Teilen“ tippen.</li>
        <li>„Zum Home-Bildschirm“ wählen.</li>
        <li>„Hinzufügen“ tippen.</li>
      </ol>
      <p class="small muted">Keine 7-Tage-Neusignierung. Die Installation bleibt bestehen, solange du sie nicht selbst entfernst.</p>
    </section>
    <section class="card">
      <h2>Datensicherung</h2>
      <p class="small muted">Empfehlung: regelmäßig exportieren. Browser-/Website-Daten können vom Nutzer gelöscht werden.</p>
      <div class="stack">
        <button class="secondary full" id="export">Backup exportieren</button>
        <button class="secondary full" id="import-backup">Backup wiederherstellen</button>
      </div>
    </section>
    <section class="card">
      <h2>Lokale Daten</h2>
      <div class="row between"><span>Dokumente</span><strong>${counts.documents}</strong></div>
      <div class="row between"><span>Lernziele</span><strong>${counts.goals}</strong></div>
      <div class="row between"><span>Karteikarten</span><strong>${counts.flashcards}</strong></div>
      <div class="row between"><span>Evidenzen</span><strong>${counts.evidence}</strong></div>
    </section>
    <section class="card">
      <h2>Wichtige Grenze</h2>
      <p class="small muted">PDF-Textextraktion nutzt PDF.js; reine Scan-Seiten werden automatisch mit Tesseract.js OCR (Deutsch + Englisch) verarbeitet. Bilder von Mitschriften, Folien und Skizzen werden im CLOUD-Modus mit Bildverstehen ausgewertet, im LOCAL-Modus per OCR. Reviews verwenden echtes FSRS 6 mit 21 Parametern. Die lokale Antwortbewertung bleibt bewusst konservativ und ist keine semantische KI.</p>
    </section>`;
  $("#save-settings").onclick=async()=>{
    settings.dailyMinutes=Math.max(5,Math.min(240,Number($("#daily-minutes").value)||30));
    await put("settings",settings);await generatePlan();toast("Gespeichert");
  };
  $("#export").onclick=exportBackup;
  $("#import-backup").onclick=()=>$("#backup-import").click();
}

document.querySelectorAll(".tabbar button").forEach(b=>b.addEventListener("click",()=>{
  state.tab=b.dataset.tab; render();
}));
$("#file-import").addEventListener("change",async e=>{
  const file=e.target.files?.[0]; if(!file)return;
  try{ await importStudyFile(file); state.tab="library"; await render(); }
  catch(err){ alert(`Import fehlgeschlagen: ${err.message}`); }
  finally{e.target.value="";}
});
$("#backup-import").addEventListener("change",async e=>{
  const f=e.target.files?.[0]; if(!f)return;
  try{await importBackup(f)}catch(err){alert(err.message)}
  finally{e.target.value="";}
});
modal.addEventListener("click",e=>{if(e.target===modal)closeModal()});

window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault(); state.installPrompt=e; $("#install-button").classList.remove("hidden");
});
$("#install-button").onclick=async()=>{
  if(state.installPrompt){state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null}
};

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js").catch(console.error);
}
await ensureSettings();
await ensureDefaultModule();
await render();
