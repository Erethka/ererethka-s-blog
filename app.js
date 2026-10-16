const STORAGE_KEY = "neon-drop-records-v3";
const THEME_KEY = "blog-theme";
const START_DATE = new Date("2026-09-02T10:03:11+08:00").getTime();
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const body = document.body;

const state = {
  records: [],
  remoteSha: null,
  pending: false,
  syncing: false,
  revision: 0,
};

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function setTheme(theme, notify = false) {
  const mode = theme === "light" ? "light" : "dark";
  root.dataset.theme = mode;
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* Theme still works when storage is unavailable. */ }
  const themeColor = mode === "dark" ? "#171b1d" : "#e8ece7";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
  const dark = mode === "dark";
  if ($("themeIcon")) $("themeIcon").textContent = dark ? "✦" : "☼";
  if ($("themeLabel")) $("themeLabel").textContent = dark ? "夜间" : "日间";
  $("themeButton")?.setAttribute("aria-label", dark ? "切换日间主题" : "切换夜间主题");
  $("themeCard")?.setAttribute("aria-label", dark ? "切换日间主题" : "切换夜间主题");
  if ($("themeCardTitle")) $("themeCardTitle").textContent = dark ? "浅色模式" : "深色模式";
  if ($("themeCardCopy")) $("themeCardCopy").textContent = dark ? "切换到纸色界面" : "切换到深色界面";
  if ($("themeOrb")) $("themeOrb").textContent = dark ? "☼" : "☾";
  if (notify) toast(dark ? "已切换到夜间模式" : "已切换到日间模式");
}

function initTheme() {
  let saved = "dark";
  try { saved = localStorage.getItem(THEME_KEY) || "dark"; } catch { /* private browsing */ }
  setTheme(saved);
  $("themeButton")?.addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark", true));
  $("themeCard")?.addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark", true));
}

function initMobileNav() {
  const button = $("mobileMenuButton");
  const links = $("mobileLinks");
  if (!button || !links) return;
  button.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "关闭导航" : "打开导航");
    button.textContent = open ? "×" : "☰";
  });
  links.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    links.classList.remove("open");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "打开导航");
    button.textContent = "☰";
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !links.classList.contains("open")) return;
    links.classList.remove("open");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "打开导航");
    button.textContent = "☰";
    button.focus();
  });
}

function currentNav() {
  if (body?.dataset.route === "updates") return "updates";
  if (body?.dataset.route === "apex") return "apex";
  if (["dev","reader"].includes(body?.dataset.route)) return "dev";
  const hash = location.hash.replace(/^#/, "");
  return ["projects", "timeline", "photowall", "music", "about"].includes(hash) ? hash : "home";
}

function updateNav() {
  const active = currentNav();
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const selected = link.dataset.nav === active;
    link.classList.toggle("active", selected);
    if (selected) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function initNav() {
  updateNav();
  window.addEventListener("hashchange", updateNav);
}

function initCopyButtons() {
  document.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy || "");
      toast("已复制到剪贴板");
    } catch {
      toast(`复制内容：${button.dataset.copy || ""}`);
    }
  }));
}

function initSearch() {
  const input = $("siteSearch");
  const results = $("searchResults");
  if (!input || !results) return;
  const entries = [
    { title: "Apex 开箱记录", detail: "500 包保底循环 / Apex Legends", href: "apex/index.html" },
    { title: "技术档案", detail: "技术记录 / 开发笔记 / Markdown / 实验与问题解法", href: "dev/index.html" },
    { title: "档案索引", detail: "项目 / 技术记录 / 照片墙 / 游戏", href: "#projects" },
    { title: "照片墙", detail: "影像档案 / 相册 / 雾与火 / 等一班车 / 游戏时刻 / 夜航", href: "photowall/index.html" },
    { title: "音乐角落", detail: "日常旋律 / 网易云音乐", href: "#music" },
    { title: "站点动态与使用说明", detail: "更新日志 / RSS 订阅 / 登录指南 / Markdown / 备份", href: "updates/index.html" },
    { title: "关于这个档案", detail: "个人记录 / About", href: "#about" },
  ];
  const render = () => {
    const query = input.value.trim().toLowerCase();
    if (!query) { results.hidden = true; results.innerHTML = ""; return; }
    const titleRank = (entry) => entry.title.toLowerCase() === query ? 2 : Number(entry.title.toLowerCase().includes(query));
    const privateEntries=(window.blogSearchDocuments || []).map(doc=>({title:doc.title || doc.path,detail:`${doc.category || '其他'} / ${(doc.tags || []).join(' / ')}`,href:`dev/reader.html?doc=${encodeURIComponent(doc.path)}`}));
    const matches = [...entries,...privateEntries]
      .filter((entry) => `${entry.title} ${entry.detail}`.toLowerCase().includes(query))
      .sort((a, b) => titleRank(b) - titleRank(a));
    results.innerHTML = matches.length ? matches.map((entry) => `<a class="search-result" href="${entry.href}"><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.detail)}</small></a>`).join("") : `<div class="search-result"><strong>没有找到相关内容</strong><small>试试搜索 Apex、项目或照片墙</small></div>`;
    results.hidden = false;
  };
  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && !results.hidden) {
      const first = results.querySelector("a");
      if (first) { event.preventDefault(); first.focus(); }
    }
    if (event.key === "Enter" && !results.hidden) results.querySelector("a")?.click();
  });
  results.addEventListener("click", (event) => {
    if (event.target.closest("a")) { results.hidden = true; input.value = ""; }
  });
  document.addEventListener("click", (event) => { if (!event.target.closest(".search-wrap")) results.hidden = true; });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); input.focus(); }
    if (event.key === "Escape") { results.hidden = true; input.blur(); }
  });
}

function initClock() {
  const clock = $("clock");
  const uptime = $("uptime");
  if (!clock && !uptime) return;
  const update = () => {
    const now = new Date();
    if (clock) clock.textContent = now.toLocaleTimeString("en-GB", { hour12: false, timeZone: "Asia/Shanghai" });
    if (uptime) {
      const days = Math.max(0, Math.floor((now.getTime() - START_DATE) / 86400000));
      uptime.textContent = `${days} 天`;
    }
  };
  update();
  setInterval(update, 1000);
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function dateText(value) { return value ? new Date(`${value}T00:00:00`).toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" }) : "No date"; }

function normalizeRecord(record) {
  return {
    id: record?.id || uid(),
    date: record?.date || new Date().toISOString().slice(0, 10),
    packs: Math.max(1, Number(record?.packs) || 1),
    createdAt: record?.createdAt || Date.now(),
  };
}

function readLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const list = Array.isArray(raw) ? raw : raw?.records;
    state.records = Array.isArray(list) ? list.map(normalizeRecord) : [];
  } catch { state.records = []; }
}

function writeLocal() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records)); }
function orderedRecords() { return [...state.records].sort((a, b) => new Date(a.date) - new Date(b.date) || (a.createdAt || 0) - (b.createdAt || 0)); }

function cycleStats() {
  const total = state.records.reduce((sum, record) => sum + record.packs, 0);
  const progress = total % 500;
  return { total, progress, toPity: progress === 0 && total > 0 ? 500 : 500 - progress };
}

function updateApexStats() {
  const stats = cycleStats();
  if ($("totalPacks")) $("totalPacks").textContent = stats.total.toLocaleString("en-US");
  if ($("pityProgress")) $("pityProgress").textContent = String(stats.progress);
  if ($("packsToPity")) $("packsToPity").textContent = String(stats.toPity);
  if ($("cycleNumber")) $("cycleNumber").textContent = `第 ${Math.floor(stats.total / 500) + 1} 轮`;
  if ($("recordCount")) $("recordCount").textContent = state.records.length.toLocaleString("en-US");
  if ($("historyCount")) $("historyCount").textContent = String(state.records.length);
  if ($("cycleFill")) $("cycleFill").style.width = `${stats.progress / 5}%`;
  $("cycleProgress")?.setAttribute("aria-valuenow", String(stats.progress));
  $("cycleProgress")?.setAttribute("aria-valuetext", `${stats.progress} 包，共 500 包`);
  const lastDate = state.records.reduce((latest, record) => record.date > latest ? record.date : latest, "");
  if ($("lastRecordedDate")) $("lastRecordedDate").textContent = lastDate ? dateText(lastDate) : "暂无记录";
}

function renderRecords() {
  const holder = $("recordsList");
  const empty = $("emptyState");
  if (!holder || !empty) return;
  const records = [...state.records].sort((a, b) => new Date(b.date) - new Date(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  empty.style.display = records.length ? "none" : "flex";
  if ($("recordColumns")) $("recordColumns").hidden = !records.length;
  holder.innerHTML = records.map((record) => `<li class="record-row"><div class="record-date"><time datetime="${escapeHtml(record.date)}">${escapeHtml(dateText(record.date))}</time><small>手动记录</small></div><span class="record-quantity">${record.packs.toLocaleString("en-US")}<small>包</small></span><button class="record-delete" type="button" data-delete="${escapeHtml(record.id)}" aria-label="删除 ${escapeHtml(dateText(record.date))} 的 ${record.packs} 包记录"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/></svg></button></li>`).join("");
}

function renderApex() { updateApexStats(); renderRecords(); }

function apexFetch(path, init = {}) {
  if (typeof window.apexAuthFetch !== "function") throw new Error("Apex 安全代理未加载");
  return window.apexAuthFetch(path, init);
}

function b64Encode(text) { const bytes = new TextEncoder().encode(text); let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); }
function b64Decode(value) { const binary = atob(value.replace(/\n/g, "")); return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))); }
function payload() { return JSON.stringify({ version: 3, rule: "Record opened pack counts; current pity progress is total packs modulo 500", updatedAt: new Date().toISOString(), records: state.records }, null, 2); }

async function getRemote() {
  const response = await apexFetch("/apex", { method: "GET" });
  if (response.status === 401) throw new Error("未登录或登录已过期，请重新验证");
  if (!response.ok) throw new Error(`私有数据读取失败（${response.status}）`);
  const data = await response.json();
  let parsed = {};
  try { parsed = JSON.parse(b64Decode(data.content || "")); } catch { /* malformed remote file becomes empty */ }
  return { sha: data.sha || null, records: Array.isArray(parsed.records) ? parsed.records.map(normalizeRecord) : [] };
}

function setSync(label, mode = "") {
  const pill = $("syncPill");
  if (!pill) return;
  pill.classList.toggle("connected", mode === "connected");
  pill.classList.toggle("working", mode === "working");
  $("syncLabel") && ($("syncLabel").textContent = label);
}

function updateSyncPill(connected = false) { setSync(connected ? "已同步" : "等待登录", connected ? "connected" : ""); }

function syncErrorMessage(error) {
  const message = error?.message || "同步暂未完成，请稍后重试。";
  return /failed to fetch|networkerror|load failed/i.test(message) ? "暂时无法连接同步服务，请稍后重试。" : message;
}

async function saveGithub(show = true) {
  if(state.syncing)return false;
  state.syncing=true;
  const revision=state.revision, content=payload();
  try {
    const remote = await getRemote();
    const body = { message: "chore: update Apex pack count log", content: b64Encode(content), branch: "main" };
    if (remote.sha) body.sha = remote.sha;
    const response = await apexFetch("/apex", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (response.status === 401) throw new Error("登录已过期，请重新验证");
    if (!response.ok) throw new Error(`私有数据保存失败（${response.status}）`);
    state.remoteSha = (await response.json()).content?.sha || remote.sha;
    state.pending=state.revision!==revision;
    updateSyncPill(true);
    if (show) toast("已保存到 GitHub 私库");
    return true;
  } catch (error) {
    setSync(/登录/.test(error.message) ? "需要登录" : "同步未完成");
    if (show) toast(syncErrorMessage(error));
    throw error;
  } finally { state.syncing=false;if(state.pending&&state.revision!==revision)scheduleGithubSave(); }
}

async function loadGithub() {
  const revision=state.revision;
  try {
    setSync("正在同步…", "working");
    const remote = await getRemote();
    if(state.pending || state.revision!==revision){setSync("本地更改待同步");return;}
    state.remoteSha = remote.sha;
    if (remote.sha || !state.records.length) {
      state.records = remote.records;
      writeLocal();
      renderApex();
      toast(`已从私有仓库拉取 ${remote.records.length} 条记录`);
    }
    updateSyncPill(Boolean(remote.sha));
  } catch (error) {
    setSync(/登录/.test(error.message) ? "需要登录" : "同步未完成");
    toast(syncErrorMessage(error));
  }
}

let saveTimer;
function scheduleGithubSave() {
  state.pending=true;state.revision++;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveGithub(false).catch(() => {}), 900);
}

function initApex() {
  if (!$("recordForm")) return;
  readLocal();
  renderApex();
  updateSyncPill(false);
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  $("date").value = today();
  const syncPackControls = () => {
    const value = Number($("packs").value);
    document.querySelectorAll("[data-pack-value]").forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.packValue) === value)));
    document.querySelectorAll("[data-pack-step]").forEach((button) => { button.disabled = Number(button.dataset.packStep) < 0 ? value <= 1 : value >= 9999; });
  };
  $("todayButton")?.addEventListener("click", () => { $("date").value = today(); });
  $("packs").addEventListener("input", syncPackControls);
  document.querySelectorAll("[data-pack-value], [data-pack-step]").forEach((button) => button.addEventListener("click", () => {
    const value = button.dataset.packValue ? Number(button.dataset.packValue) : (Number($("packs").value) || 1) + Number(button.dataset.packStep);
    $("packs").value = String(Math.max(1, Math.min(9999, value)));
    syncPackControls();
  }));
  syncPackControls();
  $("retrySync")?.addEventListener("click",()=>state.pending?saveGithub().catch(()=>{}):loadGithub());
  $("exportRecords")?.addEventListener("click",()=>{
    const url=URL.createObjectURL(new Blob([payload()],{type:"application/json;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=`apex-records-${today()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  window.addEventListener("beforeunload",event=>{if(state.pending){event.preventDefault();event.returnValue="";}});
  window.addEventListener("blog:beforelogout",event=>{if(state.pending&&!confirm("还有记录未同步。退出会清除本机记录缓存，确定退出吗？建议先重新同步或导出备份。"))event.preventDefault();});
  $("recordForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const record = normalizeRecord({ id: uid(), date: $("date").value, packs: Number($("packs").value), createdAt: Date.now() });
    state.records.push(record);
    writeLocal();
    renderApex();
    scheduleGithubSave();
    event.target.reset();
    $("date").value = today();
    $("packs").value = 1;
    syncPackControls();
    toast("已保存本地，正在同步私有仓库…");
    if (window.matchMedia("(max-width: 720px)").matches) $("history-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("emptyCta")?.addEventListener("click", () => {
    $("recordPanel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    $("packs").focus({ preventScroll: true });
  });
  $("recordsList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete]");
    if (!button) return;
    state.records = state.records.filter((record) => record.id !== button.dataset.delete);
    writeLocal();
    renderApex();
    scheduleGithubSave();
    toast("记录已删除");
  });
  loadGithub();
}

readLocal();
initTheme();
initNav();
initMobileNav();
initCopyButtons();
initSearch();
initClock();
initApex();

// Long pages keep a reachable way back to their index.
const backTop=document.createElement('button');
backTop.type='button';backTop.className='back-top';backTop.textContent='↑ 顶部';backTop.hidden=true;backTop.setAttribute('aria-label','返回页面顶部');
backTop.onclick=()=>{window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});document.querySelector('main')?.focus({preventScroll:true});};
document.body.append(backTop);
window.addEventListener('scroll',()=>backTop.hidden=scrollY<600,{passive:true});
