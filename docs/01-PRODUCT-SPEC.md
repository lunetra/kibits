# 01 — Product spec

## Vision
Reading Take Take Take's Game Review in your own language should feel native: no flash of English, no layout jump, no "machine-translated" tone. Themes should make the board look like the user's favourite lichess setup.

## Users
Primary user: a Persian-speaking chess player (also comfortable in English) who reviews their own games on taketaketake.com in Chrome on desktop.

## Features

### F1 — Commentary translation (core)
- Translate (a) **per-move commentary** and (b) the **Game Summary** of the Game Review.
- Per-move text arrives from the site's API after ~2–3 s (site shows a skeleton). Kibitz translates the API
  response **before React renders it**, so the text appears directly in the target language, in the same
  place, with the site's own layout (SITE-MAP §1, 04). The summary is translated at DOM level with pre-hide.
- Target languages: `fa` (Persian), `de` (German), `en` (English = passthrough, no API call).
  - **Note on "du":** the user wrote `fa, en, du`. We assume **German (Deutsch, ISO `de`)**. If they meant **Dutch (`nl`)**, the language registry must make that a one-line change. Ask the user once during planning to confirm.
- Style: professional chess-coach register, same length and rhythm as the original, correct chess terms (glossary). Move notation stays unchanged and LTR.
- "White"/"Black" player references read naturally in the target language (setting `playerWords`, default on).
- Revisiting plies is instant (the site caches in memory; Kibitz's own cache makes reopening a game instant too).
- Optional "hover to see original" (toggle, default ON).
- Changing language applies to new plies immediately; already-loaded plies need a reload (toast offers it). See 05.

### F2 — Board colors
The board is drawn on a **WebGPU canvas** (SITE-MAP §4), so image textures can't be applied with CSS.
- **Default**: the site's own theme (untouched; the site's own theme picker keeps working).
- **Custom color themes**: two colors (light/dark squares), optional subtle gradient, injected via the GPU uniform override.
- **From lichess boards**: the build script derives a color theme (dominant light/dark colors + gradient) from each image the user has in `assets/boards/`. The panel shows the original image as the thumbnail and labels it "colors from <name>". This is an approximation, not the texture itself. Say so clearly in the UI.
- **Image textures (wood/marble)**: *experimental spike only* (M6). It needs WGSL shader patching. Don't ship unless the spike proves robust. Report findings to the user.
- Site highlights, arrows, badges and coordinates are untouched (they are separate uniforms/draws).

### F3 — Piece set
- **Default** or a user set (12 SVGs `wK…bP`). The build script renders them into the site's atlas format
  (4×4 grid, 1x/2x/4x = 200/400/800 px, SITE-MAP §4b). The MAIN-world fetch wrapper serves our atlas instead
  of the site's, for **all three** site families, so it works whatever piece set the site is set to.
- Applies to everything drawn on the board canvas, including dragging and animation. DOM piece icons (captured pieces, move chips) are a stretch goal.
- Changing the set requires a page reload (atlases load once per page). The panel shows "Reload tab to apply".

### F4 — Panel (popup)
- English, black, minimal, professional. Details in `07-PANEL-UI.md`.
- Master switch: everything off. Live DOM cleanup, plus a reload prompt for GPU/network-level changes.
- Separate toggles: Translation, Board theme, Piece set.
- Language selector (FA / EN / DE), model selector, API key with "Test" button, cache controls, small status line (last translation latency, errors).

### F5 — Robustness
- Works across SPA navigation (moving from home → game → another game without reloads).
- Survives the site re-rendering the commentary node (React reconciliation) — never fight React in a loop.
- Graceful failure: always fall back to English within the timeout.

## Non-goals (v1)
- Translating anything other than coach commentary (menus, buttons, chat).
- Mobile apps. Firefox/Safari (keep code portable but don't test).
- Any server or account system.
- Publishing to Chrome Web Store (personal use; note asset licensing in `06`).

## Name & branding
- Name: **Kibitz**. Tagline in panel: "Commentary, in your language."
- Icon: simple monochrome glyph — a speech-bubble whose tail is a knight's L‑shape, or a knight silhouette with a small "文/A" mark. Provide 16/32/48/128 PNG generated from one SVG in `public/icon/`.
