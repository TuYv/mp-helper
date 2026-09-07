# mp-helper 公众号助手

管理自己公众号后台的 Chrome 插件，可选让你的 AI 助手直接指挥。当前功能：

1. **导入 HTML 存草稿**：选一个排版好的 HTML 文件（正文容器 id 为 `wechat-article`，图片可以是 base64 内嵌），插件把图片逐张上传到公众号素材库、替换成微信 CDN 地址，自动把第一张图设为封面，然后直接在草稿箱创建一篇图文。封面裁剪如不满意可在编辑器里调整。
2. **导出发表记录**：把已发表图文列表拉下来存成 JSON 文件（`publish_page`、`publish_info` 两层字符串化 JSON 已解开，标题和阅读数在 `publish_info.appmsg_info` 里）。

## 安装

1. Chrome 打开 `chrome://extensions`
2. 右上角打开「开发者模式」
3. 点「加载已解压的扩展程序」，选这个项目目录

## 使用

登录 [mp.weixin.qq.com](https://mp.weixin.qq.com) 后台，任意后台页面右下角会出现绿色小面板：

- 点「导入 HTML 存草稿」→ 选生成好的预览 HTML → 等图片传完 → 点「打开草稿」进编辑器检查
- 点「导出发表记录」→ 浏览器下载 `mp-published-日期.json`

## Agent 模式：让你的 AI 助手直接指挥插件

不想手动点按钮？可以让本地 AI 助手（Claude Code、或任何能发 HTTP 请求的 agent）直接对公众号后台下指令。架构是一座"本地桥"：

```
你的 AI 助手 --HTTP--> 本地桥(127.0.0.1) <--每30秒领任务-- 插件后台脚本 --带登录态--> 公众号后台
```

开启步骤：

1. 启动桥（无第三方依赖，Node >= 18）：
   ```bash
   node bridge/server.mjs --token 随便取个口令
   ```
2. 插件图标右键 →「选项」→ 勾选开启 Agent 模式，填同样的口令，保存
3. 你的 AI 助手就可以调这三个接口了（都带 `x-bridge-token` 请求头）：

   ```bash
   # 查插件是否在线
   curl -s http://127.0.0.1:8923/api/status -H "x-bridge-token: 口令"
   # 拉发表记录
   curl -s "http://127.0.0.1:8923/api/published?count=20" -H "x-bridge-token: 口令"
   # 存草稿（html 里的 base64 图片自动上传、首图自动设封面）
   curl -s -X POST http://127.0.0.1:8923/api/create_draft \
     -H "x-bridge-token: 口令" -H "content-type: application/json" \
     -d '{"title":"文章标题","html":"<section>...</section>"}'
   ```

说明：

- 开启后不需要开着公众号页面，Chrome 在运行、后台登录态有效即可
- 插件最长 30 秒领一次任务（MV3 alarms 的最小周期），下指令后稍等片刻
- 默认关闭。桥只监听 127.0.0.1、必须带口令；但请理解：开启后，本机任何持有口令的程序都能以你的身份存草稿、读发表数据

## 技术说明

- 插件只注入 `mp.weixin.qq.com/cgi-bin/*`（后台页面），不碰公开文章页
- content script 与后台同域，直接用你已登录的 cookie 调后台自己的 AJAX 接口，不保存、不外传任何凭据
- 接口调用方式参考开源项目 [wechatsync](https://github.com/wechatsync/Wechatsync) 的微信适配器：
  - 建草稿：`POST /cgi-bin/operate_appmsg?sub=create&type=77`
  - 传图片：`POST /cgi-bin/filetransfer?action=upload_material`
  - 发表记录：`GET /cgi-bin/appmsgpublish?sub=list`
- 正文里的非微信域名链接会被自动去掉（微信硬性限制，否则报错 412/64507）

## 边界与风险

- 这些是微信后台的内部接口，没有文档，改版就会失效，坏了要跟着修
- 只用于自己的账号、手动触发、正常频率；不要拿去做批量或高频自动化
- 标题超 64 字会被截断；正文违规、素材库满等情况会把微信返回的错误原样提示出来
