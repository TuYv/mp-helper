// mp-helper 公众号助手
// 只注入 mp.weixin.qq.com/cgi-bin/* 的后台页面（公开文章页在 /s/ 下，不会注入）
// 接口调用方式参考 wechatsync（https://github.com/wechatsync/Wechatsync）的微信适配器
(() => {
  "use strict";

  const PAGE_URL = new URL(location.href);
  if (!PAGE_URL.pathname.startsWith("/cgi-bin/")) return;

  // 错误码对照表，来自 wechatsync 实测积累
  const ERROR_MAP = {
    "-6": "请输入验证码",
    "-8": "请输入验证码",
    "-1": "系统错误，请稍后重试",
    "-2": "参数错误",
    "-5": "服务错误，请稍后重试",
    "-99": "内容超出字数，请调整",
    "-206": "服务负荷过大，请稍后重试",
    "200003": "登录态超时，请重新登录",
    "412": "图文中含非法外链",
    "62752": "可能含有具备安全风险的链接，请检查",
    "64506": "保存失败，链接不合法",
    "64507": "内容不能包含外部链接",
    "64562": "请勿插入非微信域名的链接",
    "64515": "当前素材非最新内容，请重新打开并编辑",
    "64702": "标题超出64字长度限制",
    "64705": "内容超出字数，请调整",
    "10806": "正文含违规内容，请重新编辑",
    "10807": "内容不能违反公众平台协议",
    "220001": "素材库存储数量已达上限",
    "220002": "图片库已达到存储上限",
  };

  // ---------- 后台元信息（token / ticket / user_name / svr_time） ----------

  let metaCache = null;

  function extractMeta(html) {
    const pick = (re) => {
      const m = html.match(re);
      return m ? m[1] : "";
    };
    return {
      token:
        PAGE_URL.searchParams.get("token") ||
        pick(/data:\s*\{[\s\S]*?t:\s*["']([^"']+)["']/),
      ticket: pick(/ticket:\s*["']([^"']+)["']/),
      userName: pick(/user_name:\s*["']([^"']+)["']/),
      svrTime: pick(/time:\s*["'](\d+)["']/),
    };
  }

  async function getMeta() {
    if (metaCache) return metaCache;
    let meta = extractMeta(document.documentElement.innerHTML);
    if (!meta.token || !meta.ticket) {
      // 当前页面拿不全就抓一次后台首页，登录态跟着 cookie 走
      const res = await fetch("https://mp.weixin.qq.com/", { credentials: "include" });
      const fetched = extractMeta(await res.text());
      meta = {
        token: meta.token || fetched.token,
        ticket: meta.ticket || fetched.ticket,
        userName: meta.userName || fetched.userName,
        svrTime: meta.svrTime || fetched.svrTime,
      };
    }
    if (!meta.token) throw new Error("拿不到 token，请确认已登录公众号后台");
    metaCache = meta;
    return meta;
  }

  // ---------- 图片：data URI -> 微信素材库 ----------

  function dataUriToBlob(uri) {
    const [head, data] = uri.split(",");
    const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function uploadImage(blob, meta) {
    const ts = Date.now();
    const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const name = `${ts}.${ext}`;
    const fd = new FormData();
    fd.append("type", blob.type || "image/jpeg");
    fd.append("id", String(ts));
    fd.append("name", name);
    fd.append("lastModifiedDate", new Date().toString());
    fd.append("size", String(blob.size));
    fd.append("file", blob, name);

    const q =
      `action=upload_material&f=json&scene=8&writetype=doublewrite&groupid=1` +
      `&ticket_id=${meta.userName}&ticket=${meta.ticket}&svr_time=${meta.svrTime}` +
      `&token=${meta.token}&lang=zh_CN&seq=${ts}&t=${Math.random()}`;
    const res = await fetch(`/cgi-bin/filetransfer?${q}`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const json = await res.json();
    if (json.base_resp?.err_msg !== "ok" || !json.cdn_url) {
      throw new Error(`图片上传失败: ${json.base_resp?.err_msg || "未知错误"}`);
    }
    return json.cdn_url;
  }

  // ---------- 建草稿 ----------

  async function createDraft(title, content, meta, coverUrl) {
    const form = new URLSearchParams({
      token: meta.token,
      lang: "zh_CN",
      f: "json",
      ajax: "1",
      random: String(Math.random()),
      AppMsgId: "",
      count: "1",
      data_seq: "0",
      operate_from: "Chrome",
      isnew: "0",
      title0: title,
      author0: "",
      writerid0: "0",
      fileid0: "",
      digest0: "",
      auto_gen_digest0: "1",
      content0: content,
      sourceurl0: "",
      need_open_comment0: "1",
      only_fans_can_comment0: "0",
      cdn_url0: coverUrl || "",
      cdn_235_1_url0: coverUrl || "",
      cdn_1_1_url0: coverUrl || "",
      cdn_url_back0: coverUrl || "",
      crop_list0: "",
      music_id0: "",
      video_id0: "",
      voteid0: "",
      voteismlt0: "",
      supervoteid0: "",
      cardid0: "",
      cardquantity0: "",
      cardlimit0: "",
      vid_type0: "",
      show_cover_pic0: "0",
      shortvideofileid0: "",
      copyright_type0: "0",
      releasefirst0: "",
      platform0: "",
      reprint_permit_type0: "",
      allow_reprint0: "",
      allow_reprint_modify0: "",
      original_article_type0: "",
      ori_white_list0: "",
      free_content0: "",
      fee0: "0",
      ad_id0: "",
      guide_words0: "",
      is_share_copyright0: "0",
      share_copyright_url0: "",
      source_article_type0: "",
      reprint_recommend_title0: "",
      reprint_recommend_content0: "",
      share_page_type0: "0",
      share_imageinfo0: '{"list":[]}',
      share_video_id0: "",
      dot0: "{}",
      share_voice_id0: "",
      insert_ad_mode0: "",
      categories_list0: "[]",
      ad_video_transition0: "",
      can_reward0: "0",
      related_video0: "",
      is_video_recommend0: "-1",
    });

    const res = await fetch(
      `/cgi-bin/operate_appmsg?t=ajax-response&sub=create&type=77&token=${meta.token}&lang=zh_CN`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      }
    );
    const json = await res.json();
    if (!json.appMsgId) {
      const ret = String(json.ret ?? json.base_resp?.ret);
      throw new Error(ERROR_MAP[ret] || `保存失败（错误码 ${ret}）`);
    }
    return json.appMsgId;
  }

  // ---------- 导入流程 ----------

  function stripExternalLinks(root) {
    root.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const keep =
        href.includes("mp.weixin.qq.com") ||
        href.includes("weixin.qq.com") ||
        href.startsWith("#");
      if (!keep) {
        const span = root.ownerDocument.createElement("span");
        span.innerHTML = a.innerHTML;
        a.replaceWith(span);
      }
    });
  }

  async function importHtmlFile(file) {
    const meta = await getMeta();
    const doc = new DOMParser().parseFromString(await file.text(), "text/html");
    const article = doc.querySelector("#wechat-article");
    if (!article) {
      throw new Error("文件里没找到 #wechat-article 容器，请选 wechat-article 生成的预览文件");
    }
    const title = (doc.querySelector("title")?.textContent || "未命名")
      .replace(/\s*-\s*微信预览\s*$/, "")
      .slice(0, 64);

    let coverUrl = "";
    const imgs = [...article.querySelectorAll("img")];
    for (let i = 0; i < imgs.length; i++) {
      const src = imgs[i].getAttribute("src") || "";
      if (src.startsWith("data:")) {
        toast(`上传图片 ${i + 1}/${imgs.length}…`);
        const cdnUrl = await uploadImage(dataUriToBlob(src), meta);
        imgs[i].setAttribute("src", cdnUrl);
        if (!coverUrl) coverUrl = cdnUrl;
      } else if (!coverUrl && src.includes("mmbiz.qpic.cn")) {
        coverUrl = src;
      }
    }

    stripExternalLinks(article);
    // 压缩标签间空白，避免公众号编辑器（ProseMirror）产生空节点
    const content = article.outerHTML.replace(/>\s+</g, "><");

    toast("正在创建草稿…");
    const appMsgId = await createDraft(title, content, meta, coverUrl);
    const editUrl =
      `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77` +
      `&appmsgid=${appMsgId}&token=${meta.token}&lang=zh_CN`;
    toast(`草稿「${title}」已创建`, { text: "打开草稿", url: editUrl });
  }

  // ---------- 导出发表记录 ----------

  async function exportPublished() {
    const meta = await getMeta();
    toast("正在拉取发表记录…");
    const res = await fetch(
      `/cgi-bin/appmsgpublish?sub=list&begin=0&count=20&token=${meta.token}&lang=zh_CN&f=json&ajax=1`,
      { credentials: "include" }
    );
    const data = await res.json();
    // publish_page 和每条的 publish_info 都是字符串化 JSON，逐层解开
    try {
      data.publish_page = JSON.parse(data.publish_page);
      for (const item of data.publish_page.publish_list || []) {
        try {
          item.publish_info = JSON.parse(item.publish_info);
        } catch {}
      }
    } catch {
      // 结构变了就保留原样
    }
    const day = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mp-published-${day}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("发表记录已导出为 JSON");
  }

  // ---------- UI ----------

  function toast(message, link) {
    document.getElementById("fne-toast")?.remove();
    const box = document.createElement("div");
    box.id = "fne-toast";
    box.textContent = message;
    if (link) {
      const btn = document.createElement("button");
      btn.textContent = link.text;
      btn.addEventListener("click", () => window.open(link.url, "_blank"));
      box.appendChild(document.createElement("br"));
      box.appendChild(btn);
    }
    document.body.appendChild(box);
    if (!link) setTimeout(() => box.remove(), 5000);
  }

  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = "fne-panel";

    const title = document.createElement("div");
    title.className = "fne-title";
    title.textContent = "MP HELPER";
    panel.appendChild(title);

    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".html,.htm";
    picker.style.display = "none";
    picker.addEventListener("change", () => {
      const file = picker.files?.[0];
      picker.value = "";
      if (!file) return;
      importHtmlFile(file).catch((err) => toast(`导入失败：${err.message}`));
    });
    panel.appendChild(picker);

    const importBtn = document.createElement("button");
    importBtn.className = "fne-primary";
    importBtn.textContent = "导入 HTML 存草稿";
    importBtn.addEventListener("click", () => picker.click());
    panel.appendChild(importBtn);

    const exportBtn = document.createElement("button");
    exportBtn.textContent = "导出发表记录";
    exportBtn.addEventListener("click", () => {
      exportPublished().catch((err) => toast(`导出失败：${err.message}`));
    });
    panel.appendChild(exportBtn);

    document.body.appendChild(panel);
  }

  buildPanel();
})();
