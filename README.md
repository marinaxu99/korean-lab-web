# Korean Lab · website

Plain HTML, CSS and JavaScript. No build step, no install, no API key in the files.
Upload every file in this folder to your static host (keep them side by side) and open `index.html`.

## What it does
- **Explain (Korean → English)**: same prompt, model, schema, streaming and checks as the Safari extension 1.3.28.
  Results fill in while Gemini writes. Layout D (numbered sentence map) or layout A (two columns).
- **EN → KO**: natural Korean for English, with meaning, usage note, an example and alternatives. ⌥K / Alt+K opens it.
- **Select Korean anywhere on the page** (an example, a phrase in a result) to get the 풀이 EXPLAIN button.
- **History**: every explanation and lookup is kept in this browser (up to 100). Running the same text at the same
  learning level again opens the saved result without a request; "Run again" asks Gemini fresh.
- **Settings**: Gemini key (save/clear), Check connection, learning level (TOPIK 1–6), result style, text size,
  appearance (match system / light / dark).

## Files
- `index.html`, `styles.css`: the page and its shell styles.
- `panel.css`: result styles copied from the extension (only `*` and `::selection` are scoped).
- `gemini.js`: Gemini calls copied from the extension's background.js (model, prompt, schema, stream reader, validation).
- `render.js`: result rendering copied from the extension's content.js (layouts D and A, EN → KO card).
- `marks.js`: 풀이 and 번역 in EBS 훈민정음 SB, outlined to SVG paths (no 3 MB font download).
- `app.js`: routing, settings, history, the two tools and the selection button.
- `favicon.svg`: the 훈민정음-style 한 as clean strokes with the green and orange dots (light and dark). `icon-48.png`, `icon-128.png`: fallback and home-screen icons.

## Storage
Everything is in this browser's localStorage for this site's address. The API key uses the same storage key as the
previous version (`korean-lab-gemini-api-key`), so a saved key keeps working. The learning level carries over.
History starts fresh (`korean-lab-history-v2`) because the result format changed. Notes, comparisons and old
history from the previous version are left in storage untouched; this version doesn't show them.

## Removed from the previous version
Compare, My Notes and Quick review, multiple translation languages and the detail-level setting.
They are not in the extension, and the extension's prompt already sizes the explanation.
