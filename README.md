# Korean Lab Vanilla

This is a plain HTML/CSS/JS version of Korean Lab.

## Files

```txt
index.html
styles.css
app.js
```

No Node, Next.js, package install, server route, or build step is required.

## Use

Open `index.html` in a browser, or upload these three files to any static host.

Each user adds their own Gemini API key in Settings. The key is saved only in that browser's localStorage.

## API Usage Controls

The app is intentionally compact:

- One Gemini request per analysis
- No automatic retries
- Duplicate analysis cache in localStorage
- 800-character input limit
- Compact JSON field names
- Output token caps:
  - concise: 850
  - detailed: 1150
  - very detailed: 1600

## Static Hosting

You can upload this folder to Cloudflare Pages, GitHub Pages, Netlify, Vercel static hosting, or any ordinary web host.
