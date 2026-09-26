# 07 — Panel (popup) UI

Browser-action popup, **360 × auto (max 600) px**, English, black, minimal. Think Linear / Raycast / Vercel dashboard: quiet, precise, one accent color, no gradients-for-the-sake-of-it, no emoji.

## Design tokens
```css
--bg: #000;            --surface: #0B0B0C;   --surface-2: #141416;  --border: #1F1F23;
--text: #EDEDEF;       --text-2: #A1A1AA;    --text-3: #63636E;
--accent: #E8E8EA;     /* primary controls are white-on-black; */
--ok: #3FB950;         --warn: #D29922;      --err: #F85149;
--radius: 10px; --radius-sm: 6px;
font: 13px/1.45 'Inter Variable', system-ui, sans-serif;  /* Vazirmatn only for FA previews */
```
Spacing on a 4 px grid. Focus rings: 2 px `--text-2` outline, offset 2 px. Motion: 120–160 ms ease-out, disabled under `prefers-reduced-motion`. All controls reachable by keyboard; labels for screen readers.

## Layout (top → bottom)
```
┌──────────────────────────────────────────┐
│ ♞ Kibitz                        [● ON ]  │  header: logo, name, MASTER switch
│ Commentary, in your language.            │  subtitle (text-3); when OFF → "Paused — page restored"
├──────────────────────────────────────────┤
│ TRANSLATION                      [ on ]  │  section header + section toggle
│ Language   [ FA | EN | DE ]              │  segmented control, native labels on hover (فارسی)
│ Model      [ Gemini 3.1 Flash-Lite  ▾ ]  │  select: Flash-Lite (fast) / Gemma 4 31B (open)
│ API key    [ ••••••••••••  ] [Test]      │  masked, eye toggle; Test → ✓ Connected / ✕ Invalid key
│ Show original on hover          [ on ]   │
│ ── preview ──────────────────────────    │  live sample: one EN line + its translation in the
│ «این انتخاب محکم، قطر فیل…»              │  chosen language/font (from cache or a fixed sample)
├──────────────────────────────────────────┤
│ BOARD COLORS                             │
│ [Default][▦][▦][▦][▦][+ Custom] →        │  thumbnails = original lichess image, caption "colors from …";
│                                          │  Custom → two color pickers + gradient toggle
├──────────────────────────────────────────┤
│ PIECES                                   │
│ [Default][♞♛][♞♛][♞♛]                    │  preview tiles = wN + bQ rendered on selected board
├──────────────────────────────────────────┤
│ 142 cached · last 0.9 s · Clear cache    │  footer: stats (text-3), link-button
└──────────────────────────────────────────┘
```

## Behaviour
- **Master switch OFF** → dims all sections (still viewable), content scripts tear down live: remove styles, disconnect observers, restore original commentary. ON → re-apply.
- Every change saves immediately to storage (no Save button); content script reacts via `storage.onChanged`.
- Language `EN` → translation section shows note "Original text, no API calls."
- If no API key and lang ≠ EN → inline callout with link "Get a free key at aistudio.google.com" (opens a new tab).
- Errors surfaced from the content script (auth/quota) show as a small status pill under the model row, with a human message: "Quota reached — showing original. Retrying in 30 s."
- Board/Pieces: if the MAIN-world guards report `unsupported` (site layout changed), show the section disabled with a one-line reason.
- Board color changes apply live on the next board redraw (e.g. next move). Piece set, language and master-switch changes show an inline **"Reload tab to apply"** button (`chrome.tabs.reload` on the active taketaketake tab; this needs the `activeTab` permission, or use a message to the content script that calls `location.reload()`).
- Small note under Board: "The board is GPU-rendered; lichess images are converted to matching colors."
- Badge on the toolbar icon: none when OK; `!` (amber) on repeated errors; greyed icon when master is OFF (`chrome.action.setIcon`).

## Components (React)
`Switch`, `Segmented`, `Select`, `SecretInput`, `ThumbGrid`, `Section`, `StatusPill`, `Callout`. Hand-rolled, ~40 lines each, no UI library. Use `useSettings()` hook (wraps storage + onChanged).

## Optional: Options page
Not needed for v1. If added later: glossary editor (edit/override terms per language), cache export, advanced (timeout, concurrency).
