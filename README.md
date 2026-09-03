# ererethka の 宝藏之地

一个无需后端的静态个人博客外壳，视觉语言迁移自 [XHBlogs](https://github.com/heiehiehi/XinghuisamaBlogs) 的玻璃拟态布局，并保留本项目的 Apex Legends 传家宝记录功能。

## 页面

- `/`：个人首页，包含资料卡、项目、照片墙预览、主题切换和站点仪表盘。
- `/apex/`：Apex 开箱记录子页，统计总开箱数、500 包保底进度和传家宝数量。

导航中的项目、归档、照片墙、音乐和关于区块是可扩展的静态锚点，后续可以继续加入文章和工具页面。

## Apex 记录规则

- 只记录每次开了多少包，以及本次是否出了传家宝。
- 每累计 500 包进入一次保底循环；勾选“本次开出传家宝”后，当前循环立即重置为 0。
- 记录先保存到浏览器 `localStorage`，不会因为刷新页面丢失。

## GitHub 私库同步

在 `/apex/` 页面右上角齿轮中填写：

1. GitHub 用户名/组织
2. 私有数据仓库名
3. 分支（默认 `main`）
4. `data/apex-records.json` 文件路径
5. Fine-grained Personal Access Token

Token 只保存在当前浏览器。测试连接成功后，新增或删除记录会通过 GitHub Contents API 自动提交到私有仓库；打开 Apex 页面时会自动拉取远端数据。

建议 Token 只授予目标仓库的 `Contents: Read and write` 权限，不要把 Token 或真实记录提交到公开的网站仓库。

## 本地预览

直接双击 `index.html`，或在项目根目录运行任意静态服务器：

```text
npx serve .
```

然后访问 `/apex/` 查看 Apex 子页。

## 资产与署名

页面使用了 XHBlogs 仓库中的 `siamese-cat.png` 头像资产，并根据其 CC BY-NC 4.0 许可保留署名。迁移后的页面代码与个人 Apex 数据仍由本项目维护；详细说明见 `ATTRIBUTION.md`。
