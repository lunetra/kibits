# 02 — Architecture

## Stack
- **WXT** (MV3 framework on Vite): `entrypoints/` convention, HMR for the popup, auto-generated manifest.
- React + TypeScript (strict) for the **popup only**. Content scripts are **vanilla TS** (no React in the host page).
- `@fontsource-variable/vazirmatn` (Persian), `@fontsource-variable/inter` (UI + optional German).
- Build-time: `sharp` (rasterize SVG pieces → PNG atlases, thumbnails), `svgo`.

## Folder layout (target)
```
kibitz/
├─ wxt.config.ts
├─ assets/                       # USER-PROVIDED raw assets (see 06)
│  ├─ boards/                    # lichess board images → used to derive color themes
│  └─ pieces/<set-name>/         # wK.svg … bP.svg
├─ scripts/
│  └─ build-themes.ts            # assets/ → public/themes/** (atlases 1x/2x/4x, thumbs) + src/themes/manifest.generated.ts
├─ public/
│  ├─ icon/                      # 16/32/48/128
│  ├─ fonts/                     # copied woff2
│  └─ themes/                    # generated, web_accessible_resources
├─ src/
│  ├─ shared/
│  │  ├─ settings.ts             # schema, defaults, migrations, typed get/set, onChange
│  │  ├─ messages.ts             # typed unions: popup↔SW, content↔SW, MAIN↔content (postMessage)
│  │  ├─ languages.ts            # registry: code, label, dir, font, glossary
│  │  ├─ models.ts               # Gemini model registry
│  │  └─ hash.ts                 # cyrb53 or similar
│  ├─ site/
│  │  └─ selectors.ts            # ALL DOM selectors + URL regexes (from SITE-MAP.md)
│  ├─ main/                      # runs in the page's MAIN world
│  │  ├─ bridge.ts               # postMessage channel, config promise, request/response correlation
│  │  ├─ fetch-hook.ts           # commentary interception + piece-atlas substitution
│  │  ├─ gpu-hook.ts             # globalUniformBuffer color override
│  │  └─ richtext.ts             # content tree ⇄ "text with ⟦n⟧ tokens"
│  ├─ content/                   # isolated world
│  │  ├─ relay.ts                # MAIN ⇄ service worker relay, sends config to MAIN
│  │  ├─ summary.ts              # Game Summary DOM translation (pre-hide → translate → reveal)
│  │  ├─ decorate.ts             # dir/lang/font on commentary slot, hover-original, error badge
│  │  ├─ bidi.ts
│  │  └─ lifecycle.ts            # enable/disable, SPA routes, cleanup
│  ├─ background/
│  │  ├─ gemini.ts               # REST client
│  │  ├─ translator.ts           # queue, dedupe, retry, validation, fallback
│  │  ├─ prompt.ts               # system instruction + few-shot + glossary
│  │  └─ cache.ts                # memory LRU + IndexedDB
│  └─ popup/                     # React app (see 07)
├─ entrypoints/
│  ├─ background.ts
│  ├─ main-world.content.ts      # world: MAIN, run_at: document_start
│  ├─ content.ts                 # isolated, run_at: document_start
│  └─ popup/index.html + main.tsx
└─ tests/
```

## Manifest essentials
```jsonc
{
  "manifest_version": 3,
  "name": "Kibitz",
  "minimum_chrome_version": "111",            // content_scripts "world": "MAIN"
  "permissions": ["storage"],
  "host_permissions": [
    "https://taketaketake.com/*",
    "https://generativelanguage.googleapis.com/*"
  ],
  "content_scripts": [
    { "matches": ["https://taketaketake.com/*"], "js": ["main-world.js"], "run_at": "document_start", "world": "MAIN" },
    { "matches": ["https://taketaketake.com/*"], "js": ["content.js"],    "run_at": "document_start" }
  ],
  "web_accessible_resources": [{ "resources": ["themes/*", "fonts/*"], "matches": ["https://taketaketake.com/*"] }]
}
```
The page's own fetch to `commentary.taketaketake.com` is intercepted inside the page, so no extra host permission is needed for it.

## Runtime components
```
 ┌──────────────────── taketaketake.com tab ─────────────────────┐        ┌──── Service worker ─────┐
 │ MAIN world (main-world.js)          ISOLATED (content.js)     │        │ translator.ts           │
 │  fetch-hook ──(position-commentary)─▶ relay ──runtime msg────────────▶ │  cache (LRU + IDB)      │
 │    holds Response, awaits result  ◀── relay ◀──────────────────────────│  queue / dedupe         │──▶ Gemini
 │  fetch-hook (piece atlases) ← atlas URLs from config          │        │  prompt / validate      │
 │  gpu-hook (globalUniformBuffer) ← board colors from config    │        └─────────────────────────┘
 │                                     summary.ts / decorate.ts (DOM)    ▲
 │                                     lifecycle (storage.onChanged)     │
 └───────────────────────────────────────────────────────────────┘      popup (React)
```

### Boot race (important)
- MAIN script installs its wrappers **synchronously** at document_start, before any site script.
- Config arrives asynchronously from the isolated script (`chrome.storage` read ≈ few ms). The MAIN script keeps a `configReady` promise.
  - `fetch` wrappers are async anyway → `await Promise.race([configReady, timeout(400ms)])` before deciding. On timeout, pass through.
  - `writeBuffer` is sync → until config arrives, pass through but **remember the last `globalUniformBuffer` write (buffer, queue, data copy)**; when config arrives, re-issue a patched write. The next frame the site renders picks it up.
- MAIN↔isolated channel: isolated script generates a random `channel` id and sends it first via `window.postMessage({kbz:'hello', channel})`. MAIN keeps only the first hello. All later messages must carry the channel id and pass `e.source === window`. The API key never crosses into MAIN world.

### Message protocol (`src/shared/messages.ts`)
```ts
// MAIN → isolated → SW
type TranslateReq = { type: 'translate'; id: string; lang: LangCode; kind: 'ply' | 'summary';
  source: string;            // text with ⟦n⟧ tokens
  tokens: string[];          // human-readable token descriptions for the prompt, e.g. ["move d4 (White)"]
  context?: { gameId?: string; plyIndex?: number; prevSource?: string } };
// SW → isolated → MAIN
type TranslateRes = { type: 'translated'; id: string; text: string; cached: boolean; ms: number; model: ModelId }
                  | { type: 'translateError'; id: string; code: 'timeout'|'auth'|'quota'|'network'|'blocked'|'invalid'; message: string };
// isolated → MAIN
type MainConfig = { type: 'config'; enabled: boolean; translate: { on: boolean; lang: LangCode; playerWords: boolean };
  board: null | { dark: [RGBA, RGBA]; light: [RGBA, RGBA] };           // gradient from/to per color
  pieces: null | { '1': string; '2': string; '4': string } };           // chrome-extension:// atlas URLs
```

### Settings schema (`chrome.storage.sync`, except the key)
```ts
interface Settings {
  schemaVersion: 1;
  enabled: boolean;                                    // master switch
  translation: { enabled: boolean; lang: 'fa'|'de'|'en'; model: ModelId;
                 showOriginalOnHover: boolean; playerWords: boolean /* see 04 */; translateSummary: boolean };
  board:  { themeId: 'default' | string; custom?: { light: string; dark: string; gradient: boolean } };
  pieces: { setId: 'default' | string };
}
// chrome.storage.local: { apiKey: string }
```

## Performance budget
- Cache hit (e.g. reopening a reviewed game): added latency < 20 ms after the site's response arrives.
- Cache miss: added latency on top of the site's ~2.3 s, p50 ≤ 1.2 s with flash-lite (`thinkingLevel: minimal`). Hard cap: 7 s, then return the original response.
- Speed: the text only exists once the site's response arrives, so the real wins are the cache and a fast model. Don't prefetch other plies through the site's endpoint (that would trigger generation on their servers).
