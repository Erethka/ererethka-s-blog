/* Graphic motion follows native scrolling. Content remains available without JS. */
(() => {
  const root=document.documentElement;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const sceneNodes=[...document.querySelectorAll('[data-scroll-scene]')];
  const nav=document.querySelector('.site-nav,.photo-nav');
  const main=document.querySelector('main');
  let observer,frame=0,enabled=false;
  const reveals=new Set();
  const clamp=value=>Math.min(1,Math.max(0,value));
  const home=document.body.dataset.route==='home';
  const explore=document.body.dataset.route==='explore';
  const selectors=home?'.home-heading,.profile-panel,.cover-copy,.section-heading,.destination-card,.photo-tile,.recent-document,.moment-card,.theme-feature,.home-music,.home-about':
    document.body.dataset.route==='photowall'?'.photo-hero-copy,.photo-hero-index,.album-card':
    document.body.dataset.route==='updates'?'.updates-masthead,.update-entry':
    document.body.dataset.route==='apex'?'.apex-heading-copy,.apex-masthead-index,.apex-section-line,.cycle-overview':
    document.body.dataset.route==='dev'?'.masthead-copy,.masthead-index,.archive-section-line':
    document.body.dataset.route==='reader'?'.reader-toolbar,.reader-header':'';
  const meter=document.createElement('div');meter.className='site-scroll-meter';meter.setAttribute('aria-hidden','true');
  if(document.body.dataset.route!=='reader')document.body.append(meter);
  let chapterLinks=[];
  if(home){
    const rail=document.createElement('nav');rail.className='scroll-compass';rail.setAttribute('aria-label','首页章节');
    [['home','首页'],['projects','快捷入口'],['recent','最近记录'],['photowall','影像选集'],['timeline','站点记录'],['about','关于']].forEach(([id,label],i)=>{
      const a=document.createElement('a');a.href=`#${id}`;a.title=label;a.setAttribute('aria-label',label);a.dataset.chapter=id;a.innerHTML=`<span>${String(i).padStart(2,'0')}</span><i></i>`;rail.append(a);
    });document.body.append(rail);
  }
  chapterLinks=[...document.querySelectorAll('[data-chapter]')];
  const chapters=chapterLinks.map(link=>({link,element:document.getElementById(link.dataset.chapter)})).filter(x=>x.element);
  function register(){
    if(selectors)document.querySelectorAll(selectors).forEach((element,index)=>{
      if(!element.hasAttribute('data-reveal'))element.dataset.reveal=element.matches('.photo-tile,.album-card')?'slice':'rise';
      element.style.setProperty('--reveal-delay',`${index%3*65}ms`);
    });
    document.querySelectorAll('[data-reveal]').forEach(element=>{
      if(reveals.has(element))return;
      reveals.add(element);
      if(!enabled||element.getBoundingClientRect().bottom<0)element.classList.add('is-revealed');
      else observer?.observe(element);
    });
  }
  function update(){
    frame=0;
    const y=scrollY,vh=innerHeight;
    const height=document.documentElement.scrollHeight-vh;
    const progress=height>0?clamp(y/height):0;
    // Read geometry before writing styles so all scenes share one layout pass.
    const scenes=enabled?sceneNodes.map(element=>({element,rect:element.getBoundingClientRect()})):[];
    // A fully clipped mask has no intersection area; use its layout box too.
    const entering=enabled?[...reveals].filter(element=>!element.classList.contains('is-revealed')).map(element=>({element,rect:element.getBoundingClientRect()})):[];
    const positions=chapters.map(item=>({...item,top:item.element.getBoundingClientRect().top}));
    let active=positions[0];positions.forEach(item=>{if(item.top<=vh*.45)active=item;});
    root.style.setProperty('--page-progress',String(progress));
    entering.forEach(({element,rect})=>{if(rect.top<vh-24&&rect.bottom>0){element.classList.add('is-revealed');observer?.unobserve(element);}});
    nav?.classList.toggle('is-scrolled',y>36);
    scenes.forEach(({element,rect})=>{
      if(rect.bottom< -100||rect.top>vh+100)return;
      const p=clamp((vh-rect.top)/(vh+rect.height));
      const travel=(p-.5)*(innerWidth>720?150:54);
      element.style.setProperty('--scene-progress',p.toFixed(4));
      element.style.setProperty('--scene-travel',`${travel.toFixed(2)}px`);
    });
    positions.forEach(item=>{
      const selected=item===active;item.link.classList.toggle('is-current',selected);
      if(selected)item.link.setAttribute('aria-current','location');else item.link.removeAttribute('aria-current');
    });
    if(explore&&active){const counter=document.getElementById('chapterCurrent'),value=active.link.dataset.number||'00';if(counter&&counter.textContent!==value)counter.textContent=value;}
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(update);}
  function configure(){
    observer?.disconnect();
    enabled=!reduced.matches&&'IntersectionObserver' in window;
    root.classList.toggle('motion-ready',enabled);
    if(enabled){
      observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
        if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}
      }),{threshold:.08,rootMargin:'0px 0px -24px 0px'});
      reveals.forEach(element=>{if(!element.classList.contains('is-revealed'))observer.observe(element);});
    }else{
      reveals.forEach(element=>element.classList.add('is-revealed'));
      sceneNodes.forEach(element=>{element.style.removeProperty('--scene-progress');element.style.removeProperty('--scene-travel');});
    }
    register();schedule();
  }
  configure();
  // Register asynchronously loaded cards without animating the editor itself.
  if(main&&selectors)new MutationObserver(()=>{reveals.forEach(element=>{if(!element.isConnected){observer?.unobserve(element);reveals.delete(element);}});register();schedule();}).observe(main,{childList:true,subtree:true});
  document.addEventListener('focusin',event=>{const target=event.target.closest?.('[data-reveal]');if(target){target.classList.add('is-revealed');observer?.unobserve(target);}});
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
  window.addEventListener('load',schedule,{once:true});window.addEventListener('pageshow',schedule);
  reduced.addEventListener('change',configure);
})();
