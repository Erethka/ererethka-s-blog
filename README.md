# ererethka's blog

一个无需后端的静态个人博客外壳，默认进入 Apex Legends 传家宝记录子页，适合直接部署到 GitHub Pages。记录先保存到浏览器 `localStorage`；配置 GitHub 后，会通过 GitHub Contents API 将 `data/apex-records.json` 自动提交到你的仓库。

## 当前记录规则

- 只记录每次开了多少包，以及本次是否出了传家宝（红色）；蓝紫金等普通掉落不会进入记录。
- 总开箱数会持续累计。
- 当前传家宝循环按 500 包计算；勾选“本次开出传家宝”后，当前循环立即重置为 0。
- 左侧导航保留“技术开发”入口，后续可以在这个个人博客外壳中继续扩展内容。
- 页面右上角可以在亮色/暗色两个壁纸文件夹之间切换，每次切换会随机应用一张对应背景图。

背景图来自本机 Wallpaper Engine 缓存中的安全静态预览图，详见 `assets/backgrounds/README.md`。

## 部署

1. 将本目录推送到 GitHub 仓库。
2. 在仓库 Settings → Pages 中选择 `Deploy from a branch`，分支选 `main`、目录选 `/ (root)`。
3. 打开站点，点击右上角齿轮，填写 GitHub 用户名、仓库、分支和数据文件路径。
4. 创建 Fine-grained Personal Access Token：只选择目标仓库，并授予 `Contents: Read and write`，粘贴后点击“测试连接”。

Token 只存储在当前浏览器的 localStorage 中，前端不会把 Token 写入仓库。若仓库为公开仓库，建议把仓库本身设为私有；GitHub Pages 仍可按账户设置访问。

## 本地预览

直接双击 `index.html` 即可预览。若浏览器限制本地文件能力，可使用任意静态服务器，例如 `npx serve .`。
