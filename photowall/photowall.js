(() => {
  const THEME_KEY = "blog-theme";
  const albums = [
    {
      title: "雾与火",
      date: "2026 · SPRING",
      description: "收集明亮、热烈，也带一点雾气的瞬间。",
      photos: [
        { src: "../assets/backgrounds/light/hu-tao.jpg", caption: "01 · 雾与火" },
        { src: "../assets/backgrounds/light/anime-spring.jpg", caption: "02 · 春日漫游" }
      ]
    },
    {
      title: "等一班车",
      date: "2026 · DAILY",
      description: "路过车站、街角与黄昏时，顺手留下的画面。",
      photos: [
        { src: "../assets/backgrounds/light/station-girl.jpg", caption: "01 · 等一班车" },
        { src: "../assets/backgrounds/light/snowy-profile.jpg", caption: "02 · 雪落之后" }
      ]
    },
    {
      title: "游戏时刻",
      date: "2026 · GAME",
      description: "游戏、角色与那些值得截图保存的瞬间。",
      photos: [
        { src: "../assets/backgrounds/light/apex-champions.jpg", caption: "01 · Apex时刻" },
        { src: "../assets/backgrounds/dark/kaisel.jpg", caption: "02 · 夜航" }
      ]
    },
    {
      title: "夜航",
      date: "ARCHIVE · 2026",
      description: "把深夜里偶然遇见的光，单独留一份档案。",
      photos: [
        { src: "../assets/backgrounds/dark/kaisel.jpg", caption: "01 · 夜航" },
        { src: "../assets/backgrounds/dark/solo-leveling.jpg", caption: "02 · 深夜记录" },
        { src: "../assets/backgrounds/light/anime-spring.jpg", caption: "03 · 返程" }
      ]
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

  function applyTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    $("themeLabel").textContent = next === "light" ? "夜间" : "日间";
    $("themeIcon").textContent = next === "light" ? "☾" : "✦";
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
      return [album.title, album.date, album.description, ...album.photos.map((photo) => photo.caption)].join(" ").toLowerCase().includes(keyword);
    });

    grid.innerHTML = visible.map((album) => {
      const albumIndex = albums.indexOf(album);
      const preview = album.photos.slice(0, 3);
      return `<article class="album-card" data-album="${albumIndex}" tabindex="0" role="button" aria-label="打开相册 ${escapeHtml(album.title)}">
        <div class="album-preview">${preview.map((photo) => `<img src="${photo.src}" alt="${escapeHtml(photo.caption)}" loading="lazy">`).join("")}</div>
        <div class="album-info">
          <div><span class="album-date">${escapeHtml(album.date)}</span><h3>${escapeHtml(album.title)}</h3><p>${escapeHtml(album.description)}</p></div>
          <span class="album-count">${album.photos.length} 张照片 · OPEN</span>
        </div>
      </article>`;
    }).join("");

    empty.hidden = visible.length !== 0;
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
    albumPhotoGrid.innerHTML = album.photos.map((photo, photoIndex) => `<figure class="album-photo" data-photo="${photoIndex}"><img src="${photo.src}" alt="${escapeHtml(photo.caption)}" loading="lazy"><figcaption>${escapeHtml(photo.caption)}</figcaption></figure>`).join("");
    albumPhotoGrid.querySelectorAll(".album-photo").forEach((figure) => figure.addEventListener("click", () => openLightbox(Number(figure.dataset.photo))));
    setOpen(albumModal, true);
  }

  function closeAlbum() {
    setOpen(albumModal, false);
  }

  function openLightbox(index) {
    if (activeAlbum === null) return;
    activePhoto = (index + albums[activeAlbum].photos.length) % albums[activeAlbum].photos.length;
    updateLightbox();
    setOpen(lightbox, true);
  }

  function updateLightbox() {
    const photo = albums[activeAlbum].photos[activePhoto];
    lightboxImage.src = photo.src;
    lightboxImage.alt = photo.caption;
    lightboxCaption.textContent = photo.caption;
    lightboxCounter.textContent = `${activePhoto + 1} / ${albums[activeAlbum].photos.length}`;
  }

  function stepPhoto(delta) {
    if (activeAlbum === null) return;
    const total = albums[activeAlbum].photos.length;
    activePhoto = (activePhoto + delta + total) % total;
    updateLightbox();
  }

  function setOpen(element, open) {
    element.classList.toggle("open", open);
    element.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("modal-open", albumModal.classList.contains("open") || lightbox.classList.contains("open"));
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
      button.textContent = open ? "×" : "☰";
    });
    links.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
      links.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
      button.textContent = "☰";
    }));
  }

  function initModalEvents() {
    $("closeAlbum").addEventListener("click", closeAlbum);
    $("closeLightbox").addEventListener("click", () => setOpen(lightbox, false));
    $("prevPhoto").addEventListener("click", () => stepPhoto(-1));
    $("nextPhoto").addEventListener("click", () => stepPhoto(1));
    albumModal.addEventListener("click", (event) => { if (event.target === albumModal) closeAlbum(); });
    lightbox.addEventListener("click", (event) => { if (event.target === lightbox) setOpen(lightbox, false); });
    document.addEventListener("keydown", (event) => {
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
  $("photoCount").textContent = `${albums.reduce((sum, album) => sum + album.photos.length, 0)} 张照片`;
  search.addEventListener("input", () => renderAlbums(search.value));
  initTheme();
  initMenu();
  initModalEvents();
  renderAlbums();
})();
