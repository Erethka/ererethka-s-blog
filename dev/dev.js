(() => {
  const $ = (id) => document.getElementById(id);
  const API = "/documents";
  const params = new URLSearchParams(location.search);
  const state = { docs: [], activePath: null, activeSha: null, dirty: false, filter: params.get("category") || "全部", query: params.get("q") || "", view: "read", tag: params.get("tag") || "", month: "", sort: "newest", hasDocument: false, saving: false, requestId: 0 };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const slugify = (value) => String(value || "untitled").trim().toLowerCase().replace(/[^\w\u4e00-\u9fff-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80) || "untitled";
  const today = () => new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const notify = (message) => { const el=$("toast"); clearTimeout(notify.timer); el.textContent=message; el.classList.add("show"); notify.timer=setTimeout(()=>el.classList.remove("show"),2400); };
  const friendlyError = (error) => /failed to fetch|networkerror|load failed/i.test(error?.message || "") ? "暂时无法加载笔记，请稍后重试。" : (error?.message || "操作未完成，请稍后重试。");
  const statusText = (status) => status === "published" ? "正式" : status === "archived" ? "归档" : "草稿";
  const confirmDiscard = () => !state.dirty || confirm("当前笔记有未保存的修改，确定离开吗？");
  function parseFrontMatter(markdown) {
    const match = String(markdown || "").match(/^---\s*\n([\s\S]*?)\n---\s*\n?/); if (!match) return { meta: {}, body: String(markdown || "") };
    const meta = {};
    for (const line of match[1].split(/\r?\n/)) { const item = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/); if (!item) continue; let value = item[2].trim(); if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1); if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1).split(",").map((v) => v.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean); meta[item[1]] = value; }
    return { meta, body: String(markdown || "").slice(match[0].length) };
  }
  const yamlString = (value) => `"${String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
  function buildMarkdown() {
    const title = $("docTitle").value.trim() || "未命名技术笔记", category = $("docCategory").value.trim() || "其他", tags = $("docTags").value.split(",").map((v) => v.trim()).filter(Boolean), date = $("docDate").value || today(), status = $("docStatus").value || "draft";
    let body = $("markdownInput").value.replace(/^\uFEFF/, ""); if (!/^#\s+/.test(body.trim())) body = `# ${title}\n\n${body}`;
    return ["---", `title: ${yamlString(title)}`, `category: ${yamlString(category)}`, `tags: [${tags.map(yamlString).join(", ")}]`, `date: ${yamlString(date)}`, `updated: ${yamlString(new Date().toISOString())}`, `status: ${yamlString(status)}`, `slug: ${yamlString(slugify(title))}`, "---", "", body.trimEnd(), ""].join("\n");
  }
  function updatePreview() {
    const raw=$("markdownInput").value;
    let body=parseFrontMatter(raw).body;
    const title=$("docTitle").value.trim();
    const first=body.match(/^\s*#\s+([^\n]+)\n*/);
    if(first && first[1].trim()===title) body=body.slice(first[0].length);
    $("markdownPreview").innerHTML=window.archiveMarkdown.render(body,state.activePath).html;
    window.archiveMarkdown.enhance($("markdownPreview"));
    $("wordCount").textContent=`${Array.from(raw).length.toLocaleString("zh-CN")} 字符`;
  }
  function updateBanner() {
    if(!state.hasDocument) return;
    $("documentHeading").textContent=$("docTitle").value.trim() || "未命名笔记";
    const index=state.docs.findIndex(doc=>doc.path===state.activePath);
    $("documentCode").textContent=state.activePath ? `RECORD / ${String(index+1).padStart(3,"0")}` : "RECORD / NEW";
    const category=$("docCategory").value.trim() || "未分类";
    const date=$("docDate").value || today();
    $("documentSubline").innerHTML=`<span>${escapeHtml(category)}</span><span class="meta-separator">/</span><span>${escapeHtml(date)}</span><span class="document-status">${statusText($("docStatus").value)}</span>`;
    $("editorState").textContent=state.saving ? "正在保存" : state.dirty ? "未保存" : state.activePath ? "已同步" : "新笔记";
    $("editorState").classList.toggle("dirty",state.dirty);
  }
  function updateControls() {
    $("exportDocBtn").disabled=!state.hasDocument || state.saving;
    $("saveDocBtn").disabled=!state.hasDocument || !state.dirty || state.saving;
    $("renameDocBtn").disabled=!state.activePath || state.dirty || state.saving;
    $("deleteDocBtn").disabled=!state.activePath || state.dirty || state.saving;
    $("newDocBtn").disabled=state.saving;
    $("importBtn").disabled=state.saving;
    ["docTitle","docCategory","docTags","docDate","docStatus","markdownInput"].forEach(id=>$(id).disabled=state.saving || !state.hasDocument);
    document.querySelectorAll(".view-switch button").forEach(button=>button.disabled=!state.hasDocument || state.saving);
    document.querySelectorAll(".doc-select").forEach(button=>button.disabled=state.saving);
    const reader=$("openReader");
    reader.classList.toggle("disabled",!state.activePath);
    reader.setAttribute("aria-disabled",String(!state.activePath));
    if(state.activePath) reader.href=`reader.html?doc=${encodeURIComponent(state.activePath)}`;
    else reader.removeAttribute("href");
    $("workspaceWelcome").hidden=state.hasDocument;
    $("editorGrid").hidden=!state.hasDocument;
    $("documentProperties").hidden=!state.hasDocument || state.view==="read";
  }
  function setView(view) {
    state.view=["read","edit","split"].includes(view) ? view : "read";
    $("editorShell").dataset.view=state.view;
    document.querySelectorAll(".view-switch button").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.view===state.view)));
    updateControls();
  }
  function setDirty(dirty) { if(dirty) state.requestId++; state.dirty=dirty; updateBanner(); updateControls(); }
  function scrollToDocument() {
    if(matchMedia("(max-width:720px)").matches) {
      document.querySelector(".doc-sidebar").classList.remove("catalog-expanded");
      $("catalogToggle").setAttribute("aria-expanded","false");
      $("catalogToggle").textContent="切换笔记 ＋";
      $("editorShell").scrollIntoView({behavior:"smooth",block:"start"});
    }
  }
  function loadIntoEditor(path,content,sha) {
    const {meta,body}=parseFrontMatter(content);
    $("docTitle").value=meta.title || path.split("/").pop().replace(/\.md$/i,"");
    $("docCategory").value=meta.category || "其他";
    $("docTags").value=Array.isArray(meta.tags) ? meta.tags.join(", ") : meta.tags || "";
    $("docDate").value=meta.date || today();
    $("docStatus").value=["draft","published","archived"].includes(meta.status) ? meta.status : "draft";
    $("markdownInput").value=body.trimStart();
    state.activePath=path; state.activeSha=sha || null; state.hasDocument=true;
    $("editorFile").textContent=path;
    $("saveHint").textContent="修改后请点击保存，笔记会自动同步。";
    $("documentProperties").open=false;
    setDirty(false); setView("read"); updatePreview(); renderDocList();
  }
  function newDocument() {
    if(state.saving || !confirmDiscard()) return;
    state.requestId++;
    state.activePath=null; state.activeSha=null; state.hasDocument=true;
    $("docTitle").value=""; $("docCategory").value="开发笔记"; $("docTags").value="";
    $("docDate").value=today(); $("docStatus").value="draft";
    $("markdownInput").value="## 问题\n\n描述这次遇到的问题。\n\n## 解决过程\n\n## 结果与复盘\n";
    $("editorFile").textContent="新笔记 / 尚未保存";
    $("saveHint").textContent="为笔记填写标题，保存后即可在索引中找到。";
    setDirty(true); setView("edit"); $("documentProperties").open=true;
    updatePreview(); renderDocList(); scrollToDocument(); $("docTitle").focus({preventScroll:true});
  }
  async function authFetch(path,init={}) {
    if(typeof window.apexAuthFetch!=="function") throw new Error("同步服务未加载，请刷新页面。");
    const response=await window.apexAuthFetch(path,init);
    if(response.status===401) throw new Error("请先登录。");
    return response;
  }
  async function loadDocuments({selectInitial=true}={}) {
    try {
      const response=await authFetch(API);
      if(!response.ok) throw new Error(`文档索引读取失败（${response.status}）`);
      const data=await response.json();
      state.docs=(Array.isArray(data.documents) ? data.documents : []).sort((a,b)=>String(b.date || "").localeCompare(String(a.date || "")) || String(a.title || "").localeCompare(String(b.title || "")));
      $("archiveTotal").textContent=String(state.docs.length).padStart(2,"0");
      $("archiveCategoryCount").textContent=new Set(state.docs.map(doc=>doc.category || "其他")).size;
      $("archiveConnection").textContent="已连接"; $("archiveConnection").classList.remove("error");
      const categories=state.docs.map(doc=>doc.category || "其他");
      if(state.filter!=="全部" && !categories.includes(state.filter)) state.filter="全部";
      renderCategories(); renderIndexes(); renderDocList(); updateBanner();
      if(selectInitial && !state.hasDocument && state.docs.length) {
        const requested=state.docs.find(doc=>doc.path===params.get("doc")) || visibleDocuments()[0];
        if(requested)await openDocument(requested.path,false);
      }
    } catch(error) {
      $("archiveConnection").textContent="未连接"; $("archiveConnection").classList.add("error");
      $("docList").innerHTML=`<div class="doc-loading error">${escapeHtml(friendlyError(error))}</div>`;
    }
  }
  async function openDocument(path,shouldScroll=true) {
    if(state.saving) return;
    if(!confirmDiscard()) return;
    const requestId=++state.requestId;
    try {
      const response=await authFetch(`${API}?path=${encodeURIComponent(path)}`);
      if(!response.ok) throw new Error(`文档读取失败（${response.status}）`);
      const data=await response.json();
      if(requestId!==state.requestId) return;
      loadIntoEditor(data.path || path,data.content || "",data.sha || null);
      if(shouldScroll) scrollToDocument();
    } catch(error) { if(requestId===state.requestId) notify(friendlyError(error)); }
  }
  async function saveDocument() {
    if(!state.hasDocument || !state.dirty || state.saving) return;
    const title=$("docTitle").value.trim();
    if(!title) { setView("edit"); $("documentProperties").open=true; $("docTitle").focus(); return notify("请先填写笔记标题。"); }
    const content=buildMarkdown(), path=state.activePath || `docs/${slugify(title)}.md`;
    if(!state.activePath && state.docs.some(doc=>doc.path===path)) return notify("同名文件已存在，请修改标题后保存。");
    const originalPath=state.activePath;
    state.requestId++; state.saving=true; updateControls(); updateBanner();
    try {
      const response=await authFetch(API,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({path,content,sha:state.activeSha || undefined,message:`docs: ${originalPath ? "update" : "add"} ${title}`})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error || `保存失败（${response.status}）`);
      state.activePath=path; state.activeSha=data.sha || state.activeSha;
      $("editorFile").textContent=path; $("saveHint").textContent="已保存，笔记已同步。";
      setDirty(false); await loadDocuments({selectInitial:false}); notify("笔记已保存。");
    } catch(error) { $("saveHint").textContent=friendlyError(error); notify(friendlyError(error)); }
    finally { state.saving=false; updateBanner(); updateControls(); }
  }
  function renderCategories() {
    const categories=["全部",...new Set(state.docs.map(doc=>doc.category || "其他"))];
    $("categoryFilter").innerHTML=categories.map(category=>`<button class="category-chip ${state.filter===category ? "active" : ""}" type="button" data-category="${escapeHtml(category)}" aria-pressed="${state.filter===category}">${escapeHtml(category)} <small>${category==="全部"?state.docs.length:state.docs.filter(d=>(d.category||"其他")===category).length}</small></button>`).join("");
    $("categoryOptions").innerHTML=categories.filter(category=>category!=="全部").map(category=>`<option value="${escapeHtml(category)}"></option>`).join("");
  }
  function renderIndexes() {
    const tags=new Map(),months=new Map();
    state.docs.forEach(doc=>{(Array.isArray(doc.tags)?doc.tags:[]).forEach(tag=>tags.set(tag,(tags.get(tag)||0)+1));const month=String(doc.date||"").match(/^\d{4}-\d{2}/)?.[0];if(month)months.set(month,(months.get(month)||0)+1);});
    if(state.tag&&!tags.has(state.tag))state.tag="";
    if(state.month&&!months.has(state.month))state.month="";
    $("tagFilter").innerHTML=[...tags].sort((a,b)=>b[1]-a[1]).map(([tag,count])=>`<button type="button" class="category-chip ${state.tag===tag?"active":""}" data-tag="${escapeHtml(tag)}" aria-pressed="${state.tag===tag}">#${escapeHtml(tag)} <small>${count}</small></button>`).join("") || '<span class="index-empty">暂无标签</span>';
    $("monthFilter").innerHTML='<option value="">全部月份</option>'+[...months].sort((a,b)=>b[0].localeCompare(a[0])).map(([month,count])=>`<option value="${month}">${month} / ${count} 篇</option>`).join("");$("monthFilter").value=state.month;
  }
  function visibleDocuments() {
    const query=state.query.trim().toLowerCase();
    const docs=state.docs.filter(doc=>(state.filter==="全部" || (doc.category || "其他")===state.filter) && (!state.tag || (doc.tags || []).includes(state.tag)) && (!state.month || String(doc.date||"").startsWith(state.month)) && (!query || `${doc.title} ${doc.category} ${(doc.tags || []).join(" ")} ${doc.path}`.toLowerCase().includes(query)));
    if(state.sort==="oldest") docs.reverse();
    if(state.sort==="title") docs.sort((a,b)=>String(a.title||"").localeCompare(String(b.title||""),"zh-CN"));
    return docs;
  }
  function renderDocList() {
    const docs=visibleDocuments();
    $("activeFilters").textContent=[state.filter!=="全部"?state.filter:"",state.tag?`#${state.tag}`:"",state.month].filter(Boolean).join(" / ") || "全部笔记";
    $("clearFilters").hidden=!(state.query || state.tag || state.month || state.filter!=="全部");
    $("catalogCount").textContent=String(docs.length).padStart(2,"0");
    $("docList").innerHTML=docs.length ? docs.map(doc=>{
      const title=doc.title || doc.path.split("/").pop();
      const number=String(state.docs.indexOf(doc)+1).padStart(2,"0");
      return `<article class="doc-item ${state.activePath===doc.path ? "active" : ""}"><button class="doc-select" data-path="${escapeHtml(doc.path)}" type="button" aria-pressed="${state.activePath===doc.path}" ${state.saving ? "disabled" : ""}><span class="doc-item-number">${number}</span><span class="doc-item-title">${escapeHtml(title)}</span><span class="doc-item-meta"><span class="doc-item-state">${statusText(doc.status)}</span>${escapeHtml(doc.date || "未标注日期")}<br>${escapeHtml(doc.category || "其他")}</span></button><a class="doc-reader-action" href="reader.html?doc=${encodeURIComponent(doc.path)}" aria-label="独立阅读：${escapeHtml(title)}">↗</a></article>`;
    }).join("") : `<div class="doc-loading">${state.docs.length ? "没有匹配的笔记，试试其他关键词。" : "还没有笔记。点击上方「新建笔记」开始写。"}</div>`;
  }
  async function importMarkdown(file) {
    if(state.saving || !file || !confirmDiscard()) return;
    const requestId=++state.requestId;
    try {
      const content=await file.text(), {meta,body}=parseFrontMatter(content);
      if(state.saving || requestId!==state.requestId) return;
      state.requestId++; state.activePath=null; state.activeSha=null; state.hasDocument=true;
      $("docTitle").value=meta.title || file.name.replace(/\.(markdown?|md)$/i,"");
      $("docCategory").value=meta.category || "其他"; $("docTags").value=Array.isArray(meta.tags) ? meta.tags.join(", ") : meta.tags || "";
      $("docDate").value=meta.date || today(); $("docStatus").value=["draft","published","archived"].includes(meta.status) ? meta.status : "draft";
      $("markdownInput").value=body.trimStart(); $("editorFile").textContent=file.name;
      $("saveHint").textContent="文档已导入，保存后将创建新笔记。";
      setDirty(true); setView("edit"); $("documentProperties").open=true;
      updatePreview(); renderDocList(); scrollToDocument(); notify("文档已导入，等待保存。");
    } catch(error) { notify(friendlyError(error)); }
  }
  async function renameDocument() {
    if(state.saving || !state.activePath || state.dirty) return;
    const current=state.activePath, next=`docs/${slugify($("docTitle").value.trim())}.md`;
    if(next===current) return notify("文件名与标题一致，无需重命名。");
    if(state.docs.some(doc=>doc.path===next)) return notify("目标文件名已存在。");
    if(!confirm(`将文件重命名为 ${next.split("/").pop()}？`)) return;
    state.requestId++; state.saving=true; updateControls(); updateBanner();
    try {
      const response=await authFetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"rename",from:current,to:next,sha:state.activeSha,message:`docs: rename ${current} to ${next}`})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error || `重命名失败（${response.status}）`);
      state.activePath=next; state.activeSha=data.sha || null; $("editorFile").textContent=next;
      await loadDocuments({selectInitial:false}); notify("文件已重命名。");
    } catch(error) { notify(friendlyError(error)); }
    finally { state.saving=false; updateBanner(); updateControls(); $("docMore").open=false; }
  }
  async function deleteDocument() {
    if(state.saving || !state.activePath || state.dirty || !confirm(`删除「${$("docTitle").value}」？同步后的笔记也会删除。`)) return;
    const path=state.activePath;
    let deleted=false;
    state.requestId++; state.saving=true; updateControls(); updateBanner();
    try {
      const response=await authFetch(API,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:state.activePath,sha:state.activeSha,message:`docs: delete ${state.activePath}`})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error || `删除失败（${response.status}）`);
      state.docs=state.docs.filter(doc=>doc.path!==path);
      state.activePath=null; state.activeSha=null; state.hasDocument=false; state.requestId++;
      $("documentHeading").textContent="选择一篇笔记"; $("documentCode").textContent="RECORD / —"; $("documentSubline").textContent="从列表中选择笔记，或新建一篇。"; $("editorFile").textContent="未选择文档"; $("editorState").textContent="待选择"; $("wordCount").textContent="0 字符";
      updateControls(); await loadDocuments({selectInitial:false}); deleted=true; notify("笔记已删除。");
    } catch(error) { notify(friendlyError(error)); }
    finally { state.saving=false; updateBanner(); updateControls(); $("docMore").open=false; }
    if(deleted && state.docs.length) await openDocument(state.docs[0].path,false);
  }
  function bind() {
    $("exportDocBtn").addEventListener("click",()=>{if(state.hasDocument)window.archiveMarkdown.download(buildMarkdown(),`${slugify($("docTitle").value)}.md`);});
    $("docSort").addEventListener("change",event=>{state.sort=event.target.value;renderDocList();});
    $("clearFilters").addEventListener("click",()=>{state.query="";state.tag="";state.month="";state.filter="全部";$("docSearch").value="";renderCategories();renderIndexes();renderDocList();});
    $("tagFilter").addEventListener("click",event=>{const button=event.target.closest("[data-tag]");if(!button)return;state.tag=state.tag===button.dataset.tag?"":button.dataset.tag;renderIndexes();renderDocList();});
    $("monthFilter").addEventListener("change",event=>{state.month=event.target.value;renderDocList();});
    window.addEventListener("blog:beforelogout",event=>{if(state.saving || !confirmDiscard())event.preventDefault();});
    $("newDocBtn").addEventListener("click",newDocument); $("saveDocBtn").addEventListener("click",saveDocument);
    $("renameDocBtn").addEventListener("click",renameDocument); $("deleteDocBtn").addEventListener("click",deleteDocument);
    $("importBtn").addEventListener("click",()=>$("fileInput").click());
    $("fileInput").addEventListener("change",event=>{ importMarkdown(event.target.files?.[0]); event.target.value=""; });
    $("docSearch").value=state.query;
    $("catalogToggle").addEventListener("click",()=>{
      const open=document.querySelector(".doc-sidebar").classList.toggle("catalog-expanded");
      $("catalogToggle").setAttribute("aria-expanded",String(open));
      $("catalogToggle").textContent=open ? "收起索引 −" : "切换笔记 ＋";
    });
    $("docSearch").addEventListener("input",event=>{state.query=event.target.value;renderDocList();});
    $("categoryFilter").addEventListener("click",event=>{const button=event.target.closest("[data-category]");if(!button)return;state.filter=button.dataset.category;renderCategories();renderDocList();});
    $("docList").addEventListener("click",event=>{const button=event.target.closest("[data-path]");if(button)openDocument(button.dataset.path);});
    $("markdownInput").addEventListener("input",()=>{setDirty(true);updatePreview();});
    ["docTitle","docCategory","docTags","docDate","docStatus"].forEach(id=>$(id).addEventListener("input",()=>{setDirty(true);updatePreview();}));
    document.querySelectorAll(".view-switch button").forEach(button=>button.addEventListener("click",()=>setView(button.dataset.view)));
    document.addEventListener("keydown",event=>{
      if((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==="k") {
        event.preventDefault();
        if(matchMedia("(max-width:720px)").matches && $("catalogToggle").getAttribute("aria-expanded")==="false") $("catalogToggle").click();
        $("docSearch").focus();
      }
      if((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==="s") {event.preventDefault();saveDocument();}
      if(event.key==="Escape") $("docMore").open=false;
    });
    window.addEventListener("beforeunload",event=>{if(state.dirty){event.preventDefault();event.returnValue="";}});
    updateControls();
  }
  window.loadGithub=()=>loadDocuments();
  document.addEventListener("DOMContentLoaded",()=>{bind();loadDocuments();});
})();
