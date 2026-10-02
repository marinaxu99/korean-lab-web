const MODEL = "gemini-2.5-flash";
const MAX_CHARS = 800;
const SETTINGS_KEY = "korean-lab-settings";
const KEY_STORAGE = "korean-lab-gemini-api-key";
const HISTORY_KEY = "korean-lab-history";

const languages = [
  ["en", "English"],
  ["zh-CN", "Simplified Chinese"],
  ["zh-TW", "Traditional Chinese"],
  ["ja", "Japanese"],
  ["es", "Spanish"],
];

const defaultSettings = {
  translationLanguages: ["en", "zh-CN"],
  learnerLevel: "intermediate",
  detailLevel: "concise",
};

const $ = (id) => document.getElementById(id);
const state = {
  settings: loadSettings(),
  cached: null,
};

init();

function init() {
  window.addEventListener("hashchange", syncRoute);
  $("analyze-form").addEventListener("submit", (event) => {
    event.preventDefault();
    analyze(false);
  });
  $("korean-input").addEventListener("input", updateCharCount);
  $("use-cache").addEventListener("click", () => {
    renderResult(state.cached);
    state.cached = null;
    $("cache-prompt").classList.add("hidden");
  });
  $("analyze-again").addEventListener("click", () => analyze(true));
  $("save-key").addEventListener("click", saveKey);
  $("api-key").value = localStorage.getItem(KEY_STORAGE) || "";

  renderSettings();
  updateCharCount();
  syncRoute();
}

function syncRoute() {
  const route = location.hash.replace("#", "") || "analyzer";
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === route));
  if (route === "history") renderHistory();
}

function updateCharCount() {
  $("char-count").textContent = `${$("korean-input").value.length} / ${MAX_CHARS}`;
  $("language-summary").textContent = state.settings.translationLanguages.map(labelForLanguage).join(" + ");
}

function renderSettings() {
  renderChips("language-options", languages, state.settings.translationLanguages, (value) => {
    const current = new Set(state.settings.translationLanguages);
    current.has(value) ? current.delete(value) : current.add(value);
    state.settings.translationLanguages = [...current];
    if (!state.settings.translationLanguages.length) state.settings.translationLanguages = ["en"];
    saveSettings();
  });

  renderChips(
    "level-options",
    [
      ["beginner", "Beginner"],
      ["intermediate", "Intermediate"],
      ["advanced", "Advanced"],
    ],
    [state.settings.learnerLevel],
    (value) => {
      state.settings.learnerLevel = value;
      saveSettings();
    },
  );

  renderChips(
    "detail-options",
    [
      ["concise", "Concise"],
      ["detailed", "Detailed"],
      ["very-detailed", "Very detailed"],
    ],
    [state.settings.detailLevel],
    (value) => {
      state.settings.detailLevel = value;
      saveSettings();
    },
  );
}

function renderChips(containerId, options, activeValues, onSelect) {
  const active = new Set(activeValues);
  $(containerId).innerHTML = "";
  options.forEach(([value, label]) => {
    const button = document.createElement("button");
    button.className = "chip";
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-pressed", String(active.has(value)));
    button.addEventListener("click", () => {
      onSelect(value);
      renderSettings();
      updateCharCount();
    });
    $(containerId).append(button);
  });
}

function saveKey() {
  const key = $("api-key").value.trim();
  key ? localStorage.setItem(KEY_STORAGE, key) : localStorage.removeItem(KEY_STORAGE);
  $("api-key").value = key;
  $("key-saved").classList.remove("hidden");
  setTimeout(() => $("key-saved").classList.add("hidden"), 1800);
}

function loadSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

async function analyze(force) {
  hideStatus();
  $("cache-prompt").classList.add("hidden");
  const text = $("korean-input").value.trim();
  const inputError = validateInput(text);
  if (inputError) return showStatus(inputError);

  const key = localStorage.getItem(KEY_STORAGE);
  if (!key) return showStatus("Add your Gemini API key first.\nOpen Settings, paste your key, and save it.");

  const cached = findCached(text);
  if (cached && !force) {
    state.cached = cached;
    $("cache-prompt").classList.remove("hidden");
    return;
  }

  showStatus("Analyzing Korean...\nKeeping the response compact to save your API usage.");
  setBusy(true);
  try {
    const analysis = await callGemini(key, text);
    saveHistory(analysis);
    renderResult(analysis);
    hideStatus();
  } catch (error) {
    showStatus(friendlyError(error));
  } finally {
    setBusy(false);
  }
}

function validateInput(text) {
  if (!text) return "Enter a Korean sentence or expression first.";
  if (!/[\u3131-\u318E\uAC00-\uD7A3]/.test(text)) return "Korean Lab is designed for Korean sentences and expressions.";
  if (text.length > MAX_CHARS) return "This passage is too long for sentence analysis.\nTry analyzing a smaller section.";
  return "";
}

async function callGemini(apiKey, text) {
  const schema = {
    type: "OBJECT",
    properties: {
      t: { type: "ARRAY", items: { type: "OBJECT", properties: { l: { type: "STRING" }, x: { type: "STRING" } }, required: ["l", "x"] } },
      lit: { type: "STRING" },
      seg: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            s: { type: "STRING" },
            m: { type: "STRING" },
            b: { type: "STRING" },
            mo: { type: "ARRAY", items: { type: "OBJECT", properties: { f: { type: "STRING" }, m: { type: "STRING" }, b: { type: "STRING" }, y: { type: "STRING" } }, required: ["f", "m"] } },
          },
          required: ["s", "m"],
        },
      },
      v: { type: "ARRAY", items: { type: "OBJECT", properties: { w: { type: "STRING" }, b: { type: "STRING" }, p: { type: "STRING" }, m: { type: "STRING" }, u: { type: "STRING" } }, required: ["w", "b", "p", "m"] } },
      g: { type: "ARRAY", items: { type: "OBJECT", properties: { p: { type: "STRING" }, m: { type: "STRING" }, f: { type: "STRING" }, u: { type: "STRING" }, e: { type: "STRING" }, c: { type: "ARRAY", items: { type: "OBJECT", properties: { p: { type: "STRING" }, d: { type: "STRING" } }, required: ["p", "d"] } } }, required: ["p", "m", "e"] } },
      n: { type: "STRING" },
      k: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["t", "seg", "v", "g", "k"],
  };

  const prompt = [
    `Korean: ${text}`,
    `Target languages: ${state.settings.translationLanguages.join(", ")}`,
    `Learner: ${state.settings.learnerLevel}; detail: ${state.settings.detailLevel}`,
    "Limits: max 5 segments, 6 vocab, 4 grammar, 2 comparisons each, 3 takeaways. Be brief.",
    "JSON keys: t {l,x}; lit; seg {s,m,b,mo[{f,m,b,y}]}; v {w,b,p,m,u}; g {p,m,f,u,e,c[{p,d}]}; n; k strings.",
  ].join("\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: "You teach Korean. Be accurate and concise. Return only compact JSON." }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        maxOutputTokens: tokenBudget(),
        temperature: 0.15,
      },
    }),
  });

  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  const data = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Gemini returned an empty response.");
  return expand(JSON.parse(raw), text);
}

function tokenBudget() {
  if (state.settings.detailLevel === "concise") return 850;
  if (state.settings.detailLevel === "very-detailed") return 1600;
  return 1150;
}

function expand(compact, original) {
  return {
    id: crypto.randomUUID(),
    original,
    settings: structuredClone(state.settings),
    translations: (compact.t || []).map((item) => ({ language: item.l, label: labelForLanguage(item.l), text: item.x })),
    literalTranslation: compact.lit,
    segments: (compact.seg || []).map((item) => ({
      surface: item.s,
      meaning: item.m,
      baseForm: item.b,
      morphology: (item.mo || []).map((m) => ({ form: m.f, meaning: m.m, baseForm: m.b, type: m.y })),
    })),
    vocabulary: (compact.v || []).map((item) => ({ word: item.w, baseForm: item.b, partOfSpeech: item.p, meaning: item.m, formInSentence: item.u })),
    grammar: (compact.g || []).map((item) => ({
      pattern: item.p,
      meaning: item.m,
      formation: item.f,
      usageInSentence: item.u,
      explanation: item.e,
      comparisons: (item.c || []).map((c) => ({ pattern: c.p, difference: c.d })),
    })),
    nuance: compact.n,
    keyTakeaways: (compact.k || []).slice(0, 3).map((text) => ({ title: text, explanation: "" })),
  };
}

function renderResult(analysis) {
  const result = $("result");
  result.innerHTML = "";
  result.append(section("Original", `<p class="korean original">${escapeHtml(analysis.original)}</p>`));
  result.append(section("Translation", `<div class="translation-grid">${analysis.translations.map((t) => `<div class="mini-card"><p class="small">${escapeHtml(t.label)}</p><p>${escapeHtml(t.text)}</p></div>`).join("")}</div>`));
  if (analysis.literalTranslation) result.append(section("Literal translation", `<p>${escapeHtml(analysis.literalTranslation)}</p>`));
  result.append(section("Sentence breakdown", `<div class="segments">${analysis.segments.map((s) => `<div class="segment"><strong>${escapeHtml(s.surface)}</strong><span>${escapeHtml(s.meaning)}</span>${s.morphology?.length ? `<p class="small">${s.morphology.map((m) => `${escapeHtml(m.form)} = ${escapeHtml(m.meaning)}`).join("; ")}</p>` : ""}</div>`).join("")}</div>`));
  result.append(section("Vocabulary", `<div class="stack">${analysis.vocabulary.map((v) => `<details><summary><strong class="korean">${escapeHtml(v.baseForm)}</strong> ${escapeHtml(v.meaning)} <span class="small">(${escapeHtml(v.partOfSpeech)})</span></summary>${v.formInSentence ? `<p class="small">Used as ${escapeHtml(v.formInSentence)}</p>` : ""}</details>`).join("")}</div>`));
  result.append(section("Grammar", `<div class="stack">${analysis.grammar.map((g) => `<article class="mini-card"><h3 class="korean">${escapeHtml(g.pattern)}</h3><p><strong>${escapeHtml(g.meaning)}</strong></p>${g.formation ? `<p class="small">Formation: ${escapeHtml(g.formation)}</p>` : ""}${g.usageInSentence ? `<p class="small korean">Here: ${escapeHtml(g.usageInSentence)}</p>` : ""}<p>${escapeHtml(g.explanation)}</p>${g.comparisons?.length ? `<p class="small">Compare: ${g.comparisons.map((c) => `${escapeHtml(c.pattern)} — ${escapeHtml(c.difference)}`).join("; ")}</p>` : ""}</article>`).join("")}</div>`));
  if (analysis.nuance) result.append(section("Nuance", `<p>${escapeHtml(analysis.nuance)}</p>`));
  result.append(section("Key takeaways", `<ol>${analysis.keyTakeaways.map((k) => `<li>${escapeHtml(k.title || k.explanation)}</li>`).join("")}</ol>`));
}

function section(title, html) {
  const element = document.createElement("section");
  element.className = "section";
  element.innerHTML = `<h2>${escapeHtml(title)}</h2>${html}`;
  return element;
}

function renderHistory() {
  const history = getHistory();
  $("history-list").innerHTML = history.length
    ? history.map((item) => `<article class="card"><p class="korean"><strong>${escapeHtml(item.original)}</strong></p><p class="muted">${escapeHtml(item.primaryTranslation || "")}</p><p class="small">${new Date(item.timestamp).toLocaleString()}</p></article>`).join("")
    : `<section class="card"><p><strong>No saved analyses yet.</strong></p><p class="muted">Analyze a sentence and it will appear here automatically.</p></section>`;
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(analysis) {
  const entry = { id: analysis.id, original: analysis.original, primaryTranslation: analysis.translations[0]?.text || "", analysis, timestamp: new Date().toISOString() };
  const history = getHistory().filter((item) => cacheKey(item.original, item.analysis.settings) !== cacheKey(analysis.original, analysis.settings));
  localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...history].slice(0, 100)));
}

function findCached(text) {
  return getHistory().find((item) => cacheKey(item.original, item.analysis.settings) === cacheKey(text, state.settings))?.analysis || null;
}

function cacheKey(text, settings) {
  return JSON.stringify({ text: text.trim(), settings });
}

function labelForLanguage(code) {
  return languages.find(([value]) => value === code)?.[1] || code;
}

function showStatus(message) {
  const [title, detail] = message.split("\n");
  $("status").innerHTML = `<div><strong>${escapeHtml(title)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>`;
  $("status").classList.remove("hidden");
}

function hideStatus() {
  $("status").classList.add("hidden");
  $("status").innerHTML = "";
}

function setBusy(busy) {
  document.querySelector("#analyze-form button").disabled = busy;
}

function friendlyError(error) {
  const message = String(error?.message || error).toLowerCase();
  if (message.includes("429") || message.includes("quota") || message.includes("resource_exhausted") || message.includes("rate limit")) return "Free AI limit reached.\nThis Gemini key is out of available free allowance. Please try again later.";
  if (message.includes("api key") || message.includes("403") || message.includes("permission")) return "Gemini could not use this API key.\nCheck the key in Settings and make sure Gemini API is enabled.";
  if (message.includes("network") || message.includes("failed to fetch")) return "Couldn't connect to Gemini from this browser.\nCheck your browser network, VPN, or proxy and try again.";
  return "The analysis couldn't be read correctly.\nPlease try again.";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
