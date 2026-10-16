/* Private document metadata is fetched only for an authenticated session. */
(() => {
  const holder=document.getElementById('recentDocuments');if(!holder)return;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let loading=false,loaded=false;
  function state(message,action){holder.innerHTML='';const box=document.createElement('div');box.className='recent-state';const text=document.createElement('p');text.textContent=message;box.append(text);if(action){const button=document.createElement('button');button.className='outline-button';button.type='button';button.textContent=action.label;button.onclick=action.run;box.append(button);}holder.append(box);}
  async function refresh(){
    if(!window.blogAuth.authenticated){window.blogSearchDocuments=[];const results=document.getElementById('searchResults');results.hidden=true;results.innerHTML='';document.getElementById('recentStats').textContent='PRIVATE COLLECTION';state('笔记暂时仅供自己查看，登录后可以阅读。',{label:'登录查看笔记',run:()=>window.blogAuth.open()});return;}
    if(loading)return;loading=true;state('正在读取最近的笔记…');
    try{
      const response=await window.apexAuthFetch('/documents');if(!response.ok)throw new Error(response.status===401?'登录已过期，请重新登录。':'暂时无法读取文章索引。');
      const data=await response.json();const docs=(data.documents||[]).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(a.title||'').localeCompare(String(b.title||'')));
      if(!window.blogAuth.authenticated)return;
      window.blogSearchDocuments=docs;
      document.getElementById('recentStats').textContent=`${docs.length} 篇笔记 / ${new Set(docs.map(d=>d.category||'其他')).size} 个分类`;
      if(!docs.length){state('还没有笔记。可以新建一篇，或者导入 Markdown 文件。',{label:'前往技术笔记',run:()=>location.href='dev/index.html'});return;}
      holder.innerHTML=docs.slice(0,4).map((doc,i)=>`<a class="recent-document" href="dev/reader.html?doc=${encodeURIComponent(doc.path)}"><span class="recent-number">${String(i+1).padStart(2,'0')}</span><span><small>${escape(doc.category||'其他')} <span>/</span> ${escape(doc.date||'未标注日期')}</small><h3>${escape(doc.title||doc.path.split('/').pop())}</h3><span class="recent-tags">${(Array.isArray(doc.tags)?doc.tags:[]).slice(0,3).map(t=>`#${escape(t)}`).join('　')}</span></span><span aria-hidden="true">↗</span></a>`).join('');
    }catch(error){state(error.message==='Failed to fetch'?'暂时无法加载笔记，请稍后重试。':error.message,{label:'重新读取',run:refresh});}
    finally{loading=false;}
  }
  window.blogAuth.ready.then(()=>{loaded=true;refresh();});
  window.addEventListener('blog:authchange',()=>{if(loaded)refresh();});
  window.loadGithub=refresh;
  document.getElementById('recentLogin')?.addEventListener('click',()=>window.blogAuth.open());
  const audio=document.getElementById('localAudio'),fileInput=document.getElementById('localMusic');
  document.getElementById('chooseMusic')?.addEventListener('click',()=>fileInput.click());
  let audioUrl;
  fileInput?.addEventListener('change',()=>{
    const file=fileInput.files?.[0];if(!file)return;
    if(file.type&&!file.type.startsWith('audio/')){document.getElementById('musicStatus').textContent='请选择音频文件。';return;}
    audio.pause();audio.removeAttribute('src');if(audioUrl)URL.revokeObjectURL(audioUrl);
    audioUrl=URL.createObjectURL(file);audio.src=audioUrl;audio.hidden=false;
    document.getElementById('musicStatus').textContent=`${file.name} · 仅在本机播放`;
    audio.play().catch(()=>{});
  });
  const musicCard=document.getElementById('music');
  audio?.addEventListener('playing',()=>musicCard.classList.add('is-playing'));
  for(const event of ['pause','ended','waiting','emptied'])audio?.addEventListener(event,()=>musicCard.classList.remove('is-playing'));
  audio?.addEventListener('error',()=>{musicCard.classList.remove('is-playing');document.getElementById('musicStatus').textContent='浏览器无法播放此音频，请选择 MP3、WAV 等支持的格式。';});
  window.addEventListener('pagehide',event=>{if(audioUrl&&!event.persisted)URL.revokeObjectURL(audioUrl);});
})();
