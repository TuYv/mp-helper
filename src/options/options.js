const $ = (id) => document.getElementById(id);

chrome.storage.local
  .get({ agentEnabled: false, bridgePort: 8923, bridgeToken: "" })
  .then((cfg) => {
    $("enabled").checked = cfg.agentEnabled;
    $("port").value = cfg.bridgePort;
    $("token").value = cfg.bridgeToken;
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
