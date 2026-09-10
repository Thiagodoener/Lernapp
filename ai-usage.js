const USAGE_TASK_LABELS={
  summarize:"Zusammenfassungen",
  tutor:"Tutor",
  generateLearningGoals:"Lernziele",
  generateFlashcards:"Karteikarten",
  evaluateFreeAnswer:"Antwortbewertung",
  analyzeImage:"Bildanalyse"
};

function usageToast(message){
  const el=document.createElement("div");
  el.className="toast";
  el.textContent=message;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),2400);
}

function usageEsc(value=""){
  return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
}

function usageBars(days){
  const peak=Math.max(1,...days.map(d=>d.total));
  return `<div class="usage-bars">${days.map(d=>`
    <div class="usage-bar" title="${usageEsc(d.date)}: ${d.total}">
      <div class="usage-bar-fill" style="height:${Math.round((d.total/peak)*100)}%"></div>
      <span>${usageEsc(d.date.slice(8))}</span>
    </div>`).join("")}</div>`;
}

function usageBody(usage){
  const tasks=Object.entries(usage.today.tasks||{}).sort((a,b)=>b[1]-a[1]);
  const weekTotal=usage.days.reduce((sum,d)=>sum+d.total,0);
  return `
    <div class="row between"><span>Heute</span><strong>${usage.today.total} Anfragen</strong></div>
    <div class="row between"><span>Letzte 7 Tage</span><strong>${weekTotal} Anfragen</strong></div>
    ${usage.today.failed?`<p class="small muted">Davon heute ${usage.today.failed} fehlgeschlagen oder gedrosselt.</p>`:""}
    ${usageBars(usage.days)}
    ${tasks.length
      ? `<div class="usage-tasks">${tasks.map(([task,count])=>`<div class="row between"><span class="small">${usageEsc(USAGE_TASK_LABELS[task]||task)}</span><span class="small">${count}</span></div>`).join("")}</div>`
      : `<p class="small muted">Heute wurden noch keine Cloud-Anfragen gestellt.</p>`}
    ${usage.blockedReason?`<p class="small muted"><strong>${usageEsc(usage.blockedReason)}</strong></p>`:""}
  `;
}

async function injectUsageCard(){
  if(!window.AIService?.usage)return false;
  const content=document.querySelector("#content");
  const profileButton=document.querySelector('[data-tab="profile"]');
  if(!content||!profileButton?.classList.contains("active"))return false;
  if(content.querySelector("#ai-usage-card"))return true;

  // Die Karte wird vor dem ersten await eingehängt. Sonst kämen zwei parallele
  // Aufrufe beide an der Prüfung oben vorbei und die Karte entstünde doppelt.
  const card=document.createElement("section");
  card.id="ai-usage-card";
  card.className="card";
  card.innerHTML=`
    <div class="eyebrow">KI-NUTZUNG</div>
    <h2>Verbrauch und Limit</h2>
    <p class="small muted">Gezählt wird jede an den Proxy gesendete Anfrage. Wiederholungen nach einer Drosselung zählen mit, weil sie ebenfalls Kontingent verbrauchen. LOCAL-Verarbeitung erscheint hier nicht, weil sie nichts verbraucht.</p>
    <div id="ai-usage-body"><p class="small muted">Wird geladen …</p></div>
    <label class="small muted" for="ai-usage-limit">Tageslimit für Cloud-Anfragen</label>
    <input id="ai-usage-limit" type="number" inputmode="numeric" min="0" step="1" placeholder="0 = kein Limit">
    <p class="small muted">Ist das Limit erreicht, wechselt AUTO automatisch auf LOCAL. Im Modus CLOUD nennt die App den Grund, statt eine unspezifische Fehlermeldung zu zeigen.</p>
    <button type="button" class="primary full" id="ai-usage-save">Limit speichern</button>
  `;
  const cloudCard=content.querySelector("#cloud-settings-card");
  if(cloudCard)cloudCard.insertAdjacentElement("afterend",card);else content.prepend(card);

  const usage=await window.AIService.usage();
  card.querySelector("#ai-usage-body").innerHTML=usageBody(usage);
  card.querySelector("#ai-usage-limit").value=usage.limit||"";

  card.querySelector("#ai-usage-save").onclick=async()=>{
    const value=await window.AIService.setDailyLimit(card.querySelector("#ai-usage-limit").value);
    card.querySelector("#ai-usage-body").innerHTML=usageBody(await window.AIService.usage());
    usageToast(value?`Tageslimit auf ${value} gesetzt`:"Tageslimit entfernt");
  };
  return true;
}

const usageStyle=document.createElement("style");
usageStyle.textContent=`
#ai-usage-card input{width:100%;margin:4px 0 8px}
.usage-bars{display:flex;align-items:flex-end;gap:6px;height:76px;margin:14px 0 6px}
.usage-bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:4px}
.usage-bar-fill{width:100%;min-height:3px;background:var(--accent);border-radius:5px 5px 0 0}
.usage-bar span{font-size:11px;color:var(--muted)}
.usage-tasks{margin-top:10px;padding-top:8px;border-top:1px solid var(--line)}
`;
document.head.appendChild(usageStyle);

document.addEventListener("click",event=>{
  if(event.target.closest?.('[data-tab="profile"]'))setTimeout(()=>injectUsageCard().catch(()=>{}),0);
},true);
const usageObserver=new MutationObserver(()=>injectUsageCard().catch(()=>{}));
const usageContent=document.querySelector("#content");
if(usageContent)usageObserver.observe(usageContent,{childList:true,subtree:false});
window.addEventListener("lernapp:cloud-config-changed",()=>injectUsageCard().catch(()=>{}));
setTimeout(()=>injectUsageCard().catch(()=>{}),0);
