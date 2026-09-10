const APPEARANCE_KEY="lernapp-appearance";
const APPEARANCE_OPTIONS=[
  ["auto","Automatisch"],
  ["light","Hell"],
  ["dark","Dunkel"]
];
const APPEARANCE_BAR={light:"#f2f2f7",dark:"#000000"};

const systemDark=window.matchMedia("(prefers-color-scheme: dark)");

function readAppearance(){
  try{
    const stored=localStorage.getItem(APPEARANCE_KEY);
    return APPEARANCE_OPTIONS.some(([value])=>value===stored)?stored:"auto";
  }catch{
    // Privater Modus oder gesperrter Speicher: dann gilt die Systemvorgabe.
    return "auto";
  }
}

function effectiveAppearance(choice=readAppearance()){
  if(choice==="dark"||choice==="light")return choice;
  return systemDark.matches?"dark":"light";
}

function applyAppearance(choice=readAppearance()){
  const effective=effectiveAppearance(choice);
  document.documentElement.dataset.theme=effective;
  document.querySelector("#theme-color")?.setAttribute("content",APPEARANCE_BAR[effective]);
  return effective;
}

function setAppearance(choice){
  const value=APPEARANCE_OPTIONS.some(([option])=>option===choice)?choice:"auto";
  try{localStorage.setItem(APPEARANCE_KEY,value);}catch{}
  applyAppearance(value);
  window.dispatchEvent(new CustomEvent("lernapp:appearance-changed",{detail:{choice:value,effective:effectiveAppearance(value)}}));
  return value;
}

// Bei "Automatisch" muss ein Wechsel der Systemeinstellung sofort greifen,
// ohne dass die App neu geladen wird.
systemDark.addEventListener("change",()=>{
  if(readAppearance()==="auto")applyAppearance("auto");
});

function appearanceToast(message){
  const el=document.createElement("div");
  el.className="toast";
  el.textContent=message;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),2200);
}

function markActive(card,choice){
  card.querySelectorAll("[data-appearance]").forEach(button=>{
    const active=button.dataset.appearance===choice;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  });
  const note=card.querySelector("#appearance-note");
  if(note){
    note.textContent=choice==="auto"
      ? `Folgt der Systemeinstellung deines Geräts, aktuell ${effectiveAppearance("auto")==="dark"?"dunkel":"hell"}.`
      : "Bleibt unabhängig von der Systemeinstellung.";
  }
}

function injectAppearanceCard(){
  const content=document.querySelector("#content");
  const profileButton=document.querySelector('[data-tab="profile"]');
  if(!content||!profileButton?.classList.contains("active"))return false;
  if(content.querySelector("#appearance-card"))return true;

  const card=document.createElement("section");
  card.id="appearance-card";
  card.className="card";
  card.innerHTML=`
    <div class="eyebrow">DARSTELLUNG</div>
    <h2>Erscheinungsbild</h2>
    <div class="segmented" role="group" aria-label="Erscheinungsbild">
      ${APPEARANCE_OPTIONS.map(([value,label])=>`<button type="button" data-appearance="${value}">${label}</button>`).join("")}
    </div>
    <p class="small muted" id="appearance-note"></p>
  `;
  // Vor der Moduskarte einhaengen, damit die Reihenfolge unabhaengig davon
  // ist, welches Modul zuerst laeuft.
  const modeCard=content.querySelector("#ai-mode-card");
  if(modeCard)content.insertBefore(card,modeCard);else content.prepend(card);

  card.querySelectorAll("[data-appearance]").forEach(button=>{
    button.onclick=()=>{
      const choice=setAppearance(button.dataset.appearance);
      markActive(card,choice);
      appearanceToast(`Erscheinungsbild: ${APPEARANCE_OPTIONS.find(([v])=>v===choice)[1]}`);
    };
  });
  markActive(card,readAppearance());
  return true;
}

applyAppearance();

document.addEventListener("click",event=>{
  if(event.target.closest?.('[data-tab="profile"]'))setTimeout(()=>injectAppearanceCard(),0);
},true);
const appearanceObserver=new MutationObserver(()=>injectAppearanceCard());
const appearanceContent=document.querySelector("#content");
if(appearanceContent)appearanceObserver.observe(appearanceContent,{childList:true,subtree:false});
window.addEventListener("lernapp:appearance-changed",()=>{
  const card=document.querySelector("#appearance-card");
  if(card)markActive(card,readAppearance());
});
setTimeout(()=>injectAppearanceCard(),0);

window.LernappAppearance={get:readAppearance,set:setAppearance,effective:effectiveAppearance};
