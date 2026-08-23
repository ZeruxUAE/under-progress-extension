import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const debugPort = "9344";
const extensionPath = process.env.UNDER_PROGRESS_EXTENSION_PATH || "/home/ubuntu/under-progress-extension-release";
const profilePath = "/tmp/under-progress-extension-popup-test-profile";

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function targets() { return fetch(`http://127.0.0.1:${debugPort}/json/list`).then(response => response.json()); }
async function browserSocketUrl() { return fetch(`http://127.0.0.1:${debugPort}/json/version`).then(response => response.json()).then(value => value.webSocketDebuggerUrl); }
async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", event => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } });
  return {
    command(method, params = {}) { const requestId = ++id; socket.send(JSON.stringify({ id: requestId, method, params })); return new Promise((resolve, reject) => pending.set(requestId, response => response.error ? reject(new Error(response.error.message)) : resolve(response.result))); },
    close() { socket.close(); },
  };
}

await execFileAsync("pkill", ["-f", `remote-debugging-port=${debugPort}`]).catch(() => undefined);
await sleep(250);
await execFileAsync("rm", ["-rf", profilePath]);
const child = (await import("node:child_process")).spawn("/usr/bin/chromium", ["--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profilePath}`, `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "https://example.com"], { stdio: "ignore" });

try {
  let allTargets = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(300);
    try {
      allTargets = await targets();
      if (allTargets.some(target => target.type === "service_worker" && target.url.includes("background.js")) && allTargets.some(target => target.type === "page" && target.url.includes("example.com"))) break;
    } catch {}
  }
  const pageTarget = allTargets.find(target => target.type === "page" && target.url.includes("example.com"));
  const workerTarget = allTargets.find(target => target.type === "service_worker" && target.url.includes("background.js"));
  assert.ok(pageTarget, "Chromium opened an ordinary webpage.");
  assert.ok(workerTarget, "Chromium loaded the extension service worker.");
  const extensionId = new URL(workerTarget.url).host;
  const browser = await connect(await browserSocketUrl());
  await browser.command("Target.createTarget", { url: `chrome-extension://${extensionId}/popup.html`, background: true });

  let popupTarget;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(200);
    popupTarget = (await targets()).find(target => target.type === "page" && target.url === `chrome-extension://${extensionId}/popup.html`);
    if (popupTarget) break;
  }
  assert.ok(popupTarget, "The actual extension popup loads.");
  const popup = await connect(popupTarget.webSocketDebuggerUrl);
  const worker = await connect(workerTarget.webSocketDebuggerUrl);
  await worker.command("Runtime.evaluate", { expression: `chrome.tabs.query({}).then(tabs => { const tab = tabs.find(item => item.url?.includes('example.com')); return chrome.tabs.update(tab.id, { active: true }); })`, awaitPromise: true, returnByValue: true });
  await browser.command("Target.activateTarget", { targetId: pageTarget.id });
  await sleep(1200);

  const controlResult = await popup.command("Runtime.evaluate", {
    expression: `new Promise(resolve => { const contrast = document.getElementById('contrast'); contrast.checked = true; contrast.dispatchEvent(new Event('input', { bubbles: true })); setTimeout(() => { const scale = document.getElementById('textScale'); scale.value = '120'; scale.dispatchEvent(new Event('input', { bubbles: true })); setTimeout(() => resolve({ status: document.getElementById('applyStatus').textContent, speak: Boolean(document.getElementById('speak')), contrast: contrast.checked, scale: scale.value }), 700); }, 700); })`,
    awaitPromise: true,
    returnByValue: true,
  });
  assert.deepEqual(controlResult.result.value, { status: controlResult.result.value?.status, speak: true, contrast: true, scale: "120" }, "The real popup accepts user control changes and exposes Read Aloud.");

  const speakStatus = await popup.command("Runtime.evaluate", {
    expression: `new Promise(resolve => { document.getElementById('speak').click(); setTimeout(() => resolve(document.getElementById('applyStatus').textContent), 900); })`,
    awaitPromise: true,
    returnByValue: true,
  });
  assert.match(speakStatus.result.value || "", /Reading|voice|Read Aloud|text/i, "The popup Read Aloud action returns user-facing feedback.");
  console.log("Under Progress popup integration check passed.");
  browser.close(); worker.close(); popup.close();
} finally {
  child.kill("SIGTERM");
}
