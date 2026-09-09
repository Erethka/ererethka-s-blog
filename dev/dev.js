(() => {
  const $ = (id) => document.getElementById(id);
  const API = "/documents";
  const state = { docs: [], activePath: null, activeSha: null, dirty: false, filter: "全部", preview: true };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const slugify = (value) => String(value || "untitled").trim().toLowerCase().replace(/[^\w\u4e00-\u9fff-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
  const today = () => new Date().toISOString().slice(0, 10);
  const notify = (message) => window.toast?.(message);

  function parseFrontMatter(markdown) {
    const match = String(markdown || "").match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (!match) return { meta: {}, body: String(markdown || "") };
    const meta = {};
    for (const line of match[1].split(/\r?\n/)) {
      const item = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
      if (!item) continue;
      let value = item[2].trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1).split(",").map((v) => v.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
      meta[item[1]] = value;
    }
    return { meta, body: String(markdown || "").slice(match[0].length) };
  }

  function yamlString(value) { return `"${String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`; }

  function buildMarkdown() {
    const title = $("docTitle").value.trim() || "未命名技术记录";
    const category = $("docCategory").value || "其他";
    const tags = $("docTags").value.split(",").map((v) => v.trim()).filter(Boolean);
    const date = $("docDate").value || today();
    let body = $("markdownInput").value.replace(/^\uFEFF/, "");
    if (!/^#\s+/.test(body.trim())) body = `# ${title}\n\n${body}`;
    const lines = ["---", `title: ${yamlString(title)}`, `category: ${yamlString(category)}`, `tags: [${tags.map(yamlString).join(", ")}]`, `date: ${yamlString(date)}`, `updated: ${yamlString(new Date().toISOString())}`, `slug: ${yamlString(slugify(title))}`, "---", "", body.trimEnd(), ""];
    return lines.join("\n");
  }

  function renderMarkdown(source) {
    const escaped = escapeHtml(source || "");
    const lines = escaped.split("\n");
    let html = "", inCode = false, code = [], list = false;
    const inline = (s) => s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    const closeList = () => { if (list) { html += "</ul>"; list = false; } };
    for (const line of lines) {
      if (line.trim().startsWith("```")) {
        if (inCode) { html += `<pre><code>${code.join("\n")}</code></pre>`; code = []; inCode = false; }
        else { closeList(); inCode = true; }
        continue;
      }
      if (inCode) { code.push(line); continue; }
      if (!line.trim()) { closeList(); continue; }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) { closeList(); const n = heading[1].length; html += `<h${n}>${inline(heading[2])}</h${n}>`; continue; }
      if (/^[-*]\s+/.test(line)) { if (!list) { html += "<ul>"; list = true; } html += `<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`; continue; }
      if (/^>\s?/.test(line)) { closeList(); html += `<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`; continue; }
      if (/^---+$/.test(line.trim())) { closeList(); html += "<hr>"; continue; }
      closeList(); html += `<p>${inline(line)}</p>`;
    }
    if (inCode) html += `<pre><code>${code.join("\n")}</code></pre>`;
    closeList();
    return html || '<p class="preview-empty">开始编辑后，这里显示 Markdown 预览。</p>';
  }

  function updatePreview() {
    const preview = $("markdownPreview");
    const raw = $("markdownInput").value;
    const parsed = parseFrontMatter(raw);
    preview.innerHTML = renderMarkdown(parsed.body);
    const words = raw.trim() ? raw.trim().split(/\s+/).length : 0;
    $("wordCount").textContent = `${words} words`;
  }

  function setDirty(dirty) {
    state.dirty = dirty;
    $("editorState").textContent = dirty ? "未保存" : (state.activePath ? "已同步" : "新文档");
    $("editorState").classList.toggle("dirty", dirty);
  }

  function loadIntoEditor(path, content, sha) {
    const parsed = parseFrontMatter(content);
    const meta = parsed.meta;
    $("docTitle").value = meta.title || path.split("/").pop().replace(/\.md$/i, "");
    $("docCategory").value = meta.category || "其他";
    $("docTags").value = Array.isArray(meta.tags) ? meta.tags.join(", ") : (meta.tags || "");
    $("docDate").value = meta.date || today();
    $("markdownInput").value = parsed.body.trimStart();
    state.activePath = path;
    state.activeSha = sha || null;
    $("editorFile").textContent = path;
    $("saveDocBtn").disabled = false;
    $("saveHint").textContent = "保存时会以原生 .md 文件写入私有仓库，并保留 Git 提交历史。";
    setDirty(false);
    updatePreview();
    renderDocList();
  }

  function newDocument() {
    state.activePath = null; state.activeSha = null;
    $("docTitle").value = ""; $("docCategory").value = "Unreal Engine"; $("docTags").value = ""; $("docDate").value = today();
    $("markdownInput").value = "# 新的技术记录\n\n## 问题\n\n## 方案\n\n## 实现\n\n## 结果\n";
    $("editorFile").textContent = "新建文档.md"; $("saveDocBtn").disabled = false;
    $("saveHint").textContent = "这是新文档；保存后会生成 docs/<slug>.md。";
    setDirty(true); updatePreview(); renderDocList();
  }

  async function authFetch(path, init = {}) {
    if (typeof window.apexAuthFetch !== "function") throw new Error("安全代理未加载");
    const response = await window.apexAuthFetch(path, init);
    if (response.status === 401) throw new Error("登录已过期，请重新验证身份");
    return response;
  }

  async function loadDocuments() {
    try {
      const response = await authFetch(API, { method: "GET" });
      if (!response.ok) throw new Error(`文档列表读取失败（${response.status}）`);
      const data = await response.json();
      state.docs = Array.isArray(data.documents) ? data.documents : [];
      renderCategories(); renderDocList();
      if (!state.docs.length) newDocument();
    } catch (error) {
      $("docList").innerHTML = `<div class="doc-loading error">${escapeHtml(error.message)}</div>`;
      notify(error.message);
    }
  }

  async function openDocument(path) {
    if (state.dirty && !confirm("当前文档还有未保存修改，确定切换吗？")) return;
    try {
      const response = await authFetch(`${API}?path=${encodeURIComponent(path)}`, { method: "GET" });
      if (!response.ok) throw new Error(`文档读取失败（${response.status}）`);
      const data = await response.json();
      loadIntoEditor(data.path || path, data.content || "", data.sha || null);
    } catch (error) { notify(error.message); }
  }

  async function saveDocument() {
    const title = $("docTitle").value.trim() || "未命名技术记录";
    const content = buildMarkdown();
    const path = state.activePath || `docs/${slugify(title)}.md`;
    try {
      $("saveDocBtn").disabled = true; $("saveHint").textContent = "正在保存到私有仓库…";
      const response = await authFetch(API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, content, sha: state.activeSha || undefined, message: `${state.activePath ? "docs: update" : "docs: add"} ${title}` }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `保存失败（${response.status}）`);
      state.activePath = path; state.activeSha = data.sha || data.content?.sha || state.activeSha;
      $("editorFile").textContent = path; $("saveHint").textContent = "已保存：Markdown 文件已经提交到私有仓库。";
      setDirty(false); await loadDocuments(); notify("Markdown 已保存到私有仓库");
    } catch (error) {
      $("saveHint").textContent = error.message; notify(error.message);
    } finally { $("saveDocBtn").disabled = false; }
  }

  function renderCategories() {
    const categories = ["全部", ...new Set(state.docs.map((d) => d.category || "其他"))];
    $("categoryFilter").innerHTML = categories.map((c) => `<button class="category-chip ${state.filter === c ? "active" : ""}" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("");
    $("categoryFilter").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.category; renderCategories(); renderDocList(); }));
  }

  function renderDocList() {
    const docs = state.docs.filter((d) => state.filter === "全部" || (d.category || "其他") === state.filter);
    $("docList").innerHTML = docs.length ? docs.map((d) => `<button class="doc-item ${state.activePath === d.path ? "active" : ""}" data-path="${escapeHtml(d.path)}"><span class="doc-item-title">${escapeHtml(d.title || d.path.split("/").pop())}</span><span class="doc-item-meta">${escapeHtml(d.category || "其他")} · ${escapeHtml(d.date || "")}</span></button>`).join("") : `<div class="doc-loading">${state.docs.length ? "这个类别还没有文档。" : "私有仓库还没有技术记录。"}</div>`;
    $("docList").querySelectorAll(".doc-item").forEach((button) => button.addEventListener("click", () => openDocument(button.dataset.path)));
  }

  function importMarkdown(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      const parsed = parseFrontMatter(content);
      const title = parsed.meta.title || file.name.replace(/\.(markdown?|md)$/i, "");
      $("docTitle").value = title; $("docCategory").value = parsed.meta.category || "其他";
      $("docTags").value = Array.isArray(parsed.meta.tags) ? parsed.meta.tags.join(", ") : (parsed.meta.tags || "");
      $("docDate").value = parsed.meta.date || today(); $("markdownInput").value = parsed.body.trimStart();
      state.activePath = null; state.activeSha = null; $("editorFile").textContent = `${file.name} → 待保存`;
      $("saveHint").textContent = `已导入 ${file.name}。保存后会作为新的 Markdown 文件写入私有仓库。`;
      $("saveDocBtn").disabled = false; setDirty(true); updatePreview();
    };
    reader.readAsText(file, "utf-8");
  }

  function bind() {
    $("newDocBtn").addEventListener("click", newDocument);
    $("saveDocBtn").addEventListener("click", saveDocument);
    $("importBtn").addEventListener("click", () => $("fileInput").click());
    $("fileInput").addEventListener("change", (e) => { importMarkdown(e.target.files?.[0]); e.target.value = ""; });
    $("markdownInput").addEventListener("input", () => { setDirty(true); updatePreview(); });
    ["docTitle", "docCategory", "docTags", "docDate"].forEach((id) => $(id).addEventListener("input", () => { setDirty(true); }));
    $("previewToggle").addEventListener("click", () => { state.preview = !state.preview; $("editorGrid").classList.toggle("preview-only", state.preview); $("previewToggle").textContent = state.preview ? "编辑 + 预览" : "仅预览"; });
    window.addEventListener("beforeunload", (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });
  }

  window.loadGithub = loadDocuments;
  document.addEventListener("DOMContentLoaded", () => { bind(); loadDocuments(); });
})();
