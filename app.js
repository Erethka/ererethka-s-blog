const STORAGE_KEY = "neon-drop-records-v2";
const SETTINGS_KEY = "neon-drop-github-settings-v1";
const $ = id => document.getElementById(id);
const state = { records: [], settings: { owner:"", repo:"", branch:"main", path:"data/apex-records.json", token:"" }, remoteSha:null };
const WALLPAPER_KEY = "neon-drop-wallpaper-theme-v1";
const WALLPAPERS = {
  dark: ["assets/backgrounds/dark/a2-wlop.jpg","assets/backgrounds/dark/solo-leveling.jpg","assets/backgrounds/dark/solo-leveling-igris.jpg","assets/backgrounds/dark/kaisel.jpg","assets/backgrounds/dark/apex-legends.jpg"],
  light: ["assets/backgrounds/light/snowy-profile.jpg","assets/backgrounds/light/apex-champions.jpg","assets/backgrounds/light/hu-tao.jpg","assets/backgrounds/light/anime-spring.jpg","assets/backgrounds/light/station-girl.jpg"]
};

function readLocal(){
  try { const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem("neon-drop-records-v1") || "[]"); state.records = Array.isArray(raw) ? raw.map(normalizeRecord) : []; } catch { state.records = []; }
  try { state.settings = { ...state.settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; } catch {}
}
function normalizeRecord(r){ return { id:r.id || uid(), date:r.date || new Date().toISOString().slice(0,10), packs:Math.max(1,Number(r.packs)||1), heirloom:Boolean(r.heirloom || r.rarity === "heirloom"), heirloomName:r.heirloomName || (r.rarity === "heirloom" ? r.highlight : "") || "", createdAt:r.createdAt || Date.now() }; }
function writeLocal(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records)); }
function writeSettings(){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); }
function uid(){ return Date.now()+"-"+Math.random().toString(36).slice(2,8); }
function escapeHtml(v){ return String(v ?? "").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function dateText(v){ return v ? new Date(v+"T00:00:00").toLocaleDateString("zh-CN",{year:"numeric",month:"short",day:"numeric"}) : "No date"; }
function toast(msg){ const el=$("toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("show"),2400); }
function setWallpaper(theme, notify=false){ const mode=theme==="light"?"light":"dark", choices=WALLPAPERS[mode], current=document.documentElement.dataset.wallpaperImage, available=choices.filter(p=>p!==current), image=available[Math.floor(Math.random()*available.length)]||choices[0]; document.documentElement.dataset.wallpaperTheme=mode; document.documentElement.dataset.wallpaperImage=image; document.documentElement.style.setProperty("--wallpaper-image",`url("${image}")`); $("wallpaperMode").textContent=mode==="light"?"Light":"Dark"; $("wallpaperIcon").textContent=mode==="light"?"sun":"moon"; $("wallpaperToggle").classList.toggle("light",mode==="light"); localStorage.setItem(WALLPAPER_KEY,mode); if(notify)toast(mode==="light"?"Light wallpaper applied":"Dark wallpaper applied"); }
function initWallpaper(){ setWallpaper(localStorage.getItem(WALLPAPER_KEY)||"dark"); $("wallpaperToggle").addEventListener("click",()=>setWallpaper(document.documentElement.dataset.wallpaperTheme==="dark"?"light":"dark",true)); }
function orderedRecords(){ return [...state.records].sort((a,b)=>new Date(a.date)-new Date(b.date)||(a.createdAt||0)-(b.createdAt||0)); }
function cycleStats(){
  let progress=0, heirlooms=0, last=null;
  for(const r of orderedRecords()){
    const before=progress, combined=before+r.packs, guaranteed=Math.floor(combined/500);
    if(guaranteed>0){ heirlooms+=guaranteed; last={date:r.date,heirloomName:r.heirloomName||"Guaranteed heirloom"}; }
    progress=combined%500;
    // A manually marked early heirloom is an extra reset only when this entry
    // did not already cross a guaranteed 500-pack boundary.
    if(r.heirloom && guaranteed===0){ heirlooms+=1; progress=0; last=r; }
    else if(r.heirloom){ progress=0; last=r; }
  }
  const total=state.records.reduce((s,r)=>s+r.packs,0);
  return { total, progress, heirlooms, toPity:Math.max(0,500-progress), last };
}
function updateStats(){
  const s=cycleStats(); $("totalPacks").textContent=s.total.toLocaleString("en-US"); $("pityProgress").textContent=`${s.progress} / 500`; $("heirloomCount").textContent=s.heirlooms; $("packsToPity").textContent=s.toPity;
  $("luckMeter").textContent=`${s.progress}/500`; $("luckBar").style.width=Math.min(100,s.progress/5)+"%"; $("cycleNumber").textContent=String(s.heirlooms+1).padStart(3,"0"); $("cycleText").textContent=`${s.progress} / 500 packs`; $("lastHeirloom").textContent=s.last ? (s.last.heirloomName || dateText(s.last.date)) : "No entry yet";
  if(!s.total){ $("vibeFace").textContent="^_^"; $("vibeTitle").textContent="New cycle, new hope"; $("vibeCopy").textContent="Every pack moves the tracker one step closer to the next guaranteed heirloom."; }
  else if(s.progress<350){ $("vibeFace").textContent="o_o"; $("vibeTitle").textContent="The red glow is loading"; $("vibeCopy").textContent=`${s.toPity} packs remain in this 500-pack cycle.`; }
  else { $("vibeFace").textContent="^w^"; $("vibeTitle").textContent="Pity is getting warm"; $("vibeCopy").textContent="The next red glow is close. Keep the record honest."; }
}
function renderRecords(){
  const list=[...state.records].sort((a,b)=>new Date(b.date)-new Date(a.date)||(b.createdAt||0)-(a.createdAt||0)); $("emptyState").style.display=list.length?"none":"block";
  $("recordsList").innerHTML=list.map(r=>`<article class="record-card ${r.heirloom?"record-card-red":"record-card-normal"}"><div class="record-badge ${r.heirloom?"heirloom":"common"}">${r.heirloom?"♢":"·"}</div><div class="record-main"><h3>${r.heirloom?"Heirloom found":"Pack cycle logged"}${r.heirloomName?` / ${escapeHtml(r.heirloomName)}`:""}</h3><p>${dateText(r.date)} / <span>${r.packs} packs</span>${r.heirloom?" / <b>cycle reset</b>":""}</p></div><div class="record-side"><strong>${r.heirloom?"RED GLOW":"+"+r.packs}</strong><small>${r.heirloom?"HEIRLOOM":"PACKS"}</small></div><button class="record-delete" data-delete="${r.id}" aria-label="Delete">x</button></article>`).join("");
  document.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>{state.records=state.records.filter(r=>r.id!==b.dataset.delete);writeLocal();renderAll();toast("Entry deleted");scheduleGithubSave();}));
}
function renderAll(){ updateStats(); renderRecords(); updateSyncPill(); }
function setPage(page,changeHash=true){ const valid=["loot","dev"].includes(page)?page:"loot"; document.querySelectorAll(".nav-button").forEach(b=>b.classList.toggle("active",b.dataset.page===valid)); document.querySelectorAll(".hero,.stats-grid,.content-grid,.history-section").forEach(el=>el.style.display=valid==="loot"?"":"none"); $("devPage").classList.toggle("active",valid==="dev"); if(changeHash) history.replaceState(null,"",`#${valid}`); if(valid!=="loot") toast("这个页面会在后续个人博客更新中开放"); }
function githubReady(){ return state.settings.owner&&state.settings.repo&&state.settings.token; }
function apiUrl(){ const s=state.settings; return `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/contents/${s.path.split("/").map(encodeURIComponent).join("/")}`; }
function authHeaders(){ return {Accept:"application/vnd.github+json",Authorization:`Bearer ${state.settings.token}`,"X-GitHub-Api-Version":"2022-11-28"}; }
function b64Encode(text){ const bytes=new TextEncoder().encode(text); let bin=""; for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(bin); }
function b64Decode(s){ const bin=atob(s.replace(/\n/g,"")); return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0))); }
function payload(){ return JSON.stringify({version:2,rule:"500 packs guarantees one heirloom; heirloom resets current cycle",updatedAt:new Date().toISOString(),records:state.records},null,2); }
async function getRemote(){ const r=await fetch(`${apiUrl()}?ref=${encodeURIComponent(state.settings.branch||"main")}`,{headers:authHeaders()}); if(r.status===404)return{sha:null,records:[]}; if(!r.ok)throw Error("GitHub read failed ("+r.status+")"); const d=await r.json(); let p; try{p=JSON.parse(b64Decode(d.content));}catch{p={records:[]};} return{sha:d.sha,records:Array.isArray(p.records)?p.records.map(normalizeRecord):[]}; }
async function saveGithub(show=true){ if(!githubReady()){if(show)toast("Connect GitHub in settings first");return false;} const old=await getRemote(),body={message:"chore: update heirloom loot log",content:b64Encode(payload()),branch:state.settings.branch||"main"}; if(old.sha)body.sha=old.sha; const r=await fetch(apiUrl(),{method:"PUT",headers:{...authHeaders(),"Content-Type":"application/json"},body:JSON.stringify(body)}); if(!r.ok)throw Error("GitHub save failed ("+r.status+")"); state.remoteSha=(await r.json()).content?.sha||old.sha; updateSyncPill(true); if(show)toast("Saved to GitHub"); return true; }
async function loadGithub(){ if(!githubReady()){toast("Connect GitHub in settings first");openSettings();return;} try{setSync("Syncing...","working");const r=await getRemote();state.remoteSha=r.sha;if(r.sha||!state.records.length){state.records=r.records;writeLocal();renderAll();toast(r.sha?"Remote records loaded":"No remote file yet");}else{updateSyncPill(true);toast("Remote file is empty; local draft kept");}}catch(e){updateSyncPill();toast(e.message||"GitHub load failed");} }
let saveTimer; function scheduleGithubSave(){if(!githubReady())return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveGithub(false).catch(()=>updateSyncPill()),900);}
function setSync(label,mode=""){ $("syncLabel").textContent=label; $("syncPill").classList.toggle("connected",mode==="connected"); $("syncPill").classList.toggle("working",mode==="working"); }
function updateSyncPill(connected=false){setSync(connected||githubReady()?"GitHub connected":"Local draft",connected||githubReady()?"connected":"");}
function openSettings(){const ids={owner:"ghOwner",repo:"ghRepo",branch:"ghBranch",path:"ghPath",token:"ghToken"};Object.entries(ids).forEach(([k,id])=>$(id).value=state.settings[k]||"");$("settingsModal").classList.add("open");$("settingsModal").setAttribute("aria-hidden","false");$("ghOwner").focus();}
function closeSettings(){$("settingsModal").classList.remove("open");$("settingsModal").setAttribute("aria-hidden","true");}
function collectSettings(){state.settings={owner:$("ghOwner").value.trim(),repo:$("ghRepo").value.trim(),branch:$("ghBranch").value.trim()||"main",path:$("ghPath").value.trim()||"data/apex-records.json",token:$("ghToken").value.trim()};writeSettings();updateSyncPill();}

$("recordForm").addEventListener("submit",e=>{e.preventDefault();const record=normalizeRecord({id:uid(),date:$("date").value,packs:Number($("packs").value),heirloom:$("heirloom").checked,heirloomName:$("heirloomName").value.trim(),createdAt:Date.now()});state.records.push(record);writeLocal();renderAll();scheduleGithubSave();e.target.reset();$("date").valueAsDate=new Date();$("packs").value=1;toast(githubReady()?"Saved locally, syncing GitHub...":"Saved locally");$("history-section").scrollIntoView({behavior:"smooth"});});
$("scrollToForm").addEventListener("click",()=>$("recordPanel").scrollIntoView({behavior:"smooth",block:"center"}));$("emptyCta").addEventListener("click",()=>$("recordPanel").scrollIntoView({behavior:"smooth",block:"center"}));document.querySelectorAll(".nav-button").forEach(b=>b.addEventListener("click",()=>setPage(b.dataset.page)));$("settingsBtn").addEventListener("click",openSettings);$("closeSettings").addEventListener("click",closeSettings);$("settingsModal").addEventListener("click",e=>{if(e.target===$("settingsModal"))closeSettings()});$("saveSettingsBtn").addEventListener("click",()=>{collectSettings();closeSettings();toast(githubReady()?"GitHub settings saved":"Local settings saved")});$("testGithubBtn").addEventListener("click",async()=>{collectSettings();const s=$("modalStatus");if(!githubReady()){s.textContent="Fill owner, repo, and token first.";s.style.color="#ff9fbd";return}s.textContent="Testing connection...";s.style.color="#a9a1e2";try{const r=await fetch(`https://api.github.com/repos/${encodeURIComponent(state.settings.owner)}/${encodeURIComponent(state.settings.repo)}`,{headers:authHeaders()});if(!r.ok)throw Error("GitHub returned "+r.status);s.textContent="Connection works. Auto-save is ready.";s.style.color="#79efb6"}catch(e){s.textContent=e.message||"Connection failed.";s.style.color="#ff9fbd";}});$("loadGithubBtn").addEventListener("click",loadGithub);
readLocal();$("date").valueAsDate=new Date();renderAll();setPage(location.hash.slice(1)||"loot",false);initWallpaper();if(githubReady())loadGithub();
