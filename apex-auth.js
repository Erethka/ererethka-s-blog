/* Shared session controls for the private archive. No credentials are persisted. */
(() => {
  const API_BASE='https://ererethka-apex-auth.erethka.workers.dev';
  const originalFetch=window.fetch.bind(window);
  const state={authenticated:false,modal:null,returnFocus:null,inert:[],overflow:''};
  let resolveReady;
  const ready=new Promise(resolve=>resolveReady=resolve);
  const api=path=>`${API_BASE}${path}`;
  function announce(){
    document.querySelectorAll('[data-auth-action]').forEach(button=>{button.textContent=state.authenticated?'退出登录':'登录档案';button.setAttribute('aria-label',button.textContent);});
    window.dispatchEvent(new CustomEvent('blog:authchange',{detail:{authenticated:state.authenticated}}));
  }
  function close(){
    if(!state.modal||state.modal.hidden)return;
    state.modal.hidden=true;state.modal.setAttribute('aria-hidden','true');
    state.inert.forEach(([element,inert])=>element.inert=inert);state.inert=[];
    document.body.style.overflow=state.overflow;state.returnFocus?.focus();
  }
  function open(message=''){
    if(!state.modal)buildModal();
    if(state.modal.hidden){
      state.returnFocus=document.activeElement;state.overflow=document.body.style.overflow;
      state.inert=[...document.body.children].filter(e=>e!==state.modal&&e.tagName!=='SCRIPT'&&e.tagName!=='STYLE').map(e=>[e,e.inert]);
      state.inert.forEach(([e])=>e.inert=true);document.body.style.overflow='hidden';
    }
    state.modal.hidden=false;state.modal.setAttribute('aria-hidden','false');
    document.getElementById('apexAuthStatus').textContent=message;
    document.getElementById('apexAuthPassword').focus();
  }
  async function logout(){
    if(!window.dispatchEvent(new Event('blog:beforelogout',{cancelable:true})))return;
    const button=document.querySelector('[data-auth-action]');if(button)button.disabled=true;
    try{
      const response=await originalFetch(api('/logout'),{method:'POST',credentials:'include'});
      if(!response.ok)throw new Error('退出未完成，请稍后重试。');
      state.authenticated=false;
      try{localStorage.removeItem('neon-drop-records-v3');}catch{}
      announce();location.reload();
    }catch(error){open(/failed to fetch/i.test(error.message)?'暂时无法连接登录服务，请稍后重试。':error.message);}
    finally{if(button)button.disabled=false;}
  }
  window.apexAuthFetch=async(path,init={})=>{
    const response=await originalFetch(api(path),{...init,credentials:'include',cache:'no-store'});
    if(response.status===401){state.authenticated=false;announce();if(!document.body.hasAttribute('data-auth-optional'))open('请登录后继续访问私人档案。');}
    return response;
  };
  window.blogAuth={ready,open,close,logout,get authenticated(){return state.authenticated;}};
  function buildModal(){
    const apex=document.body.dataset.route==='apex';
    const modal=document.createElement('div');modal.id='apexAuthModal';modal.hidden=true;modal.setAttribute('aria-hidden','true');
    modal.innerHTML=`<section class="apex-auth-card" role="dialog" aria-modal="true" aria-labelledby="apexAuthTitle"><button type="button" class="auth-close" aria-label="关闭登录窗口">×</button><div class="apex-auth-lock" aria-hidden="true">△</div><div class="apex-auth-kicker">ERE / PRIVATE ARCHIVE</div><h2 id="apexAuthTitle">${apex?'登录开箱记录':'进入私人档案'}</h2><p class="apex-auth-copy">输入博客密码，继续${apex?'查看与同步开箱记录':'阅读与整理技术记录'}。</p><form id="apexAuthForm"><label for="apexAuthPassword">登录密码<input id="apexAuthPassword" type="password" autocomplete="current-password" required placeholder="输入密码"></label><div class="apex-auth-actions"><button class="apex-auth-submit" type="submit">登录档案</button></div><p class="apex-auth-status" id="apexAuthStatus" role="status" aria-live="polite"></p></form><p class="auth-footnote">私人内容仅在登录后显示。按 ESC 返回页面。</p></section>`;
    document.body.append(modal);state.modal=modal;
    modal.querySelector('.auth-close').onclick=close;
    modal.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Tab'){
        const items=[...modal.querySelectorAll('button,input')].filter(e=>!e.disabled),first=items[0],last=items.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    });
    modal.querySelector('form').onsubmit=async event=>{
      event.preventDefault();const button=modal.querySelector('[type=submit]'),input=document.getElementById('apexAuthPassword'),status=document.getElementById('apexAuthStatus');
      button.disabled=true;status.textContent='正在验证…';
      try{
        const response=await originalFetch(api('/login'),{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:input.value})});
        const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'登录未完成，请稍后重试。');
        const session=await originalFetch(api('/session'),{credentials:'include',cache:'no-store'});
        if(!session.ok||!(await session.json()).authenticated)throw new Error('浏览器未能保存登录会话。请允许此站点的跨站 Cookie 后重试。');
        state.authenticated=true;input.value='';close();announce();
        if(typeof window.loadGithub==='function')window.loadGithub();
      }catch(error){status.textContent=/failed to fetch|networkerror/i.test(error.message)?'暂时无法连接登录服务，请稍后重试。':error.message;}
      finally{button.disabled=false;}
    };
  }
  async function bootstrap(){
    [document.querySelector('.nav-actions'),document.getElementById('mobileLinks')].filter(Boolean).forEach(actions=>{
      if(actions.querySelector('[data-auth-action]'))return;
      const button=document.createElement('button');button.className='session-button';button.type='button';button.dataset.authAction='';button.onclick=()=>state.authenticated?logout():open();actions.append(button);
    });
    try{const response=await originalFetch(api('/session'),{credentials:'include',cache:'no-store'});state.authenticated=response.ok&&Boolean((await response.json()).authenticated);}catch{}
    announce();resolveReady(state.authenticated);
    if(!state.authenticated&&!document.body.hasAttribute('data-auth-optional'))open();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap,{once:true});else bootstrap();
})();
