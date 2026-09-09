(() => {
  const addReaderActions = () => {
    document.querySelectorAll("#docList .doc-item").forEach((item) => {
      if (item.querySelector(".doc-reader-action")) return;
      const action = document.createElement("span");
      action.className = "doc-reader-action";
      action.textContent = "阅读";
      action.title = "打开知识库阅读页";
      action.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const path = item.dataset.path;
        if (path) location.href = `./reader.html?doc=${encodeURIComponent(path)}`;
      });
      item.appendChild(action);
    });
  };
  const boot = () => {
    addReaderActions();
    const list = document.getElementById("docList");
    if (list) new MutationObserver(addReaderActions).observe(list, { childList: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
