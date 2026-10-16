/* A canceled browser transition must never reject into the page's app logic. */
for(const type of ['pageswap','pagereveal']){
  window.addEventListener(type,event=>{
    const transition=event.viewTransition;
    if(!transition)return;
    transition.ready.catch(()=>{});
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)transition.skipTransition();
  });
}
