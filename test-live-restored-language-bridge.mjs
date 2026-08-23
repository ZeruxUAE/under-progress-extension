import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const debugPort = "9336";
const extensionPath = process.env.UNDER_PROGRESS_EXTENSION_PATH || "/home/ubuntu/under-progress-extension-release";
const profilePath = "/tmp/under-progress-restored-language-profile";
const targetUrl = "https://under-progress-psi.vercel.app/";
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function targets() { return fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json()); }
async function connect(wsUrl) { const socket = new WebSocket(wsUrl); await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); }); let id = 0; const pending = new Map(); socket.addEventListener("message", event => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } }); return { command(method, params = {}) { const requestId = ++id; socket.send(JSON.stringify({ id: requestId, method, params })); return new Promise((resolve, reject) => pending.set(requestId, response => response.error ? reject(new Error(response.error.message)) : resolve(response.result))); }, close() { socket.close(); } }; }

await execFileAsync("rm", ["-rf", profilePath]);
const child = spawn("/usr/bin/chromium", ["--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profilePath}`, `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, targetUrl], { stdio: "ignore" });
try {
  let allTargets = [];
  for (let attempt = 0; attempt < 30; attempt += 1) { await sleep(300); try { allTargets = await targets(); if (allTargets.some(target => target.type === "page" && target.url.includes("under-progress-psi.vercel.app")) && allTargets.some(target => target.type === "service_worker" && target.url.includes("background.js"))) break; } catch {} }
  const pageTarget = allTargets.find(target => target.type === "page" && target.url.includes("under-progress-psi.vercel.app"));
  const workerTarget = allTargets.find(target => target.type === "service_worker" && target.url.includes("background.js"));
  assert.ok(pageTarget, "Chromium opened the live Under Progress website."); assert.ok(workerTarget, "Chromium loaded the published extension package.");
  const page = await connect(pageTarget.webSocketDebuggerUrl); const worker = await connect(workerTarget.webSocketDebuggerUrl);
  await sleep(1200);
  const selected = await page.command("Runtime.evaluate", { expression: `(() => { const opener = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Language')); opener?.click(); return Boolean(opener); })()`, returnByValue: true });
  assert.equal(selected.result.value, true, "The live language control is available."); await sleep(250);
  const changed = await page.command("Runtime.evaluate", { expression: `(() => { const select = document.querySelector('select'); if (!select) return false; select.value='tl-PH'; select.dispatchEvent(new Event('change',{bubbles:true})); return select.value === 'tl-PH'; })()`, returnByValue: true });
  assert.equal(changed.result.value, true, "The restored Filipino option can be selected on the live website."); await sleep(900);
  const stored = await worker.command("Runtime.evaluate", { expression: "chrome.storage.sync.get(['underProgressSpeechLanguage','underProgressProfile'])", awaitPromise: true, returnByValue: true });
  assert.equal(stored.result.value?.underProgressSpeechLanguage, "tl-PH", "The live Filipino website selection reaches the extension speech-language preference unchanged.");
  assert.equal(stored.result.value?.underProgressProfile?.language, "tl-PH", "The extension profile retains the exact Filipino locale.");
  const speechReply = await worker.command("Runtime.evaluate", { expression: `new Promise(resolve => chrome.tabs.query({}).then(async tabs => { const tab = tabs.find(item => typeof item.url === 'string' && item.url.includes('under-progress-psi.vercel.app')); await chrome.storage.sync.set({underProgressTranslateBeforeSpeech:true}); resolve(await chrome.tabs.sendMessage(tab.id,{type:'speak'})); }))`, awaitPromise: true, returnByValue: true });
  assert.equal(speechReply.result.value?.language, "tl-PH", "Read Aloud keeps the restored Filipino locale.");
  assert.equal(speechReply.result.value?.applied, false, "Headless Chromium does not silently substitute a browser-default voice.");
  assert.match(speechReply.result.value?.error || "", /tl-PH voice/, "The extension requests the exact matching Filipino voice when it is unavailable.");
  console.log("Under Progress restored-language live bridge check passed."); page.close(); worker.close();
} finally { child.kill("SIGTERM"); }
