// mp-helper Agent 模式：background service worker 定期向本地桥（bridge/server.mjs）
// 领任务，用当前浏览器的公众号登录态执行，结果送回桥，由用户自己的 AI 助手消费。
// 默认关闭，需在插件设置页开启并配置口令。
importScripts("./lib/mp-api.js");

const ALARM = "fne-bridge-poll";

chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) tick();
});

function ensureAlarm() {
  // MV3 alarms 最小周期 30 秒，任务延迟上限约半分钟
  chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
}

async function getConfig() {
  return chrome.storage.local.get({
    agentEnabled: false,
    bridgePort: 8923,
    bridgeToken: "",
  });
}

async function tick() {
  const cfg = await getConfig();
  if (!cfg.agentEnabled || !cfg.bridgeToken) return;

  const base = `http://127.0.0.1:${cfg.bridgePort}`;
  const headers = { "x-bridge-token": cfg.bridgeToken };

  let job = null;
  try {
    const res = await fetch(`${base}/ext/poll`, { headers });
    if (!res.ok) return;
    job = (await res.json()).job;
  } catch {
    return; // 桥没开，静默跳过
  }
  if (!job) return;

  let result;
  try {
    if (job.type === "create_draft") {
      const { title, html } = job.payload || {};
      if (!title || !html) throw new Error("缺少 title 或 html");
      const data = await mpPublishDraft(title, html);
      result = { id: job.id, ok: true, data };
    } else if (job.type === "export_published") {
      const data = await mpExportPublished(job.payload?.count);
      result = { id: job.id, ok: true, data };
    } else {
      result = { id: job.id, ok: false, error: `未知指令: ${job.type}` };
    }
  } catch (err) {
    result = { id: job.id, ok: false, error: err.message };
  }

  try {
    await fetch(`${base}/ext/result`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(result),
    });
  } catch {
    return;
  }
  // 干完一件立刻再问一次，连续任务不用等下个 alarm
  tick();
}
