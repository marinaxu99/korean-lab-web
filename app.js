const CANDIDATE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-3-flash",
  "gemini-2.5-flash"
];

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
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === route);
  });
  if (route === "history") renderHistory();
}

function updateCharCount() {
  const count = $("korean-input").value.length;
  $("char-count").textContent = `${count} / ${MAX_CHARS}`;
  $("language-summary").textContent = state.settings.translationLanguages.map(labelForLanguage).join(" + ");
}

/* ==========================================================================
   Natural Web Speech Pronunciation Engine
   ========================================================================== */
function playKoreanAudio(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();

  const cleanText = text.replace(/[[\]()~-]/g, "").trim();
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = "ko-KR";
  utterance.rate = 0.92;
  utterance.pitch = 1.05;

  const voices = window.speechSynthesis.getVoices();
  const naturalVoice = voices.find(
    (v) =>
      v.lang.startsWith("ko") &&
      (v.name.includes("Yuna") ||
        v.name.includes("Sora") ||
        v.name.includes("Premium") ||
        v.name.includes("Natural") ||
        v.name.includes("Google 한국어"))
  ) || voices.find((v) => v.lang.startsWith("ko"));

  if (naturalVoice) utterance.voice = naturalVoice;
  window.speechSynthesis.speak(utterance);
}

window.playAudioHook = (btn, text) => {
  btn.classList.add("speaking");
  playKoreanAudio(text);
  setTimeout(() => btn.classList.remove("speaking"), 1400);
};

/* ==========================================================================
   Settings Management
   ========================================================================== */
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
  const key = $("api-key").value.trim().replace(/\s+/g, "");
  key ? localStorage.setItem(KEY_STORAGE, key) : localStorage.removeItem(KEY_STORAGE);
  $("api-key").value = key;
  $("key-saved").classList.remove("hidden");
  setTimeout(() => $("key-saved").classList.add("hidden"), 2000);
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

/* ==========================================================================
   Input Detection & Execution
   ========================================================================== */
function detectInputType(text) {
  const trimmed = text.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const hasSentencePunctuation = /[.?!~]/.test(trimmed);
  const hasSentenceConjugation = /(?:다|요|죠|까|네|거든|잖아|는데|지만)$/.test(trimmed);

  if (wordCount <= 2 && !hasSentencePunctuation && !hasSentenceConjugation) {
    return "word";
  }
  return "sentence";
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

  const mode = detectInputType(text);
  showStatus(mode === "word" ? "Analyzing Korean vocabulary..." : "Analyzing Korean sentence structure...");
  setBusy(true);

  try {
    const analysis = await callGemini(key, text, mode);
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

/* ==========================================================================
   Universal API Call Engine
   ========================================================================== */
async function callGemini(apiKey, text, mode) {
  const cleanKey = apiKey.trim().replace(/\s+/g, "");
  if (!cleanKey) throw new Error("API key is empty.");

  const isWord = mode === "word";

  const schema = isWord
    ? {
      type: "OBJECT",
      properties: {
        mode: { type: "STRING" },
        t: { type: "ARRAY", items: { type: "OBJECT", properties: { l: { type: "STRING" }, x: { type: "STRING" } }, required: ["l", "x"] } },
        v: {
          type: "OBJECT",
          properties: {
            w: { type: "STRING" },
            b: { type: "STRING" },
            p: { type: "STRING" },
            m: { type: "STRING" },
            hanja: { type: "STRING" },
            antonyms: { type: "ARRAY", items: { type: "STRING" } },
            synonyms: { type: "ARRAY", items: { type: "STRING" } },
            collocations: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["w", "b", "p", "m"],
        },
        ex: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { ko: { type: "STRING" }, tr: { type: "STRING" } },
            required: ["ko", "tr"],
          },
        },
        n: { type: "STRING" },
      },
      required: ["mode", "t", "v", "ex"],
    }
    : {
      type: "OBJECT",
      properties: {
        mode: { type: "STRING" },
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
      required: ["mode", "t", "seg", "v", "g", "k"],
    };

  const prompt = isWord
    ? [
      `Target Korean Word: ${text}`,
      `Target translation languages: ${state.settings.translationLanguages.join(", ")}`,
      `Learner level: ${state.settings.learnerLevel}`,
      "Task: Treat as single word/term. Give definitions, root form, Hanja if Sino-Korean, 2-3 collocations, 2 natural example sentences, and nuance.",
      "JSON keys: mode ('word'), t {l,x}, v {w,b,p,m,hanja,antonyms[],synonyms[],collocations[]}, ex [{ko,tr}], n.",
    ].join("\n")
    : [
      `Target Korean Sentence: ${text}`,
      `Target translation languages: ${state.settings.translationLanguages.join(", ")}`,
      `Learner level: ${state.settings.learnerLevel}; Detail: ${state.settings.detailLevel}`,
      "Limits: max 5 segments, 5 vocab, 3 grammar, 2 comparisons each, 3 takeaways.",
      "JSON keys: mode ('sentence'), t {l,x}, lit, seg {s,m,b,mo[{f,m,b,y}]}, v {w,b,p,m,u}, g {p,m,f,u,e,c[{p,d}]}, n, k strings.",
    ].join("\n");

  const payload = {
    systemInstruction: { parts: [{ text: "You are an analytical Korean linguistics instructor. Output compact valid JSON strictly complying with schema." }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      maxOutputTokens: isWord ? 1000 : 2500,
      temperature: 0.15,
      thinkingConfig: { thinkingBudget: 0 }
    },
  };

  let lastError = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.status === 404 || response.status === 429 || response.status === 503) {
        lastError = new Error(`Model ${model} unavailable (${response.status})`);
        continue; // Instantly cascade to the next Lite model
      }

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
      }

      const data = await response.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) throw new Error("Gemini returned an empty response.");
      return expand(JSON.parse(raw), text, mode);
    } catch (err) {
      if (err.message && (err.message.includes("404") || err.message.includes("503"))) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("All Gemini candidate models failed. Please verify your API key.");
}

function expand(compact, original, detectedMode) {
  const isWord = compact.mode === "word" || detectedMode === "word";
  return {
    id: crypto.randomUUID(),
    original,
    mode: isWord ? "word" : "sentence",
    settings: structuredClone(state.settings),
    translations: (compact.t || []).map((item) => ({ language: item.l, label: labelForLanguage(item.l), text: item.x })),
    literalTranslation: compact.lit,
    wordInfo: isWord ? compact.v : null,
    examples: isWord ? compact.ex || [] : [],
    segments: (compact.seg || []).map((item) => ({
      surface: item.s,
      meaning: item.m,
      baseForm: item.b,
      morphology: (item.mo || []).map((m) => ({ form: m.f, meaning: m.m, baseForm: m.b, type: m.y })),
    })),
    vocabulary: !isWord ? (compact.v || []).map((item) => ({ word: item.w, baseForm: item.b, partOfSpeech: item.p, meaning: item.m, formInSentence: item.u })) : [],
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

/* ==========================================================================
   UI Rendering
   ========================================================================== */
function renderResult(analysis) {
  const result = $("result");
  result.innerHTML = "";

  // 1. Original Sentence / Word Banner (With audio button)
  const orig = document.createElement("section");
  orig.className = "original-box";
  orig.innerHTML = `
    <div class="original-header-row">
      <div class="original-text-wrap">
        <span class="badge subtle mode-badge">${analysis.mode === "word" ? "VOCABULARY" : "SENTENCE"}</span>
        <p class="korean original-text">${escapeHtml(analysis.original)}</p>
      </div>
      <button type="button" class="btn-audio" title="Listen" onclick="playAudioHook(this, '${escapeHtml(analysis.original)}')">
        <span class="audio-icon">🔊</span>
      </button>
    </div>
    ${analysis.literalTranslation ? `<div class="literal-box"><strong>Literal gloss:</strong> ${escapeHtml(analysis.literalTranslation)}</div>` : ""}
  `;
  result.append(orig);

  // 2. Translations Grid
  result.append(section("Translations", "🌐", `
    <div class="translation-grid">
      ${analysis.translations.map((t) => `
        <div class="trans-card">
          <div class="trans-lang">${escapeHtml(t.label)}</div>
          <div class="trans-text">${escapeHtml(t.text)}</div>
        </div>
      `).join("")}
    </div>
  `));

  // BRANCH A: Word Mode
  if (analysis.mode === "word" && analysis.wordInfo) {
    const w = analysis.wordInfo;
    result.append(section("Lexical Profile", "📖", `
      <div class="word-profile-card">
        <div class="word-profile-top">
          <div>
            <h3 class="korean word-base-title">${escapeHtml(w.b || w.w)}</h3>
            ${w.hanja ? `<span class="hanja-tag">${escapeHtml(w.hanja)}</span>` : ""}
            <span class="pos-tag">${escapeHtml(w.p)}</span>
          </div>
          <p class="word-primary-mean">${escapeHtml(w.m)}</p>
        </div>
        ${w.collocations?.length ? `
          <div class="collocation-list">
            <strong>Common Collocations:</strong>
            ${w.collocations.map((c) => `<span class="colloc-pill korean">${escapeHtml(c)}</span>`).join("")}
          </div>
        ` : ""}
      </div>
    `));

    if (analysis.examples?.length) {
      result.append(section("Practical Examples", "💬", `
        <div class="example-stack">
          ${analysis.examples.map((ex) => `
            <div class="example-item">
              <span class="korean example-ko">${escapeHtml(ex.ko)}</span>
              <p class="example-tr">${escapeHtml(ex.tr)}</p>
            </div>
          `).join("")}
        </div>
      `));
    }
  }

  // BRANCH B: Sentence Mode
  if (analysis.mode === "sentence") {
    // 3. Sentence Breakdown (Clean, static layout)
    result.append(section("Sentence Breakdown", "🧩", `
      <div class="segments-container">
        ${analysis.segments.map((s) => `
          <div class="segment-pill-card">
            <span class="seg-surface korean">${escapeHtml(s.surface)}</span>
            <span class="seg-meaning">${escapeHtml(s.meaning)}</span>${s.morphology?.length ? `
              <div class="seg-morphology">
                ${s.morphology.map((m) => `<strong>${escapeHtml(m.form)}</strong> (${escapeHtml(m.meaning)})`).join(" + ")}
              </div>
            ` : ""}
          </div>
        `).join("")}
      </div>
    `));

    // 4. Vocabulary (Solid clean cards; audio kept here)
    if (analysis.vocabulary?.length) {
      result.append(section("Vocabulary", "📖", `
        <div class="vocab-stack">
          ${analysis.vocabulary.map((v) => `
            <div class="vocab-card">
              <div class="vocab-left">
                <span class="korean vocab-base">${escapeHtml(v.baseForm || v.word)}</span>
                <span class="pos-tag">${escapeHtml(v.partOfSpeech)}</span>${v.formInSentence && v.formInSentence !== (v.baseForm || v.word) ? `<span class="muted" style="font-size:12px;">(as ${escapeHtml(v.formInSentence)})</span>` : ""}
              </div>
              <div class="vocab-right">
                <span class="vocab-meaning">${escapeHtml(v.meaning)}</span>
                <button type="button" class="btn-audio-mini" title="Listen" onclick="playAudioHook(this, '${escapeHtml(v.baseForm || v.word)}')">🔊</button>
              </div>
            </div>
          `).join("")}
        </div>
      `));
    }

    // 5. Grammar Points: Pattern -> Meaning -> Rule -> Explanation -> Compare
    if (analysis.grammar?.length) {
      result.append(section("Grammar Points", "📐", `
        <div class="grammar-stack">
          ${analysis.grammar.map((g) => {
        const hasRule = Boolean(g.formation && g.formation.trim());
        const hasUsage = Boolean(g.usageInSentence && g.usageInSentence.trim());
        const hasComparisons = Boolean(g.comparisons && g.comparisons.length > 0);

        return `
              <article class="grammar-card">
                <div class="grammar-pattern korean">${escapeHtml(g.pattern)}</div>
                <div class="grammar-meaning">${escapeHtml(g.meaning)}</div>

                ${(hasRule || hasUsage) ? `
                  <div class="grammar-rule-box">
                    ${hasRule ? `<div><strong>Rule:</strong> ${escapeHtml(g.formation)}</div>` : ""}
                    ${hasUsage ? `<div><strong>In Sentence:</strong> <span class="korean">${escapeHtml(g.usageInSentence)}</span></div>` : ""}
                  </div>
                ` : ""}

                ${g.explanation ? `<p class="grammar-expl">${escapeHtml(g.explanation)}</p>` : ""}

                ${hasComparisons ? `
                  <div class="grammar-compare">
                    <strong>Comparison:</strong>
                    ${g.comparisons.map((c) => `${escapeHtml(c.pattern)} (${escapeHtml(c.difference)})`).join("; ")}
                  </div>
                ` : ""}
              </article>
            `;
      }).join("")}
        </div>
      `));
    }
  }

  // 6. Nuance
  if (analysis.nuance) {
    result.append(section("Nuance & Usage", "💡", `<p class="nuance-text">${escapeHtml(analysis.nuance)}</p>`));
  }

  // 7. Takeaways
  if (analysis.keyTakeaways?.length) {
    result.append(section("Key Takeaways", "🎯", `
      <ol class="takeaways-list">
        ${analysis.keyTakeaways.map((k) => `<li>${escapeHtml(k.title || k.explanation)}</li>`).join("")}
      </ol>
    `));
  }
}

function section(title, icon, innerHtml) {
  const element = document.createElement("section");
  element.className = "result-card";
  element.innerHTML = `
    <div class="result-card-header">
      <h2><span>${icon}</span> ${escapeHtml(title)}</h2>
      <span class="header-pill">Analysis</span>
    </div>
    ${innerHtml}
  `;
  return element;
}

function renderHistory() {
  const history = getHistory();
  const container = $("history-list");
  if (!history.length) {
    container.innerHTML = `<div class="card" style="text-align: center; color: var(--muted);"><p>No saved analyses yet. Enter a sentence or word to begin.</p></div>`;
    return;
  }

  container.innerHTML = history.map((item) => `
    <article class="history-card" data-id="${item.id}">
      <div class="history-main">
        <div style="display: flex; gap: 8px; align-items: baseline;">
          <span class="badge subtle" style="font-size: 9px;">${item.analysis?.mode === "word" ? "WORD" : "SENTENCE"}</span>
          <span class="korean history-original">${escapeHtml(item.original)}</span>
        </div>
        <span class="history-trans">${escapeHtml(item.primaryTranslation || "")}</span>
        <span class="history-time">${new Date(item.timestamp).toLocaleDateString()} · ${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <button class="btn-sm btn-secondary history-load-btn" type="button">Inspect</button>
    </article>
  `).join("");

  container.querySelectorAll(".history-card").forEach((card) => {
    card.addEventListener("click", () => {
      const match = history.find((h) => h.id === card.dataset.id);
      if (match) {
        $("korean-input").value = match.original;
        updateCharCount();
        renderResult(match.analysis);
        location.hash = "#analyzer";
      }
    });
  });
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
  $("status").innerHTML = `<div><strong>${escapeHtml(title)}</strong>${detail ? `<p style="margin-top: 4px;">${escapeHtml(detail)}</p>` : ""}</div>`;
  $("status").classList.remove("hidden");
}

function hideStatus() {
  $("status").classList.add("hidden");
  $("status").innerHTML = "";
}

function setBusy(busy) {
  const btn = $("analyze-btn");
  btn.disabled = busy;
  btn.querySelector("span").textContent = busy ? "Analyzing..." : "Analyze";
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