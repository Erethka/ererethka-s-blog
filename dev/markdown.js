/* One renderer for the editor and reading room. Raw HTML stays disabled. */
(() => {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const md = window.markdownit({html:false,linkify:true,breaks:false});
  md.core.ruler.push('archive_headings', state => {
    const used = new Map(); state.env.headings = [];
    state.tokens.forEach((token,i) => {
      if(token.type !== 'heading_open') return;
      const inline=state.tokens[i+1];
      const text=(inline.children || []).map(t=>t.type==='text'||t.type==='code_inline'?t.content:t.type==='image'?t.content:'').join('');
      const base=text.toLowerCase().replace(/[^\w\u4e00-\u9fff-]+/g,'-').replace(/^-+|-+$/g,'') || 'section';
      const count=(used.get(base)||0)+1; used.set(base,count);
      const id=count===1?base:`${base}-${count}`;
      token.attrSet('id',id); state.tokens[i+2].meta={id};
      state.env.headings.push({n:Number(token.tag.slice(1)),text,id});
    });
    // Checkboxes are generated from parsed plain text, never from document HTML.
    state.tokens.forEach((token,i) => {
      if(token.type!=='inline'||state.tokens[i-1]?.type!=='paragraph_open'||!token.children?.length) return;
      const first=token.children[0], match=first.type==='text'&&first.content.match(/^\[([ xX])\]\s+/);
      if(!match) return;
      first.content=first.content.slice(match[0].length);
      const box=new state.Token('html_inline','',0); box.content=`<input type="checkbox" disabled aria-label="${match[1]===' '?'未完成':'已完成'}"${match[1]===' '?'':' checked'}>`;
      token.children.unshift(box);
    });
  });
  const closeHeading=md.renderer.rules.heading_close || ((tokens,i,options,env,self)=>self.renderToken(tokens,i,options));
  md.renderer.rules.heading_close=(tokens,i,options,env,self)=>` <a class="reader-anchor" href="#${escape(tokens[i].meta.id)}" aria-label="定位此节">#</a>${closeHeading(tokens,i,options,env,self)}`;
  const linkOpen=md.renderer.rules.link_open || ((tokens,i,options,env,self)=>self.renderToken(tokens,i,options));
  md.renderer.rules.link_open=(tokens,i,options,env,self)=>{
    const token=tokens[i], href=token.attrGet('href') || '';
    if(/^https?:/i.test(href)){token.attrSet('target','_blank');token.attrSet('rel','noopener noreferrer');}
    else if(/\.md(?:#.*)?$/i.test(href)&&!href.startsWith('//')){
      const url=new URL(href,`https://archive.invalid/${env.path || 'docs/note.md'}`);
      if(url.origin==='https://archive.invalid'&&url.pathname.startsWith('/docs/')) token.attrSet('href',`reader.html?doc=${encodeURIComponent(url.pathname.slice(1))}${url.hash}`);
    }
    return linkOpen(tokens,i,options,env,self);
  };
  const image=md.renderer.rules.image;
  md.renderer.rules.image=(tokens,i,options,env,self)=>{tokens[i].attrSet('loading','lazy');tokens[i].attrSet('referrerpolicy','no-referrer');return image(tokens,i,options,env,self);};
  const render=(source,path)=>{
    const env={path}; const html=md.render(String(source||''),env);
    return {html,headings:env.headings || []};
  };
  function enhance(container){
    container.querySelectorAll('table').forEach(table=>{const wrapper=document.createElement('div');wrapper.className='markdown-table';wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label','表格，可横向滚动');table.replaceWith(wrapper);wrapper.append(table);});
    container.querySelectorAll('pre').forEach(pre=>{
      const code=pre.querySelector('code');if(!code)return;
      const bar=document.createElement('div');bar.className='code-tools';
      const language=document.createElement('span');language.textContent=(code.className.match(/language-([\w+-]+)/)||[])[1]||'TEXT';
      const copy=document.createElement('button');copy.type='button';copy.textContent='复制代码';
      copy.onclick=async()=>{try{await navigator.clipboard.writeText(code.textContent);copy.textContent='已复制';setTimeout(()=>copy.textContent='复制代码',1800);}catch{copy.textContent='复制失败，请选择代码复制';}};
      bar.append(language,copy);pre.before(bar);
    });
  }
  function download(content,name){const url=URL.createObjectURL(new Blob([content],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  window.archiveMarkdown={render,enhance,download};
})();
