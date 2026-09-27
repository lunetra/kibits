# CLAUDE.md — working rules for the Kibitz repo

## Project
Chrome MV3 extension "Kibitz" for taketaketake.com: translate per‑move Game Review commentary (Gemini API) in place, and re-skin board/pieces. Full spec in `README.md` → `docs/`.

## Stack (do not change without asking)
- **WXT** (https://wxt.dev) + **React 18/19** + **TypeScript (strict)** + **Vite** (via WXT).
- Styling: plain CSS modules or a tiny hand-written CSS token file. No heavy UI kit. Tailwind is acceptable only for the popup if you strongly prefer it — never inject Tailwind into the host page.
- Package manager: `npm`.
- Tests: Vitest for pure logic (tokenizer, cache, prompt builder, bidi wrapper). Playwright for an optional smoke test.
- No backend. All Gemini calls go from the **background service worker** only. The MAIN-world script never sees the API key.

## Hard rules
1. **Never** put the API key in a content script, in page-visible DOM, in logs, or in `chrome.storage.sync`. Only `chrome.storage.local`, read only by the service worker.
2. **Never** make the site look broken. Every failure path (timeout, 429, invalid key, parse error) must fall back to revealing the original English within ≤ 8 s.
3. **The master switch** turns every wrapper into pass-through immediately and removes all DOM changes live. Content the site already holds in memory (translated plies, loaded atlases) needs a reload, so offer it.
4. **MAIN-world code must fail open**: every wrapper (`fetch`, `GPUQueue.writeBuffer`) catches all errors and falls back to the original call/response. Never mutate the site's buffers/arrays in place; copy them.
5. Content-script CSS must be **scoped** (prefix `kbz-` and/or `[data-kbz]` attributes). Never restyle site elements by broad selectors.
6. Selectors and URL regexes for the host site live in **one file** (`src/site/selectors.ts`) with comments pointing to `docs/SITE-MAP.md`. Prefer stable hooks (`data-*`, `aria-*`, roles, text structure) over hashed class names (e.g. `css-1x2y3z`, `sc-abc123`, Tailwind utility chains).
7. Do not hard-code secrets, do not add analytics/telemetry.
8. Keep bundle lean; fonts are bundled locally (`@fontsource-variable/*`), not loaded from Google Fonts at runtime.
9. After each milestone: `npm run build`, run tests, and give the user reload/test instructions.

## Conventions
- Prefix all DOM attributes/classes the extension adds with `kbz` (`data-kbz-state`, `.kbz-skeleton`).
- Messages between contexts are typed (`src/shared/messages.ts`), discriminated unions with a `type` field.
- Settings schema is versioned (`schemaVersion`) with a migration function.
- Code comments and UI copy in English.

## Git workflow
- **Commit after every change.** When a change is done (typecheck + tests + build pass), commit everything
  right away with a clear message, then push to `origin main`. Don't let work pile up uncommitted.
- Commit as the user's own git identity, with no AI/Claude attribution lines.
- Before committing, make sure no personal data slips in (API keys, real usernames, game IDs in fixtures/docs).
