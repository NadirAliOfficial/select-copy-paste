const toggle = document.getElementById("enabled");

chrome.storage.local.get({ enabled: true }, (d) => {
  toggle.checked = d.enabled !== false;
});

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: toggle.checked });
});
