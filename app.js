// Korean Lab website: routing, settings, history and the two tools (Korean -> English explanation,
// English -> Korean lookup). Gemini logic lives in gemini.js, result rendering in render.js.
"use strict";

const SETTINGS_KEY = "korean-lab-settings-v2";
const OLD_SETTINGS_KEY = "korean-lab-settings";
const HISTORY_KEY = "korean-lab-history-v2";
const HISTORY_LIMIT = 100;
const MAX_CHARS = 800;
const ROUTES = ["explain", "en-ko", "history", "settings"];
const $ = id => document.getElementById(id);
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const state = { settings: loadSettings(), busy: { ko: false, en: false } };

// ---------- storage ----------
function readJSON(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ?? fallback; } catch { return fallback; } }
function writeJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }

function loadSettings() {
  const saved = readJSON(SETTINGS_KEY, null);
  const old = saved ? {} : readJSON(OLD_SETTINGS_KEY, {});
  const s = { level: "3", layout: "D", textSize: 14, theme: "auto", ...(saved || {}) };
  // Carry the learning level over from the previous version of the site.
  if (!saved && old && old.learnerLevel) s.level = ({ beginner: "1", intermediate: "3", advanced: "5" })[old.learnerLevel] || String(old.learnerLevel);
  if (!["1", "2", "3", "4", "5", "6"].includes(String(s.level))) s.level = "3";
  s.level = String(s.level);
  if (!["D", "A"].includes(s.layout)) s.layout = "D";
  s.textSize = Math.min(17, Math.max(12, Number(s.textSize) || 14));
  if (!["auto", "light", "dark"].includes(s.theme)) s.theme = "auto";
  return s;
}
function saveSettings() { writeJSON(SETTINGS_KEY, state.settings); }

function getHistory() { const rows = readJSON(HISTORY_KEY, []); return Array.isArray(rows) ? rows.filter(r => r && r.text && r.data) : []; }
function findSaved(kind, text) {
  return getHistory().find(r => r.kind === kind && r.text === text && (kind === "en" || r.level === state.settings.level)) || null;
}
function saveToHistory(kind, text, data) {
  const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), kind, text, level: state.settings.level, data,
    summary: kind === "ko" ? (data.translation || "") : [data.primaryKorean, data.literalMeaning].filter(Boolean).join(" · "), time: Date.now() };
  const rest = getHistory().filter(r => !(r.kind === kind && r.text === text && (kind === "en" || r.level === entry.level)));
  let rows = [entry, ...rest].slice(0, HISTORY_LIMIT);
  // If storage is full, drop the oldest entries rather than losing the new one.
  while (rows.length && !writeJSON(HISTORY_KEY, rows)) rows = rows.slice(0, Math.floor(rows.length * .8));
}

// ---------- theme ----------
function effectiveDark() { return state.settings.theme === "dark" || (state.settings.theme === "auto" && darkQuery.matches); }
function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.querySelectorAll(".kl-bubble.kl-web").forEach(b => b.classList.toggle("kl-dark", effectiveDark()));
}
darkQuery.addEventListener?.("change", applyTheme);

// ---------- Korean marks on the action buttons ----------
function mountMark(el, word, inkHeight) {
  const m = MARKS[word]; if (!m || !el) return;
  const total = inkHeight * (1 + 2 * m.bleed), width = total * m.ratio, bleed = m.bleed * inkHeight;
  // The ink mass of these words sits ~1% of their height above the box centre: nudge down so it meets the cap centre.
  el.innerHTML = `<svg viewBox="${m.vb}" width="${width.toFixed(2)}" height="${total.toFixed(2)}" style="margin:${(-bleed).toFixed(2)}px;top:${(inkHeight * .0091).toFixed(2)}px" aria-hidden="true" focusable="false"><path d="${m.d}"/></svg>`;
}

// ---------- routing ----------
function route() {
  const requested = location.hash.slice(1);
  const current = ROUTES.includes(requested) ? requested : "explain";
  for (const id of ROUTES) $(id).hidden = id !== current;
  document.querySelectorAll(".nav-link").forEach(a => a.dataset.route === current ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  if (current === "history") renderHistory();
  if (current === "settings") syncSettingsForm();
  document.title = { explain: "Korean Lab", "en-ko": "English → Korean · Korean Lab", history: "History · Korean Lab", settings: "Settings · Korean Lab" }[current];
  return current;
}
function go(target) { if (location.hash !== "#" + target) location.hash = target; else route(); }

// ---------- result card (the extension's panel, as a card in the page) ----------
function resultCard(container, title, tools = []) {
  container.hidden = false;
  container.innerHTML = `<div class="kl-bubble kl-web${effectiveDark() ? " kl-dark" : ""}" style="--kl-unit:${state.settings.textSize}px">
    <div class="kl-bubble-head"><div class="kl-head-left"><span class="kl-badge"></span></div><div class="kl-head-tools"></div></div>
    <div class="kl-bubble-body"></div></div>`;
  container.querySelector(".kl-badge").textContent = title;
  const toolbar = container.querySelector(".kl-head-tools");
  for (const [label, action, aria] of tools) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "kl-head-btn"; b.textContent = label;
    if (aria) b.setAttribute("aria-label", aria);
    b.addEventListener("click", action);
    toolbar.append(b);
  }
  return container.querySelector(".kl-bubble-body");
}
function loading(body, label) { body.innerHTML = `<div class="kl-loading"><span class="kl-pulse-dot"></span> ${escapeHtml(label)}</div>`; }
function showError(body, message) { body.innerHTML = `<div class="kl-error"></div>`; body.firstChild.textContent = message; }

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR"; u.rate = .92;
  const voice = speechSynthesis.getVoices().find(v => /^ko/i.test(v.lang));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}
const canSpeak = "speechSynthesis" in window;

// ---------- Korean -> English ----------
function setBusy(kind, busy) {
  state.busy[kind] = busy;
  const btn = $(kind === "ko" ? "explain-btn" : "enko-btn");
  btn.disabled = busy; btn.classList.toggle("is-busy", busy);
  btn.setAttribute("aria-busy", String(busy));
}

async function explain(text, { force = false } = {}) {
  text = canonicalText(text);
  const status = $("explain-status");
  status.textContent = ""; status.classList.remove("is-error");
  if (!text) { status.textContent = "Type or paste some Korean first."; return; }
  if (!/[ㄱ-ㆎ가-힣]/.test(text)) { status.textContent = "Korean Lab explains Korean text (Hangul). For English, use EN → KO."; return; }
  if (text.length > MAX_CHARS) { status.textContent = `Keep it under ${MAX_CHARS} characters.`; return; }
  if (state.busy.ko) return;
  $("explain-empty").hidden = true;

  const saved = !force && findSaved("ko", text);
  const tools = [];
  if (canSpeak) tools.push(["Listen", () => speak(text), "Listen to the Korean"]);
  if (saved) tools.push(["Run again", () => explain(text, { force: true }), "Ask Gemini again"]);
  const body = resultCard($("explain-result"), saved ? "Korean → English · saved" : "Korean → English", tools);
  if (saved) { renderEditorialData(body, { ...saved.data, selectedText: text }); return; }

  if (!getApiKey()) { showError(body, "Add your Gemini API key in Settings first."); return; }
  loading(body, "ANALYZING PATTERNS...");
  setBusy("ko", true);
  let frame = 0, latest = null;
  const paint = () => { frame = 0; if (latest && body.isConnected) renderEditorialData(body, { ...latest, selectedText: text }, { streaming: true }); };
  try {
    const data = await callGemini(text, false, Number(state.settings.level), snapshot => {
      if (!snapshot?.translation) return;
      latest = snapshot;
      if (!frame) frame = requestAnimationFrame(paint);
    });
    cancelAnimationFrame(frame);
    if (body.isConnected) renderEditorialData(body, { ...data, selectedText: text });
    saveToHistory("ko", text, data);
  } catch (error) {
    cancelAnimationFrame(frame);
    if (body.isConnected) showError(body, error.message || "Something went wrong. No automatic retry was sent.");
  } finally { setBusy("ko", false); }
}

// ---------- English -> Korean ----------
async function lookup(query, { force = false } = {}) {
  query = canonicalText(query);
  const status = $("enko-status");
  status.textContent = "";
  if (!query) { status.textContent = "Type an English word or phrase first."; return; }
  if (query.length > MAX_CHARS) { status.textContent = `Keep it under ${MAX_CHARS} characters.`; return; }
  if (state.busy.en) return;
  $("enko-empty").hidden = true;

  const saved = !force && findSaved("en", query);
  const tools = saved ? [["Run again", () => lookup(query, { force: true }), "Ask Gemini again"]] : [];
  const body = resultCard($("enko-result"), saved ? "English → Korean · saved" : "English → Korean", tools);
  const addListen = data => {
    if (!canSpeak || !data?.primaryKorean) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "kl-head-btn"; b.textContent = "Listen"; b.setAttribute("aria-label", "Listen to the Korean");
    b.addEventListener("click", () => speak(data.primaryKorean));
    $("enko-result").querySelector(".kl-head-tools").prepend(b);
  };
  if (saved) { renderEnglishLookupResult(body, saved.data); addListen(saved.data); return; }

  if (!getApiKey()) { showError(body, "Add your Gemini API key in Settings first."); return; }
  loading(body, "SEARCHING IDIOMATIC PHRASING...");
  setBusy("en", true);
  try {
    const data = await callGemini(query, true);
    if (body.isConnected) { renderEnglishLookupResult(body, data); addListen(data); }
    saveToHistory("en", query, data);
  } catch (error) {
    if (body.isConnected) showError(body, error.message || "Something went wrong. No automatic retry was sent.");
  } finally { setBusy("en", false); }
}

// ---------- history ----------
function renderHistory() {
  const list = $("history-list");
  const q = $("history-search").value.trim().toLowerCase();
  const rows = getHistory().filter(r => !q || `${r.text} ${r.summary}`.toLowerCase().includes(q));
  list.textContent = "";
  $("history-clear").disabled = !getHistory().length;
  if (!rows.length) {
    const li = document.createElement("li"); li.className = "history-empty";
    li.textContent = q ? "Nothing matches that search." : "Nothing yet. Explanations and lookups you run are kept here.";
    list.append(li); return;
  }
  const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  for (const r of rows) {
    const li = document.createElement("li"); li.className = "history-item";
    li.innerHTML = `<button class="history-open" type="button"><span class="history-kind"></span><span class="history-text"></span><span class="history-date"></span><span class="history-trans"></span></button>`;
    li.querySelector(".history-kind").textContent = r.kind === "ko" ? "KO → EN" : "EN → KO";
    const t = li.querySelector(".history-text"); t.textContent = r.text; t.lang = r.kind === "ko" ? "ko" : "en";
    li.querySelector(".history-date").textContent = fmt.format(new Date(r.time));
    li.querySelector(".history-trans").textContent = r.summary || "";
    li.querySelector("button").addEventListener("click", () => openSaved(r));
    list.append(li);
  }
}
function openSaved(r) {
  if (r.kind === "ko") {
    $("ko-input").value = r.text; autosize(); updateCount(); go("explain");
    if (r.level !== state.settings.level) { state.settings.level = r.level; saveSettings(); }
    explain(r.text);
  } else {
    $("en-input").value = r.text; go("en-ko"); lookup(r.text);
  }
}

// ---------- settings ----------
function syncSettingsForm() {
  $("api-key").value = getApiKey();
  $("level").value = state.settings.level;
  $("layout").value = state.settings.layout;
  $("text-size").value = state.settings.textSize;
  $("text-size-value").textContent = `${state.settings.textSize} px`;
  $("theme").value = state.settings.theme;
}
function showKeyStatus(message, error = false) {
  const s = $("key-status"); s.textContent = message; s.classList.toggle("is-error", error);
  clearTimeout(showKeyStatus.t); showKeyStatus.t = setTimeout(() => { s.textContent = ""; }, 2600);
}
async function runChecks() {
  const list = $("checks"), btn = $("check-btn");
  list.textContent = ""; btn.disabled = true; btn.textContent = "Checking…";
  const row = label => { const li = document.createElement("li"); li.innerHTML = `<span>…</span><span></span><span class="ms"></span>`; li.children[1].textContent = label; list.append(li); return li; };
  const finish = (li, ok, ms, detail) => {
    li.children[0].textContent = ok ? "✓" : "✕"; li.className = ok ? "ok" : "bad"; li.children[2].textContent = ms != null ? `${ms} ms` : "";
    if (detail) { const d = document.createElement("span"); d.className = "detail"; d.textContent = detail; li.append(d); }
  };
  try {
    const c = row("Gemini · key and network");
    const g = await testGemini();
    finish(c, !!g.ok, g.ms, g.ok ? `${g.model || "model"} answered` : (g.status ? `HTTP ${g.status}: ` : "") + (g.detail || "failed"));
    if (!g.ok) return;
    const st = g.stream || {};
    finish(row("Gemini · live streaming"), !!st.ok, st.ms, st.ok ? `first text after ${st.firstText} ms` : (st.detail || "failed"));
  } finally { btn.disabled = false; btn.textContent = "Check connection"; }
}

// ---------- selection trigger: select Korean anywhere on the page to explain it ----------
let floating = null;
function removeFloating() { floating?.remove(); floating = null; }
function showFloating(text, rect) {
  removeFloating();
  const b = document.createElement("button");
  b.type = "button"; b.className = "kl-action kl-floating"; b.setAttribute("aria-label", "Explain the selected Korean");
  b.innerHTML = `<span class="kl-action-mark"></span><span class="kl-action-label">EXPLAIN</span>`;
  mountMark(b.firstChild, "풀이", 10.8);
  document.body.append(b);
  const w = b.offsetWidth, top = window.scrollY + rect.top - 34;
  b.style.top = `${rect.top < 50 ? window.scrollY + rect.bottom + 8 : top}px`;
  b.style.left = `${Math.max(8, Math.min(window.scrollX + rect.left + rect.width / 2 - w / 2, window.scrollX + document.documentElement.clientWidth - w - 8))}px`;
  b.addEventListener("mousedown", e => e.preventDefault());
  b.addEventListener("click", () => {
    removeFloating(); getSelection()?.removeAllRanges();
    $("ko-input").value = text; autosize(); updateCount(); go("explain");
    window.scrollTo({ top: 0 }); explain(text);
  });
  floating = b;
}
document.addEventListener("mouseup", e => {
  if (floating && floating.contains(e.target)) return;
  setTimeout(() => {
    const sel = getSelection();
    const text = canonicalText((sel?.toString() || "").replace(/ /g, " "));
    const active = document.activeElement;
    if (!text || !/[가-힣]/.test(text) || text.length > MAX_CHARS || !sel.rangeCount || (active && /^(TEXTAREA|INPUT)$/.test(active.tagName))) { removeFloating(); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width || rect.height) showFloating(text, rect);
  }, 0);
});
document.addEventListener("mousedown", e => { if (floating && !floating.contains(e.target)) removeFloating(); });
window.addEventListener("scroll", () => { if (floating && !getSelection()?.toString()) removeFloating(); }, { passive: true });

// ---------- composer helpers ----------
function autosize(t = $("ko-input")) { t.style.height = "auto"; t.style.height = `${Math.min(t.scrollHeight, 360)}px`; t.style.overflowY = t.scrollHeight > 360 ? "auto" : "hidden"; }
function updateCount() { $("ko-count").textContent = $("ko-input").value.length; }

// ---------- wire up ----------
function init() {
  layoutStyle = state.settings.layout;
  applyTheme();
  mountMark(document.querySelector("#explain-btn .kl-action-mark"), "풀이", 13);
  mountMark(document.querySelector("#enko-btn .kl-action-mark"), "번역", 13);
  if (!isMac) {
    document.querySelectorAll(".mod-key").forEach(k => { k.textContent = "Ctrl"; });
    document.querySelectorAll(".alt-key").forEach(k => { k.textContent = "Alt"; });
  }

  $("explain-form").addEventListener("submit", e => { e.preventDefault(); explain($("ko-input").value); });
  $("ko-input").addEventListener("input", () => { autosize(); updateCount(); });
  $("ko-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); explain($("ko-input").value); }
  });
  $("enko-form").addEventListener("submit", e => { e.preventDefault(); lookup($("en-input").value); });
  // English is usually one line: Enter searches, Shift+Enter adds a line.
  $("en-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); lookup($("en-input").value); }
  });
  $("en-input").addEventListener("input", () => autosize($("en-input")));

  $("history-search").addEventListener("input", renderHistory);
  $("history-clear").addEventListener("click", () => {
    if (!confirm("Clear all saved explanations and lookups from this browser?")) return;
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* nothing to clear */ }
    renderHistory();
  });

  $("key-save").addEventListener("click", () => {
    const key = $("api-key").value.trim().replace(/\s+/g, "");
    $("api-key").value = key;
    try { key ? localStorage.setItem(KEY_STORAGE, key) : localStorage.removeItem(KEY_STORAGE); showKeyStatus(key ? "Key saved in this browser." : "No key entered; nothing saved.", !key); }
    catch { showKeyStatus("Could not save: this browser is blocking site storage.", true); }
  });
  $("key-clear").addEventListener("click", () => {
    try { localStorage.removeItem(KEY_STORAGE); } catch { /* already gone */ }
    $("api-key").value = ""; showKeyStatus("Key removed from this browser.");
  });
  $("check-btn").addEventListener("click", runChecks);
  $("level").addEventListener("change", e => { state.settings.level = e.target.value; saveSettings(); });
  $("layout").addEventListener("change", e => {
    state.settings.layout = layoutStyle = e.target.value; saveSettings();
    if (lastRender?.container?.isConnected && !lastRender.options?.streaming) renderEditorialData(lastRender.container, lastRender.data, lastRender.options);
  });
  $("text-size").addEventListener("input", e => {
    state.settings.textSize = Number(e.target.value); saveSettings();
    $("text-size-value").textContent = `${state.settings.textSize} px`;
    document.querySelectorAll(".kl-bubble.kl-web").forEach(b => b.style.setProperty("--kl-unit", `${state.settings.textSize}px`));
  });
  $("theme").addEventListener("change", e => { state.settings.theme = e.target.value; saveSettings(); applyTheme(); });

  // Option+K (Alt+K) opens English -> Korean, like the extension. On macOS, Option+K types "˚".
  document.addEventListener("keydown", e => {
    if (e.altKey && !e.metaKey && !e.ctrlKey && (e.code === "KeyK" || e.key === "˚" || e.key.toLowerCase() === "k")) {
      e.preventDefault(); go("en-ko"); requestAnimationFrame(() => $("en-input").focus());
    } else if (e.key === "Escape") removeFloating();
  });

  window.addEventListener("hashchange", () => {
    const r = route();
    if (r === "explain") $("ko-input").focus({ preventScroll: true });
    if (r === "en-ko") $("en-input").focus({ preventScroll: true });
  });
  const first = route();
  if (first === "explain") $("ko-input").focus({ preventScroll: true });
  updateCount(); autosize();
}
init();
