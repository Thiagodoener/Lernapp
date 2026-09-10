function cloudSettingsToast(message){const el=document.createElement("div");el.className="toast";el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),2400);}

async function injectCloudSettings(){
  if(!window.AIService)return false;
  const content=document.querySelector("#content");
  const profileButton=document.querySelector('[data-tab="profile"]');
  if(!content||!profileButton?.classList.contains("active"))return false;
  if(content.querySelector("#cloud-settings-card"))return true;

  // Die Karte wird vor dem ersten await eingehängt. Sonst kämen zwei parallele
  // Aufrufe beide an der Prüfung oben vorbei und die Karte entstünde mehrfach.
  const cfg={endpoint:"",hasAccessToken:false};
  const card=document.createElement("section");
  card.id="cloud-settings-card";
  card.className="card";
  card.innerHTML=`
    <div class="eyebrow">CLOUD-KI · SICHERER PROXY</div>
    <h2>Cloud-Verbindung</h2>
    <p class="small muted">Hier wird nur die Adresse deines sicheren Proxys gespeichert. Der eigentliche KI-API-Schlüssel bleibt ausschließlich als Secret im Backend und niemals in dieser PWA.</p>
    <label for="cloud-endpoint">Proxy-Endpunkt</label>
    <input id="cloud-endpoint" type="url" inputmode="url" autocomplete="off" placeholder="https://lernapp-ai.deinname.workers.dev" value="${cfg.endpoint||""}">
    <label for="cloud-token">Persönlicher Zugriffsschlüssel</label>
    <input id="cloud-token" type="password" autocomplete="off" placeholder="Nur nötig, wenn dein Proxy geschützt ist">
    <p class="small muted">Der Zugriffsschlüssel schützt deinen privaten Proxy vor fremder Nutzung. Er ist nicht dein KI-API-Key und wird nur lokal auf diesem Gerät gespeichert.<span id="cloud-token-hint"></span></p>
    <div class="stack">
      <button type="button" class="primary full" id="cloud-save">Verbindung speichern</button>
      <button type="button" class="secondary full" id="cloud-test">Verbindung testen</button>
      <button type="button" class="secondary full" id="cloud-clear">Cloud-Verbindung entfernen</button>
    </div>
    <div id="cloud-status" class="small muted" aria-live="polite"></div>
  `;
  const modeCard=content.querySelector("#ai-mode-card");
  if(modeCard)modeCard.insertAdjacentElement("afterend",card);else content.prepend(card);

  const endpoint=card.querySelector("#cloud-endpoint");
  const token=card.querySelector("#cloud-token");
  const status=card.querySelector("#cloud-status");

  const stored=await window.AIService.getCloudConfig();
  cfg.endpoint=stored.endpoint||"";
  cfg.hasAccessToken=stored.hasAccessToken;
  endpoint.value=cfg.endpoint;
  if(cfg.hasAccessToken)card.querySelector("#cloud-token-hint").textContent=" Aktuell ist bereits ein Zugriffsschlüssel gespeichert.";
  card.querySelector("#cloud-save").onclick=async()=>{
    try{
      const accessToken=token.value.trim()?token.value:undefined;
      await window.AIService.configureCloud({endpoint:endpoint.value.trim(),accessToken});
      token.value="";
      status.textContent="Cloud-Konfiguration gespeichert.";
      cloudSettingsToast("Cloud-Verbindung gespeichert");
    }catch(error){status.textContent=error.message||"Speichern fehlgeschlagen.";}
  };
  card.querySelector("#cloud-test").onclick=async event=>{
    const button=event.currentTarget;button.disabled=true;const old=button.textContent;button.textContent="Teste …";
    try{
      if(endpoint.value.trim() && endpoint.value.trim()!==cfg.endpoint){
        const accessToken=token.value.trim()?token.value:undefined;
        await window.AIService.configureCloud({endpoint:endpoint.value.trim(),accessToken});
        token.value="";
      }
      const result=await window.AIService.testCloud();
      status.textContent=`Verbunden · ${result.provider||"Cloud"} · ${result.model||"Modell konfiguriert"} · ${result.latencyMs} ms`;
      cloudSettingsToast("Cloud-Verbindung funktioniert");
    }catch(error){status.textContent=error.message||"Verbindung fehlgeschlagen.";}
    finally{button.disabled=false;button.textContent=old;}
  };
  card.querySelector("#cloud-clear").onclick=async()=>{
    await window.AIService.clearCloud();endpoint.value="";token.value="";status.textContent="Cloud-Verbindung entfernt. AUTO nutzt wieder LOCAL.";cloudSettingsToast("Cloud-Verbindung entfernt");
  };
  return true;
}

document.addEventListener("click",event=>{if(event.target.closest?.('[data-tab="profile"]'))setTimeout(()=>injectCloudSettings().catch(()=>{}),0);},true);
const cloudObserver=new MutationObserver(()=>injectCloudSettings().catch(()=>{}));
const cloudContent=document.querySelector("#content");
if(cloudContent)cloudObserver.observe(cloudContent,{childList:true,subtree:false});
window.addEventListener("lernapp:cloud-config-changed",()=>injectCloudSettings().catch(()=>{}));
setTimeout(()=>injectCloudSettings().catch(()=>{}),0);
