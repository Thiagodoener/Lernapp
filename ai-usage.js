const USAGE_TASK_LABELS={
  summarize:"Zusammenfassungen",
  tutor:"Tutor",
  generateLearningGoals:"Lernziele",
  generateFlashcards:"Karteikarten",
  evaluateFreeAnswer:"Antwortbewertung",
  analyzeImage:"Bildanalyse",
  generateChoiceOptions:"Quizoptionen"
};

function usageTokenLabel(value){
  const zahl=Number(value)||0;
  if(zahl>=1e6)return `${(zahl/1e6).toFixed(2)} Mio.`;
  if(zahl>=1000)return `${Math.round(zahl/1000)} Tsd.`;
  return String(zahl);
}

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
  const monat=usage.month||{};
  const preisGesetzt=(Number(monat.preis?.input)||0)>0||(Number(monat.preis?.output)||0)>0;
  return `
    <div class="row between"><span>Heute</span><strong>${usage.today.total} Anfragen</strong></div>
    <div class="row between"><span>Letzte 7 Tage</span><strong>${weekTotal} Anfragen</strong></div>
    <div class="row between"><span>Diesen Monat</span><strong>${monat.anfragen||0} Anfragen</strong></div>
    <div class="row between"><span>Tokens im Monat</span><strong>${usageTokenLabel(monat.tokensIn)} ein · ${usageTokenLabel(monat.tokensOut)} aus</strong></div>
    ${preisGesetzt
      ? `<div class="row between"><span>Geschätzte Kosten</span><strong>${(monat.euro||0).toFixed(2)} €${monat.budget?` von ${Number(monat.budget).toFixed(2)} €`:""}</strong></div>
         ${monat.budget?`<div class="progress-track"><div class="progress-fill" data-budget-fill></div></div>`:""}`
      : `<p class="small muted">Für eine Kostenschätzung fehlt der Preis je Million Tokens. Ohne ihn zeigt die App Tokens statt einer geratenen Zahl.</p>`}
    ${usage.today.failed?`<p class="small muted">Davon heute ${usage.today.failed} fehlgeschlagen oder gedrosselt.</p>`:""}
    ${usageBars(usage.days)}
    ${tasks.length
      ? `<div class="usage-tasks">${tasks.map(([task,count])=>`<div class="row between"><span class="small">${usageEsc(USAGE_TASK_LABELS[task]||task)}</span><span class="small">${count}</span></div>`).join("")}</div>`
      : `<p class="small muted">Heute wurden noch keine Cloud-Anfragen gestellt.</p>`}
    ${usage.blockedReason?`<p class="small muted"><strong>${usageEsc(usage.blockedReason)}</strong></p>`:""}
  `;
}

function usageDrawBudget(card,usage){
  const fill=card.querySelector("[data-budget-fill]");
  const monat=usage.month||{};
  if(!fill||!(monat.budget>0))return;
  // Breite ist ein Wert, keine Gestaltung, und steht deshalb nicht im Markup.
  fill.style.width=`${Math.round(Math.min(1,(monat.euro||0)/monat.budget)*100)}%`;
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
    <label class="small muted" for="ai-usage-budget">Monatsbudget in Euro</label>
    <input id="ai-usage-budget" type="number" inputmode="decimal" min="0" step="0.5" placeholder="0 = kein Budget">
    <div class="usage-price-grid">
      <div>
        <label class="small muted" for="ai-usage-price-in">€ je Mio. Eingabe-Tokens</label>
        <input id="ai-usage-price-in" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0">
      </div>
      <div>
        <label class="small muted" for="ai-usage-price-out">€ je Mio. Ausgabe-Tokens</label>
        <input id="ai-usage-price-out" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0">
      </div>
    </div>
    <p class="small muted">Die Preise stehen auf der Preisseite deines Anbieters und ändern sich dort; deshalb trägst du sie hier ein, statt dass die App eine Zahl errät. Im kostenlosen Kontingent bleiben beide auf 0 und es entstehen keine Kosten. Ist das Budget ausgeschöpft, wechselt AUTO auf LOCAL, genau wie beim Tageslimit.</p>
    <button type="button" class="primary full" id="ai-usage-save">Limit und Budget speichern</button>
  `;
  const cloudCard=content.querySelector("#cloud-settings-card");
  if(cloudCard)cloudCard.insertAdjacentElement("afterend",card);else content.prepend(card);

  const usage=await window.AIService.usage();
  card.querySelector("#ai-usage-body").innerHTML=usageBody(usage);
  usageDrawBudget(card,usage);
  card.querySelector("#ai-usage-limit").value=usage.limit||"";
  card.querySelector("#ai-usage-budget").value=usage.month?.budget||"";
  card.querySelector("#ai-usage-price-in").value=usage.month?.preis?.input||"";
  card.querySelector("#ai-usage-price-out").value=usage.month?.preis?.output||"";

  card.querySelector("#ai-usage-save").onclick=async()=>{
    const limit=await window.AIService.setDailyLimit(card.querySelector("#ai-usage-limit").value);
    const budget=await window.AIService.setMonthlyBudget(card.querySelector("#ai-usage-budget").value);
    await window.AIService.setTokenPrice({
      input:card.querySelector("#ai-usage-price-in").value,
      output:card.querySelector("#ai-usage-price-out").value
    });
    const frisch=await window.AIService.usage();
    card.querySelector("#ai-usage-body").innerHTML=usageBody(frisch);
    usageDrawBudget(card,frisch);
    usageToast([limit?`Tageslimit ${limit}`:null,budget?`Budget ${budget.toFixed(2)} €`:null].filter(Boolean).join(" · ")||"Grenzen entfernt");
  };
  return true;
}

// Die Gestaltung liegt zentral in styles.css. Ein eigener style-Block hier
// wuerde das Design-System ueberschreiben, weil er spaeter in die Kaskade faellt.

document.addEventListener("click",event=>{
  if(event.target.closest?.('[data-tab="profile"]'))setTimeout(()=>injectUsageCard().catch(()=>{}),0);
},true);
const usageObserver=new MutationObserver(()=>injectUsageCard().catch(()=>{}));
const usageContent=document.querySelector("#content");
if(usageContent)usageObserver.observe(usageContent,{childList:true,subtree:false});
window.addEventListener("lernapp:cloud-config-changed",()=>injectUsageCard().catch(()=>{}));
setTimeout(()=>injectUsageCard().catch(()=>{}),0);
