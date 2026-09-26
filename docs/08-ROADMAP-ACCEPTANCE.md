# 08 — Roadmap, acceptance criteria, tests

## Milestones
**M0: Re-check recon (short)**
- Run the "Re-check" in `docs/SITE-MAP.md` (or ask the user to). If anything differs, update SITE-MAP.md + `selectors.ts` first.

**M1: Scaffold**
- WXT + React + TS, manifest with both content scripts (MAIN + isolated, document_start), settings with migrations, typed messages, MAIN↔isolated bridge with channel handshake, popup shell with master switch, icons.
- Exit: loads unpacked without errors. The MAIN script logs "kbz ready" and passes everything through.

**M2: Translation core (service worker)**
- Gemini client, models registry, prompt builder + glossary filter, cache (LRU + IndexedDB), queue/dedupe, validation, key test.
- Vitest: prompt builder, glossary filter, notation regex, validation, token round-trip, richtext serialize/rebuild (use the real JSON samples in SITE-MAP §1 as fixtures), cache eviction.
- Exit: popup "Test" translates the real sample to FA and DE. **Ask the user to judge the Persian** and edit `glossary/fa.json`.

**M3: Per-move commentary via fetch hook**
- `fetch-hook.ts` + `richtext.ts` + relay, LRI/PDI isolation, decorate (dir/lang/font), hover-original, toasts, error badge.
- Exit: A1–A6, A8.

**M4: Game Summary (DOM)**
- Pre-hide CSS, serialize/translate/render clone, click forwarding for san links.
- Exit: A7.

**M5: Pieces + board colors**
- `build-themes.ts` (atlases 1x/2x/4x with king calibration, board color extraction, thumbnails), `gpu-hook.ts`, atlas substitution, panel pickers, reload prompts.
- Exit: B1–B6.

**M6: Polish + optional spike**
- Visual polish, accessibility, README install guide, CHANGELOG.
- Optional: image-texture spike (06 §C), time-boxed. Report results; don't merge unless robust.

## Acceptance — translation
- **A1** FA selected: stepping through a review never shows English per-move commentary. The site skeleton stays until Persian appears.
- **A2** Added latency on a cache miss is ≤ 1.5 s p50 (log `ms` in the SW). On a reopened game (cache hit) it is ≈ 0.
- **A3** `san` chips (icon + move) and any notation in text render correctly LTR inside RTL paragraphs.
- **A4** Persian uses Vazirmatn, right-aligned, correct ZWNJ, no Arabic ي/ك. "White/Black" appear as سفید/سیاه (playerWords on).
- **A5** Invalid key / offline / 429 / model 404 → the original English appears (no longer than the 7.5 s cap). Subtle indicator shown, page fully functional, no console spam.
- **A6** Master OFF → the wrappers pass through immediately. After the reload prompt, the page is identical to running without the extension.
- **A7** Game Summary is never painted in English when FA is on. Its move links still work (click → site navigates).
- **A8** SPA navigation between games works. No leaks after stepping 200 plies (observer scoped, maps capped at ~500 entries).

## Acceptance — themes
- **B1** Default board/pieces → wrappers pass through (verify byte-identical atlas responses).
- **B2** Custom piece set shows on board, during drag and move animation, in all three site piece-family settings, with size/baseline matching the default look.
- **B3** Board color theme applies (incl. after moving to start position, flipping, resizing, theme reset by the site).
- **B4** Highlights, arrows, badges, coordinates remain visible and unchanged.
- **B5** If the uniform layout guard fails, board theming disables itself and the panel says so; the site stays intact.
- **B6** Build script reports clear errors for missing/misnamed SVGs.

## Manual test script (give this to the user after M3/M4)
1. `npm run build` → chrome://extensions → Developer mode → Load unpacked → `dist/chrome-mv3`.
2. Open popup → paste API key → Test → ✓.
3. Open a finished game on taketaketake.com → Game Review → read the summary (FA) → step through 10 plies → go back 5.
4. Switch to DE, then EN, then master OFF/ON.
5. Pick board colors and a piece set → Reload → flip board (F key), drag a piece if possible, change the site's own piece set (Clean/Newspaper/Delta): yours must stay.
