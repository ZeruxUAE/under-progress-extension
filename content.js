// Under Progress extension — keeps display settings, saved presets, and disability profile metadata in browser storage.
const root = document.documentElement;
let savedProfile = null;
let preferredSpeechLanguage = "";

function normalizedSettings(state = {}) { return { textScale: Number(state.textScale ?? 100), lineSpacing: Number(state.lineSpacing ?? 1.5), readingWidth: Number(state.readingWidth ?? 70), contrast: Boolean(state.contrast), focus: Boolean(state.focus) }; }
function apply(state) { const next = normalizedSettings(state); root.style.setProperty("--up-text-scale", `${next.textScale / 100}`); root.style.setProperty("--up-line-spacing", String(next.lineSpacing)); root.style.setProperty("--up-reading-width", `${next.readingWidth}ch`); root.dataset.upContrast = String(next.contrast); root.dataset.upFocus = String(next.focus); }
function isUnderProgressWebsite() { const host = window.location.hostname; return host === "under-progress-psi.vercel.app" || /^under-progress(?:-[a-z0-9-]+)?\.vercel\.app$/.test(host); }

function extensionContextAvailable() {
  try { return Boolean(globalThis.chrome?.runtime?.id); } catch { return false; }
}

function reportUnavailableContext() {
  if (!isUnderProgressWebsite()) return;
  window.postMessage({ source: "under-progress-extension", type: "connection-unavailable", reason: "extension-reloaded" }, window.location.origin);
}

function storageGet(keys, callback) {
  if (!extensionContextAvailable()) { reportUnavailableContext(); return false; }
  try { chrome.storage.sync.get(keys, callback); return true; } catch { reportUnavailableContext(); return false; }
}

function storageSet(values, callback) {
  if (!extensionContextAvailable()) { reportUnavailableContext(); return false; }
  try { chrome.storage.sync.set(values, callback); return true; } catch { reportUnavailableContext(); return false; }
}

function voiceForLanguage(language) { if (!language || !window.speechSynthesis?.getVoices) return null; const voices = window.speechSynthesis.getVoices(); const requested = language.toLowerCase(); return voices.find(voice => voice.lang?.toLowerCase() === requested) || voices.find(voice => voice.lang?.toLowerCase().split("-")[0] === requested.split("-")[0]) || null; }
function waitForVoice(language) { const immediate = voiceForLanguage(language); if (immediate || !language || !window.speechSynthesis?.addEventListener) return Promise.resolve(immediate); return new Promise(resolve => { let completed = false; const finish = () => { if (completed) return; completed = true; window.speechSynthesis.removeEventListener?.("voiceschanged", onVoicesChanged); window.clearTimeout?.(timeout); resolve(voiceForLanguage(language)); }; const onVoicesChanged = () => { if (voiceForLanguage(language)) finish(); }; const timeout = window.setTimeout?.(finish, 700); window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged); }); }
function languageBase(language) { return String(language || "").toLowerCase().split("-")[0]; }
function needsTranslation(language) { const pageLanguage = document.documentElement.lang || ""; return Boolean(language && languageBase(pageLanguage) !== languageBase(language)); }
function truncateForFreeTranslation(text, limit = 430) { const encoder = new TextEncoder(); let output = ""; for (const character of text) { if (encoder.encode(output + character).length > limit) break; output += character; } return output; }
async function translateForSpeech(text, target) { const response = await chrome.runtime.sendMessage({ type: "translate-text", text: truncateForFreeTranslation(text), target }); if (!response?.translatedText) throw new Error(response?.error || "The free translation service did not return translated text."); return response; }
async function readAloud(text, language, sendResponse, translateBeforeSpeech = false) { if (!text) { sendResponse?.({ applied: false, error: "No readable text was found." }); return; } const selectedLanguage = typeof language === "string" ? language : ""; const voice = selectedLanguage ? await waitForVoice(selectedLanguage) : null; if (selectedLanguage && !voice) { sendResponse?.({ applied: false, language: selectedLanguage, error: `No ${selectedLanguage} voice is installed or available in this browser. Add a matching device voice, then try Read Aloud again.` }); return; } let spokenText = text; let translated = false; if (translateBeforeSpeech) { try { const translation = await translateForSpeech(text, selectedLanguage); spokenText = translation.translatedText; translated = true; } catch (error) { sendResponse?.({ applied: false, language: selectedLanguage, error: error instanceof Error ? error.message : "The free translation service is unavailable. Try again later." }); return; } } window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(spokenText); if (selectedLanguage) { utterance.lang = selectedLanguage; utterance.voice = voice; } window.speechSynthesis.speak(utterance); sendResponse?.({ applied: true, language: selectedLanguage || undefined, voiceLanguage: voice?.lang, translated }); }
function sendProfileToWebsite(settings) { if (!isUnderProgressWebsite() || !settings) return; window.postMessage({ source: "under-progress-extension", type: "extension-profile", settings: normalizedSettings(settings), profile: savedProfile }, window.location.origin); }

if (extensionContextAvailable()) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;
    if (message.type === "ping") { sendResponse?.({ ready: true }); return; }
    if (message.type === "apply") { apply(message.state); sendResponse?.({ applied: true }); return; }
    if (message.type === "speak") {
      const selected = window.getSelection()?.toString().trim();
      const fallback = document.querySelector("main, article, [role=main]")?.innerText?.slice(0, 1800) || document.body.innerText.slice(0, 1800);
      const text = selected || fallback;
      storageGet(["underProgressProfile", "underProgressSpeechLanguage", "underProgressTranslateBeforeSpeech"], ({ underProgressProfile, underProgressSpeechLanguage, underProgressTranslateBeforeSpeech }) => {
        if (!extensionContextAvailable()) { reportUnavailableContext(); return; }
        savedProfile = underProgressProfile || savedProfile;
        preferredSpeechLanguage = underProgressSpeechLanguage || savedProfile?.language || preferredSpeechLanguage;
        const translateBeforeSpeech = Boolean(underProgressTranslateBeforeSpeech) && needsTranslation(preferredSpeechLanguage);
        if (preferredSpeechLanguage && needsTranslation(preferredSpeechLanguage) && !underProgressTranslateBeforeSpeech) { sendResponse?.({ applied: false, language: preferredSpeechLanguage, error: "Free translation is off. Turn on “Translate before speaking” to hear this page in your saved language instead of an accent." }); return; }
        readAloud(text, preferredSpeechLanguage, sendResponse, translateBeforeSpeech);
      });
      return true;
    }
    if (message.type === "pause-speech") { if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) { window.speechSynthesis.pause(); sendResponse?.({ applied: true }); } else sendResponse?.({ applied: false, error: "There is no active reading to pause." }); return; }
    if (message.type === "resume-speech") { if (window.speechSynthesis.paused) { window.speechSynthesis.resume(); sendResponse?.({ applied: true }); } else sendResponse?.({ applied: false, error: "There is no paused reading to resume." }); }
  });
}

storageGet(["underProgress", "underProgressProfile", "underProgressSpeechLanguage"], ({ underProgress, underProgressProfile, underProgressSpeechLanguage }) => {
  if (!extensionContextAvailable()) { reportUnavailableContext(); return; }
  savedProfile = underProgressProfile || null;
  preferredSpeechLanguage = underProgressSpeechLanguage || savedProfile?.language || "";
  if (underProgress && !isUnderProgressWebsite()) apply(underProgress);
  if (isUnderProgressWebsite()) { window.postMessage({ source: "under-progress-extension", type: "connection-status" }, window.location.origin); sendProfileToWebsite(underProgress); }
});

if (extensionContextAvailable()) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !extensionContextAvailable()) return;
    if (changes.underProgressProfile) savedProfile = changes.underProgressProfile.newValue || null;
    if (changes.underProgressSpeechLanguage) preferredSpeechLanguage = changes.underProgressSpeechLanguage.newValue || savedProfile?.language || "";
    if (changes.underProgress) { const settings = normalizedSettings(changes.underProgress.newValue); if (!isUnderProgressWebsite()) apply(settings); sendProfileToWebsite(settings); }
  });
}

window.addEventListener("message", (event) => {
  if (!isUnderProgressWebsite() || event.origin !== window.location.origin || event.source !== window) return;
  const message = event.data;
  if (!message || message.source !== "under-progress-website") return;
  if (!extensionContextAvailable()) { reportUnavailableContext(); return; }
  if (message.type === "request-profile") {
    storageGet(["underProgress", "underProgressProfile", "underProgressSpeechLanguage"], ({ underProgress, underProgressProfile, underProgressSpeechLanguage }) => {
      if (!extensionContextAvailable()) { reportUnavailableContext(); return; }
      savedProfile = underProgressProfile || null;
      preferredSpeechLanguage = underProgressSpeechLanguage || savedProfile?.language || "";
      window.postMessage({ source: "under-progress-extension", type: "connection-status" }, window.location.origin);
      sendProfileToWebsite(underProgress);
    });
  }
  if (message.type === "set-language" && typeof message.language === "string") {
    storageGet(["underProgressProfile"], ({ underProgressProfile }) => {
      if (!extensionContextAvailable()) { reportUnavailableContext(); return; }
      preferredSpeechLanguage = message.language;
      savedProfile = { ...(underProgressProfile || {}), language: message.language };
      storageSet({ underProgressProfile: savedProfile, underProgressSpeechLanguage: message.language }, () => window.postMessage({ source: "under-progress-extension", type: "language-saved", language: message.language }, window.location.origin));
    });
  }
  if (message.type === "save-profile" && message.settings) {
    const settings = normalizedSettings(message.settings);
    savedProfile = { ...(savedProfile || {}), ...(message.profile || {}) };
    preferredSpeechLanguage = savedProfile.language || preferredSpeechLanguage;
    const preset = { id: "website-default", name: savedProfile?.presetName || "Website default", settings };
    storageGet(["underProgressPresets"], ({ underProgressPresets }) => {
      if (!extensionContextAvailable()) { reportUnavailableContext(); return; }
      const previous = Array.isArray(underProgressPresets) ? underProgressPresets.filter(item => item?.id !== "website-default") : [];
      storageSet({ underProgress: settings, underProgressProfile: savedProfile, underProgressSpeechLanguage: preferredSpeechLanguage, underProgressPresets: [...previous, preset], underProgressDefaultPreset: "website-default" }, () => { window.postMessage({ source: "under-progress-extension", type: "preset-saved", presetName: preset.name }, window.location.origin); });
    });
  }
});
