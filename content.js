(function () {
  "use strict";

  let enabled = true;
  chrome.storage?.local?.get({ enabled: true }, (d) => { enabled = d.enabled !== false; });
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === "local" && "enabled" in changes) enabled = changes.enabled.newValue !== false;
  });

  let lastCopied = "";
  let debounceTimer = null;

  function isPasswordField(el) {
    return !!el && el.tagName === "INPUT" && el.type === "password";
  }

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

  function maybeCopySelection() {
    if (!enabled) return;
    const sel = window.getSelection();
    const text = sel.toString();
    if (!text.trim() || text === lastCopied) return;
    if (isPasswordField(document.activeElement)) return;

    navigator.clipboard.writeText(text).then(() => {
      lastCopied = text;
      try {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        showToast(rect);
      } catch (_) {}
    }).catch(() => {});
  }

  // Mouse-drag selection
  document.addEventListener("mouseup", maybeCopySelection);

  // Keyboard selection (Shift+Arrow, Ctrl+A, etc.) — debounced so it only
  // fires once selection settles, not on every intermediate keystroke
  document.addEventListener("selectionchange", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(maybeCopySelection, 300);
  });

  // Double-click an editable field → paste at the cursor
  document.addEventListener("dblclick", async () => {
    if (!enabled) return;
    const el = document.activeElement;
    const isEditable = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    if (!isEditable) return;

    try {
      const text = await navigator.clipboard.readText();
      if (text) document.execCommand("insertText", false, text);
    } catch (_) {}
  });
})();
