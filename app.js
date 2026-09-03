const STORAGE_KEY = "neon-drop-records-v2";
const SETTINGS_KEY = "neon-drop-github-settings-v1";
const THEME_KEY = "blog-theme";
const START_DATE = new Date("2026-03-23T00:00:00+08:00").getTime();
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const body = document.body;
const assetPrefix = body?.dataset.assetPrefix || "";
const asset = (file) => `${assetPrefix}${file}`;
const state = {
  records: [],
  settings: { owner: "", repo: "", branch: "main", path: "data/apex-records.json", token: "" },
  remoteSha: null,
  backgroundIndex: 0,
  backgroundTimer: null,
  musicPlaying: false,
};

const WALLPAPERS = {
  dark: ["assets/backgrounds/dark/a2-wlop.jpg", "assets/backgrounds/dark/solo-leveling.jpg", "assets/backgrounds/dark/solo-leveling-igris.jpg", "assets/backgrounds/dark/kaisel.jpg"],
  light: ["assets/backgrounds/light/snowy-profile.jpg", "assets/backgrounds/light/hu-tao.jpg", "assets/backgrounds/light/anime-spring.jpg", "assets/backgrounds/light/station-girl.jpg"],
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
  localStorage.setItem(THEME_KEY, mode);
  const dark = mode === "dark";
  if ($("themeIcon")) $("themeIcon").textContent = dark ? "✦" : "☼";
  if ($("themeLabel")) $("themeLabel").textContent = dark ? "夜间" : "日间";
  if ($("themeCardTitle")) $("themeCardTitle").textContent = dark ? "日间模式" : "夜间模式";
  if ($("themeCardCopy")) $("themeCardCopy").textContent = dark ? "落樱漫舞的清晨" : "流萤飞舞的深空";
  if ($("themeOrb")) $("themeOrb").textContent = dark ? "✿" : "✦";
  renderBackgrounds(mode);
  if (notify) toast(dark ? "已切换到夜间模式" : "已切换到日间模式");
}

function renderBackgrounds(theme = root.dataset.theme || "dark") {
  const holder = $("backgroundSlides");
  if (!holder) return;
  const choices = WALLPAPERS[theme] || WALLPAPERS.dark;
  clearInterval(state.backgroundTimer);
  holder.innerHTML = choices.map((file, index) => `<div class="ambient-slide${index === state.backgroundIndex % choices.length ? " active" : ""}" style="background-image:url('${asset(file)}')"></div>`).join("");
  const slides = [...holder.children];
  state.backgroundTimer = setInterval(() => {
    if (slides.length < 2) return;
    slides[state.backgroundIndex % slides.length]?.classList.remove("active");
    state.backgroundIndex = (state.backgroundIndex + 1) % slides.length;
    slides[state.backgroundIndex]?.classList.add("active");
  }, 10000);
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
    button.textContent = open ? "×" : "☰";
  });
  links.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    links.classList.remove("open");
    button.setAttribute("aria-expanded", "false");
    button.textContent = "☰";
  }));
}

function currentNav() {
  if (body?.dataset.route === "apex") return "apex";
  const hash = location.hash.replace(/^#/, "");
  return ["projects", "timeline", "photowall", "music", "about"].includes(hash) ? hash : "home";
}

function updateNav() {
  const active = currentNav();
  document.querySelectorAll("[data-nav]").forEach((link) => link.classList.toggle("active", link.dataset.nav === active));
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

function initMusicPreview() {
  const button = $("musicPlay");
  if (!button) return;
  button.addEventListener("click", () => {
    state.musicPlaying = !state.musicPlaying;
    button.textContent = state.musicPlaying ? "Ⅱ" : "▶";
    $("musicLine").textContent = state.musicPlaying ? "正在播放：给今天的背景音乐。" : "让旋律替你保存此刻的心情。";
    $("musicPreview")?.classList.toggle("is-playing", state.musicPlaying);
  });
}

function initSearch() {
  const input = $("siteSearch");
  const results = $("searchResults");
  if (!input || !results) return;
  const entries = [
    { title: "Apex 开箱记录", detail: "500 包保底循环 / Apex Legends", href: "apex/index.html" },
    { title: "个人博客迁移", detail: "XHBlogs 玻璃拟态页面骨架", href: "#projects" },
    { title: "照片墙", detail: "把路过的风景留在这里", href: "#photowall" },
    { title: "关于这个空间", detail: "个人数字花园 / About", href: "#about" },
  ];
  const render = () => {
    const query = input.value.trim().toLowerCase();
    if (!query) { results.hidden = true; results.innerHTML = ""; return; }
    const matches = entries.filter((entry) => `${entry.title} ${entry.detail}`.toLowerCase().includes(query));
    results.innerHTML = matches.length ? matches.map((entry) => `<a class="search-result" href="${entry.href}"><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.detail)}</small></a>`).join("") : `<div class="search-result"><strong>没有找到相关内容</strong><small>试试搜索 Apex、项目或照片墙</small></div>`;
    results.hidden = false;
  };
  input.addEventListener("input", render);
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
    if (clock) clock.textContent = now.toLocaleTimeString("en-US", { hour12: false });
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
    heirloom: Boolean(record?.heirloom || record?.rarity === "heirloom"),
    heirloomName: record?.heirloomName || (record?.rarity === "heirloom" ? record?.highlight : "") || "",
    createdAt: record?.createdAt || Date.now(),
  };
}

function readLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const list = Array.isArray(raw) ? raw : raw?.records;
    state.records = Array.isArray(list) ? list.map(normalizeRecord) : [];
  } catch { state.records = []; }
  try { state.settings = { ...state.settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; } catch { /* ignore malformed settings */ }
}

function writeLocal() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records)); }
function writeSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); }
function orderedRecords() { return [...state.records].sort((a, b) => new Date(a.date) - new Date(b.date) || (a.createdAt || 0) - (b.createdAt || 0)); }

function cycleStats() {
  let progress = 0, heirlooms = 0, last = null;
  for (const record of orderedRecords()) {
    const combined = progress + record.packs;
    const guaranteed = Math.floor(combined / 500);
    if (guaranteed > 0) { heirlooms += guaranteed; last = { date: record.date, heirloomName: record.heirloomName || "Guaranteed heirloom" }; }
    progress = combined % 500;
    if (record.heirloom) { if (guaranteed === 0) heirlooms += 1; progress = 0; last = record; }
  }
  return { total: state.records.reduce((sum, record) => sum + record.packs, 0), progress, heirlooms, toPity: Math.max(0, 500 - progress), last };
}

function updateHomePreview() {
  if ($("homePostCount")) $("homePostCount").textContent = "0";
  if ($("homeChatterCount")) $("homeChatterCount").textContent = "0";
  if ($("homePhotoCount")) $("homePhotoCount").textContent = "5";
}

function updateApexStats() {
  const stats = cycleStats();
  if ($("totalPacks")) $("totalPacks").textContent = stats.total.toLocaleString("en-US");
  if ($("pityProgress")) $("pityProgress").textContent = `${stats.progress} / 500`;
  if ($("heirloomCount")) $("heirloomCount").textContent = String(stats.heirlooms);
  if ($("packsToPity")) $("packsToPity").textContent = String(stats.toPity);
  if ($("cycleText")) $("cycleText").textContent = `${stats.progress} / 500 packs`;
  if ($("lastHeirloom")) $("lastHeirloom").textContent = stats.last ? (stats.last.heirloomName || dateText(stats.last.date)) : "尚未记录";
  if ($("vibeFace")) {
    $("vibeFace").textContent = !stats.total ? "^_^" : stats.progress < 350 ? "o_o" : "^w^";
    $("vibeTitle").textContent = !stats.total ? "新的循环，新的希望" : stats.progress < 350 ? "红光正在加载" : "保底开始升温";
    $("vibeCopy").textContent = !stats.total ? "每累计一包，就距离下一次保底更近一步。" : `${stats.toPity} 包后进入下一次 500 包保底循环。`;
  }
}

function renderRecords() {
  const holder = $("recordsList");
  const empty = $("emptyState");
  if (!holder || !empty) return;
  const records = [...state.records].sort((a, b) => new Date(b.date) - new Date(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  empty.style.display = records.length ? "none" : "block";
  holder.innerHTML = records.map((record) => `<article class="record-card ${record.heirloom ? "record-card-red" : "record-card-normal"}"><div class="record-badge">${record.heirloom ? "✦" : "◇"}</div><div class="record-main"><h3>${record.heirloom ? "Heirloom found" : "Pack cycle logged"}${record.heirloomName ? ` / ${escapeHtml(record.heirloomName)}` : ""}</h3><p>${dateText(record.date)} / <span>${record.packs} packs</span>${record.heirloom ? " / <b>cycle reset</b>" : ""}</p></div><div class="record-side"><strong>${record.heirloom ? "RED GLOW" : `+${record.packs}`}</strong><small>${record.heirloom ? "HEIRLOOM" : "PACKS"}</small></div><button class="record-delete" type="button" data-delete="${escapeHtml(record.id)}" aria-label="删除记录">×</button></article>`).join("");
}

function renderApex() { updateApexStats(); renderRecords(); }

function githubReady() { return Boolean(state.settings.owner && state.settings.repo && state.settings.token); }
function apiUrl() { const settings = state.settings; return `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${settings.path.split("/").map(encodeURIComponent).join("/")}`; }
function repoUrl() { return `https://api.github.com/repos/${encodeURIComponent(state.settings.owner)}/${encodeURIComponent(state.settings.repo)}`; }
function authHeaders() { return { Accept: "application/vnd.github+json", Authorization: `Bearer ${state.settings.token}`, "X-GitHub-Api-Version": "2022-11-28" }; }
function b64Encode(text) { const bytes = new TextEncoder().encode(text); let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); }
function b64Decode(value) { const binary = atob(value.replace(/\n/g, "")); return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))); }
function payload() { return JSON.stringify({ version: 2, rule: "500 packs guarantees one heirloom; heirloom resets current cycle", updatedAt: new Date().toISOString(), records: state.records }, null, 2); }

async function getRemote() {
  const response = await fetch(`${apiUrl()}?ref=${encodeURIComponent(state.settings.branch || "main")}&t=${Date.now()}`, { headers: authHeaders(), cache: "no-store" });
  if (response.status === 404) {
    const repoCheck = await fetch(`${repoUrl()}?t=${Date.now()}`, { headers: authHeaders(), cache: "no-store" });
    if (repoCheck.status === 404) throw new Error("无法访问该仓库：请检查用户名、仓库名和 Token 权限");
    if (!repoCheck.ok) throw new Error(`GitHub 仓库验证失败（${repoCheck.status}）`);
    return { sha: null, records: [] };
  }
  if (!response.ok) throw new Error(`GitHub 读取失败（${response.status}）`);
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

function updateSyncPill(connected = false) { setSync(connected || githubReady() ? "GitHub connected" : "Local draft", connected || githubReady() ? "connected" : ""); }

async function saveGithub(show = true) {
  if (!githubReady()) { if (show) toast("请先在设置中连接 GitHub"); return false; }
  const remote = await getRemote();
  const body = { message: "chore: update Apex heirloom loot log", content: b64Encode(payload()), branch: state.settings.branch || "main" };
  if (remote.sha) body.sha = remote.sha;
  const response = await fetch(apiUrl(), { method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`GitHub 保存失败（${response.status}）`);
  state.remoteSha = (await response.json()).content?.sha || remote.sha;
  updateSyncPill(true);
  if (show) toast("已保存到 GitHub 私库");
  return true;
}

async function loadGithub() {
  if (!githubReady()) { toast("请先在设置中连接 GitHub"); openSettings(); return; }
  try {
    setSync("Syncing…", "working");
    const remote = await getRemote();
    state.remoteSha = remote.sha;
    if (remote.sha || !state.records.length) {
      state.records = remote.records;
      writeLocal();
      renderApex();
      toast(`已从 GitHub 拉取 ${remote.records.length} 条记录`);
    } else {
      updateSyncPill(true);
      toast("远端文件为空，已保留本地草稿");
    }
    updateSyncPill(Boolean(remote.sha));
  } catch (error) {
    updateSyncPill();
    toast(error.message || "GitHub 拉取失败");
  }
}

let saveTimer;
function scheduleGithubSave() { if (!githubReady()) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => saveGithub(false).catch(() => updateSyncPill()), 900); }

function fillSettings() {
  const map = { owner: "ghOwner", repo: "ghRepo", branch: "ghBranch", path: "ghPath", token: "ghToken" };
  Object.entries(map).forEach(([key, id]) => { if ($(id)) $(id).value = state.settings[key] || ""; });
}
function openSettings() { const modal = $("settingsModal"); if (!modal) return; fillSettings(); modal.classList.add("open"); modal.setAttribute("aria-hidden", "false"); $("ghOwner")?.focus(); }
function closeSettings() { const modal = $("settingsModal"); if (!modal) return; modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true"); }
function collectSettings() {
  state.settings = { owner: $("ghOwner")?.value.trim() || "", repo: $("ghRepo")?.value.trim() || "", branch: $("ghBranch")?.value.trim() || "main", path: $("ghPath")?.value.trim() || "data/apex-records.json", token: $("ghToken")?.value.trim() || "" };
  writeSettings();
  updateSyncPill();
}

function initSettings() {
  $("settingsBtn")?.addEventListener("click", openSettings);
  $("closeSettings")?.addEventListener("click", closeSettings);
  $("settingsModal")?.addEventListener("click", (event) => { if (event.target === $("settingsModal")) closeSettings(); });
  $("saveSettingsBtn")?.addEventListener("click", () => { collectSettings(); closeSettings(); toast(githubReady() ? "GitHub 设置已保存" : "本地设置已保存"); });
  $("testGithubBtn")?.addEventListener("click", async () => {
    collectSettings();
    const status = $("modalStatus");
    if (!githubReady()) { if (status) { status.textContent = "请先填写用户名、仓库和 Token。"; status.style.color = "var(--pink)"; } return; }
    if (status) { status.textContent = "正在测试连接…"; status.style.color = "var(--muted)"; }
    try {
      const response = await fetch(`${repoUrl()}?t=${Date.now()}`, { headers: authHeaders(), cache: "no-store" });
      if (!response.ok) throw new Error(`GitHub 返回 ${response.status}`);
      if (status) { status.textContent = "连接成功，自动保存已就绪。"; status.style.color = "#86efac"; }
    } catch (error) {
      if (status) { status.textContent = error.message || "连接失败"; status.style.color = "var(--pink)"; }
    }
  });
  $("loadGithubBtn")?.addEventListener("click", loadGithub);
}

function initApex() {
  if (!$('recordForm')) return;
  readLocal();
  renderApex();
  updateSyncPill();
  $("date").valueAsDate = new Date();
  $("recordForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const record = normalizeRecord({ id: uid(), date: $("date").value, packs: Number($("packs").value), heirloom: $("heirloom").checked, heirloomName: $("heirloomName").value.trim(), createdAt: Date.now() });
    state.records.push(record);
    writeLocal();
    renderApex();
    scheduleGithubSave();
    event.target.reset();
    $("date").valueAsDate = new Date();
    $("packs").value = 1;
    toast(githubReady() ? "已保存本地，正在同步 GitHub…" : "记录已保存到本地");
    $("history-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("emptyCta")?.addEventListener("click", () => ($("recordPanel") || $("recordForm"))?.scrollIntoView({ behavior: "smooth", block: "center" }));
  $("recordsList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete]");
    if (!button) return;
    state.records = state.records.filter((record) => record.id !== button.dataset.delete);
    writeLocal();
    renderApex();
    scheduleGithubSave();
    toast("记录已删除");
  });
  if (githubReady()) loadGithub();
}

readLocal();
initTheme();
initNav();
initMobileNav();
initCopyButtons();
initMusicPreview();
initSearch();
initClock();
initSettings();
updateHomePreview();
initApex();
updateSyncPill();
