# Design docs

The specification Kibitz was built from, plus live findings about the site. Recommended reading order:

| # | File | What it contains |
|---|------|------------------|
| 1 | [`../CLAUDE.md`](../CLAUDE.md) | Working rules for this repo |
| 2 | [`01-PRODUCT-SPEC.md`](01-PRODUCT-SPEC.md) | Features, user stories, non-goals |
| 3 | [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) | Stack, folder layout, components, message protocol, storage schema |
| 4 | [`SITE-MAP.md`](SITE-MAP.md) + [`03-SITE-RECON.md`](03-SITE-RECON.md) | Verified findings about taketaketake.com (API, DOM, WebGPU board, piece atlases, current-move detection) |
| 5 | [`04-TRANSLATION.md`](04-TRANSLATION.md) | Gemini API usage, prompts, glossary, caching, error handling |
| 6 | [`05-RTL-TYPOGRAPHY.md`](05-RTL-TYPOGRAPHY.md) | In-place rendering, bidi rules, fonts per language |
| 7 | [`06-THEMES-BOARD-PIECES.md`](06-THEMES-BOARD-PIECES.md) | Board / piece theming and the asset pipeline |
| 8 | [`07-PANEL-UI.md`](07-PANEL-UI.md) | Popup design system and controls |
| 9 | [`08-ROADMAP-ACCEPTANCE.md`](08-ROADMAP-ACCEPTANCE.md) | Milestones, acceptance criteria, test plan |
| — | [`../glossary/`](../glossary/) | Chess terminology glossaries injected into prompts |
| — | [`../tools/recon.js`](../tools/recon.js) | DevTools console script to re-map the site if SITE-MAP goes stale |

The site deploys often and its asset names are content-hashed. If something stops working, start with the
"Re-check" at the end of `SITE-MAP.md`.

Some details in the early specs were superseded during the build. For example, API keys are now a rotating pool,
translations are cached per move forever, and board changes reload the tab. The code and the main README are the
source of truth.
