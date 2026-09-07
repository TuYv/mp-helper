// 公众号后台接口封装。content script 和 background service worker 共用，
// service worker 里没有 DOM，因此全部用字符串/正则实现。
// 接口调用方式参考 wechatsync（https://github.com/wechatsync/Wechatsync）的微信适配器。

// 错误码对照表，来自 wechatsync 实测积累
const MP_ERROR_MAP = {
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

let mpMetaCache = null;

// token / ticket / user_name / svr_time 从后台首页 HTML 里正则提取
async function mpGetMeta() {
  if (mpMetaCache) return mpMetaCache;
  const res = await fetch("https://mp.weixin.qq.com/", { credentials: "include" });
  const html = await res.text();
  const pick = (re) => (html.match(re) || [])[1] || "";
  const meta = {
    token: pick(/data:\s*\{[\s\S]*?t:\s*["']([^"']+)["']/),
    ticket: pick(/ticket:\s*["']([^"']+)["']/),
    userName: pick(/user_name:\s*["']([^"']+)["']/),
    svrTime: pick(/time:\s*["'](\d+)["']/),
  };
  if (!meta.token) throw new Error("拿不到 token，请确认已在此浏览器登录公众号后台");
  mpMetaCache = meta;
  return meta;
}

function mpDataUriToBlob(uri) {
  const [head, data] = uri.split(",");
  const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function mpUploadImage(blob, meta) {
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
  const res = await fetch(`https://mp.weixin.qq.com/cgi-bin/filetransfer?${q}`, {
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

// 微信不允许非微信域名的链接（错误码 412/64507），外链只保留文字
function mpStripExternalLinks(html) {
  return html.replace(
    /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (match, href, text) => {
      const keep =
        href.includes("mp.weixin.qq.com") ||
        href.includes("weixin.qq.com") ||
        href.startsWith("#");
      return keep ? match : `<span>${text}</span>`;
    }
  );
}

async function mpCreateDraft(title, content, meta, coverUrl) {
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
    `https://mp.weixin.qq.com/cgi-bin/operate_appmsg?t=ajax-response&sub=create&type=77&token=${meta.token}&lang=zh_CN`,
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
    throw new Error(MP_ERROR_MAP[ret] || `保存失败（错误码 ${ret}）`);
  }
  return json.appMsgId;
}

// 完整流程：上传 base64 图片 -> 替换地址 -> 剔除外链 -> 首图设封面 -> 建草稿
async function mpPublishDraft(title, html, onProgress) {
  const meta = await mpGetMeta();

  const srcs = [...html.matchAll(/src=["'](data:image\/[^"']+)["']/g)].map((m) => m[1]);
  const unique = [...new Set(srcs)];
  for (let i = 0; i < unique.length; i++) {
    onProgress?.(`上传图片 ${i + 1}/${unique.length}…`);
    const cdnUrl = await mpUploadImage(mpDataUriToBlob(unique[i]), meta);
    html = html.split(unique[i]).join(cdnUrl);
  }

  // 替换完之后，文档顺序的第一张微信图就是封面
  const coverUrl = (html.match(/src=["'](https?:\/\/mmbiz\.qpic\.cn[^"']+)["']/) || [])[1] || "";

  // 压缩标签间空白，避免公众号编辑器（ProseMirror）产生空节点
  html = mpStripExternalLinks(html).replace(/>\s+</g, "><");

  onProgress?.("正在创建草稿…");
  const appMsgId = await mpCreateDraft(String(title).slice(0, 64), html, meta, coverUrl);
  return {
    appMsgId,
    editUrl:
      `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77` +
      `&appmsgid=${appMsgId}&token=${meta.token}&lang=zh_CN`,
  };
}

// 发表记录，嵌套的字符串化 JSON 逐层解开
async function mpExportPublished(count) {
  const meta = await mpGetMeta();
  const res = await fetch(
    `https://mp.weixin.qq.com/cgi-bin/appmsgpublish?sub=list&begin=0&count=${count || 20}&token=${meta.token}&lang=zh_CN&f=json&ajax=1`,
    { credentials: "include" }
  );
  const data = await res.json();
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
  return data;
}
