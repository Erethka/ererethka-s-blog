const DATA_REPO = "Erethka/apex-loot-data";
const DATA_PATH = "data/apex-records.json";
const DATA_BRANCH = "main";
const DOCS_ROOT = "docs";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const failedLogins = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return corsResponse(new Response(null, { status: 204 }), origin, env);
    }

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
      if (url.pathname === "/documents" && request.method === "GET") {
        return corsResponse(await getDocuments(request, env), origin, env);
      }
      if (url.pathname === "/documents" && request.method === "PUT") {
        return corsResponse(await putDocument(request, env), origin, env);
      }
      if (url.pathname === "/documents" && request.method === "POST") {
        return corsResponse(await postDocument(request, env), origin, env);
      }
      if (url.pathname === "/documents" && request.method === "DELETE") {
        return corsResponse(await deleteDocument(request, env), origin, env);
      }

      return corsResponse(json({ error: "Not found" }, 404), origin, env);
    } catch (error) {
      return corsResponse(
        json({ error: error?.message || "Internal server error" }, 500),
        origin,
        env,
      );
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
    headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    headers.set("Vary", "Origin");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extra,
    },
  });
}

async function login(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  if (isRateLimited(ip)) {
    return json({ error: "登录失败次数过多，请 10 分钟后再试。" }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求格式无效。" }, 400);
  }

  const password = typeof body?.password === "string" ? body.password : "";

  if (!password || !env.APEX_PASSWORD || !env.SESSION_SECRET) {
    return json({ error: "服务端认证配置不完整。" }, 500);
  }

  const valid = timingSafeStringEqual(password, env.APEX_PASSWORD);

  if (!valid) {
    registerFailure(ip);
    return json({ error: "密码错误。" }, 401);
  }

  failedLogins.delete(ip);

  return json(
    { ok: true },
    200,
    { "Set-Cookie": sessionCookie(await createSession(env.SESSION_SECRET)) },
  );
}

function logout() {
  return json(
    { ok: true },
    200,
    {
      "Set-Cookie":
        "apex_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None",
    },
  );
}

async function sessionStatus(request, env) {
  return json({ authenticated: Boolean(await readSession(request, env)) });
}

async function getApex(request, env) {
  if (!(await readSession(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const github = await githubRequest(env, "GET", null, DATA_PATH);

  if (github.status === 404) {
    return json({ sha: null, content: "" }, 404);
  }

  if (!github.ok) {
    return json({ error: `GitHub read failed (${github.status})` }, 502);
  }

  const data = await github.json();
  return json({ sha: data.sha || null, content: data.content || "" });
}

async function putApex(request, env) {
  if (!(await readSession(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.content !== "string") {
    return json({ error: "Invalid content" }, 400);
  }

  const payload = {
    message:
      typeof body.message === "string"
        ? body.message
        : "chore: update Apex heirloom loot log",
    content: body.content,
    branch: DATA_BRANCH,
  };

  if (body.sha) {
    payload.sha = body.sha;
  }

  const github = await githubRequest(env, "PUT", payload, DATA_PATH);

  return new Response(await github.text(), {
    status: github.status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function validDocumentPath(path) {
  return (
    typeof path === "string" &&
    /^docs\/[\p{L}\p{N}._~\-/]+\.md$/iu.test(path) &&
    !path.includes("..") &&
    !path.includes("\\")
  );
}

function decodeGithubContent(value) {
  const binary = atob(String(value || "").replace(/\n/g, ""));
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

function encodeGithubContent(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";

  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  return btoa(binary);
}

function frontMatter(markdown) {
  const match = String(markdown || "").match(
    /^---\s*\n([\s\S]*?)\n---\s*\n?/,
  );
  const meta = {};

  if (!match) {
    return meta;
  }

  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!item) continue;

    let value = item[2].trim().replace(/^['"]|['"]$/g, "");

    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    }

    meta[item[1]] = value;
  }

  return meta;
}

async function getDocuments(request, env) {
  if (!(await readSession(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const requestedPath = new URL(request.url).searchParams.get("path");

  if (requestedPath) {
    if (!validDocumentPath(requestedPath)) {
      return json({ error: "Invalid document path" }, 400);
    }

    const github = await githubRequest(env, "GET", null, requestedPath);

    if (github.status === 404) {
      return json({ error: "Document not found" }, 404);
    }

    if (!github.ok) {
      return json({ error: `GitHub read failed (${github.status})` }, 502);
    }

    const data = await github.json();

    return json({
      path: requestedPath,
      sha: data.sha || null,
      content: decodeGithubContent(data.content || ""),
    });
  }

  const github = await githubRequest(env, "GET", null, DOCS_ROOT);

  if (github.status === 404) {
    return json({ documents: [] });
  }

  if (!github.ok) {
    return json({ error: `GitHub list failed (${github.status})` }, 502);
  }

  const items = await github.json();
  const documents = [];

  for (const item of Array.isArray(items) ? items : []) {
    if (item.type !== "file" || !validDocumentPath(item.path)) {
      continue;
    }

    let content = "";

    try {
      const file = await githubRequest(env, "GET", null, item.path);
      if (file.ok) {
        const data = await file.json();
        content = decodeGithubContent(data.content || "");
      }
    } catch {}

    const meta = frontMatter(content);

    documents.push({
      path: item.path,
      sha: item.sha || null,
      title: meta.title || item.name.replace(/\.md$/i, ""),
      category: meta.category || "其他",
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      date: meta.date || "",
      updated: meta.updated || "",
      status: meta.status || "draft",
    });
  }

  documents.sort(
    (a, b) =>
      String(b.updated || b.date).localeCompare(String(a.updated || a.date)) ||
      a.title.localeCompare(b.title),
  );

  return json({ documents });
}

async function putDocument(request, env) {
  if (!(await readSession(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null);
  const path = body?.path;
  const content = body?.content;

  if (!validDocumentPath(path)) {
    return json({ error: "文档路径必须位于 docs/ 且以 .md 结尾。" }, 400);
  }

  if (typeof content !== "string" || !content.trim()) {
    return json({ error: "Markdown 内容不能为空。" }, 400);
  }

  if (content.length > 2 * 1024 * 1024) {
    return json({ error: "Markdown 文件不能超过 2 MB。" }, 413);
  }

  const payload = {
    message:
      typeof body.message === "string"
        ? body.message.slice(0, 160)
        : "docs: update Markdown document",
    content: encodeGithubContent(content),
    branch: DATA_BRANCH,
  };

  if (body.sha) {
    payload.sha = body.sha;
  }

  const github = await githubRequest(env, "PUT", payload, path);
  const text = await github.text();

  if (!github.ok) {
    return new Response(text, {
      status: github.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  let data = {};
  try {
    data = JSON.parse(text);
  } catch {}

  return json({
    ok: true,
    path,
    sha: data.content?.sha || null,
    commitSha: data.commit?.sha || null,
  });
}

async function postDocument(request, env) {
  if (!(await readSession(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null);

  if (body?.action !== "rename") {
    return json({ error: "Unsupported document action" }, 400);
  }

  const from = body.from;
  const to = body.to;

  if (!validDocumentPath(from) || !validDocumentPath(to)) {
    return json(
      { error: "源文件和目标文件都必须位于 docs/ 且以 .md 结尾。" },
      400,
    );
  }

  if (from === to) {
    return json({ error: "文件名没有变化。" }, 400);
  }

  const source = await githubRequest(env, "GET", null, from);

  if (!source.ok) {
    return json(
      {
        error:
          source.status === 404
            ? "源文档不存在。"
            : `源文档读取失败（${source.status}）`,
      },
      502,
    );
  }

  const sourceData = await source.json();

  if (body.sha && body.sha !== sourceData.sha) {
    return json({ error: "文档已被其他修改，请重新打开后再试。" }, 409);
  }

  const target = await githubRequest(env, "GET", null, to);

  if (target.status !== 404) {
    return json({ error: "目标文件已存在，请换一个标题。" }, 409);
  }

  const message =
    typeof body.message === "string"
      ? body.message.slice(0, 160)
      : "docs: rename Markdown document";

  const created = await githubRequest(
    env,
    "PUT",
    { message, content: sourceData.content, branch: DATA_BRANCH },
    to,
  );

  if (!created.ok) {
    return new Response(await created.text(), {
      status: created.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const deleted = await githubRequest(
    env,
    "DELETE",
    { message, sha: sourceData.sha, branch: DATA_BRANCH },
    from,
  );

  if (!deleted.ok) {
    return json(
      {
        error:
          "目标文件已创建，但源文件删除失败，请勿重复重命名；可稍后手动删除旧文件。",
        path: to,
      },
      502,
    );
  }

  const createdData = await created.json();

  return json({
    ok: true,
    path: to,
    sha: createdData.content?.sha || null,
  });
}

async function deleteDocument(request, env) {
  if (!(await readSession(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null);
  const path = body?.path;

  if (!validDocumentPath(path)) {
    return json({ error: "文档路径无效。" }, 400);
  }

  if (!body.sha) {
    return json({ error: "删除需要当前文件 SHA。" }, 400);
  }

  const github = await githubRequest(
    env,
    "DELETE",
    {
      message:
        typeof body.message === "string"
          ? body.message.slice(0, 160)
          : "docs: delete Markdown document",
      sha: body.sha,
      branch: DATA_BRANCH,
    },
    path,
  );

  const text = await github.text();

  if (!github.ok) {
    return new Response(text, {
      status: github.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  return json({ ok: true, path });
}

async function githubRequest(env, method, body, path) {
  if (!env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN 未配置。");
  }

  const encodedPath = String(path)
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const url = `https://api.github.com/repos/${DATA_REPO}/contents/${encodedPath}`;

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ererethka-s-blog-private-archive",
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function sessionCookie(token) {
  return `apex_session=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=None`;
}

async function readSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)apex_session=([^;]+)/);

  if (!match) {
    return null;
  }

  return verifySession(match[1], env.SESSION_SECRET);
}

async function createSession(secret) {
  const payload = `${Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

async function verifySession(token, secret) {
  if (!token || !secret) {
    return null;
  }

  const parts = token.split(".");
  const exp = Number(parts[0]);

  if (
    parts.length !== 2 ||
    !Number.isFinite(exp) ||
    exp < Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  const expected = await hmac(secret, parts[0]);
  return timingSafeStringEqual(parts[1], expected) ? { exp } : null;
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return toBase64Url(new Uint8Array(signature));
}

function timingSafeStringEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  const length = Math.max(left.length, right.length);
  let result = left.length ^ right.length;

  for (let i = 0; i < length; i++) {
    result |= (left[i] || 0) ^ (right[i] || 0);
  }

  return result === 0;
}

function isRateLimited(ip) {
  const item = failedLogins.get(ip);

  if (!item) {
    return false;
  }

  if (Date.now() - item.startedAt > RATE_WINDOW_MS) {
    failedLogins.delete(ip);
    return false;
  }

  return item.count >= MAX_LOGIN_ATTEMPTS;
}

function registerFailure(ip) {
  const now = Date.now();
  const item = failedLogins.get(ip);

  if (!item || now - item.startedAt > RATE_WINDOW_MS) {
    failedLogins.set(ip, { startedAt: now, count: 1 });
  } else {
    item.count += 1;
  }
}

function toBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
