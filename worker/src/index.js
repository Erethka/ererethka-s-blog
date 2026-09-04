const DATA_REPO = "Erethka/apex-loot-data";
const DATA_PATH = "data/apex-records.json";
const DATA_BRANCH = "main";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const failedLogins = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return corsResponse(new Response(null, { status: 204 }), origin, env);

    const url = new URL(request.url);
    try {
      if (url.pathname === "/login" && request.method === "POST") {
        return corsResponse(await login(request, env), origin, env);
      }
      if (url.pathname === "/logout" && request.method === "POST") {
        return corsResponse(logout(), origin, env);
      }
      if (url.pathname === "/session" && request.method === "GET") {
        return corsResponse(await sessionStatus(request, env), origin, env);
      }
      if (url.pathname === "/apex" && request.method === "GET") {
        return corsResponse(await getApex(request, env), origin, env);
      }
      if (url.pathname === "/apex" && request.method === "PUT") {
        return corsResponse(await putApex(request, env), origin, env);
      }
      return corsResponse(json({ error: "Not found" }, 404), origin, env);
    } catch (error) {
      return corsResponse(json({ error: error?.message || "Internal server error" }, 500), origin, env);
    }
  },
};

function allowedOrigin(env) {
  return env.ALLOWED_ORIGIN || "https://erethka.github.io";
}

function corsResponse(response, origin, env) {
  const headers = new Headers(response.headers);
  const allowed = allowedOrigin(env);
  if (origin === allowed) {
    headers.set("Access-Control-Allow-Origin", allowed);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
    headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    headers.set("Vary", "Origin");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

async function login(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (isRateLimited(ip)) return json({ error: "登录失败次数过多，请 10 分钟后再试。" }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: "请求格式无效。" }, 400); }
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password || !env.PASSWORD_HASH || !env.SESSION_SECRET) {
    return json({ error: "服务端认证配置不完整。" }, 500);
  }

  const valid = await verifyPassword(password, env.PASSWORD_HASH);
  if (!valid) {
    registerFailure(ip);
    return json({ error: "密码错误。" }, 401);
  }
  failedLogins.delete(ip);

  const token = await createSession(env.SESSION_SECRET);
  return json({ ok: true }, 200, {
    "Set-Cookie": sessionCookie(token),
  });
}

function logout() {
  return json({ ok: true }, 200, {
    "Set-Cookie": "apex_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None",
  });
}

async function sessionStatus(request, env) {
  const session = await readSession(request, env);
  return json({ authenticated: Boolean(session) });
}

async function getApex(request, env) {
  if (!(await readSession(request, env))) return json({ error: "Unauthorized" }, 401);
  const github = await githubRequest(env, "GET");
  if (github.status === 404) return json({ sha: null, content: "" }, 404);
  const data = await github.json();
  return json({ sha: data.sha || null, content: data.content || "" });
}

async function putApex(request, env) {
  if (!(await readSession(request, env))) return json({ error: "Unauthorized" }, 401);
  const body = await request.json();
  if (!body || typeof body.content !== "string") return json({ error: "Invalid content" }, 400);

  const payload = {
    message: typeof body.message === "string" ? body.message : "chore: update Apex heirloom loot log",
    content: body.content,
    branch: DATA_BRANCH,
  };
  if (typeof body.sha === "string" && body.sha) payload.sha = body.sha;

  const github = await githubRequest(env, "PUT", payload);
  const text = await github.text();
  return new Response(text, {
    status: github.status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function githubRequest(env, method, body) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN 未配置。");
  const url = `https://api.github.com/repos/${DATA_REPO}/contents/${DATA_PATH}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ererethka-s-blog-apex-proxy",
  };
  if (body) headers["Content-Type"] = "application/json";
  return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

function sessionCookie(token) {
  return `apex_session=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=None`;
}

async function readSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)apex_session=([^;]+)/);
  if (!match) return null;
  return verifySession(match[1], env.SESSION_SECRET);
}

async function createSession(secret) {
  const payload = `${Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

async function verifySession(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const exp = Number(parts[0]);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const expected = await hmac(secret, parts[0]);
  return timingSafeEqual(parts[1], expected) ? { exp } : null;
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function verifyPassword(password, stored) {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[1]);
  const salt = fromBase64Url(parts[2].split(".")[0]);
  const expected = fromBase64Url(parts[2].split(".")[1] || "");
  if (!iterations || !salt.length || !expected.length) return false;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, expected.length * 8);
  return timingSafeEqual(toBase64Url(new Uint8Array(bits)), toBase64Url(expected));
}

function isRateLimited(ip) {
  const item = failedLogins.get(ip);
  if (!item) return false;
  if (Date.now() - item.startedAt > RATE_WINDOW_MS) {
    failedLogins.delete(ip);
    return false;
  }
  return item.count >= MAX_LOGIN_ATTEMPTS;
}

function registerFailure(ip) {
  const now = Date.now();
  const item = failedLogins.get(ip);
  if (!item || now - item.startedAt > RATE_WINDOW_MS) failedLogins.set(ip, { startedAt: now, count: 1 });
  else item.count += 1;
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  if (!value) return new Uint8Array();
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}