# Apex 私有数据认证代理

Apex 页面现在不再要求浏览器保存 GitHub Token。浏览器只保存安全会话 Cookie；Cloudflare Worker 在服务端使用 GitHub Token 读取/写入 `Erethka/apex-loot-data`。

## 1. 准备 GitHub Fine-grained Token

创建 Fine-grained Personal Access Token，资源所有者选择 `Erethka`，Repository access 只授权：

- `Erethka/apex-loot-data`
- Repository permissions → Contents → Read and write

不要把 Token 写进本仓库，也不要把 Token 发到聊天里。

## 2. 生成博客密码哈希

在本地安装 Node.js 18+，进入 `worker` 目录执行：

```powershell
node scripts/hash-password.mjs
```

脚本会交互式读取密码，并输出一行 `pbkdf2-sha256$...` 字符串。只复制输出结果，不要提交到 Git。

## 3. 安装 Wrangler 并登录 Cloudflare

```powershell
npm install -g wrangler
wrangler login
```

然后：

```powershell
cd worker
wrangler deploy
```

部署成功后 Cloudflare 会给出类似：

```text
https://ererethka-apex-auth.<你的账号>.workers.dev
```

## 4. 配置三个 Secret

仍在 `worker` 目录执行：

```powershell
wrangler secret put GITHUB_TOKEN
wrangler secret put PASSWORD_HASH
wrangler secret put SESSION_SECRET
```

分别填入：

- `GITHUB_TOKEN`：第 1 步创建的 Fine-grained Token
- `PASSWORD_HASH`：第 2 步生成的 `pbkdf2-sha256$...` 字符串
- `SESSION_SECRET`：随机长字符串，例如用密码管理器生成 32 字节以上随机值

Secret 不会进入 Git 仓库。

## 5. 配置前端 Worker 地址

打开仓库根目录 `apex-auth.js`，把：

```js
const API_BASE = "https://REPLACE-WITH-YOUR-WORKER.workers.dev";
```

改成你第 3 步获得的 Worker 地址，然后提交。

## 6. 推荐的生产域名

GitHub Pages 与 `workers.dev` 属于不同站点。浏览器的第三方 Cookie 策略可能影响跨站会话，因此正式使用时推荐给 Worker 绑定自己的域名，例如：

```text
https://api.example.com
```

然后同步修改 `apex-auth.js` 中的 `API_BASE` 和 `wrangler.toml` 的 `ALLOWED_ORIGIN` 保持不变（前者是 API 地址，后者必须是博客页面的 Origin，例如 `https://erethka.github.io`）。

## 7. 最终使用方式

1. 打开博客 → Apex记录。
2. 第一次在某台设备上访问时输入博客密码。
3. Worker 验证成功后设置 `HttpOnly + Secure + SameSite=None` 会话 Cookie。
4. Apex 页面自动从私有仓库拉取记录。
5. 新增/删除记录仍会自动保存到 `apex-loot-data`。
6. 之后同一设备无需再次输入密码，直到会话过期或主动清除 Cookie。
7. 换新设备只需要输入博客密码，不需要 GitHub Token、仓库名或用户名配置。

## 安全说明

- GitHub Token 只存在 Cloudflare Worker Secret，不进入前端 JavaScript。
- 密码只以 PBKDF2-SHA-256 哈希形式存储。
- 会话是带过期时间的 HMAC-SHA-256 签名 Cookie。
- 登录接口带基础 IP 失败次数限制。
- 当前 Worker 使用内存限流；若未来访问量明显增加，可升级到 Durable Objects/Rate Limiting。
