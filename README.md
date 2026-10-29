# Korean Lab - Study workspace
Plain HTML, CSS, JavaScript and an SVG icon. No install or build step.

Open index.html locally, or upload all files together to your existing static host.
Keep study.js and study.css beside app.js and styles.css, plus both SVG assets. No API keys are included.
Your original GitHub checkout and deployed website have not been modified.

## New tools
- Settings: TOPIK 1-6 learning target, response detail and selected translation
  languages now shape the request. Existing beginner/intermediate/advanced
  preferences migrate to levels 1/3/5. TOPIK difficulty is approximate.
- My Notes: star a vocabulary/phrase or grammar item to save its meaning,
  formation and original sentence. Search and filter saved items.
- Quick review: starts from the current My Notes filter, with remembered items
  last. Reveal meaning, then mark Remembered or Review again. Each item appears
  once per session; Review again prioritizes it next session. No API calls.
- Compare: explicitly submit two expressions for meaning, formation, one
  example each and the key distinction. Uses the current preferences.
- Website font family and light heading weights match the Safari extension.

## API and storage
Each user supplies a Gemini key in Settings. It is stored in browser localStorage
and sent directly to Google via the x-goog-api-key request header.
The configured model is gemini-3.5-flash-lite, matching the Safari extension.\nOnly one request is sent per uncached Analyze or Compare action. No automatic
fallback or retry. Requests time out after 20 seconds.
Concise analysis caps output at 1000 tokens for words or 2400 for sentences.
Longer detail caps output at 4000. Comparisons cap output at 1800 or 3000.
Model availability and quota are controlled by Google.

Analysis and comparison caches include learning level, detail and languages.
Old history remains readable, but legacy entries without settings metadata are
not silently reused for new analyses. History holds up to 100 entries and
comparison cache up to 30. Notes remain saved until removed.
Storage is local to the current browser and website origin. Changing domains,
clearing site data or switching browsers does not transfer saved items.
Backup/export is not included in this release.

## Verification
JavaScript syntax and mocked functional tests passed for settings payloads,
language validation, review progress, cache separation, comparison reuse,
input validation and single-request failure behavior. No live Gemini requests
or paid calls were made. Local-file browser automation was unavailable, so
desktop/mobile visual verification and live Safari testing remain outstanding.
