# 05 — In-place rendering, RTL & typography

## Per-move commentary: already translated when React renders it
Because translation happens inside the site's fetch (04), the site keeps showing **its own skeleton** until our
modified response resolves, then React renders the translated text directly. **No hiding, no swapping, no flash.**
DOM work for per-move commentary is only *decoration* (`content/decorate.ts`):
- A scoped MutationObserver on `.game-review-scrollbar` finds the commentary slot (`div.mt-[18px]`, see
  SITE-MAP §2). When its text contains Persian script, set `dir="rtl"` `lang="fa"` and `data-kbz="tr"` on the
  slot. Everything else is scoped CSS on `[data-kbz="tr"]`:
  ```css
  [data-kbz="tr"][lang="fa"] { font-family: 'Vazirmatn Variable', Tahoma, sans-serif; line-height: 1.8; text-align: start; }
  [data-kbz="tr"] .kbz-nt, [data-kbz="tr"] svg + span { direction: ltr; unicode-bidi: isolate; }
  ```
- The site's `san` node renders as `<span><span><svg/></span><span>d4</span></span>`. Give that wrapper
  `unicode-bidi: isolate; direction: ltr` (via a structural selector in `selectors.ts`) so icon + move stay in order inside RTL.
- Plain-text notation that the model wrote (rare: most moves are `san` nodes) can't be wrapped in React-owned
  text. Instead, have `richtext.ts` insert **U+2066 (LRI) … U+2069 (PDI)** around notation matches in the
  translated text before returning the response. This isolates it without touching the DOM.

## Game Summary (DOM-level)
1. The content script injects at `document_start` (only while translation is on and lang ≠ en):
   `.game-review-scrollbar > div.mx-auto.rounded-lg > div.min-w-0:not([data-kbz-done]) { visibility: hidden }`
   (exact selector in `selectors.ts`). The English summary is never painted.
2. Serialize → translate → render into `<div class="kbz-tr" dir="rtl" lang="fa">` inserted as the next sibling.
   Mark the original `data-kbz-done` + `hidden` via our CSS. Re-insert san links as **clones of the original
   buttons** (clicks on a clone are forwarded with `original.click()`).
3. Timeout/error: mark `data-kbz-done` without hiding, so English shows, plus a tiny `!` badge ("Translation unavailable, showing original").
4. While waiting, show a 3-bar shimmer matching the site's skeleton (`span.animate-pulse` look). Respect `prefers-reduced-motion`.

## Language switch / master switch
- The site caches already-loaded commentary in memory, so changing language or turning Kibitz off can't
  retroactively change plies React already holds. On change, the content script shows a small toast in the
  page: "Kibitz settings changed. [Reload to apply]". Future plies use the new setting immediately.
- Master OFF: MAIN wrappers switch to pass-through at once. Our styles/attributes/nodes are removed. The
  summary original is un-hidden. Toast offers reload to get the English/default-board back for already-loaded content.

## Hover original
When `showOriginalOnHover` is on: hovering the translated block (per-move slot: MAIN keeps a map `normalized translated plain text → original English`; decorate reads the slot's `textContent` and asks for it through the bridge. Summary: our stored source) for 600 ms shows a small dark tooltip (or swaps text) with the English original, LTR, Inter. Keyboard accessible (`tabindex=0`, focus shows it). Never blocks clicks on the site.

## Fonts
| Lang | Font | Package | Notes |
|------|------|---------|-------|
| fa | **Vazirmatn** (variable) | `@fontsource-variable/vazirmatn` | Best-in-class open Persian UI font; weights 400/500/600. Latin glyphs included and harmonious. |
| de | **Inter** (variable) — or inherit site font if it's already a good Latin sans | `@fontsource-variable/inter` | Keep site font by default for DE (feels native); option to force Inter. |
| en | site font (untouched) | — | |

Load fonts via `@font-face` pointing to `chrome.runtime.getURL('fonts/…woff2')` (declare in `web_accessible_resources`). Use `font-display: block` with a short timeout — we only reveal after translation anyway, so no FOUT. Preload the current language's font when the content script starts on a review page.

Optional setting `persianDigits` (default **off**): convert non-notation digits to ۰–۹.

## Language registry (`src/shared/languages.ts`)
```ts
export const LANGUAGES = {
  fa: { label: 'Persian', native: 'فارسی', dir: 'rtl', font: "'Vazirmatn Variable', Tahoma, sans-serif", lineHeight: 1.75, glossary: 'fa' },
  de: { label: 'German',  native: 'Deutsch', dir: 'ltr', font: 'inherit', lineHeight: null, glossary: 'de' },
  en: { label: 'English', native: 'English', dir: 'ltr', font: 'inherit', lineHeight: null, glossary: null, passthrough: true },
} as const;
```
Adding Dutch later = one entry + `glossary/nl.json`.
