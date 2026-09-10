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

  // Die Karte wird vor dem ersten await eingehängt. Sonst kämen zwei parallele
  // Aufrufe beide an der Prüfung oben vorbei und die Karte entstünde mehrfach.
  const card=document.createElement("section");
  card.id="ai-mode-card";
  card.className="card";
  card.innerHTML=`
    <div class="eyebrow">KI-BETRIEBSMODUS</div>
    <h2>${aiModeLabel("AUTO")}</h2>
    <p class="small muted" id="ai-mode-description">Wird geladen …</p>
    <div class="segmented ai-mode-segmented" role="group" aria-label="KI-Betriebsmodus">
      <button type="button" data-ai-mode="AUTO">AUTO</button>
      <button type="button" data-ai-mode="LOCAL">LOCAL</button>
      <button type="button" data-ai-mode="CLOUD">CLOUD</button>
    </div>
    <div class="ai-mode-grid">
      <div><strong>AUTO</strong><span>Standard. Wählt automatisch die beste verfügbare Option.</span></div>
      <div><strong>LOCAL</strong><span>Komplett kostenfreier Betrieb ohne Cloud-KI.</span></div>
      <div><strong>CLOUD</strong><span>Für höchste Qualität, sobald ein Cloud-Anbieter angebunden ist.</span></div>
    </div>
    <p class="small muted">API-Schlüssel werden niemals im Browser gespeichert. Eine spätere Cloud-Anbindung läuft über einen sicheren Backend-Endpunkt.</p>
  `;
  content.prepend(card);

  const mode=await window.AIService.getMode();
  const status=await window.AIService.status();
  card.querySelector("h2").textContent=aiModeLabel(mode);
  card.querySelector("#ai-mode-description").textContent=aiModeDescription(mode,status);
  card.querySelectorAll("[data-ai-mode]").forEach(b=>b.classList.toggle("active",b.dataset.aiMode===mode));

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

// Die Gestaltung liegt zentral in styles.css. Ein eigener style-Block hier
// wuerde das Design-System ueberschreiben, weil er spaeter in die Kaskade faellt.

document.addEventListener("click",event=>{
  if(event.target.closest?.('[data-tab="profile"]'))setTimeout(()=>injectAIModeCard(),0);
},true);

const profileObserver=new MutationObserver(()=>{injectAIModeCard().catch(()=>{});});
const profileContent=document.querySelector("#content");
if(profileContent)profileObserver.observe(profileContent,{childList:true,subtree:false});
window.addEventListener("lernapp:ai-mode-changed",()=>injectAIModeCard().catch(()=>{}));
setTimeout(()=>injectAIModeCard(),0);
