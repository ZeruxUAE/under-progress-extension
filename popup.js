// Under Progress extension — saves persistent defaults and named presets in chrome.storage.sync.
const defaults = { textScale: 100, lineSpacing: 1.5, readingWidth: 70, contrast: false, focus: false };
const ids = ["textScale", "lineSpacing", "readingWidth", "contrast", "focus"];
const byId = (id) => document.getElementById(id);
let presets = [];
let defaultPresetId = "";

function setApplyStatus(message, failure = false) { const status = byId("applyStatus"); status.textContent = message; status.style.borderColor = failure ? "#B6473C" : "rgba(15,139,123,.28)"; status.style.background = failure ? "#FCE7E5" : "#D9F3ED"; }

function normalize(state = {}) { return { textScale: Number(state.textScale ?? 100), lineSpacing: Number(state.lineSpacing ?? 1.5), readingWidth: Number(state.readingWidth ?? 70), contrast: Boolean(state.contrast), focus: Boolean(state.focus) }; }
function showValues(state) { byId("textScaleValue").textContent = `${state.textScale}%`; byId("lineSpacingValue").textContent = `${state.lineSpacing}×`; byId("readingWidthValue").textContent = `${state.readingWidth}ch`; }
function writeControls(state) { const next = normalize(state); ids.forEach((id) => { byId(id).type === "checkbox" ? byId(id).checked = next[id] : byId(id).value = next[id]; }); showValues(next); }
function getState() { return normalize({ textScale: byId("textScale").value, lineSpacing: byId("lineSpacing").value, readingWidth: byId("readingWidth").value, contrast: byId("contrast").checked, focus: byId("focus").checked }); }
async function activeTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab; }
async function apply(state) { const tab = await activeTab(); if (!tab?.id) { setApplyStatus("Open a normal website first, then try again.", true); return false; } const result = await chrome.runtime.sendMessage({ type: "apply-active-tab", tabId: tab.id, state }); if (result?.applied) { setApplyStatus(result.injected ? "Controls applied. The extension attached to this page." : "Controls applied to this page."); return true; } setApplyStatus(result?.error || "This browser page cannot be adjusted.", true); return false; }
async function persistAndApply() { const state = getState(); showValues(state); await chrome.storage.sync.set({ underProgress: state }); await apply(state); }
function selectedPreset() { return presets.find((preset) => preset.id === byId("presetSelect").value); }
function renderPresets() { const select = byId("presetSelect"); select.innerHTML = presets.length ? presets.map((preset) => `<option value="${preset.id}">${preset.name}</option>`).join("") : '<option value="">No saved presets yet</option>'; if (defaultPresetId && presets.some((preset) => preset.id === defaultPresetId)) select.value = defaultPresetId; updatePresetState(); }
function updatePresetState() { const preset = selectedPreset(); byId("applyPreset").disabled = !preset; byId("deletePreset").disabled = !preset; byId("setDefault").checked = Boolean(preset && preset.id === defaultPresetId); byId("presetStatus").textContent = preset ? (preset.id === defaultPresetId ? "Default preset" : "Saved preset") : "No preset selected"; }
async function savePreset() { const name = byId("presetName").value.trim() || "Untitled preset"; const preset = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, settings: getState() }; presets = [...presets, preset]; byId("presetName").value = ""; await chrome.storage.sync.set({ underProgressPresets: presets }); renderPresets(); byId("presetSelect").value = preset.id; updatePresetState(); }
async function applyPreset() { const preset = selectedPreset(); if (!preset) return; writeControls(preset.settings); await persistAndApply(); }
async function deletePreset() { const preset = selectedPreset(); if (!preset) return; presets = presets.filter((item) => item.id !== preset.id); if (preset.id === defaultPresetId) defaultPresetId = ""; await chrome.storage.sync.set({ underProgressPresets: presets, underProgressDefaultPreset: defaultPresetId }); renderPresets(); }
async function setDefaultPreset() { const preset = selectedPreset(); defaultPresetId = byId("setDefault").checked && preset ? preset.id : ""; if (defaultPresetId && preset) { writeControls(preset.settings); await chrome.storage.sync.set({ underProgressDefaultPreset: defaultPresetId, underProgress: preset.settings }); await apply(preset.settings); } else { await chrome.storage.sync.set({ underProgressDefaultPreset: "" }); } updatePresetState(); }

chrome.storage.sync.get(["underProgress", "underProgressPresets", "underProgressDefaultPreset", "underProgressTranslateBeforeSpeech"], async ({ underProgress, underProgressPresets, underProgressDefaultPreset, underProgressTranslateBeforeSpeech }) => { presets = Array.isArray(underProgressPresets) ? underProgressPresets : []; defaultPresetId = typeof underProgressDefaultPreset === "string" ? underProgressDefaultPreset : ""; byId("translateBeforeSpeech").checked = Boolean(underProgressTranslateBeforeSpeech); const defaultPreset = presets.find((preset) => preset.id === defaultPresetId); const state = normalize(underProgress || defaultPreset?.settings || defaults); writeControls(state); renderPresets(); await apply(state); });
ids.forEach((id) => byId(id).addEventListener("input", persistAndApply));
byId("presetSelect").addEventListener("change", updatePresetState);
byId("savePreset").addEventListener("click", savePreset);
byId("applyPreset").addEventListener("click", applyPreset);
byId("deletePreset").addEventListener("click", deletePreset);
byId("setDefault").addEventListener("change", setDefaultPreset);
byId("translateBeforeSpeech").addEventListener("change", async () => { const enabled = byId("translateBeforeSpeech").checked; await chrome.storage.sync.set({ underProgressTranslateBeforeSpeech: enabled }); setApplyStatus(enabled ? "Free translation is on. Selected text will be translated before speaking." : "Free translation is off. Read Aloud will not use a mismatched language voice."); });
async function speechAction(type, success) { const tab = await activeTab(); if (!tab?.id) return setApplyStatus("Open a normal website first, then try again.", true); const result = await chrome.runtime.sendMessage({ type, tabId: tab.id }); if (!result?.applied) return setApplyStatus(result?.error || "No reading action could be completed.", true); if (type === "speak-active-tab" && result.language) return setApplyStatus(result.translated ? `Translated selected text, then reading with the saved ${result.voiceLanguage || result.language} voice.` : `${success} Using the saved ${result.voiceLanguage || result.language} voice.`); setApplyStatus(success); }
byId("speak").addEventListener("click", () => speechAction("speak-active-tab", "Reading the selected text or page aloud."));
byId("pauseSpeech").addEventListener("click", () => speechAction("pause-active-tab", "Reading paused. Press Resume when you are ready."));
byId("resumeSpeech").addEventListener("click", () => speechAction("resume-active-tab", "Reading resumed."));
byId("setup").addEventListener("click", () => chrome.tabs.create({ url: "https://under-progress-psi.vercel.app/setup" }));
byId("reset").addEventListener("click", async () => { writeControls(defaults); await chrome.storage.sync.set({ underProgress: defaults }); await apply(defaults); });
