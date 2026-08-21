async function ensurePageBridge(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "ping" });
    return { ok: true };
  } catch {
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      return { ok: true, injected: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "This browser page cannot be adjusted." };
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.tabId) return;
  (async () => {
    const bridge = await ensurePageBridge(message.tabId);
    if (!bridge.ok) return sendResponse({ applied: false, error: bridge.error });
    if (message.type === "apply-active-tab") {
      await chrome.tabs.sendMessage(message.tabId, { type: "apply", state: message.state });
      return sendResponse({ applied: true, injected: Boolean(bridge.injected) });
    }
    if (message.type === "speak-active-tab" || message.type === "pause-active-tab" || message.type === "resume-active-tab") {
      const type = message.type === "speak-active-tab" ? "speak" : message.type === "pause-active-tab" ? "pause-speech" : "resume-speech";
      const response = await chrome.tabs.sendMessage(message.tabId, { type });
      if (response?.applied === false) return sendResponse({ applied: false, error: response.error || "No active reading was found." });
      return sendResponse({ applied: true, injected: Boolean(bridge.injected) });
    }
    return sendResponse({ applied: false, error: "Unsupported extension action." });
  })().catch((error) => sendResponse({ applied: false, error: error instanceof Error ? error.message : "Unable to apply this setting." }));
  return true;
});
