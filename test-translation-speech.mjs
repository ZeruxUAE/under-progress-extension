import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("./content.js", import.meta.url), "utf8");
const listeners = {};
const spoken = [];
const root = { lang: "en", style: { setProperty() {} }, dataset: {} };
const speech = { speaking: false, paused: false, cancel() {}, speak(utterance) { spoken.push(utterance); }, getVoices() { return [{ lang: "zh-CN", name: "Available Chinese test voice" }]; } };
const windowMock = { location: { origin: "https://example.com", hostname: "example.com" }, addEventListener(type, callback) { listeners[type] = callback; }, getSelection() { return { toString: () => "Learning should be accessible." }; }, speechSynthesis: speech };
const chromeMock = {
  runtime: { id: "under-progress-translation-test", onMessage: { addListener(callback) { listeners.runtime = callback; } }, sendMessage(message) { assert.equal(message.type, "translate-text", "The normal English page requests free translation before speech."); assert.equal(message.text, "Learning should be accessible.", "The selected English text is sent for translation."); assert.equal(message.target, "zh-CN", "The selected Chinese language is used as the translation target."); return Promise.resolve({ translatedText: "学习应该是无障碍的。", sourceLanguage: "en" }); } },
  storage: { sync: { get(_keys, callback) { callback({ underProgressProfile: { language: "zh-CN" }, underProgressSpeechLanguage: "zh-CN", underProgressTranslateBeforeSpeech: true }); }, set() {} }, onChanged: { addListener() {} } },
};
const context = { window: windowMock, document: { documentElement: root, body: { innerText: "" }, querySelector: () => null }, chrome: chromeMock, SpeechSynthesisUtterance: function SpeechSynthesisUtterance(text) { this.text = text; }, TextEncoder, console };
vm.runInNewContext(source, context);

let reply;
listeners.runtime({ type: "speak" }, null, response => { reply = response; });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(reply.applied, true, "Translation-to-speech succeeds when a matching Chinese voice is available.");
assert.equal(reply.translated, true, "The speech response confirms translation occurred.");
assert.equal(reply.language, "zh-CN", "The selected Chinese language remains attached to the speech request.");
assert.equal(spoken.at(-1).text, "学习应该是无障碍的。", "Speech receives translated Chinese text instead of the English source text.");
assert.equal(spoken.at(-1).lang, "zh-CN", "Speech uses the selected Chinese language.");
console.log("Under Progress external-page translation-to-speech check passed.");
