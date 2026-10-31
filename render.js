// Result rendering, ported from the Korean Lab Safari extension (content.js, 1.3.28):
// layout D (numbered sentence map), layout A (two columns) and the EN -> KO lookup card.
"use strict";
let layoutStyle = "D";
let lastRender = null;

function renderEnglishLookupResult(container, data) {
  data = { ...data,
    examples: validRows(data.examples, ["ko", "en"]),
    alternatives: validRows(data.alternatives, ["term", "translation"])
  };
  container.innerHTML = `
    <div class="kl-word-masthead" style="margin-top: 4px;">
      <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
        <span class="kl-word-title">${escapeHtml(data.primaryKorean)}</span>
        ${data.rootForm && data.rootForm !== data.primaryKorean ? `<span class="kl-chunk-root">${escapeHtml(data.rootForm)}</span>` : ""}
        ${data.pos ? `<span class="kl-chunk-pos">${escapeHtml(data.pos)}</span>` : ""}
      </div>
      <div class="kl-word-meaning">${escapeHtml(data.literalMeaning)}</div>
    </div>

    ${present(data.nuance) ? `
      <div class="kl-tone-card" style="margin: 12px 0 16px;">
        <span class="kl-tone-label">CONTEXT & REGISTER</span>
        <span>${escapeHtml(data.nuance)}</span>
      </div>
    ` : ""}

    ${data.examples?.length ? `
      <div class="kl-section-label">Real-World Examples</div>
      <div class="kl-ex-stack">
        ${data.examples.map((ex) => `
          <div class="kl-ex-card">
            <div class="kl-ex-ko">${escapeHtml(ex.ko)}</div>
            <div class="kl-ex-en">${escapeHtml(ex.en)}</div>
          </div>
        `).join("")}
      </div>
    ` : ""}

    ${data.alternatives?.length ? `
      <div class="kl-section-label">Alternative Phrasings</div>
      <div class="kl-alt-stack">
        ${data.alternatives.map((alt) => `
          <div class="kl-alt-card">
            <div class="kl-alt-top">
              <span class="kl-alt-term">${escapeHtml(alt.term)}</span>
              <span class="kl-alt-trans">${escapeHtml(alt.translation || "")}</span>
            </div>
            ${present(alt.nuance) ? `<div class="kl-alt-nuance">${escapeHtml(alt.nuance)}</div>` : ""}
          </div>
        `).join("")}
      </div>
    ` : ""}
  `;
}

function present(value) {
  return typeof value === "string" && value.trim() && !["null", "undefined", "n/a"].includes(value.trim().toLowerCase());
}

function validRows(value, fields) {
  return Array.isArray(value) ? value.filter(item => item && fields.every(field => present(item[field]))) : [];
}

function wordClassLabel(value) {
  if (!present(value)) return "";
  const label = value.trim().toLowerCase();
  if (/adverb/.test(label)) return "adverb";
  if (/adjective|descriptive verb|\badj\b/.test(label)) return "adjective";
  if (/verb/.test(label)) return "verb";
  if (/pronoun/.test(label)) return "pronoun";
  if (/noun/.test(label)) return "noun";
  if (/particle|postposition/.test(label)) return "particle";
  if (/expression|phrase|idiom/.test(label)) return "expression";
  return label.replace(/^\(|\)$/g, "");
}

function inlineHanja(v) {
  const root = present(v.rootForm) ? v.rootForm.trim() : v.term.trim();
  // These native words have no etymological Hanja; ignore stale generated guesses.
  const nativeRoots = new Set(["사람", "처음", "높다", "낮다", "오르다", "차근차근", "쓰레기"]);
  const hanja = present(v.hanja) && !nativeRoots.has(root) ? v.hanja : "";
  const characters = hanja.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+(?:[ \t]+[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+)*/u)?.[0];
  return characters ? `<span class="kl-inline-hanja">[${escapeHtml(characters)}]</span>` : "";
}

function displayableTerm(t) {
  const term = String(t.term || "").trim();
  return term !== "하다" && !/^[-–−~(（]/.test(term)
    && !/^(고 있다|고있다|아\/어 있다|아\/어야 하다|는 중이다)$/.test(term)
    && !/grammar|ending|particle|suffix/i.test(t.pos || "");
}

function vocabularyMeta(v) {
  const terms = validRows(v.terms, ["term", "meaning"]).filter(displayableTerm);
  if (terms.length) return `<div class="kl-term-list kl-a-vocab">${terms.map(t => `<div class="kl-term-row"><span class="kl-term-heading"><span class="kl-a-w">${escapeHtml(t.term)}</span>${inlineHanja(t)}</span><span class="kl-term-definition">${posTag(t.pos)}${escapeHtml(t.meaning)}</span></div>`).join("")}</div>`;
  if (Array.isArray(v.terms)) return "";
  const hasRoot = present(v.rootForm) && v.rootForm !== v.term;
  const details = [];
  if (hasRoot) {
    details.push(`<span class="kl-dictionary-meta"><span class="kl-chunk-root">${escapeHtml(v.rootForm)}</span>${present(v.rootMeaning) ? `<span>${escapeHtml(v.rootMeaning)}</span>` : ""}${present(v.pos) ? `<span class="kl-word-class">(${escapeHtml(wordClassLabel(v.pos))})</span>` : ""}</span>`);
  }
  return details.length ? `<div class="kl-compact-meta">${details.join("")}</div>` : "";
}

function renderEditorialData(container, data, options = {}) {
  lastRender = { container, data, options };
  if (layoutStyle !== "A") return renderSentenceMap(container, data, options);
  const vocabulary = validRows(data.vocabulary, ["term", "meaning"]).filter(displayableTerm);
  const breakdown = validRows(data.breakdown, ["chunk", "meaning"]);
  const sentence = data.mode === "sentence" || breakdown.length > 0;
  const entries = sentence ? breakdown.map(v => ({ ...v, term: v.chunk })) : vocabulary;
  const grammar = validRows(data.grammarPoints, ["pattern", "meaning"]);
  container.innerHTML = `
    <div class="kl-word-masthead ${sentence ? "kl-sentence-masthead" : "kl-phrase-masthead"}">
      <div class="kl-word-title">${escapeHtml(data.selectedText)}</div>
      ${present(data.translation) ? `<div class="${sentence ? "kl-meaning-banner" : "kl-word-meaning"}">${escapeHtml(data.translation)}</div>` : ""}
    </div>
    ${entries.length ? `
      <div class="kl-section-label">${sentence ? "Sentence Breakdown" : "Vocabulary"}</div>
      <div class="kl-breakdown-stack">
        ${entries.map(v => `
          <div class="kl-vocab-card ${sentence ? "kl-phrase-card" : ""}">
            <div class="kl-vocab-left">
              <div class="kl-phrase-label"><span class="kl-chunk-text">${escapeHtml(v.term)}</span>${!sentence ? inlineHanja(v) : ""}${(!present(v.rootForm) || v.rootForm === v.term) && present(v.pos) ? `<span class="kl-word-class">(${escapeHtml(wordClassLabel(v.pos))})</span>` : ""}</div>
            </div>
            <span class="kl-vocab-meaning">${escapeHtml(v.meaning)}</span>
            ${vocabularyMeta(v)}
          </div>
        `).join("")}
      </div>` : ""}
    ${grammar.length ? `
      <div class="kl-section-label">Grammar</div>
      <div class="kl-grammar-stack">
        ${grammar.map(g => `
          <div class="kl-grammar-card">
            <div class="kl-g-top">
              <span class="kl-g-pattern">${escapeHtml(g.pattern)}</span>
              <span class="kl-g-meaning">${escapeHtml(g.meaning)}</span>
            </div>
            ${present(g.rule) ? `<div class="kl-g-detail"><span class="kl-g-label">Formation</span><div class="kl-g-rule">${escapeHtml(g.rule.replace(/^Rule:\s*/i, ""))}</div></div>` : ""}
            ${present(g.explanation) ? `<div class="kl-g-detail"><span class="kl-g-label">In context</span><div class="kl-g-expl">${escapeHtml(g.explanation)}</div></div>` : ""}
          </div>
        `).join("")}
      </div>` : ""}
    ${present(data.nuance) ? `
      <div class="kl-tone-card">
        <span class="kl-tone-label">Usage & Nuance</span>
        <span>${escapeHtml(data.nuance)}</span>
      </div>` : ""}
    ${options.streaming ? `<div class="kl-loading kl-stream-tail"><span class="kl-pulse-dot"></span> WRITING DETAILS...</div>` : ""}
  `;
}

// ---- Layout D: numbered sentence map -------------------------------------------------------
const GRAMMAR_LETTERS = "abcdefghijklmnopqrstuvwxyz";

function posTag(value) {
  const label = wordClassLabel(value);
  const short = { noun: "n.", verb: "v.", adjective: "adj.", adverb: "adv.", pronoun: "pron.", particle: "part.", expression: "expr." }[label] || (label ? label + "." : "");
  return short ? `<span class="kl-d-pos">${escapeHtml(short)}</span> ` : "";
}

// The selection with each phrase underlined and numbered, and each grammar example dotted and lettered.
function sentenceMapHtml(text, chunks, grammar) {
  const phraseRanges = [];
  let cursor = 0;
  chunks.forEach((c, i) => {
    let at = text.indexOf(c.chunk, cursor);
    if (at < 0) at = text.indexOf(c.chunk);
    if (at < 0 || phraseRanges.some(r => at < r.end && at + c.chunk.length > r.start)) return;
    phraseRanges.push({ start: at, end: at + c.chunk.length, mark: i + 1 });
    cursor = at + c.chunk.length;
  });
  const grammarRanges = [];
  grammar.forEach((g, i) => {
    const evidence = String(g.evidence || "").trim();
    if (!evidence) return;
    let from = 0, at;
    while ((at = text.indexOf(evidence, from)) >= 0 && grammarRanges.some(r => at < r.end && at + evidence.length > r.start)) from = at + 1;
    if (at < 0) return;
    grammarRanges.push({ start: at, end: at + evidence.length, mark: GRAMMAR_LETTERS[i] });
  });
  const cuts = [...new Set([0, text.length, ...phraseRanges.flatMap(r => [r.start, r.end]), ...grammarRanges.flatMap(r => [r.start, r.end])])].sort((a, b) => a - b);
  let html = "";
  for (let k = 0; k < cuts.length - 1; k++) {
    const a = cuts[k], b = cuts[k + 1];
    const piece = escapeHtml(text.slice(a, b));
    const opens = phraseRanges.find(r => r.start === a);
    if (opens) html += `<span class="kl-d-seg"><span class="kl-d-n" aria-hidden="true">${opens.mark}</span>`;
    html += grammarRanges.some(r => a >= r.start && b <= r.end) ? `<span class="kl-d-gm">${piece}</span>` : piece;
    const grammarEnd = grammarRanges.find(r => r.end === b);
    if (grammarEnd) html += `<span class="kl-d-l" aria-hidden="true">${grammarEnd.mark}</span>`;
    if (phraseRanges.some(r => r.end === b)) html += `</span>`;
  }
  return html;
}

function renderSentenceMap(container, data, options = {}) {
  const text = String(data.selectedText || "");
  const breakdown = validRows(data.breakdown, ["chunk", "meaning"]);
  const sentence = data.mode === "sentence" || breakdown.length > 0;
  const vocabulary = validRows(data.vocabulary, ["term", "meaning"]).filter(displayableTerm);
  const grammar = validRows(data.grammarPoints, ["pattern", "meaning"]);
  const vocabLine = t => `<span class="kl-d-voc"><span class="kl-d-w">${escapeHtml(t.term)}</span>${inlineHanja(t)}<span class="kl-d-def">${posTag(t.pos)}${escapeHtml(t.meaning)}</span></span>`;
  container.innerHTML = `
    <div class="kl-word-masthead ${sentence ? "kl-sentence-masthead" : "kl-phrase-masthead"}">
      ${sentence
        ? `<div class="kl-word-title kl-d-map">${sentenceMapHtml(text, breakdown, grammar)}</div>`
        : `<div class="kl-word-title">${escapeHtml(text)}</div>`}
      ${present(data.translation) ? `<div class="${sentence ? "kl-meaning-banner" : "kl-word-meaning"}">${escapeHtml(data.translation)}</div>` : ""}
    </div>
    ${sentence && breakdown.length ? `
      <div class="kl-section-label">Phrases</div>
      <div class="kl-d-list">
        ${breakdown.map((v, i) => {
          const terms = validRows(v.terms, ["term", "meaning"]).filter(displayableTerm);
          return `<div class="kl-d-item">
            <span class="kl-d-badge">${i + 1}</span>
            <div class="kl-d-main">
              <div class="kl-d-ko">${escapeHtml(v.chunk)}</div>
              <div class="kl-d-en">${escapeHtml(v.meaning)}</div>
              ${terms.length ? `<div class="kl-d-vocab">${terms.map(vocabLine).join("")}</div>` : ""}
            </div>
          </div>`;
        }).join("")}
      </div>` : ""}
    ${!sentence && vocabulary.length ? `
      <div class="kl-section-label">Vocabulary</div>
      <div class="kl-d-list">
        ${vocabulary.map(t => `<div class="kl-d-item kl-d-word"><div class="kl-d-main">
          <div class="kl-d-term">${escapeHtml(t.term)}${inlineHanja(t)}</div>
          <div class="kl-d-en">${posTag(t.pos)}${escapeHtml(t.meaning)}</div>
        </div></div>`).join("")}
      </div>` : ""}
    ${grammar.length ? `
      <div class="kl-section-label">Grammar</div>
      <div class="kl-d-list">
        ${grammar.map((g, i) => `<div class="kl-d-item">
          <span class="kl-d-badge kl-d-o">${GRAMMAR_LETTERS[i]}</span>
          <div class="kl-d-main">
            <div class="kl-d-gtop"><span class="kl-d-pat">${escapeHtml(g.pattern)}</span><span class="kl-d-gmean">${escapeHtml(g.meaning)}</span></div>
            ${present(g.explanation) ? `<div class="kl-d-ctx">${escapeHtml(g.explanation)}</div>` : ""}
            ${present(g.rule) ? `<div class="kl-d-rule">${escapeHtml(g.rule.replace(/^Rule:\s*/i, ""))}</div>` : ""}
          </div>
        </div>`).join("")}
      </div>` : ""}
    ${present(data.nuance) ? `
      <div class="kl-tone-card">
        <span class="kl-tone-label">Usage & Nuance</span>
        <span>${escapeHtml(data.nuance)}</span>
      </div>` : ""}
    ${options.streaming ? `<div class="kl-loading kl-stream-tail"><span class="kl-pulse-dot"></span> WRITING DETAILS...</div>` : ""}
  `;
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
