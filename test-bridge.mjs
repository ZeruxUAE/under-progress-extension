import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("./content.js", import.meta.url), "utf8");
const posted = [];
const listeners = {};
const storageListeners = [];
let storedSettings;
let storedProfile;
const root = { style: { values: {}, setProperty(key, value) { this.values[key] = value; } }, dataset: {} };
const speech = { speaking: false, paused: false, starts: 0, cancel() { this.speaking = false; this.paused = false; }, speak() { this.speaking = true; this.paused = false; this.starts += 1; }, pause() { this.paused = true; }, resume() { this.paused = false; } };
const windowMock = {
  location: { origin: "https://under-progress-psi.vercel.app", hostname: "under-progress-psi.vercel.app" },
  postMessage(message, origin) { posted.push({ message, origin }); },
  addEventListener(type, callback) { listeners[type] = callback; },
  getSelection() { return { toString: () => "A short reading test." }; },
  speechSynthesis: speech,
};
const chromeMock = {
  runtime: { onMessage: { addListener(callback) { listeners.runtime = callback; } } },
  storage: {
    sync: {
      get(_key, callback) { callback({ underProgress: storedSettings, underProgressProfile: storedProfile }); },
      set(values) {
        const changes = {};
        if ("underProgress" in values) { storedSettings = values.underProgress; changes.underProgress = { newValue: storedSettings }; }
        if ("underProgressProfile" in values) { storedProfile = values.underProgressProfile; changes.underProgressProfile = { newValue: storedProfile }; }
        storageListeners.forEach((callback) => callback(changes, "sync"));
      },
    },
    onChanged: { addListener(callback) { storageListeners.push(callback); } },
  },
};
const context = { window: windowMock, document: { documentElement: root, body: { innerText: "" }, querySelector: () => null }, chrome: chromeMock, SpeechSynthesisUtterance: function SpeechSynthesisUtterance() {}, console };
vm.runInNewContext(source, context);

assert.equal(posted.filter(({ message }) => message.type === "connection-status").length, 1, "The website receives an extension connection signal.");
assert.equal(posted.filter(({ message }) => message.type === "extension-profile").length, 0, "An empty extension store does not overwrite a website profile.");

const savedFromWebsite = { textScale: 120, lineSpacing: 1.8, readingWidth: 70, contrast: true, focus: true };
const savedProfile = { displayName: "Alex", disabilities: ["adhd", "dyslexia"], presetName: "Everyday reading" };
listeners.message({ origin: windowMock.location.origin, source: windowMock, data: { source: "under-progress-website", type: "save-profile", settings: savedFromWebsite, profile: savedProfile } });
assert.equal(JSON.stringify(storedSettings), JSON.stringify(savedFromWebsite), "Website settings are persisted by the extension.");
assert.equal(JSON.stringify(storedProfile), JSON.stringify(savedProfile), "Multiple disability selections and the default preset name are stored with the extension profile.");
assert.equal(root.dataset.upContrast, "true", "Saved contrast is applied to the active page.");
assert.equal(root.dataset.upFocus, "true", "Saved focus mode is applied to the active page.");

listeners.message({ origin: windowMock.location.origin, source: windowMock, data: { source: "under-progress-website", type: "request-profile" } });
assert.ok(posted.some(({ message }) => message.type === "extension-profile" && message.settings.textScale === 120 && message.profile.disabilities.length === 2), "The extension returns settings and multiple disability selections to the website.");
let speakResponse; listeners.runtime({ type: "speak" }, null, response => { speakResponse = response; });
assert.equal(speakResponse.applied, true, "Read-aloud starts when text is available.");
let pauseResponse; listeners.runtime({ type: "pause-speech" }, null, response => { pauseResponse = response; });
assert.equal(pauseResponse.applied, true, "Read-aloud can be paused.");
assert.equal(speech.paused, true, "Speech state records the pause.");
let resumeResponse; listeners.runtime({ type: "resume-speech" }, null, response => { resumeResponse = response; });
assert.equal(resumeResponse.applied, true, "Read-aloud can be resumed.");
assert.equal(speech.paused, false, "Speech state clears after resume.");
console.log("Under Progress extension bridge checks passed.");
