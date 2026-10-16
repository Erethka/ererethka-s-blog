(() => {
  const API = "/documents";
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const safeUrl = (v) => /^(https?:\/\/)/i.test(String(v || "")) ? String(v) : "#";
  const slugify = (v) => String(v || "section").trim().toLowerCase().replace(/[^\w\u4e00-\u9fff-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80) || "section";
  const parseFrontMatter = (md) => {
    const m = String(md || "").match(/^---\s*\n([\s\S]*?)\n---\s*\n?/); if (!m) return {meta:{},body:String(md||"")};
    const meta = {};
    m[1].split(/\r?\n/).forEach(line => { const x=line.match(/^([A-Za-z][\w-]*):\s*(.*)$/); if(!x)return; let v=x[2].trim(); if((v.startsWith("\"")&&v.endsWith("\""))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1); if(v.startsWith("[")&&v.endsWith("]"))v=v.slice(1,-1).split(",").map(s=>s.trim().replace(/^['\"]|['\"]$/g,"")).filter(Boolean); meta[x[1]]=v; });
    return {meta,body:String(md||"").slice(m[0].length)};
  };
  async function authFetch(path,init={}){if(typeof window.apexAuthFetch!=="function")throw new Error("安全代理未加载，请返回知识库重新登录");const r=await window.apexAuthFetch(path,init);if(r.status===401)throw new Error("登录已过期，请重新验证身份");return r;}
  function readerUrl(path){return `./reader.html?doc=${encodeURIComponent(path)}`;}
  function setNav(el,path,title){if(!path){el.classList.add("disabled");el.setAttribute("aria-disabled","true");el.removeAttribute("href");el.querySelector("strong").textContent="没有了";return;}el.classList.remove("disabled");el.removeAttribute("aria-disabled");el.href=readerUrl(path);el.querySelector("strong").textContent=title||path.split("/").pop();}
  async function main(){
    const path=new URLSearchParams(location.search).get("doc");
    if(!path||!/^docs\/[A-Za-z0-9\u4e00-\u9fff._/-]+\.md$/i.test(path)||path.includes("..")||path.includes("\\")){return fail("文档地址无效。请从文档索引进入记录。",false);}
    try{
      const listRes=await authFetch(API); if(!listRes.ok)throw new Error(`文档列表读取失败（${listRes.status}）`); const list=await listRes.json(); const docs=(Array.isArray(list.documents)?list.documents:[]).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))||String(a.title||"").localeCompare(String(b.title||"")));
      const idx=docs.findIndex(d=>d.path===path); if(idx<0)throw new Error("找不到这篇技术记录。");
      const res=await authFetch(`${API}?path=${encodeURIComponent(path)}`); if(!res.ok)throw new Error(`文档读取失败（${res.status}）`); const data=await res.json(); const {meta,body}=parseFrontMatter(data.content||"");
      const title=meta.title||(data.path||path).split("/").pop().replace(/\.md$/i,""); document.title=`${title} · Erethka`; $("docTitle").textContent=title;
      const tags=Array.isArray(meta.tags)?meta.tags:(meta.tags?[meta.tags]:[]); $("docMeta").textContent=[meta.category||"其他",meta.status==="published"?"正式":meta.status==="archived"?"归档":"草稿",meta.date||""].filter(Boolean).join(" · ");
      $("docTags").innerHTML=tags.map(t=>`<a class="reader-tag" href="./index.html?tag=${encodeURIComponent(t)}">#${escapeHtml(t)}</a>`).join("");
      const first=body.match(/^\s*#\s+([^\n]+)\n*/);
      const article=first&&first[1].trim()===title ? body.slice(first[0].length) : body;
      const rendered=window.archiveMarkdown.render(article,path); $("articleBody").innerHTML=rendered.html;window.archiveMarkdown.enhance($("articleBody"));
      const words=article.replace(/```[\s\S]*?```/g,"").replace(/[#*_|>]/g,"").replace(/\s/g,"").length;
      $("readingStats").textContent=`${words.toLocaleString("zh-CN")} 字 / 约 ${Math.max(1,Math.ceil(words/400))} 分钟`;
      $("downloadDoc").onclick=()=>window.archiveMarkdown.download(data.content,`${title.replace(/[<>:\"/\\|?*]/g,"-")}.md`);
      $("printDoc").onclick=()=>window.print();
      $("toc").innerHTML=rendered.headings.filter(h=>h.n<=3).map(h=>`<a class="toc-h${h.n}" href="#${h.id}">${escapeHtml(h.text)}</a>`).join("")||"<span style=\"opacity:.5\">暂无目录</span>";
      const tagSet=[...new Set(docs.flatMap(d=>Array.isArray(d.tags)?d.tags:(d.tags?[d.tags]:[])))]; $("tagIndex").innerHTML=tagSet.length?tagSet.map(t=>`<a class="reader-tag" href="./index.html?tag=${encodeURIComponent(t)}">#${escapeHtml(t)}</a>`).join(""):"<span style=\"opacity:.5\">暂无标签</span>";
      setNav($("prevDoc"),idx>0?docs[idx-1].path:null,idx>0?docs[idx-1].title:null); setNav($("nextDoc"),idx<docs.length-1?docs[idx+1].path:null,idx<docs.length-1?docs[idx+1].title:null);
      $("editLink").href=`./index.html?doc=${encodeURIComponent(path)}`; $("readerState").hidden=true; $("readerLayout").hidden=false;
      if(location.hash){try{document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();}catch{}}
      requestAnimationFrame(updateReading);
    }catch(e){fail(e.message);}
  }
  function fail(msg,retry=true){
    const state=$("readerState");state.textContent="";
    const message=document.createElement("p");message.textContent=/failed to fetch|networkerror|load failed/i.test(msg)?"暂时无法连接私人档案，请稍后重试。":msg;
    const actions=document.createElement("div");actions.className="reader-error-actions";
    const back=document.createElement("a");back.href="index.html";back.textContent="返回文档索引 ↗";actions.append(back);
    if(retry){const button=document.createElement("button");button.type="button";button.textContent="重新读取";button.onclick=main;actions.append(button);}
    state.append(message,actions);state.hidden=false;state.classList.add("error");$("readerLayout").hidden=true;
  }

  let ticking=false;
  function updateReading(){
    ticking=false;const article=$("readerLayout");if(article.hidden)return;
    const top=article.getBoundingClientRect().top+scrollY-100,total=article.offsetHeight-innerHeight+100;
    const value=Math.round(Math.min(1,Math.max(0,total>0?(scrollY-top)/total:1))*100);
    $("readingProgress").value=value;$("readingProgress").setAttribute("aria-label",`阅读进度 ${value}%`);
    const links=[...$("toc").querySelectorAll("a")];let current=links[0];
    links.forEach(link=>{const heading=document.getElementById(decodeURIComponent(link.hash.slice(1)));if(heading&&heading.getBoundingClientRect().top<=150)current=link;});
    links.forEach(link=>{link.classList.toggle("active",link===current);if(link===current)link.setAttribute("aria-current","location");else link.removeAttribute("aria-current");});
  }
  window.addEventListener("scroll",()=>{if(!ticking){ticking=true;requestAnimationFrame(updateReading);}},{passive:true});window.addEventListener("resize",updateReading);
  window.loadGithub=main;
  main();
})();
