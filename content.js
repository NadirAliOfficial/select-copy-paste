(function () {
  "use strict";

  const HISTORY_LIMIT = 20;

  let enabled = true;
  chrome.storage?.local?.get({ enabled: true }, (d) => { enabled = d.enabled !== false; });
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === "local" && "enabled" in changes) enabled = changes.enabled.newValue !== false;
  });

  let lastCopied = "";
  let debounceTimer = null;
  let lastFocusedEditable = null;

  function isEditable(el) {
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  }

  function isPasswordField(el) {
    return !!el && el.tagName === "INPUT" && el.type === "password";
  }

  // Remember the last real editable field the user focused, so the popup
  // can insert text there even after focus moves to the extension popup.
  document.addEventListener("focusin", (e) => {
    if (isEditable(e.target)) lastFocusedEditable = e.target;
  });

  function showToast(rect) {
    const toast = document.createElement("div");
    toast.textContent = "Copied";
    toast.style.cssText = `
      position: fixed;
      left: ${Math.max(8, rect.left)}px;
      top: ${Math.max(8, rect.top - 28)}px;
      background: #1a1a1a;
      color: #fff;
      font: 600 11px -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 3px 8px;
      border-radius: 6px;
      z-index: 2147483647;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.12s ease;
    `;
    document.documentElement.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = "1"; });
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 150);
    }, 700);
  }

  function pushHistory(text) {
    chrome.storage?.local?.get({ scp_history: [] }, (d) => {
      const list = d.scp_history.filter((item) => item.text !== text);
      list.unshift({ text, ts: Date.now() });
      chrome.storage.local.set({ scp_history: list.slice(0, HISTORY_LIMIT) });
    });
  }

  function maybeCopySelection() {
    if (!enabled) return;
    const sel = window.getSelection();
    const text = sel.toString();
    if (!text.trim() || text === lastCopied) return;
    if (isPasswordField(document.activeElement)) return;

    // Track internally right away — some pages (e.g. WhatsApp Web) block the
    // real Clipboard API entirely, but our own history/paste flow still works.
    lastCopied = text;
    pushHistory(text);
    try {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      showToast(rect);
    } catch (_) {}

    navigator.clipboard.writeText(text).catch(() => {}); // best-effort real clipboard sync
  }

  function insertText(text) {
    const target = (lastFocusedEditable && lastFocusedEditable.isConnected) ? lastFocusedEditable : document.activeElement;
    if (!isEditable(target)) return false;
    target.focus();
    document.execCommand("insertText", false, text);
    return true;
  }

  // Mouse-drag selection
  document.addEventListener("mouseup", maybeCopySelection);

  // Keyboard selection (Shift+Arrow, Ctrl+A, etc.) — debounced so it only
  // fires once selection settles, not on every intermediate keystroke
  document.addEventListener("selectionchange", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(maybeCopySelection, 300);
  });

  // Some sites (e.g. WhatsApp Web) set a Permissions-Policy that blocks the
  // Clipboard API outright for every script on the page, extensions included.
  // Fall back to our own tracked copy history when the real API is blocked.
  function getFallbackText() {
    if (lastCopied) return Promise.resolve(lastCopied);
    return new Promise((resolve) => {
      chrome.storage.local.get({ scp_history: [] }, (d) => resolve(d.scp_history[0]?.text || ""));
    });
  }

  async function getClipboardText() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) return text;
    } catch (_) {
      // Clipboard API blocked by page policy — use our own history instead
    }
    return getFallbackText();
  }

  // Double-click an editable field → paste at the cursor
  document.addEventListener("dblclick", async () => {
    if (!enabled) return;
    if (!isEditable(document.activeElement)) return;
    const text = await getClipboardText();
    if (text) document.execCommand("insertText", false, text);
  });

  // Insert requests coming from the popup (history/pin clicks)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "SCP_INSERT_TEXT") {
      sendResponse({ ok: insertText(msg.text) });
    }
  });
})();
