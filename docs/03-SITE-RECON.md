# 03 — Site recon: status & chosen strategies

Recon was **done live** on 27 Sep 2026. All facts are in **`docs/SITE-MAP.md`** (read it fully).
Before M3/M4, run the quick "Re-check" at the end of SITE-MAP to confirm nothing changed since. Use
`tools/recon.js` (DevTools console) or Playwright only if the re-check fails.

## Summary of what we learned
| Area | Finding | Consequence |
|------|---------|-------------|
| Per-move commentary | `POST commentary.taketaketake.com/v1/position-commentary` → JSON rich-text tree (`paragraph` / text / `player` / `san`). ~2–2.7 s latency, skeleton shown meanwhile. | **Translate at the network layer**: wrap `window.fetch` in the MAIN world, hold the response, translate, return a modified `Response`. The site renders Persian directly: English is never in the DOM. |
| Game Summary | DOM `div.mx-auto.w-[361px]…` inside `.game-review-scrollbar`; data via Convex WebSocket. | DOM-level translation with pre-hide (only this block). |
| Board | Single **WebGPU canvas** (TypeGPU). | No CSS theming possible. |
| Board colors | `globalUniformBuffer` (208 B) holds dark/light square gradient colors as sRGB floats. | **Custom board colors/gradients: yes** (wrap `GPUQueue.prototype.writeBuffer`). **Image textures: no**, the shader ignores alpha (spike only). |
| Pieces | 4×4 PNG atlases (`regular|newspaper|delta` × `1x|2x|4x`), fetched once via `window.fetch` at init. | **Custom piece sets: yes.** Serve our generated atlas from the fetch wrapper. Needs a `document_start` MAIN-world script; changing the set requires a reload. |

## Strategy decisions (binding)
1. **MAIN-world script is mandatory** (`entrypoints/main-world.content.ts`, `world: "MAIN"`, `run_at: "document_start"`, `matches: ["https://taketaketake.com/*"]`). It wraps `window.fetch` and `GPUQueue.prototype.writeBuffer`. It has **no chrome.* APIs**: it talks to the isolated content script via `window.postMessage` with a random per-page channel id + `event.source === window` checks. The isolated script relays to the service worker.
2. MAIN world must **fail open**: any exception, timeout, or disabled state → return the original `Response` / call the original `writeBuffer` unchanged.
3. The isolated content script sends the current settings (enabled flags, lang, board colors, atlas blob URLs or bytes) to MAIN world at startup. It does this synchronously enough to beat the site's init. Settings are mirrored to `sessionStorage`/a `<meta>`-free mechanism; see 02 "Boot race".
4. DOM work is limited to: `dir`/`lang`/font on the commentary slot and summary box, the Game Summary translation, the hover-original tooltip, and the error indicator.
