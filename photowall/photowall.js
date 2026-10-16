(() => {
  const THEME_KEY = "blog-theme";
  const artworkInfo = {
  "swav-resurgum": {
    "artist": "SWAV",
    "source": "https://pixiv-waengallery.com/exhibition/swav_resurgum/"
  },
  "guweiz-subway": {
    "artist": "GUWEIZ",
    "source": "https://wall.alphacoders.com/big.php?i=1116513"
  },
  "loundraw-rooftop": {
    "artist": "loundraw",
    "source": "https://wall.alphacoders.com/big.php?i=742755"
  },
  "loundraw-city": {
    "artist": "loundraw",
    "source": "https://www.zerochan.net/2118421"
  }
};
  const artwork = (name, caption) => ({
    src: `../assets/artwork/${name}.webp`,
    thumbnail: `../assets/artwork/${name}-small.webp`,
    caption,
    source: artworkInfo[name].source,
    credit: `© ${artworkInfo[name].artist}`
  });
  const albums = [
    {
      title: "城市切片", aliases: ["雾与火", "灰阶肖像"], date: "CURATED / CITY FRAGMENTS",
      description: "人物、建筑与风，一起留在画面里。",
      photos: [artwork("loundraw-city", "01 · 城市上空 / loundraw"), artwork("swav-resurgum", "02 · ReSURGUM / SWAV")]
    },
    {
      title: "冷光片段", aliases: ["等一班车"], date: "CURATED / ON THE WAY",
      description: "车厢里的短暂停留，也有自己的光线。",
      photos: [artwork("guweiz-subway", "01 · 途中片刻 / GUWEIZ")]
    },
    {
      title: "游戏时刻", date: "2026 · GAME",
      description: "角色与战场，游戏里的记忆。",
      photos: [
        { src: "../assets/backgrounds/light/apex-champions.jpg", caption: "01 · Apex时刻" }
      ]
    },
    {
      title: "天台来风", aliases: ["夜航"], date: "CURATED / ROOFTOP AIR",
      description: "城市很远，风恰好经过。",
      photos: [artwork("loundraw-rooftop", "01 · 天台来风 / loundraw")]
    }
  ];

  const $ = (id) => document.getElementById(id);
  const grid = $("albumGrid");
  const empty = $("emptyState");
  const search = $("photoSearch");
  const albumModal = $("albumModal");
  const albumPhotoGrid = $("albumPhotoGrid");
  const lightbox = $("lightbox");
  const lightboxImage = $("lightboxImage");
  const lightboxCaption = $("lightboxCaption");
  const lightboxCounter = $("lightboxCounter");
  let activeAlbum = null;
  let activePhoto = 0;
  const returnFocus = new WeakMap();

  function applyTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    $("themeLabel").textContent = next === "light" ? "日间" : "夜间";
    $("themeIcon").textContent = "◐";
    document.querySelector('meta[name="theme-color"]').content = next === "light" ? "#e8ece7" : "#171b1d";
    $("themeButton").setAttribute("aria-label", next === "light" ? "切换夜间主题" : "切换日间主题");
  }

  function initTheme() {
    let saved = "dark";
    try { saved = localStorage.getItem(THEME_KEY) || "dark"; } catch {}
    applyTheme(saved);
    $("themeButton").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));
  }

  function renderAlbums(query = "") {
    const keyword = query.trim().toLowerCase();
    const visible = albums.filter((album) => {
      if (!keyword) return true;
      return [album.title, ...(album.aliases || []), album.date, album.description, ...album.photos.map((photo) => photo.caption)].join(" ").toLowerCase().includes(keyword);
    });

    grid.innerHTML = visible.map((album) => {
      const albumIndex = albums.indexOf(album);
      const preview = album.photos.slice(0, 3);
      const number = String(albumIndex + 1).padStart(2, "0");
      return `<article class="album-card" data-album="${albumIndex}" tabindex="0" role="button" aria-label="打开相册 ${escapeHtml(album.title)}，${album.photos.length} 张照片">
        <div class="album-card-top"><span><i aria-hidden="true">■</i>COLLECTION / ${number}</span><span>${escapeHtml(album.date)}</span></div>
        <div class="album-preview${preview.length > 2 ? " has-three" : preview.length === 1 ? " is-single" : ""}" aria-hidden="true">${preview.map((photo) => `<img src="${photo.thumbnail || photo.src}" alt="" loading="lazy" decoding="async">`).join("")}</div>
        <div class="album-info">
          <div><h3>${escapeHtml(album.title)}</h3><p>${escapeHtml(album.description)}</p></div><span class="album-open" aria-hidden="true">↗</span>
        </div>
        <div class="album-card-bottom"><span>${String(album.photos.length).padStart(2, "0")} 张影像</span><span>VIEW COLLECTION ↗</span></div>
      </article>`;
    }).join("");

    empty.hidden = visible.length !== 0;
    $("visibleAlbumCount").textContent = String(visible.length).padStart(2, "0");
    grid.querySelectorAll(".album-card").forEach((card) => {
      const open = () => openAlbum(Number(card.dataset.album));
      card.addEventListener("click", open);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
      });
    });
  }

  function openAlbum(index) {
    activeAlbum = index;
    const album = albums[index];
    $("albumTitle").textContent = album.title;
    $("albumDate").textContent = album.date;
    $("albumDescription").textContent = album.description;
    albumPhotoGrid.innerHTML = album.photos.map((photo, photoIndex) => `<button class="album-photo" type="button" data-photo="${photoIndex}" aria-label="查看照片 ${escapeHtml(photo.caption)}"><img src="${photo.thumbnail || photo.src}" alt="" loading="lazy" decoding="async"><span>${escapeHtml(photo.caption)}</span></button>`).join("");
    albumPhotoGrid.querySelectorAll(".album-photo").forEach((figure) => figure.addEventListener("click", () => openLightbox(Number(figure.dataset.photo))));
    setOpen(albumModal, true);
    writeRoute();
  }

  function closeAlbum() {
    setOpen(lightbox, false);
    setOpen(albumModal, false);
    writeRoute();
  }

  function openLightbox(index) {
    if (activeAlbum === null) return;
    activePhoto = (index + albums[activeAlbum].photos.length) % albums[activeAlbum].photos.length;
    updateLightbox();
    setOpen(lightbox, true);
    writeRoute();
  }

  function updateLightbox() {
    const photo = albums[activeAlbum].photos[activePhoto];
    lightboxImage.src = photo.src;
    lightboxImage.alt = photo.caption;
    lightboxCaption.textContent = photo.caption;
    const source = $("artworkSource"), credit = $("artworkCredit");
    source.hidden = !photo.source;
    if (photo.source) source.href = photo.source; else source.removeAttribute("href");
    credit.hidden = !photo.credit;
    credit.textContent = photo.credit || "";
    lightboxCounter.textContent = `${activePhoto + 1} / ${albums[activeAlbum].photos.length}`;
    $("openOriginal").href=photo.src;
    if(lightbox.classList.contains("open"))writeRoute();
  }

  function stepPhoto(delta) {
    if (activeAlbum === null) return;
    const total = albums[activeAlbum].photos.length;
    activePhoto = (activePhoto + delta + total) % total;
    updateLightbox();
  }

  function writeRoute() {
    const url=new URL(location.href);url.searchParams.delete("album");url.searchParams.delete("photo");
    if(albumModal.classList.contains("open")){url.searchParams.set("album",albums[activeAlbum].title);if(lightbox.classList.contains("open"))url.searchParams.set("photo",String(activePhoto+1));}
    history.replaceState(null,"",url);
  }
  function setOpen(element, open) {
    if (open) returnFocus.set(element, document.activeElement);
    element.classList.toggle("open", open);
    element.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("modal-open", albumModal.classList.contains("open") || lightbox.classList.contains("open"));
    $("photoMain").inert = albumModal.classList.contains("open") || lightbox.classList.contains("open");
    document.querySelector(".photo-nav").inert = $("photoMain").inert;
    albumModal.inert = lightbox.classList.contains("open");
    if (open) element.querySelector("button")?.focus();
    else returnFocus.get(element)?.focus();
    if(element===lightbox&&!open)writeRoute();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));
  }

  function initMenu() {
    const button = $("menuButton");
    const links = $("mobileLinks");
    button.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "关闭导航" : "打开导航");
      button.textContent = open ? "×" : "☰";
    });
    links.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
      links.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "打开导航");
      button.textContent = "☰";
    }));
  }

  function initModalEvents() {
    $("copyPhotoLink").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(location.href);$("copyPhotoLink").textContent="链接已复制";setTimeout(()=>$("copyPhotoLink").textContent="复制图片链接 ↗",1800);}catch{$("copyPhotoLink").textContent="请复制地址栏链接";}});
    $("closeAlbum").addEventListener("click", closeAlbum);
    $("closeLightbox").addEventListener("click", () => setOpen(lightbox, false));
    $("prevPhoto").addEventListener("click", () => stepPhoto(-1));
    $("nextPhoto").addEventListener("click", () => stepPhoto(1));
    albumModal.addEventListener("click", (event) => { if (event.target === albumModal) closeAlbum(); });
    lightbox.addEventListener("click", (event) => { if (event.target === lightbox) setOpen(lightbox, false); });
    document.addEventListener("keydown", (event) => {
      const currentDialog = lightbox.classList.contains("open") ? lightbox : albumModal.classList.contains("open") ? albumModal : null;
      if (currentDialog && event.key === "Tab") {
        const focusable = [...currentDialog.querySelectorAll("button, a[href], [tabindex='0']")];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      if (lightbox.classList.contains("open")) {
        if (event.key === "Escape") setOpen(lightbox, false);
        else if (event.key === "ArrowLeft") stepPhoto(-1);
        else if (event.key === "ArrowRight") stepPhoto(1);
      } else if (albumModal.classList.contains("open") && event.key === "Escape") {
        closeAlbum();
      }
    });
  }

  $("albumCount").textContent = `${albums.length} 个相册`;
  $("collectionTotal").textContent = String(albums.length).padStart(2, "0");
  $("photoCount").textContent = `${albums.reduce((sum, album) => sum + album.photos.length, 0)} 张照片`;
  search.addEventListener("input", () => renderAlbums(search.value));
  initTheme();
  initMenu();
  initModalEvents();
  renderAlbums();
  const params=new URLSearchParams(location.search),albumIndex=albums.findIndex(album=>album.title===params.get("album")||album.aliases?.includes(params.get("album")));
  const photo=Number(params.get("photo"));
  if(albumIndex>=0){openAlbum(albumIndex);if(Number.isInteger(photo)&&photo>0&&photo<=albums[albumIndex].photos.length)openLightbox(photo-1);}
})();
