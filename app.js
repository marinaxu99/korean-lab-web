// High-capacity models with 250,000 requests/day
const CANDIDATE_MODELS = [
  "gemini-2.5-flash-lite",
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
  translationLanguages: ["en"],
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

  if (count === 0 && !$("result").children.length) {
    $("analyzer").classList.remove("has-result");
  }
}

/* Pronunciation Audio Hook */
function playKoreanAudio(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();

  const cleanText = text.replace(/[[\]()~-]/g, "").trim();
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = "ko-KR";
  utterance.rate = 0.92;

  const voices = window.speechSynthesis.getVoices();
  const naturalVoice = voices.find((v) => v.lang.startsWith("ko") && (v.name.includes("Yuna") || v.name.includes("Sora") || v.name.includes("Natural") || v.name.includes("Google 한국어"))) || voices.find((v) => v.lang.startsWith("ko"));

  if (naturalVoice) utterance.voice = naturalVoice;
  window.speechSynthesis.speak(utterance);
}

window.playAudioHook = (btn, text) => {
  btn.classList.add("speaking");
  playKoreanAudio(text);
  setTimeout(() => btn.classList.remove("speaking"), 1400);
};

/* Settings Management */
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
  setTimeout(() => $("key-saved").classList.add("hidden"), 2200);
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

function detectInputType(text) {
  const trimmed = text.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const hasPunctuation = /[.?!~]/.test(trimmed);
  const hasConjugation = /(?:다|요|죠|까|네|거든|잖아|는데|지만)$/.test(trimmed);
  return wordCount <= 2 && !hasPunctuation && !hasConjugation ? "word" : "sentence";
}

/* Analysis Flow */
async function analyze(force) {
  hideStatus();
  $("cache-prompt").classList.add("hidden");
  const text = $("korean-input").value.trim();
  const inputError = validateInput(text);
  if (inputError) return showStatus(inputError);

  const key = localStorage.getItem(KEY_STORAGE);
  if (!key) return showStatus("Gemini API Key Required\nPlease paste your key in Settings to activate the analyzer.");

  const cached = findCached(text);
  if (cached && !force) {
    state.cached = cached;
    $("cache-prompt").classList.remove("hidden");
    return;
  }

  const mode = detectInputType(text);
  showStatus(mode === "word" ? "ANALYZING LEXICAL ENTRY..." : "DECONSTRUCTING PHRASES & MORPHOLOGY...");
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
  if (!/[\u3131-\u318E\uAC00-\uD7A3]/.test(text)) return "Korean Lab is designed for Korean text (Hangul characters).";
  if (text.length > MAX_CHARS) return "Text too long. Try a shorter sentence or paragraph.";
  return "";
}

/* Gemini API Cascade */
async function callGemini(apiKey, text, mode) {
  const cleanKey = apiKey.trim().replace(/\s+/g, "");
  const isWord = mode === "word";

  const schema = isWord
    ? {
      type: "OBJECT",
      properties: {
        mode: { type: "STRING" },
        word: { type: "STRING" },
        root: { type: "STRING" },
        pos: { type: "STRING" },
        hanja: { type: "STRING" },
        primaryMeaning: { type: "STRING" },
        naturalEnglish: { type: "STRING" },
        nuance: { type: "STRING" },
        examples: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { ko: { type: "STRING" }, en: { type: "STRING" } },
            required: ["ko", "en"],
          },
        },
      },
      required: ["mode", "word", "primaryMeaning", "naturalEnglish"],
    }
    : {
      type: "OBJECT",
      properties: {
        mode: { type: "STRING" },
        naturalEnglish: { type: "STRING" },
        literalTranslation: { type: "STRING" },
        breakdown: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              chunk: { type: "STRING" },
              rootForm: { type: "STRING" },
              pos: { type: "STRING" },
              meaning: { type: "STRING" },
            },
            required: ["chunk", "meaning"],
          },
        },
        grammarPoints: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              pattern: { type: "STRING" },
              meaning: { type: "STRING" },
              rule: { type: "STRING" },
              explanation: { type: "STRING" },
            },
            required: ["pattern", "meaning", "explanation"],
          },
        },
        nuance: { type: "STRING" },
      },
      required: ["mode", "naturalEnglish", "breakdown", "grammarPoints"],
    };

  const prompt = isWord
    ? `Target Korean Word: "${text}"
Output a rich vocabulary profile in JSON matching schema. Include root form, Hanja if Sino-Korean, natural English meaning, nuance, and 2 example sentences.`
    : `Target Korean Sentence: "${text}"
Task:
1. "naturalEnglish": Provide ONE natural, fluent, idiomatic English translation that makes the most sense in English.
2. "literalTranslation": Provide a word-by-word literal gloss.
3. "breakdown": Break down into grammatical chunks (combining words with attached particles like "처음에는", "영화를"). Include rootForm, pos, and context meaning.
4. "grammarPoints": Extract ONLY significant Korean grammar structures (e.g., "-는 것", "-(으)ㄹ 수 있다", "-기로 하다", "-어/아 보다", "-는데"). DO NOT list plain nouns, adverbs, or basic words as grammar.
5. "nuance": 1-sentence note on politeness register and tone.`;

  let lastError = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const generationConfig = {
        responseMimeType: "application/json",
        responseSchema: schema,
        maxOutputTokens: isWord ? 800 : 2200,
        temperature: 0.15,
      };

      if (model === "gemini-2.5-flash") {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      const payload = {
        systemInstruction: { parts: [{ text: "You are an analytical Korean linguistics instructor for intermediate learners. Output compact valid JSON strictly following schema." }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      };

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 404 || response.status === 429 || response.status === 503) {
        lastError = new Error(`Model ${model} unavailable (${response.status})`);
        continue;
      }

      if (!response.ok) {
        throw new Error(`${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) throw new Error("Empty AI response received.");
      return JSON.parse(raw);
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error("All candidate models failed. Please verify your Gemini API key.");
}

/* UI Rendering */
function renderResult(data) {
  const result = $("result");
  result.innerHTML = "";

  // Switch analyzer from vertical center to natural document flow
  $("analyzer").classList.add("has-result");

  const isWord = data.mode === "word";

  // 1. Top Original Korean Card with Audio
  const orig = document.createElement("section");
  orig.className = "original-masthead";
  orig.innerHTML = `
    <div>
      <span class="mono" style="font-size:10px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.8px; display:block; margin-bottom:4px;">
        ${isWord ? "LEXICAL ENTRY" : "HANGUL STATEMENT"}
      </span>
      <p class="original-hangul">${escapeHtml(data.word || $("korean-input").value.trim())}</p>
    </div>
    <button type="button" class="btn-audio" title="Listen" onclick="playAudioHook(this, '${escapeHtml(data.word || $("korean-input").value.trim())}')">
      🔊
    </button>
  `;
  result.append(orig);

  // 2. Natural English Meaning First
  const meaningSection = document.createElement("section");
  meaningSection.className = "meaning-banner";
  meaningSection.innerHTML = `
    <div class="meaning-label">Natural English Meaning</div>
    <div class="meaning-text">${escapeHtml(data.naturalEnglish || data.primaryMeaning)}</div>
    ${data.literalTranslation ? `<div class="meaning-literal"><strong>Literal gloss:</strong> ${escapeHtml(data.literalTranslation)}</div>` : ""}
  `;
  result.append(meaningSection);

  // 3. Sentence Mode: Integrated 2-Row Breakdown & Grammar
  if (!isWord) {
    if (data.breakdown?.length) {
      const breakdownEl = document.createElement("section");
      breakdownEl.innerHTML = `
        <div class="section-label">Phrases & Morphology</div>
        <div class="breakdown-stack">
          ${data.breakdown.map((item) => `
            <div class="chunk-card">
              <div class="chunk-left">
                <div class="chunk-primary-row">
                  <span class="chunk-text">${escapeHtml(item.chunk)}</span>${item.rootForm && item.rootForm !== item.chunk ? `<span class="chunk-root">${escapeHtml(item.rootForm)}</span>` : ""}
                </div>
                ${item.pos ? `<span class="chunk-pos">${escapeHtml(item.pos)}</span>` : ""}
              </div>
              <div class="chunk-mean">${escapeHtml(item.meaning)}</div>
            </div>
          `).join("")}
        </div>
      `;
      result.append(breakdownEl);
    }

    if (data.grammarPoints?.length) {
      const grammarEl = document.createElement("section");
      grammarEl.innerHTML = `
        <div class="section-label">Grammar Structures</div>
        <div class="grammar-stack">
          ${data.grammarPoints.map((g) => `
            <article class="grammar-card">
              <div class="grammar-top">
                <span class="grammar-pattern">${escapeHtml(g.pattern)}</span>
                <span class="grammar-meaning">${escapeHtml(g.meaning)}</span>
              </div>
              ${g.rule ? `<div class="grammar-rule">RULE: ${escapeHtml(g.rule)}</div>` : ""}
              <p class="grammar-expl">${escapeHtml(g.explanation)}</p>
            </article>
          `).join("")}
        </div>
      `;
      result.append(grammarEl);
    }
  }

  // 4. Word Mode: Root, Hanja & Examples
  if (isWord) {
    const wordProfile = document.createElement("section");
    wordProfile.className = "word-masthead-box";
    wordProfile.innerHTML = `
      <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
        <span class="word-hero-title">${escapeHtml(data.root || data.word)}</span>
        ${data.hanja ? `<span class="hanja-pill">${escapeHtml(data.hanja)}</span>` : ""}
        <span class="chunk-pos">${escapeHtml(data.pos || "")}</span>
      </div>
      <p class="word-primary-def">${escapeHtml(data.primaryMeaning)}</p>
    `;
    result.append(wordProfile);

    if (data.examples?.length) {
      const examplesEl = document.createElement("section");
      examplesEl.innerHTML = `
        <div class="section-label">Practical Examples</div>
        <div class="example-stack">
          ${data.examples.map((ex) => `
            <div class="example-card">
              <p class="example-ko">${escapeHtml(ex.ko)}</p>
              <p class="example-en">${escapeHtml(ex.en)}</p>
            </div>
          `).join("")}
        </div>
      `;
      result.append(examplesEl);
    }
  }

  // 5. Politeness & Tone
  if (data.nuance) {
    const toneEl = document.createElement("section");
    toneEl.className = "tone-card";
    toneEl.innerHTML = `
      <span class="tone-label">Politeness & Tone</span>
      <span>${escapeHtml(data.nuance)}</span>
    `;
    result.append(toneEl);
  }
}

function renderHistory() {
  const history = getHistory();
  const container = $("history-list");
  if (!history.length) {
    container.innerHTML = `<div class="card" style="text-align: center; padding: 24px; color: var(--muted);"><p class="mono">NO RECORDED ENTRIES FOUND.</p></div>`;
    return;
  }

  container.innerHTML = history.map((item) => `
    <article class="history-card" data-id="${item.id}">
      <div class="history-left">
        <span class="history-original">${escapeHtml(item.original)}</span>
        <span class="history-trans">${escapeHtml(item.primaryTranslation || "")}</span>
      </div>
      <span class="mono" style="font-size: 10px; color: var(--muted);">${new Date(item.timestamp).toLocaleDateString()}</span>
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
  const entry = {
    id: crypto.randomUUID(),
    original: $("korean-input").value.trim(),
    primaryTranslation: analysis.naturalEnglish || analysis.primaryMeaning || "",
    analysis,
    timestamp: new Date().toISOString(),
  };
  const history = getHistory().filter((item) => item.original !== entry.original);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...history].slice(0, 100)));
}

function findCached(text) {
  return getHistory().find((item) => item.original.trim() === text.trim())?.analysis || null;
}

function labelForLanguage(code) {
  return languages.find(([value]) => value === code)?.[1] || code;
}

function showStatus(message) {
  $("status").textContent = message;
  $("status").classList.remove("hidden");
}

function hideStatus() {
  $("status").classList.add("hidden");
  $("status").textContent = "";
}

function setBusy(busy) {
  const btn = $("analyze-btn");
  btn.disabled = busy;
  btn.querySelector("span:last-child").textContent = busy ? "ANALYZING..." : "ANALYZE";
}

function friendlyError(error) {
  const message = String(error?.message || error).toLowerCase();
  if (message.includes("429") || message.includes("quota")) return "Rate limit reached. Please wait a few moments and try again.";
  if (message.includes("api key") || message.includes("403")) return "Check your Gemini API key in Settings.";
  return "Could not complete analysis. Check your connection or API key.";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}