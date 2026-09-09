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
  const inline = (s) => String(s).replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/__([^_]+)__/g,"<strong>$1</strong>").replace(/\*([^*]+)\*/g,"<em>$1</em>").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,t,u)=>`<a href="${safeUrl(u)}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  function renderMarkdown(source){
    const lines=escapeHtml(source||"").split("\n"), headings=[], out=[]; let code=false, lang="", buf=[], list=null;
    const close=()=>{if(list){out.push(list==="ol"?"</ol>":"</ul>");list=null;}};
    for(const line of lines){
      const fence=line.match(/^```\s*([\w+-]*)\s*$/);
      if(fence){if(code){out.push(`<pre><code class="language-${escapeHtml(lang)}">${buf.join("\n")}</code></pre>`);buf=[];code=false;lang="";}else{close();code=true;lang=fence[1]||"text";}continue;}
      if(code){buf.push(line);continue;}
      if(!line.trim()){close();continue;}
      const h=line.match(/^(#{1,6})\s+(.+)$/); if(h){close();const n=h[1].length,text=h[2].replace(/\s+#+\s*$/,""),base=slugify(text),id=base+(headings.filter(x=>x.base===base).length?`-${headings.filter(x=>x.base===base).length+1}`:"");headings.push({n,text,base,id});out.push(`<h${n} id="${id}">${inline(text)} <a class="reader-anchor" href="#${id}" aria-label="复制此节链接">#</a></h${n}>`);continue;}
      if(/^\d+\.\s+/.test(line)){if(list!=="ol"){close();out.push("<ol>");list="ol";}out.push(`<li>${inline(line.replace(/^\d+\.\s+/,""))}</li>`);continue;}
      if(/^[-*]\s+/.test(line)){if(list!=="ul"){close();out.push("<ul>");list="ul";}out.push(`<li>${inline(line.replace(/^[-*]\s+/,""))}</li>`);continue;}
      if(/^>\s?/.test(line)){close();out.push(`<blockquote>${inline(line.replace(/^>\s?/,""))}</blockquote>`);continue;}
      if(/^---+$/.test(line.trim())){close();out.push("<hr>");continue;}
      close();out.push(`<p>${inline(line)}</p>`);
    }
    if(code)out.push(`<pre><code class="language-${escapeHtml(lang)}">${buf.join("\n")}</code></pre>`);close();
    return {html:out.join("\n"),headings};
  }
  async function authFetch(path,init={}){if(typeof window.apexAuthFetch!=="function")throw new Error("安全代理未加载，请返回知识库重新登录");const r=await window.apexAuthFetch(path,init);if(r.status===401)throw new Error("登录已过期，请重新验证身份");return r;}
  function readerUrl(path){return `./reader.html?doc=${encodeURIComponent(path)}`;}
  function setNav(el,path,title){if(!path){el.classList.add("disabled");el.removeAttribute("href");el.querySelector("strong").textContent="没有了";return;}el.href=readerUrl(path);el.querySelector("strong").textContent=title||path.split("/").pop();}
  async function main(){
    const path=new URLSearchParams(location.search).get("doc");
    if(!path||!/^docs\/[A-Za-z0-9._/-]+\.md$/i.test(path)||path.includes("..")||path.includes("\\")){return fail("文档地址无效。请从知识库列表进入文档。");}
    try{
      const listRes=await authFetch(API); if(!listRes.ok)throw new Error(`文档列表读取失败（${listRes.status}）`); const list=await listRes.json(); const docs=Array.isArray(list.documents)?list.documents:[];
      const idx=docs.findIndex(d=>d.path===path); if(idx<0)throw new Error("找不到这篇技术记录。");
      const res=await authFetch(`${API}?path=${encodeURIComponent(path)}`); if(!res.ok)throw new Error(`文档读取失败（${res.status}）`); const data=await res.json(); const {meta,body}=parseFrontMatter(data.content||"");
      const title=meta.title||data.path.split("/").pop().replace(/\.md$/i,""); document.title=`${title} · Erethka`; $("docTitle").textContent=title;
      const tags=Array.isArray(meta.tags)?meta.tags:(meta.tags?[meta.tags]:[]); $("docMeta").textContent=[meta.category||"其他",meta.status==="published"?"正式":meta.status==="archived"?"归档":"草稿",meta.date||""].filter(Boolean).join(" · ");
      $("docTags").innerHTML=tags.map(t=>`<a class="reader-tag" href="./index.html?tag=${encodeURIComponent(t)}">#${escapeHtml(t)}</a>`).join("");
      const rendered=renderMarkdown(body); $("articleBody").innerHTML=rendered.html;
      $("toc").innerHTML=rendered.headings.filter(h=>h.n<=3).map(h=>`<a class="toc-h${h.n}" href="#${h.id}">${escapeHtml(h.text)}</a>`).join("")||"<span style=\"opacity:.5\">暂无目录</span>";
      const tagSet=[...new Set(docs.flatMap(d=>Array.isArray(d.tags)?d.tags:(d.tags?[d.tags]:[])))]; $("tagIndex").innerHTML=tagSet.length?tagSet.map(t=>`<a class="reader-tag" href="./index.html?tag=${encodeURIComponent(t)}">#${escapeHtml(t)}</a>`).join(""):"<span style=\"opacity:.5\">暂无标签</span>";
      setNav($("prevDoc"),idx>0?docs[idx-1].path:null,idx>0?docs[idx-1].title:null); setNav($("nextDoc"),idx<docs.length-1?docs[idx+1].path:null,idx<docs.length-1?docs[idx+1].title:null);
      $("editLink").href=`./index.html?doc=${encodeURIComponent(path)}`; $("readerState").hidden=true; $("readerLayout").hidden=false;
    }catch(e){fail(e.message);}
  }
  function fail(msg){$("readerState").textContent=msg;$("readerState").classList.add("error");$("readerLayout").hidden=true;}
  main();
})();
