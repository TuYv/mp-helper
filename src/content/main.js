// mp-helper 公众号助手 — 后台页面手动操作面板
// 接口逻辑在 src/lib/mp-api.js（与 background 共用），本文件只做 UI。
// 只注入 mp.weixin.qq.com/cgi-bin/* 的后台页面（公开文章页在 /s/ 下，不会注入）
(() => {
  "use strict";

  if (!location.pathname.startsWith("/cgi-bin/")) return;

  async function importHtmlFile(file) {
    const doc = new DOMParser().parseFromString(await file.text(), "text/html");
    const article = doc.querySelector("#wechat-article") || doc.querySelector("article");
    if (!article) {
      throw new Error("文件里没找到 #wechat-article 或 <article> 容器");
    }
    const title = (doc.querySelector("title")?.textContent || "未命名")
      .replace(/\s*-\s*微信预览\s*$/, "");

    const { editUrl } = await mpPublishDraft(title, article.outerHTML, toast);
    toast(`草稿「${title.slice(0, 20)}」已创建`, { text: "打开草稿", url: editUrl });
  }

  async function exportPublished() {
    toast("正在拉取发表记录…");
    const data = await mpExportPublished(20);
    const day = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mp-published-${day}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("发表记录已导出为 JSON");
  }

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
