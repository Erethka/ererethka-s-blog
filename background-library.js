/* Use the exact three background images configured by the reference XHBlogs site. */
(() => {
  const REFERENCE_BACKGROUNDS = [
    "https://bu.dusays.com/2026/03/24/69c1e38b4c370.jpg",
    "https://bu.dusays.com/2026/03/24/69c26fe4acdb5.jpg",
    "https://bu.dusays.com/2026/03/24/69c26fe4d9486.jpg"
  ];

  const apply = () => {
    const holder = document.getElementById("backgroundSlides");
    if (!holder) return;
    holder.innerHTML = REFERENCE_BACKGROUNDS.map((src, index) =>
      `<div class="ambient-slide${index === 0 ? " active" : ""}" style="background-image:url('${src}')"></div>`
    ).join("");
  };

  apply();
  let index = 0;
  setInterval(() => {
    const slides = [...document.querySelectorAll("#backgroundSlides .ambient-slide")];
    if (slides.length < 2) return;
    slides[index % slides.length].classList.remove("active");
    index = (index + 1) % slides.length;
    slides[index].classList.add("active");
  }, 10000);
})();
