import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const debugPort = "9334";
const extensionPath = process.env.UNDER_PROGRESS_EXTENSION_PATH || "/home/ubuntu/under-progress-extension-release";
const profilePath = "/tmp/under-progress-extension-live-reload-profile";
const targetUrl = "https://under-progress-psi.vercel.app/setup";

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

async function waitForTargets() {
  let allTargets = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(300);
    try {
      allTargets = await targets();
      if (allTargets.some(target => target.type === "service_worker" && target.url.includes("background.js")) && allTargets.some(target => target.type === "page" && target.url.includes("under-progress-psi.vercel.app/setup"))) return allTargets;
    } catch {}
  }
  return allTargets;
}

await execFileAsync("rm", ["-rf", profilePath]);
const child = spawn("/usr/bin/chromium", ["--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profilePath}`, `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, targetUrl], { stdio: "ignore" });

try {
  const allTargets = await waitForTargets();
  const pageTarget = allTargets.find(target => target.type === "page" && target.url.includes("under-progress-psi.vercel.app/setup"));
  const workerTarget = allTargets.find(target => target.type === "service_worker" && target.url.includes("background.js"));
  assert.ok(pageTarget, "Chromium opened the live Under Progress setup page.");
  assert.ok(workerTarget, "Chromium loaded the packaged Under Progress service worker.");

  const page = await connect(pageTarget.webSocketDebuggerUrl);
  const worker = await connect(workerTarget.webSocketDebuggerUrl);
  await sleep(1400);
  const initial = await page.command("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
  assert.match(initial.result.value, /Extension connected|Current extension settings were imported/, "The packaged extension connects to the live setup page.");

  try { await worker.command("Runtime.evaluate", { expression: "chrome.runtime.reload(); 'reload-requested'", returnByValue: true }); } catch {}
  await sleep(1200);
  await page.command("Runtime.evaluate", { expression: "window.postMessage({source:'under-progress-website',type:'request-profile'}, window.location.origin)", returnByValue: true });
  await sleep(700);
  const afterReload = await page.command("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
  assert.doesNotMatch(afterReload.result.value, /Checking for the Under Progress extension/, "The live page does not remain in the checking state after an extension reload.");
  assert.match(afterReload.result.value, /Extension connected|Current extension settings were imported|The extension was updated or reloaded\. Reload this webpage, then connect again\./, "The live page provides either a reconnect or clear reload guidance after extension reload.");
  console.log("Under Progress live extension reload check passed.");
  page.close();
  worker.close();
} finally {
  child.kill("SIGTERM");
}
