import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("./content.js", import.meta.url), "utf8");
const posted = [];
const listeners = {};
const storageListeners = [];
let storedSettings;
let storedProfile;
let storedPresets;
let storedDefaultPreset;
let storedSpeechLanguage;
let storedTranslateBeforeSpeech;
let storedSpeechRate = 0.7;
let storedSpeechPitch = 0.8;
let translationRequest;
const extensionVoiceRequests = [];
let storageGetCalls = 0;
const root = { style: { values: {}, setProperty(key, value) { this.values[key] = value; } }, dataset: {} };
const speech = { speaking: false, paused: false, starts: 0, lastUtterance: null, cancel() { this.speaking = false; this.paused = false; }, speak(utterance) { this.speaking = true; this.paused = false; this.starts += 1; this.lastUtterance = utterance; }, pause() { this.paused = true; }, resume() { this.paused = false; }, getVoices() { return [{ lang: "ar-AE", name: "Arabic test voice" }, { lang: "zh-CN", name: "Chinese test voice" }]; } };
const windowMock = {
  location: { origin: "https://under-progress-psi.vercel.app", hostname: "under-progress-psi.vercel.app" },
  postMessage(message, origin) { posted.push({ message, origin }); },
  addEventListener(type, callback) { listeners[type] = callback; },
  getSelection() { return { toString: () => "A short reading test." }; },
  speechSynthesis: speech,
};
const chromeMock = {
  runtime: { id: "under-progress-test", onMessage: { addListener(callback) { listeners.runtime = callback; } }, sendMessage(message) { if (message.type === "get-tts-voice-support") return Promise.resolve({ available: true, language: message.language, voiceLanguage: message.language, voiceName: "Extension matching voice" }); if (message.type === "speak-with-extension-voice") { extensionVoiceRequests.push(message); return Promise.resolve({ applied: true, language: message.language, voiceLanguage: message.language, engine: "extension" }); } if (message.type === "pause-extension-voice" || message.type === "resume-extension-voice") return Promise.resolve({ applied: true, engine: "extension" }); translationRequest = message; return Promise.resolve({ translatedText: String(message.target).startsWith("ar") ? "ينبغي أن يكون التعلم متاحاً." : "学习应该是无障碍的。", sourceLanguage: "en" }); } },
  storage: {
    sync: {
      get(_key, callback) { storageGetCalls += 1; callback({ underProgress: storedSettings, underProgressProfile: storedProfile, underProgressPresets: storedPresets, underProgressDefaultPreset: storedDefaultPreset, underProgressSpeechLanguage: storedSpeechLanguage, underProgressTranslateBeforeSpeech: storedTranslateBeforeSpeech, underProgressSpeechRate: storedSpeechRate, underProgressSpeechPitch: storedSpeechPitch }); },
      set(values, callback) {
        const changes = {};
        if ("underProgress" in values) { storedSettings = values.underProgress; changes.underProgress = { newValue: storedSettings }; }
        if ("underProgressProfile" in values) { storedProfile = values.underProgressProfile; changes.underProgressProfile = { newValue: storedProfile }; }
        if ("underProgressPresets" in values) { storedPresets = values.underProgressPresets; changes.underProgressPresets = { newValue: storedPresets }; }
        if ("underProgressDefaultPreset" in values) { storedDefaultPreset = values.underProgressDefaultPreset; changes.underProgressDefaultPreset = { newValue: storedDefaultPreset }; }
        if ("underProgressSpeechLanguage" in values) { storedSpeechLanguage = values.underProgressSpeechLanguage; changes.underProgressSpeechLanguage = { newValue: storedSpeechLanguage }; }
        if ("underProgressTranslateBeforeSpeech" in values) { storedTranslateBeforeSpeech = values.underProgressTranslateBeforeSpeech; changes.underProgressTranslateBeforeSpeech = { newValue: storedTranslateBeforeSpeech }; }
        if ("underProgressSpeechRate" in values) { storedSpeechRate = values.underProgressSpeechRate; changes.underProgressSpeechRate = { newValue: storedSpeechRate }; }
        if ("underProgressSpeechPitch" in values) { storedSpeechPitch = values.underProgressSpeechPitch; changes.underProgressSpeechPitch = { newValue: storedSpeechPitch }; }
        storageListeners.forEach((callback) => callback(changes, "sync"));
        callback?.();
      },
    },
    onChanged: { addListener(callback) { storageListeners.push(callback); } },
  },
};
root.lang = "en";
const context = { window: windowMock, document: { documentElement: root, body: { innerText: "" }, querySelector: () => null }, chrome: chromeMock, SpeechSynthesisUtterance: function SpeechSynthesisUtterance(text) { this.text = text; }, TextEncoder, console };
vm.runInNewContext(source, context);

assert.equal(posted.filter(({ message }) => message.type === "connection-status").length, 1, "The website receives an extension connection signal.");
assert.equal(posted.filter(({ message }) => message.type === "extension-profile").length, 0, "An empty extension store does not overwrite a website profile.");

const savedFromWebsite = { textScale: 120, lineSpacing: 1.8, readingWidth: 70, contrast: true, focus: true };
const savedProfile = { displayName: "Alex", disabilities: ["adhd", "dyslexia"], presetName: "Everyday reading" };
listeners.message({ origin: windowMock.location.origin, source: windowMock, data: { source: "under-progress-website", type: "save-profile", settings: savedFromWebsite, profile: savedProfile } });
assert.equal(JSON.stringify(storedSettings), JSON.stringify(savedFromWebsite), "Website settings are persisted by the extension.");
assert.equal(JSON.stringify(storedProfile), JSON.stringify(savedProfile), "Multiple disability selections and the default preset name are stored with the extension profile.");
assert.equal(root.dataset.upContrast, undefined, "Website setup keeps global page styling unchanged.");
assert.equal(root.dataset.upFocus, undefined, "Website setup never applies the extension focus overlay to the full page.");
assert.equal(storedDefaultPreset, "website-default", "The website preset becomes the extension default.");
assert.equal(storedPresets.at(-1).name, "Everyday reading", "The named website preset is saved in the extension preset list.");

listeners.message({ origin: windowMock.location.origin, source: windowMock, data: { source: "under-progress-website", type: "set-language", language: "ar-AE" } });
assert.equal(storedProfile.language, "ar-AE", "The selected website language is stored without changing display settings.");
assert.equal(storedSpeechLanguage, "ar-AE", "The selected website language has its own extension speech preference for Read Aloud.");

listeners.message({ origin: windowMock.location.origin, source: windowMock, data: { source: "under-progress-website", type: "request-profile" } });
assert.ok(posted.some(({ message }) => message.type === "extension-profile" && message.settings.textScale === 120 && message.profile.disabilities.length === 2), "The extension returns settings and multiple disability selections to the website.");
let speakResponse; listeners.runtime({ type: "speak" }, null, response => { speakResponse = response; }); await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(speakResponse.applied, false, "Read-aloud does not use a mismatched language voice while free translation is off.");
assert.match(speakResponse.error, /Free translation is off/, "The extension explains how to enable translation before cross-language speech.");
storedTranslateBeforeSpeech = true;
listeners.runtime({ type: "speak" }, null, response => { speakResponse = response; }); await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(speakResponse.applied, true, "Read-aloud starts when text is available.");
assert.equal(speakResponse.language, "ar-AE", "Read-aloud reports the selected preferred language.");
assert.equal(speech.lastUtterance.lang, "ar-AE", "Read-aloud applies the selected language to the speech utterance.");
assert.equal(speech.lastUtterance.voice?.lang, "ar-AE", "Read-aloud selects the matching installed voice instead of the browser default.");
assert.equal(speech.lastUtterance.rate, 0.7, "Read-aloud applies the user's saved speech speed.");
assert.equal(speech.lastUtterance.pitch, 0.8, "Read-aloud applies the user's saved speech pitch.");
assert.equal(speech.lastUtterance.text, "ينبغي أن يكون التعلم متاحاً.", "Read-aloud speaks translated Arabic text after the user opts in.");
listeners.message({ origin: windowMock.location.origin, source: windowMock, data: { source: "under-progress-website", type: "set-language", language: "zh-CN" } });
storedTranslateBeforeSpeech = true;
let chineseSpeakResponse; listeners.runtime({ type: "speak" }, null, response => { chineseSpeakResponse = response; }); await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(chineseSpeakResponse.language, "zh-CN", "Read-aloud reports the selected Chinese language.");
assert.equal(speech.lastUtterance.lang, "zh-CN", "Read-aloud applies Chinese to the speech utterance instead of falling back to the browser default.");
assert.equal(speech.lastUtterance.voice?.lang, "zh-CN", "Read-aloud selects the matching Chinese voice when it is available.");
assert.equal(chineseSpeakResponse.translated, true, "Read-aloud reports that it translated an English page before speaking Chinese.");
assert.equal(translationRequest.target, "zh-CN", "Free translation receives the selected speech language.");
assert.equal(speech.lastUtterance.text, "学习应该是无障碍的。", "Read-aloud speaks translated Chinese text instead of English with a Chinese voice.");
let pauseResponse; listeners.runtime({ type: "pause-speech" }, null, response => { pauseResponse = response; });
assert.equal(pauseResponse.applied, true, "Read-aloud can be paused.");
assert.equal(speech.paused, true, "Speech state records the pause.");
let resumeResponse; listeners.runtime({ type: "resume-speech" }, null, response => { resumeResponse = response; });
assert.equal(resumeResponse.applied, true, "Read-aloud can be resumed.");
assert.equal(speech.paused, false, "Speech state clears after resume.");
speech.getVoices = () => [];
listeners.runtime({ type: "speak" }, null, response => { chineseSpeakResponse = response; }); await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(chineseSpeakResponse.applied, true, "Read-aloud recovers when an extension TTS voice matches the selected language.");
assert.equal(chineseSpeakResponse.engine, "extension", "The recovery uses the matching extension voice rather than a browser-default voice.");
assert.equal(extensionVoiceRequests.at(-1).language, "zh-CN", "The recovered speech keeps the exact selected language.");
assert.equal(extensionVoiceRequests.at(-1).text, "学习应该是无障碍的。", "The recovered extension voice receives translated target-language text.");
assert.equal(extensionVoiceRequests.at(-1).rate, 0.7, "The recovered extension voice receives the saved speech speed.");
assert.equal(extensionVoiceRequests.at(-1).pitch, 0.8, "The recovered extension voice receives the saved speech pitch.");
const getsBeforeInvalidation = storageGetCalls;
delete chromeMock.runtime.id;
listeners.message({ origin: windowMock.location.origin, source: windowMock, data: { source: "under-progress-website", type: "request-profile" } });
assert.equal(storageGetCalls, getsBeforeInvalidation, "A stale content script does not call extension storage after its context is invalidated.");
assert.ok(posted.some(({ message }) => message.type === "connection-unavailable" && message.reason === "extension-reloaded"), "A stale content script reports a recoverable reload state instead of throwing.");
console.log("Under Progress extension bridge checks passed.");
