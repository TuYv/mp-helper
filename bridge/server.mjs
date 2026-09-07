// mp-helper 本地桥：AI 助手与浏览器插件之间的任务中转站。
// 只监听 127.0.0.1，所有请求需带口令。无第三方依赖，Node >= 18。
//
// 启动：node bridge/server.mjs --token 你的口令 [--port 8923]
//
// AI 侧接口（任何能发 HTTP 的 agent 都能用）：
//   GET  /api/status                       -> { extension_online, queued }
//   GET  /api/published?count=20           -> 发表记录 JSON
//   POST /api/create_draft {title, html}   -> { appMsgId, editUrl }（html 内 base64 图片自动上传）
// 插件侧接口：
//   GET  /ext/poll                         -> { job | null }
//   POST /ext/result {id, ok, data, error}
import http from "node:http";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const PORT = Number(argOf("--port")) || Number(process.env.MP_HELPER_PORT) || 8923;
const TOKEN =
  argOf("--token") || process.env.MP_HELPER_TOKEN || crypto.randomBytes(12).toString("hex");

const EXT_OFFLINE_MS = 90_000; // 插件轮询周期 30s，超过 90s 没来视为离线
const JOB_TIMEOUT_MS = 300_000; // 传图可能很慢，给足 5 分钟
const MAX_BODY = 64 * 1024 * 1024; // base64 图文可能很大

const queue = [];
const waiters = new Map(); // job id -> resolve
let lastPoll = 0;
let seq = 0;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

function extensionOnline() {
  return Date.now() - lastPoll < EXT_OFFLINE_MS;
}

// 把任务放进队列并等插件送回结果
function runJob(type, payload, timeoutMs = JOB_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!extensionOnline()) {
      reject(
        new Error(
          "插件不在线：请确认 Chrome 已打开、mp-helper 已在设置页开启 Agent 模式且口令一致（插件最长 30 秒领一次任务）"
        )
      );
      return;
    }
    const id = `job-${Date.now()}-${++seq}`;
    const timer = setTimeout(() => {
      waiters.delete(id);
      reject(new Error("任务超时：插件没有在时限内送回结果"));
    }, timeoutMs);
    waiters.set(id, (result) => {
      clearTimeout(timer);
      waiters.delete(id);
      result.ok ? resolve(result.data) : reject(new Error(result.error || "插件执行失败"));
    });
    queue.push({ id, type, payload });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const token = req.headers["x-bridge-token"] || url.searchParams.get("token");
  if (token !== TOKEN) {
    send(res, 401, { error: "口令不对" });
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/ext/poll") {
      lastPoll = Date.now();
      send(res, 200, { job: queue.shift() || null });
      return;
    }

    if (req.method === "POST" && url.pathname === "/ext/result") {
      const result = JSON.parse(await readBody(req));
      waiters.get(result.id)?.(result);
      send(res, 200, {});
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      send(res, 200, { extension_online: extensionOnline(), queued: queue.length });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/published") {
      const count = Number(url.searchParams.get("count")) || 20;
      const data = await runJob("export_published", { count }, 60_000);
      send(res, 200, data);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/create_draft") {
      const { title, html } = JSON.parse(await readBody(req));
      if (!title || !html) {
        send(res, 400, { error: "需要 title 和 html 两个字段" });
        return;
      }
      const data = await runJob("create_draft", { title, html });
      send(res, 200, data);
      return;
    }

    send(res, 404, { error: "没有这个接口" });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mp-helper 桥已启动: http://127.0.0.1:${PORT}`);
  console.log(`口令: ${TOKEN}`);
  console.log("把口令填进插件设置页并开启 Agent 模式即可。");
});
