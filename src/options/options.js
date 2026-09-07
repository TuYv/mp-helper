const $ = (id) => document.getElementById(id);

chrome.storage.local
  .get({ agentEnabled: false, bridgePort: 8923, bridgeToken: "" })
  .then((cfg) => {
    $("enabled").checked = cfg.agentEnabled;
    $("port").value = cfg.bridgePort;
    // 首次打开自动生成口令，用户不用自己编
    $("token").value =
      cfg.bridgeToken ||
      [...crypto.getRandomValues(new Uint8Array(12))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
  });

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    agentEnabled: $("enabled").checked,
    bridgePort: Number($("port").value) || 8923,
    bridgeToken: $("token").value.trim(),
  });
  $("status").textContent = "已保存";
  setTimeout(() => ($("status").textContent = ""), 2000);
});
