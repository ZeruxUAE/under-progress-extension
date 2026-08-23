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

function truncateForFreeTranslation(text, limit = 430) { const encoder = new TextEncoder(); let output = ""; for (const character of String(text || "")) { if (encoder.encode(output + character).length > limit) break; output += character; } return output; }
async function translateText(message) {
  const target = String(message.target || "").trim();
  const text = truncateForFreeTranslation(message.text);
  if (!target || !text) return { translatedText: "", error: "Select readable text before using free translation." };
  const query = new URLSearchParams({ q: text, langpair: `autodetect|${target}`, mt: "1" });
  const response = await fetch(`https://api.mymemory.translated.net/get?${query}`);
  if (!response.ok) return { translatedText: "", error: "The free translation service is temporarily unavailable. Try again later." };
  const data = await response.json();
  if (data.responseStatus !== 200 || !data.responseData?.translatedText) return { translatedText: "", error: data.responseDetails || "The free translation limit may have been reached. Try again later." };
  return { translatedText: data.responseData.translatedText, sourceLanguage: data.responseData.detectedLanguage || "" };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "translate-text") { translateText(message).then(sendResponse).catch(() => sendResponse({ translatedText: "", error: "The free translation service is unavailable. Try again later." })); return true; }
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
      return sendResponse({ ...response, applied: true, injected: Boolean(bridge.injected) });
    }
    return sendResponse({ applied: false, error: "Unsupported extension action." });
  })().catch((error) => sendResponse({ applied: false, error: error instanceof Error ? error.message : "Unable to apply this setting." }));
  return true;
});
