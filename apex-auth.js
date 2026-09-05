(() => {
  const API_BASE = "https://ererethka-apex-auth.erethka.workers.dev";
  const state = { authenticated: false, modal: null, message: "" };

  function api(path) { return `${API_BASE.replace(/\/$/, "")}${path}`; }

  // Apex 页面只通过 Worker 访问私有数据；浏览器不保存、不发送 GitHub Token。
  window.apexAuthFetch = (path, init = {}) => originalFetch(api(path), {
    ...init,
    credentials: "include",
    cache: "no-store",
  });

  const originalFetch = window.fetch.bind(window);

  function showLogin(message = "") {
    state.message = message;
    if (!state.modal) buildModal();
    state.modal.hidden = false;
    state.modal.setAttribute("aria-hidden", "false");
    const input = document.getElementById("apexAuthPassword");
    if (input) setTimeout(() => input.focus(), 0);
    const status = document.getElementById("apexAuthStatus");
    if (status) status.textContent = message;
  }

  function hideLogin() {
    if (!state.modal) return;
    state.modal.hidden = true;
    state.modal.setAttribute("aria-hidden", "true");
  }

  function buildModal() {
    const style = document.createElement("style");
    style.textContent = `
      #apexAuthModal{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:rgba(3,7,18,.62);backdrop-filter:blur(18px)}
      #apexAuthModal[hidden]{display:none}
      .apex-auth-card{width:min(430px,100%);padding:30px;border:1px solid rgba(255,255,255,.16);border-radius:26px;background:rgba(15,23,42,.84);box-shadow:0 30px 80px rgba(0,0,0,.4);color:#fff}
      .apex-auth-kicker{font-size:11px;letter-spacing:.16em;opacity:.62}.apex-auth-card h2{margin:8px 0 10px;font-size:28px}.apex-auth-copy{margin:0 0 22px;line-height:1.7;opacity:.72;font-size:14px}
      .apex-auth-card label{display:block;font-size:13px;font-weight:700}.apex-auth-card input{box-sizing:border-box;width:100%;margin-top:8px;padding:13px 14px;border-radius:13px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#fff;outline:none}.apex-auth-card input:focus{border-color:rgba(255,255,255,.4)}
      .apex-auth-actions{display:flex;gap:10px;margin-top:16px}.apex-auth-actions button{flex:1;padding:12px 14px;border-radius:13px;border:1px solid rgba(255,255,255,.16);cursor:pointer}.apex-auth-submit{background:#fff;color:#111827}.apex-auth-status{min-height:20px;margin:12px 0 0;font-size:12px;color:#fda4af}
      .apex-auth-lock{width:44px;height:44px;display:grid;place-items:center;border-radius:50%;background:rgba(255,255,255,.08);font-size:20px}
    `;
    document.head.appendChild(style);
    const modal = document.createElement("div");
    modal.id = "apexAuthModal";
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `<section class="apex-auth-card" role="dialog" aria-modal="true" aria-labelledby="apexAuthTitle"><div class="apex-auth-lock">✦</div><div class="apex-auth-kicker">PRIVATE APEX ARCHIVE</div><h2 id="apexAuthTitle">确认身份</h2><p class="apex-auth-copy">这是你的私人 Apex 数据。输入博客登录密码后，网站会通过安全会话自动访问私有仓库，无需在设备上配置 GitHub Token。</p><form id="apexAuthForm"><label for="apexAuthPassword">登录密码<input id="apexAuthPassword" type="password" autocomplete="current-password" required placeholder="输入密码"></label><div class="apex-auth-actions"><button class="apex-auth-submit" type="submit">验证并同步</button></div><p class="apex-auth-status" id="apexAuthStatus" role="status"></p></form></section>`;
    document.body.appendChild(modal);
    state.modal = modal;
    modal.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = modal.querySelector("button[type=submit]");
      const status = document.getElementById("apexAuthStatus");
      const password = document.getElementById("apexAuthPassword")?.value || "";
      if (!password) return;
      button.disabled = true;
      status.textContent = "正在验证…";
      try {
        const response = await originalFetch(api("/login"), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ password }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `验证失败（${response.status}）`);
        state.authenticated = true;
        hideLogin();
        document.getElementById("apexAuthPassword").value = "";
        if (typeof window.loadGithub === "function") window.loadGithub();
      } catch (error) {
        status.textContent = error.message || "验证失败";
      } finally {
        button.disabled = false;
      }
    });
  }

  async function bootstrap() {
    try {
      const response = await originalFetch(api("/session"), { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.authenticated) {
        state.authenticated = true;
        return;
      }
    } catch { /* Worker 不可用时由登录界面提示 */ }
    showLogin();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  else bootstrap();
})();