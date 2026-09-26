# Kibitz

> *kibitzer (n.)*: a spectator who comments on a chess game.

**Kibitz** is a free, open-source Chrome extension for [taketaketake.com](https://taketaketake.com). It translates
the per-move **Game Review commentary** into your language with Google's Gemini models, and it adds calm, dark
**board themes** that are easy on the eyes.

- 🇮🇷 **Persian**: relaxed, natural Persian, like a strong player talking you through the game, in
  [Vazirmatn](https://github.com/rastikerdar/vazirmatn) with correct right-to-left layout.
- 🇩🇪 **German**: standard chess-book register.
- 🇬🇧 **English**: untouched (no API calls).

The translation happens *before* the site shows the text, so you never see English flash first.

> Kibitz is an independent project. It is not affiliated with or endorsed by Take Take Take.

---

## Features

**Commentary translation**
- Translates each move's commentary and the Game Summary, with the site's own layout, move chips and links intact.
- Chess notation (`Nf3`, `exd5`, `O-O`) stays exactly as written and reads left-to-right inside Persian text.
- **Only pays for what you read.** If you click past a move before its commentary arrives, it isn't translated.
  It's translated when you come back to it.
- **Every translated move is cached forever** on your machine. Reopening or refreshing a game is instant and
  costs nothing. The panel shows the cache size and has a delete button.
- Hover a translated paragraph to see the English original.
- A chess glossary keeps terminology consistent. Edit `glossary/fa.json` / `glossary/de.json` to taste.

**Multiple API keys**
- Add as many Gemini API keys as you like. They're used in turn.
- A key that hits its rate limit rests until the limit resets, then rejoins automatically.
- Each key has its own **Test** button and live status.

**Board themes**
- Eight built-in dark, low-glare presets (Graphite, Forest, Slate, Petrol, Olive, Espresso, Dusk, Ash), tuned
  so both the site's white and black pieces stay clearly readable.
- A custom two-colour theme, or colours derived from your own board images (see [Custom boards](#custom-boards-and-pieces)).

**Panel**
- A minimal black popup with a master on/off switch.
- Changes that need it reload the tab automatically.
- Models: Gemini 3.1 Flash-Lite (default), Gemini 3.5 Flash-Lite, Gemini 2.5 Flash-Lite, Gemma 4 31B.

---

## Install

Kibitz isn't on the Chrome Web Store. Install it from source (Chrome 111+ or any Chromium browser):

```bash
git clone <this-repo-url> kibitz
cd kibitz
npm install
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select the `dist/chrome-mv3` folder.
3. Pin Kibitz from the puzzle-piece menu so the panel is one click away.

**Update:** `git pull && npm install && npm run build`, then click the reload icon on the Kibitz card in
`chrome://extensions`.

## Set up

1. Get a free Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Open the Kibitz panel, paste the key under **API keys**, click **Add**, then **Test**.
3. Pick a language (FA / EN / DE).
4. Open any finished game on taketaketake.com and start the Game Review.

Want more headroom on the free tier? Add a few keys; Kibitz rotates through them.

---

## Privacy

- Kibitz has **no server, no analytics and no tracking**.
- The commentary text is sent to Google's Gemini API, using **your** key, only to translate it.
- API keys are stored in `chrome.storage.local` on your machine. They're only read by the extension's
  background worker and are never exposed to the web page.
- The translation cache lives in your browser's IndexedDB. The panel's **Delete cache** button clears it.

## How it works

The site loads per-move commentary from a JSON API and draws the board with WebGPU. Kibitz runs a small script
in the page that:

1. **Wraps `fetch`** for the commentary endpoint. It serves a cached translation if there is one. Otherwise
   it waits for the site's response and until you're looking at that move, then has the background worker
   translate it and hands the translated JSON to the site. Every failure path falls back to the original English.
2. **Wraps `GPUQueue.writeBuffer`** to swap the board's two square colours in the site's uniform buffer.

The Game Summary is translated at DOM level. Details are in [`docs/`](docs/README.md).

## Custom boards and pieces

- **Boards:** drop board images into `assets/boards/` (e.g. lichess boards). The build derives matching
  colours; the board is GPU-rendered, so textures themselves can't be shown.
- **Pieces:** put 12 SVGs (`wK.svg … bP.svg`) in `assets/pieces/<set-name>/`.
  This is experimental: it needs re-verification against the current site (see `docs/SITE-MAP.md` §4c).

Then run `npm run build` and reload the extension. Please respect the licences of the assets you use, and list
them in `assets/ATTRIBUTION.md`.

---

## Development

```bash
npm install            # also generates themes + WXT types
npm run dev            # WXT dev mode with hot reload
npm run build          # → dist/chrome-mv3
npm test               # Vitest
npm run typecheck
npm run themes         # regenerate board colours / piece atlases from assets/
npm run icons          # regenerate toolbar icons from public/icon/icon.svg
npm run preview:boards -- path/to/site-regular4x.png out.png   # preview presets with the site's pieces
```

Built with [WXT](https://wxt.dev), React, TypeScript and Vite.

```
entrypoints/        background (service worker), content scripts (MAIN + isolated), popup
src/main/           page-world hooks: fetch, WebGPU, rich-text tokenizer, current-move detection
src/content/        isolated-world relay, RTL decoration, Game Summary translation
src/background/     Gemini client, translator, key pool, cache, prompt, validation
src/popup/          the panel (React)
src/site/           every selector / URL pattern for the site, in one file
src/themes/         board presets and theme resolution
scripts/            asset pipeline, icons, board previews
glossary/           chess glossaries per language
docs/               design docs and live site findings
```

The site changes often. If something breaks, `src/site/selectors.ts` and `docs/SITE-MAP.md` are the first places
to look.

### Adding a language

Add an entry to `src/shared/languages.ts`, a `glossary/<code>.json`, and optional style rules and examples in
`src/background/prompt.ts`.

## Contributing

Issues and pull requests are welcome. Glossary improvements from native speakers are especially valuable.
Please run `npm test` and `npm run typecheck` before opening a PR.

## License

[MIT](LICENSE)
