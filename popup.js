const PIN_LIMIT = 9;

const toggle = document.getElementById("enabled");
const pinnedList = document.getElementById("pinnedList");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistory");

chrome.storage.local.get({ enabled: true }, (d) => {
  toggle.checked = d.enabled !== false;
});
toggle.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: toggle.checked });
});

function truncate(text, max = 60) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

async function insertIntoPage(text) {
  await navigator.clipboard.writeText(text).catch(() => {});
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "SCP_INSERT_TEXT", text }, () => {
    void chrome.runtime.lastError; // ignore — tab may not have the content script (chrome:// pages etc.)
  });
}

function makeItem(text, { pinned }) {
  const el = document.createElement("div");
  el.className = "item";

  const label = document.createElement("span");
  label.className = "item-text";
  label.textContent = truncate(text);
  label.title = text;
  el.appendChild(label);

  const pinBtn = document.createElement("button");
  pinBtn.className = "item-btn";
  pinBtn.textContent = pinned ? "★" : "☆";
  pinBtn.title = pinned ? "Unpin" : "Pin";
  pinBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    pinned ? unpin(text) : pin(text);
  });
  el.appendChild(pinBtn);

  const removeBtn = document.createElement("button");
  removeBtn.className = "item-btn remove";
  removeBtn.textContent = "✕";
  removeBtn.title = "Remove";
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    pinned ? unpin(text) : removeFromHistory(text);
  });
  el.appendChild(removeBtn);

  el.addEventListener("click", () => insertIntoPage(text));
  return el;
}

function render() {
  chrome.storage.local.get({ scp_pins: [], scp_history: [] }, ({ scp_pins, scp_history }) => {
    pinnedList.innerHTML = "";
    if (!scp_pins.length) {
      pinnedList.innerHTML = '<div class="empty">Nothing pinned yet</div>';
    } else {
      scp_pins.forEach((item) => pinnedList.appendChild(makeItem(item.text, { pinned: true })));
    }

    historyList.innerHTML = "";
    const pinnedTexts = new Set(scp_pins.map((p) => p.text));
    const unpinnedHistory = scp_history.filter((item) => !pinnedTexts.has(item.text));
    if (!unpinnedHistory.length) {
      historyList.innerHTML = '<div class="empty">Nothing copied yet</div>';
    } else {
      unpinnedHistory.forEach((item) => historyList.appendChild(makeItem(item.text, { pinned: false })));
    }
  });
}

function pin(text) {
  chrome.storage.local.get({ scp_pins: [] }, ({ scp_pins }) => {
    if (scp_pins.some((p) => p.text === text)) return;
    const next = [{ text, ts: Date.now() }, ...scp_pins].slice(0, PIN_LIMIT);
    chrome.storage.local.set({ scp_pins: next }, render);
  });
}

function unpin(text) {
  chrome.storage.local.get({ scp_pins: [] }, ({ scp_pins }) => {
    chrome.storage.local.set({ scp_pins: scp_pins.filter((p) => p.text !== text) }, render);
  });
}

function removeFromHistory(text) {
  chrome.storage.local.get({ scp_history: [] }, ({ scp_history }) => {
    chrome.storage.local.set({ scp_history: scp_history.filter((h) => h.text !== text) }, render);
  });
}

clearHistoryBtn.addEventListener("click", () => {
  chrome.storage.local.set({ scp_history: [] }, render);
});

render();
