# ererethka の 宝藏之地

静态个人博客，包含技术档案、影像相册和 Apex 补给记录。全站采用受《明日方舟》平面设计启发的档案版式：深灰／纸色双主题、黄绿点缀、编号、细线分区与直角组件。保留原有个人图片与内容，没有使用游戏角色或官方标识作为界面素材。

## 页面

- `/`：个人首页、站内页面搜索、档案入口、影像选集与主题切换。
- `/dev/`：技术档案索引，支持搜索、分类、Markdown 导入，以及阅读、编辑和分栏视图。
- `/dev/reader.html?doc=…`：独立阅读页，包含目录、标签与上一篇／下一篇导航。
- `/photowall/`：相册检索、相册浏览与支持键盘操作的图片灯箱。
- `/apex/`：记录开启包数，查看累计数量、500 包循环进度与历史记录。

全站公共颜色和导航样式在 `site-polish.css`，首页样式在 `styles-polish.css`；各子页样式位于对应目录。首页保留 `#home`、`#projects`、`#timeline`、`#photowall`、`#music` 与 `#about` 锚点。

## 私人数据

技术文档和 Apex 记录继续通过现有 Cloudflare Worker 代理访问 GitHub 私有仓库。访问私人页面时使用口令登录；浏览器通过会话 Cookie 请求接口，不需要填写或保存 GitHub Token。Worker 部署说明见 `worker/README.md`。

Apex 的显示进度按累计包数对 500 取余计算，不根据是否获得传家宝重置。浏览器保留本地记录缓存，新增与删除操作继续使用原有私人同步接口。界面中的循环数字仅是个人记录统计。

## 本地预览

在项目根目录启动静态 HTTP 服务器，例如：

```sh
python -m http.server 4173
```

访问 `http://localhost:4173/`。私人接口沿用生产环境的 Origin 和会话配置；本地验收使用独立的模拟响应，不修改真实私人记录。

项目没有前端构建步骤。发布沿用仓库现有 GitHub Pages 配置；修改 CSS 或 JavaScript 后，应同步更新 HTML 中的资源版本参数，避免浏览器使用旧缓存。

## 资产与署名

`siamese-cat.png` 头像来自 [XHBlogs](https://github.com/heiehiehi/XinghuisamaBlogs)，保留 CC BY-NC 4.0 署名。插画来自项目原有的本地资源；详细说明见 `ATTRIBUTION.md`。
