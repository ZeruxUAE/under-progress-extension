import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const debugPort = "9333";
const extensionPath = "/home/ubuntu/under-progress-extension-release";
const profilePath = "/tmp/under-progress-extension-test-profile";

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function targets() { return fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json()); }
async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", event => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } });
  return { command(method, params = {}) { const requestId = ++id; socket.send(JSON.stringify({ id: requestId, method, params })); return new Promise((resolve, reject) => pending.set(requestId, response => response.error ? reject(new Error(response.error.message)) : resolve(response.result))); }, close() { socket.close(); } };
}

await execFileAsync("rm", ["-rf", profilePath]);
const child = (await import("node:child_process")).spawn("/usr/bin/chromium", ["--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profilePath}`, `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "https://example.com"], { stdio: "ignore" });
try {
  let allTargets = [];
  for (let attempt = 0; attempt < 20; attempt += 1) { await sleep(300); try { allTargets = await targets(); if (allTargets.some(target => target.type === "service_worker" && target.url.includes("background.js")) && allTargets.some(target => target.type === "page" && target.url.includes("example.com"))) break; } catch {} }
  const pageTarget = allTargets.find(target => target.type === "page" && target.url.includes("example.com"));
  const workerTarget = allTargets.find(target => target.type === "service_worker" && target.url.includes("background.js"));
  assert.ok(pageTarget, "Chromium opened the target website.");
  assert.ok(workerTarget, "Chromium loaded the Under Progress service worker.");
  const worker = await connect(workerTarget.webSocketDebuggerUrl);
  const injection = await worker.command("Runtime.evaluate", { expression: `new Promise(resolve => { const deadline = Date.now() + 7000; const check = () => chrome.tabs.query({}).then(async tabs => { const tab = tabs.find(item => typeof item.url === 'string' && item.url.includes('example.com')); if (!tab) return Date.now() < deadline ? setTimeout(check, 250) : resolve({ok:false,error:'Target tab was not found',tabs:tabs.map(item => ({id:item.id,url:item.url,active:item.active,status:item.status}))}); const bridge = await ensurePageBridge(tab.id); if (!bridge.ok) return resolve(bridge); await chrome.tabs.sendMessage(tab.id, {type:'apply',state:{textScale:120,lineSpacing:1.8,readingWidth:70,contrast:true,focus:true}}); resolve(bridge); }); check(); })`, awaitPromise: true, returnByValue: true });
  assert.equal(injection.exceptionDetails, undefined, "The background worker evaluates the injection request.");
  assert.equal(injection.result.value?.ok, true, `${injection.result.value?.error || "The content bridge attaches to the active page."} ${JSON.stringify(injection.result.value?.tabs || [])}`);
  await sleep(800);
  const page = await connect(pageTarget.webSocketDebuggerUrl);
  const inspection = await page.command("Runtime.evaluate", { expression: "JSON.stringify({contrast:document.documentElement.dataset.upContrast,focus:document.documentElement.dataset.upFocus,scale:getComputedStyle(document.documentElement).getPropertyValue('--up-text-scale').trim()})", returnByValue: true });
  const result = JSON.parse(inspection.result.value);
  assert.deepEqual(result, { contrast: "true", focus: "true", scale: "1.2" }, "Saved extension settings reach the live webpage.");
  const freeTranslation = await worker.command("Runtime.evaluate", { expression: "translateText({ text: 'Learning should be accessible.', target: 'zh-CN' })", awaitPromise: true, returnByValue: true });
  assert.match(freeTranslation.result.value?.translatedText || "", /学习|無障礙|无障碍/, "The free provider returns Chinese text from the extension service worker.");
  const chineseSpeech = await worker.command("Runtime.evaluate", { expression: `new Promise(resolve => chrome.tabs.query({}).then(async tabs => { const tab = tabs.find(item => typeof item.url === 'string' && item.url.includes('example.com')); await chrome.storage.sync.set({underProgressSpeechLanguage:'zh-CN',underProgressProfile:{language:'zh-CN'},underProgressTranslateBeforeSpeech:true}); const reply = await chrome.tabs.sendMessage(tab.id,{type:'speak'}); resolve(reply); }))`, awaitPromise: true, returnByValue: true });
  assert.equal(chineseSpeech.result.value?.applied, false, "Headless Chromium does not silently use its default voice when Chinese is selected but unavailable.");
  assert.equal(chineseSpeech.result.value?.language, "zh-CN", "The selected Chinese language reaches the actual extension content bridge.");
  assert.match(chineseSpeech.result.value?.error || "", /zh-CN voice/, "The extension reports a clear matching-voice instruction instead of speaking in the default language.");
  console.log("Under Progress browser integration check passed.");
  page.close(); worker.close();
} finally {
  child.kill("SIGTERM");
}
