/* A canceled browser transition must never reject into the page's app logic. */
for(const type of ['pageswap','pagereveal']){
  window.addEventListener(type,event=>{
    const transition=event.viewTransition;
    if(!transition)return;
    transition.ready.catch(()=>{});
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)transition.skipTransition();
  });
}

/* Only animate an intentional theme change, never the first page paint. */
(() => {
  let timer;
  window.blogThemeChange = apply => {
    const root = document.documentElement;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(); return; }
    root.classList.add('theme-switching');
    getComputedStyle(document.body).backgroundColor;
    apply();
    clearTimeout(timer);
    timer = setTimeout(() => root.classList.remove('theme-switching'), 450);
  };
})();
