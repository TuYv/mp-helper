# mp-helper 公众号助手

管理自己公众号后台的 Chrome 插件。当前两个功能：

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
