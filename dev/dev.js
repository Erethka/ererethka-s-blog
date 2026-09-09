(() => {
  const $ = (id) => document.getElementById(id);
  const API = "/documents";
  const state = { docs: [], activePath: null, activeSha: null, dirty: false, filter: "全部", query: "", preview: true };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const slugify = (value) => String(value || "untitled").trim().toLowerCase().replace(/[^\w\u4e00-\u9fff-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
  const today = () => new Date().toISOString().slice(0, 10);
  const notify = (message) => { const toast = $("toast"); if (toast) { toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2200); } };
  function parseFrontMatter(markdown) {
    const match = String(markdown || "").match(/^---\s*\n([\s\S]*?)\n---\s*\n?/); if (!match) return { meta: {}, body: String(markdown || "") };
    const meta = {};
    for (const line of match[1].split(/\r?\n/)) { const item = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/); if (!item) continue; let value = item[2].trim(); if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1); if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1).split(",").map((v) => v.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean); meta[item[1]] = value; }
    return { meta, body: String(markdown || "").slice(match[0].length) };
  }
  const yamlString = (value) => `"${String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
  function buildMarkdown() {
    const title = $("docTitle").value.trim() || "未命名技术记录", category = $("docCategory").value.trim() || "其他", tags = $("docTags").value.split(",").map((v) => v.trim()).filter(Boolean), date = $("docDate").value || today(), status = $("docStatus").value || "draft";
    let body = $("markdownInput").value.replace(/^\uFEFF/, ""); if (!/^#\s+/.test(body.trim())) body = `# ${title}\n\n${body}`;
    return ["---", `title: ${yamlString(title)}`, `category: ${yamlString(category)}`, `tags: [${tags.map(yamlString).join(", ")}]`, `date: ${yamlString(date)}`, `updated: ${yamlString(new Date().toISOString())}`, `status: ${yamlString(status)}`, `slug: ${yamlString(slugify(title))}`, "---", "", body.trimEnd(), ""].join("\n");
  }
  function renderMarkdown(source) {
    const escaped = escapeHtml(source || ""), lines = escaped.split("\n"); let html = "", inCode = false, code = [], list = false, ordered = false;
    const inline = (s) => s.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    const closeList = () => { if (list) { html += ordered ? "</ol>" : "</ul>"; list = false; ordered = false; } };
    for (const line of lines) {
      if (line.trim().startsWith("```")) { if (inCode) { html += `<pre><code>${code.join("\n")}</code></pre>`; code = []; inCode = false; } else { closeList(); inCode = true; } continue; }
      if (inCode) { code.push(line); continue; } if (!line.trim()) { closeList(); continue; }
      const heading = line.match(/^(#{1,6})\s+(.+)$/); if (heading) { closeList(); const n = heading[1].length; html += `<h${n}>${inline(heading[2])}</h${n}>`; continue; }
      if (/^\d+\.\s+/.test(line)) { if (!list || !ordered) { closeList(); html += "<ol>"; list = true; ordered = true; } html += `<li>${inline(line.replace(/^\d+\.\s+/, ""))}</li>`; continue; }
      if (/^[-*]\s+/.test(line)) { if (!list || ordered) { closeList(); html += "<ul>"; list = true; ordered = false; } html += `<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`; continue; }
      if (/^>\s?/.test(line)) { closeList(); html += `<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`; continue; }
      if (/^---+$/.test(line.trim())) { closeList(); html += "<hr>"; continue; }
      closeList(); html += `<p>${inline(line)}</p>`;
    }
    if (inCode) html += `<pre><code>${code.join("\n")}</code></pre>`; closeList(); return html || '<p class="preview-empty">开始编辑后，这里显示 Markdown 预览。</p>';
  }
  function updatePreview() { const raw = $("markdownInput").value, parsed = parseFrontMatter(raw); $("markdownPreview").innerHTML = renderMarkdown(parsed.body); $("wordCount").textContent = `${raw.trim() ? raw.trim().split(/\s+/).length : 0} words`; }
  function setDirty(dirty) { state.dirty = dirty; $("editorState").textContent = dirty ? "未保存" : (state.activePath ? "已同步" : "新文档"); $("editorState").classList.toggle("dirty", dirty); }
  function setActiveControls(enabled) { $("saveDocBtn").disabled = !enabled; $("renameDocBtn").disabled = !state.activePath || dirtyGuard(); $("deleteDocBtn").disabled = !state.activePath || dirtyGuard(); }
  function dirtyGuard() { return state.dirty; }
  function loadIntoEditor(path, content, sha) {
    const { meta, body } = parseFrontMatter(content); $("docTitle").value = meta.title || path.split("/").pop().replace(/\.md$/i, ""); $("docCategory").value = meta.category || "其他"; $("docTags").value = Array.isArray(meta.tags) ? meta.tags.join(", ") : (meta.tags || ""); $("docDate").value = meta.date || today(); $("docStatus").value = ["draft","published","archived"].includes(meta.status) ? meta.status : "draft"; $("markdownInput").value = body.trimStart(); state.activePath = path; state.activeSha = sha || null; $("editorFile").textContent = path; $("saveHint").textContent = "保存时会以原生 .md 文件写入私有仓库，并保留 Git 提交历史。"; setDirty(false); updatePreview(); renderDocList(); setActiveControls(true);
  }
  function newDocument() { state.activePath = null; state.activeSha = null; $("docTitle").value = ""; $("docCategory").value = "Unreal Engine"; $("docTags").value = ""; $("docDate").value = today(); $("docStatus").value = "draft"; $("markdownInput").value = "# 新的技术记录\n\n## 问题\n\n## 方案\n\n## 实现\n\n## 结果\n"; $("editorFile").textContent = "新建文档.md"; $("saveHint").textContent = "这是新文档；保存后会生成 docs/<slug>.md。"; setDirty(true); updatePreview(); renderDocList(); setActiveControls(true); }
  async function authFetch(path, init = {}) { if (typeof window.apexAuthFetch !== "function") throw new Error("安全代理未加载"); const response = await window.apexAuthFetch(path, init); if (response.status === 401) throw new Error("登录已过期，请重新验证身份"); return response; }
  async function loadDocuments() {
    try { const response = await authFetch(API); if (!response.ok) throw new Error(`文档列表读取失败（${response.status}）`); const data = await response.json(); state.docs = Array.isArray(data.documents) ? data.documents : []; renderCategories(); renderDocList(); if (!state.docs.length && !state.activePath) newDocument(); }
    catch (error) { $("docList").innerHTML = `<div class="doc-loading error">${escapeHtml(error.message)}</div>`; }
  }
  async function openDocument(path) { if (state.dirty && !confirm("当前文档还有未保存修改，确定切换吗？")) return; try { const response = await authFetch(`${API}?path=${encodeURIComponent(path)}`); if (!response.ok) throw new Error(`文档读取失败（${response.status}）`); const data = await response.json(); loadIntoEditor(data.path || path, data.content || "", data.sha || null); } catch (error) { notify(error.message); } }
  async function saveDocument() {
    const title = $("docTitle").value.trim() || "未命名技术记录", content = buildMarkdown(), path = state.activePath || `docs/${slugify(title)}.md`;
    try { $("saveDocBtn").disabled = true; $("saveHint").textContent = "正在保存到私有仓库…"; const response = await authFetch(API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, content, sha: state.activeSha || undefined, message: `${state.activePath ? "docs: update" : "docs: add"} ${title}` }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `保存失败（${response.status}）`); state.activePath = path; state.activeSha = data.sha || state.activeSha; $("editorFile").textContent = path; $("saveHint").textContent = "已保存：Markdown 文件已经提交到私有仓库。"; setDirty(false); await loadDocuments(); notify("Markdown 已保存"); }
    catch (error) { $("saveHint").textContent = error.message; notify(error.message); } finally { setActiveControls(true); }
  }
  function renderCategories() {
    const categories = ["全部", ...new Set(state.docs.map((d) => d.category || "其他"))]; $("categoryFilter").innerHTML = categories.map((c) => `<button class="category-chip ${state.filter === c ? "active" : ""}" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join(""); $("categoryFilter").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { state.filter = b.dataset.category; renderCategories(); renderDocList(); })); $("categoryOptions").innerHTML = categories.filter((c) => c !== "全部").map((c) => `<option value="${escapeHtml(c)}"></option>`).join("");
  }
  function renderDocList() {
    const q = state.query.trim().toLowerCase(); const docs = state.docs.filter((d) => (state.filter === "全部" || (d.category || "其他") === state.filter) && (!q || `${d.title} ${d.category} ${(d.tags || []).join(" ")} ${d.path}`.toLowerCase().includes(q)));
    $("docList").innerHTML = docs.length ? docs.map((d) => `<button class="doc-item ${state.activePath === d.path ? "active" : ""}" data-path="${escapeHtml(d.path)}"><span class="doc-item-title">${escapeHtml(d.title || d.path.split("/").pop())}</span><span class="doc-item-meta">${escapeHtml(d.category || "其他")} · ${escapeHtml(d.status === "published" ? "正式" : d.status === "archived" ? "归档" : "草稿")} · ${escapeHtml(d.date || "")}</span></button>`).join("") : `<div class="doc-loading">${state.docs.length ? "没有匹配的文档。" : "私有仓库还没有技术记录。"}</div>`; $("docList").querySelectorAll(".doc-item").forEach((b) => b.addEventListener("click", () => openDocument(b.dataset.path)));
  }
  function importMarkdown(file) { if (!file) return; const reader = new FileReader(); reader.onload = () => { const content = String(reader.result || ""), parsed = parseFrontMatter(content), title = parsed.meta.title || file.name.replace(/\.(markdown?|md)$/i, ""); $("docTitle").value = title; $("docCategory").value = parsed.meta.category || "其他"; $("docTags").value = Array.isArray(parsed.meta.tags) ? parsed.meta.tags.join(", ") : (parsed.meta.tags || ""); $("docDate").value = parsed.meta.date || today(); $("docStatus").value = ["draft","published","archived"].includes(parsed.meta.status) ? parsed.meta.status : "draft"; $("markdownInput").value = parsed.body.trimStart(); state.activePath = null; state.activeSha = null; $("editorFile").textContent = `${file.name} → 待保存`; $("saveHint").textContent = `已导入 ${file.name}。保存后会作为新的 Markdown 文件写入私有仓库。`; setDirty(true); updatePreview(); setActiveControls(true); }; reader.readAsText(file, "utf-8"); }
  async function renameDocument() {
    if (!state.activePath || state.dirty) { notify("请先保存当前修改，再重命名"); return; } const current = state.activePath, title = $("docTitle").value.trim(); if (!title) return notify("标题不能为空"); const next = `docs/${slugify(title)}.md`; if (next === current) return notify("文件名没有变化"); if (!confirm(`确定将 ${current.split("/").pop()} 重命名为 ${next.split("/").pop()} 吗？`)) return;
    try { const response = await authFetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rename", from: current, to: next, sha: state.activeSha, message: `docs: rename ${current.split("/").pop()} to ${next.split("/").pop()}` }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `重命名失败（${response.status}）`); state.activePath = next; state.activeSha = data.sha || null; $("editorFile").textContent = next; await loadDocuments(); notify("文档已重命名"); } catch (error) { notify(error.message); }
  }
  async function deleteDocument() {
    if (!state.activePath) return; if (state.dirty) { notify("请先保存当前修改，再删除"); return; } if (!confirm(`确定永久删除 ${state.activePath} 吗？\n此操作会在私有仓库产生 Git 删除提交。`)) return;
    try { const response = await authFetch(API, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: state.activePath, sha: state.activeSha, message: `docs: delete ${state.activePath.split("/").pop()}` }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `删除失败（${response.status}）`); state.activePath = null; state.activeSha = null; newDocument(); await loadDocuments(); notify("文档已删除"); } catch (error) { notify(error.message); }
  }
  function bind() {
    $("newDocBtn").addEventListener("click", newDocument); $("saveDocBtn").addEventListener("click", saveDocument); $("renameDocBtn").addEventListener("click", renameDocument); $("deleteDocBtn").addEventListener("click", deleteDocument); $("importBtn").addEventListener("click", () => $("fileInput").click()); $("fileInput").addEventListener("change", (e) => { importMarkdown(e.target.files?.[0]); e.target.value = ""; }); $("docSearch").addEventListener("input", (e) => { state.query = e.target.value; renderDocList(); }); $("markdownInput").addEventListener("input", () => { setDirty(true); updatePreview(); setActiveControls(true); }); ["docTitle","docCategory","docTags","docDate","docStatus"].forEach((id) => $(id).addEventListener("input", () => { setDirty(true); setActiveControls(true); })); $("previewToggle").addEventListener("click", () => { state.preview = !state.preview; $("editorGrid").classList.toggle("preview-only", state.preview); $("previewToggle").textContent = state.preview ? "编辑 + 预览" : "仅预览"; }); window.addEventListener("beforeunload", (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } }); document.querySelectorAll('.site-nav [data-nav]').forEach((link) => link.classList.toggle('active', link.dataset.nav === 'dev'));
  }
  window.loadGithub = loadDocuments;
  document.addEventListener("DOMContentLoaded", () => { bind(); loadDocuments(); });
})();
