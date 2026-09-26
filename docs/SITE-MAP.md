# SITE-MAP — verified findings on taketaketake.com (live inspection, 27 Sep 2026)

These facts were verified in the user's logged-in Chrome session on
`/games/exampleGameId000000000000000000`. Asset file names contain **content hashes that change on every
deploy** — always match with regexes, never with exact names. Re-verify quickly (see "Re-check" at the end)
before relying on anything here.

---

## 1. Per-move commentary — comes from a REST endpoint (the key finding)

**Request** (issued by the page with `window.fetch`, looked up at call time → patchable from MAIN world):
```
POST https://commentary.taketaketake.com/v1/position-commentary
Content-Type: application/json
{"gameId":"exampleGameId000000000000000000","plyIndex":2}
```
- One request per ply, **only when the user navigates to that ply** (no prefetch by the site).
- Latency measured: **1.9 – 2.7 s** (server-side generation). The UI shows a skeleton the whole time.
- Revisiting a ply does **not** refetch (the app caches it in memory for the page session).
- Auth: cookies/headers handled by the site; we never call this endpoint ourselves.

**Response** (`200`, `application/json`):
```jsonc
{
  "status": "ready",
  "classificationStatus": "settled",
  "classificationGeneration": 2,
  "commentary": {
    "_id": "vh77…", "_creationTime": 1790456049159.77,      // Convex document
    "gameId": "js73…", "plyIndex": 2, "positionId": "js73…:2",
    "model": "google/gemini-3-flash-preview",
    "promptVersion": "position-commentary-v2.27.0",
    "reasoningEffort": "default",
    "traceId": "commentaryApi:…",
    "text": "White immediately challenges the center with d4, leading into …",   // plain-text version
    "content": [                                                               // rich-text tree (what the UI renders)
      { "type": "paragraph", "children": [
          { "type": "player", "player": "white" },
          { "text": " immediately challenges the center with " },
          { "type": "san", "san": "d4", "color": "white" },
          { "text": ", leading into the sharp lines of the Center Game. By attacking the e5 pawn, " },
          { "type": "player", "player": "white" },
          { "text": " forces " },
          { "type": "player", "player": "black" },
          { "text": " to decide how to resolve the tension in the heart of the board." }
      ]}
    ]
  }
}
```
Inline node types seen: `paragraph`, `{text}`, `player` (`white|black`), `san` (`san`, `color`). Treat any
**unknown** node type as an opaque placeholder token (never drop it). `status` was always `"ready"` in
our sample. Handle other values (`pending`, `error`, …) by passing the response through untouched.

**Rendering of a `player` node:** a plain `<span class="min-w-0">` whose text is either the color word
("White"/"Black") or the player's username. The label rule looks perspective-dependent and isn't
confirmed. **`san` node:** `<span><span><svg piece-icon/></span><span class="min-w-0">d4</span></span>`.

## 2. Per-move commentary — DOM

```
aside … > div.game-review-scrollbar            ← scroll container of the Commentary tab (stable-ish class)
  └ div                                        (per-move view)
     ├ div.overflow-visible.mt-[10px] …        header chips: opening name button, "Engine: <san>" button
     └ div.mt-[18px]                           ← COMMENTARY SLOT
          loading:  div.flex.flex-col.gap-3.pt-1 > span.animate-pulse[aria-hidden] ×3   (skeleton bars)
          ready:    (slot gets class .text-foreground)
                    div.min-w-0 > div > span.min-w-0 > [span.min-w-0 text | span(san) | …]
```
- Font: `"GT Planar"` 16 px / line-height 25.6 px (1.6) for per-move text.
- No Shadow DOM, no iframes.
- The Commentary / Moves tabs are two buttons at the top of the panel.

## 3. Game Summary (first view, before ply 0)

```
div.game-review-scrollbar > div.mx-auto.w-[361px].rounded-lg.border…
   ├ p  "Game Summary"
   └ div.min-w-0.mt-2 > div > span.min-w-0 > [span text | button(san link, e.g. "Rhe1") | span(player name) …]
```
- Rendered from data delivered over the **Convex WebSocket** (`wss://convex.taketaketake.com/api/<ver>/sync`,
  token from `GET /api/auth/convex/token`). The summary is not in any REST response we captured; this is
  highly likely but not 100 % confirmed.
- ⇒ Translate the summary at the **DOM level** (see 04/05). Don't intercept WebSocket frames in v1.

## 4. Board rendering — WebGPU canvas (important for theming)

```
div.relative.aspect-square[aria-label="Game board"][aria-keyshortcuts="F X Space ArrowLeft ArrowRight"]
  └ div.size-full > div.relative.aspect-square.w-full.rounded-lg > canvas   (1265×1265 backing, WebGPU)
```
- `canvas.getContext('webgpu')` → `GPUCanvasContext`; format `bgra8unorm`, `alphaMode: "opaque"`.
- Renderer is TypeGPU (`typegpu-*.js`, `Chessboard-*.js`, `gpuRoot-*.js`). Squares, pieces, highlights,
  arrows, coordinates and classification badges are **all drawn on this single canvas** → CSS can't reach them.

### 4a. Board colors = one uniform buffer (verified: overriding it recolors the board)
- `GPUQueue.writeBuffer` on buffer with `label === "globalUniformBuffer"` (size 208 B), offset 0.
- Float32 layout (first 24 floats, as observed for the "Original" theme):
  ```
  [0..3]   darkGradient.fromColor  rgba  (0.518,0.447,0.675,1)  ≈ #8472AC
  [4..7]   darkGradient.toColor    rgba
  [8..15]  darkGradient center/axisU/axisV (vec2s + padding)
  [16..19] lightGradient.fromColor rgba  (0.690,0.647,0.796,1)  ≈ #B0A5CB
  [20..23] lightGradient.toColor   rgba
  [24..31] lightGradient center/axes
  [32..]   other theme colors (highlights, etc.): (0.945,0.722,0.678,1) (0.953,0.325,0.259,1) (0.624,0.565,1,0.8) …
  ```
- Values are **sRGB 0–1 floats** (not linear): `#B3A7FF`-family hexes from the theme table map directly.
- The site rewrites this buffer on some state changes (theme change, reset/start position), so the override
  must live **inside a persistent `writeBuffer` wrapper**, not in a one-off write.
- The shader **ignores alpha**. Setting alpha 0 + `alphaMode: "premultiplied"` did *not* make squares
  transparent. ⇒ Image boards (lichess JPG/PNG textures) can't be done with uniforms alone (see 06).
- Site built-in themes (localStorage `board_theme`): `original`, `royal`, `candy`, `coffeehouse`, `noir`.

### 4b. Pieces = PNG sprite atlases fetched with `window.fetch` (replaceable)
- In `Chessboard-*.js`: `async function X(url){ const b = await (await fetch(url)).blob(); return createImageBitmap(b,{premultiplyAlpha:"none"}) }`
  → then `device.queue.copyExternalImageToTexture` (with mip levels).
- **All** families are loaded once at board-module init (a module-level promise), at 3 resolutions:
  ```
  /assets/regular4x-<hash>.png   800×800   ← "Clean" set in the UI (localStorage board_piece_family = "clean")
  /assets/regular2x-<hash>.png   400×400
  /assets/regular1x-<hash>.png   200×200
  /assets/newspaper{4x,2x,1x}-<hash>.png   ← "Newspaper"
  /assets/delta{4x,2x,1x}-<hash>.png       ← "Delta"
  ```
  Regex: `/\/assets\/(regular|newspaper|delta)([124])x-[\w-]+\.png(\?.*)?$/`
- **Atlas layout: 4 × 4 grid**, transparent background, cell = width/4 (200 px at 4x):
  ```
  row 0:  bK  bQ  bR  bN
  row 1:  bB  bP  —   —
  row 2:  wK  wQ  wR  wN
  row 3:  wB  wP  —   —
  ```
  Measured opaque bbox inside a 200-px cell (4x): pieces are **bottom-anchored** at y≈178–186 and span
  ≈ 115–160 px wide, top at y≈8–31. That's about 80–88 % of the cell height with ~7–11 % bottom margin.
  Our generated atlases should mimic this (configurable scale & baseline per set).
- Because the atlases are fetched once at init, the fetch wrapper **must be installed at `document_start`
  in the MAIN world**. Changing the piece set therefore needs a **page reload** (or at least a board remount
  that re-imports the module, which does NOT happen on SPA navigation; verified).
- Other atlases on the same path (don't touch): `icons-{4,2,1}-*.png` (classification icons), `labels-*.png`
  (coordinates), `notation-*.js`.
- Piece React SVG components (`ChessPieces-*.js`) are used for DOM icons (captured pieces, move chips) and
  aren't part of the canvas. Theming those is a stretch goal.

## 4c. Current move (verified live 27 Sep 2026, second pass)
- The move list stays in the DOM (hidden) while the Commentary tab is open:
  `[data-move-list-scroll-container] button` — one button per half-move, in order.
- **Button index === API `plyIndex`** (e4 = 0). Verified: stepping → requests for plyIndex 2, 3, 4 while the
  highlighted buttons were 2, 3, 4.
- The current move's button has class `border-foreground`; the others `border-transparent`. No button
  highlighted = Game Summary view.
- The site passes an AbortSignal to the commentary fetch but did **not** abort when the user stepped on
  quickly; the requests simply resolve later. Kibitz holds such a response until that move is on screen.
- `Chessboard-*.js` now imports the atlases through tiny modules (`regular4x-<hash>.js` →
  `/assets/regular4x-<hash>.png`). Re-verify that the PNG is still loaded with `fetch` before relying on
  piece substitution (M5).
- Default "Clean" piece colours (from regular4x): white body `#FCFCFC`, outline `#504464`; black body ≈ `#3E3850`,
  outline `#201C28`, soft white halo. Board presets are tuned against these.

## 5. Other endpoints seen
- `GET https://taketaketake.com/api/auth/convex/token`
- `wss://convex.taketaketake.com/api/1.43.0/sync` (Convex realtime; version in path)
- `images.takex3.com` (avatars, medal SVGs)
- `/t3cap/*` (PostHog analytics proxy; ignore)

## 6. localStorage keys (site settings, informational)
`board_theme`, `board_piece_family`, `board_adjust_colors_to_theme`, `takex3.web.boardSizePx`, `board_zen_mode_enabled`, `board_streamer_mode_enabled`.
**Don't write to these.** Kibitz overrides happen at the GPU/network layer, so the site's own settings keep working when Kibitz is off.

## Re-check (quick, before coding M3/M4)
Paste in DevTools on a review page:
```js
performance.getEntriesByType('resource').filter(r=>/position-commentary|regular\dx|newspaper\dx|delta\dx/.test(r.name)).map(r=>r.name)
```
(The resource buffer holds only 250 entries, so run it soon after load.) Also run `tools/recon.js` if the DOM looks different.
