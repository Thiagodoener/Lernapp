function aiModeLabel(mode){
  return ({AUTO:"AUTO · automatisch",LOCAL:"LOCAL · komplett kostenfrei",CLOUD:"CLOUD · höchste Qualität"})[mode]||"AUTO · automatisch";
}

function aiModeDescription(mode,status){
  if(mode==="LOCAL")return "Alle KI-Funktionen bleiben lokal bzw. nutzen kostenfreie lokale Verfahren. Keine Cloud-KI erforderlich.";
  if(mode==="CLOUD")return status?.cloudAvailable?"Cloud-KI ist aktiv verfügbar.":"Cloud-KI ist ausgewählt, aber noch nicht konfiguriert oder gerade nicht verfügbar.";
  return status?.activeProvider==="CLOUD"?"AUTO nutzt aktuell CLOUD, weil sie verfügbar ist.":"AUTO nutzt aktuell LOCAL. Sobald eine Cloud-KI konfiguriert und verfügbar ist, kann AUTO sie automatisch verwenden.";
}

async function injectAIModeCard(){
  if(!window.AIService)return false;
  const content=document.querySelector("#content");
  const profileButton=document.querySelector('[data-tab="profile"]');
  if(!content||!profileButton?.classList.contains("active"))return false;
  if(content.querySelector("#ai-mode-card"))return true;

  const mode=await window.AIService.getMode();
  const status=await window.AIService.status();
  const card=document.createElement("section");
  card.id="ai-mode-card";
  card.className="card";
  card.innerHTML=`
    <div class="eyebrow">KI-BETRIEBSMODUS</div>
    <h2>${aiModeLabel(mode)}</h2>
    <p class="small muted" id="ai-mode-description">${aiModeDescription(mode,status)}</p>
    <div class="segmented ai-mode-segmented" role="group" aria-label="KI-Betriebsmodus">
      <button type="button" data-ai-mode="AUTO" class="${mode==="AUTO"?"active":""}">AUTO</button>
      <button type="button" data-ai-mode="LOCAL" class="${mode==="LOCAL"?"active":""}">LOCAL</button>
      <button type="button" data-ai-mode="CLOUD" class="${mode==="CLOUD"?"active":""}">CLOUD</button>
    </div>
    <div class="ai-mode-grid">
      <div><strong>AUTO</strong><span>Standard. Wählt automatisch die beste verfügbare Option.</span></div>
      <div><strong>LOCAL</strong><span>Komplett kostenfreier Betrieb ohne Cloud-KI.</span></div>
      <div><strong>CLOUD</strong><span>Für höchste Qualität, sobald ein Cloud-Anbieter angebunden ist.</span></div>
    </div>
    <p class="small muted">API-Schlüssel werden niemals im Browser gespeichert. Eine spätere Cloud-Anbindung läuft über einen sicheren Backend-Endpunkt.</p>
  `;
  content.prepend(card);

  card.querySelectorAll("[data-ai-mode]").forEach(button=>{
    button.onclick=async()=>{
      const next=button.dataset.aiMode;
      await window.AIService.setMode(next);
      const freshStatus=await window.AIService.status();
      card.querySelector("h2").textContent=aiModeLabel(next);
      card.querySelector("#ai-mode-description").textContent=aiModeDescription(next,freshStatus);
      card.querySelectorAll("[data-ai-mode]").forEach(b=>b.classList.toggle("active",b.dataset.aiMode===next));
      const toast=document.createElement("div");
      toast.className="toast";
      toast.textContent=`KI-Modus: ${next}`;
      document.body.appendChild(toast);
      setTimeout(()=>toast.remove(),2200);
    };
  });
  return true;
}

const aiStyle=document.createElement("style");
aiStyle.textContent=`
.ai-mode-segmented{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}
.ai-mode-segmented button{min-height:44px;border-radius:12px}
.ai-mode-segmented button.active{background:#111827;color:#fff}
.ai-mode-grid{display:grid;gap:8px;margin-top:12px}
.ai-mode-grid>div{display:grid;gap:2px;padding:10px 12px;border:1px solid rgba(148,163,184,.25);border-radius:12px}
.ai-mode-grid span{font-size:.88rem;opacity:.72}
`;
document.head.appendChild(aiStyle);

document.addEventListener("click",event=>{
  if(event.target.closest?.('[data-tab="profile"]'))setTimeout(()=>injectAIModeCard(),0);
},true);

const profileObserver=new MutationObserver(()=>{injectAIModeCard().catch(()=>{});});
const profileContent=document.querySelector("#content");
if(profileContent)profileObserver.observe(profileContent,{childList:true,subtree:false});
window.addEventListener("lernapp:ai-mode-changed",()=>injectAIModeCard().catch(()=>{}));
setTimeout(()=>injectAIModeCard(),0);
