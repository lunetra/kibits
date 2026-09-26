# 04 — Translation engine

## Models (Google AI / Gemini API, key from https://aistudio.google.com)
| Id | Role | Notes |
|----|------|-------|
| `gemini-3.1-flash-lite` | **Default** | Stable. Fast/cheap. Supports `thinkingLevel` (`minimal`/`low`/`medium`/`high`) → use `minimal`. Supports JSON structured output (`responseMimeType` + `responseJsonSchema`). |
| `gemma-4-31b-it` | Alternative | Open model served by the same API. Supports `systemInstruction`. Thinking toggles via `thinkingLevel`: `minimal` (off) / `high` (on) → use `minimal`. Do **not** rely on structured output — use the tagged text format below. |

Keep model ids in one registry (`src/shared/models.ts`) so new ids (e.g. a future flash-lite) are one-line additions. Verify ids against https://ai.google.dev/gemini-api/docs/models at build time if unsure; if a call returns 404 for the model, surface "Model not available for this key" in the panel.

## REST
```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
Headers: x-goog-api-key: <KEY>, Content-Type: application/json
```
```jsonc
{
  "systemInstruction": { "parts": [{ "text": "<SYSTEM PROMPT>" }] },
  "contents": [{ "role": "user", "parts": [{ "text": "<PAYLOAD>" }] }],
  "generationConfig": {
    "thinkingConfig": { "thinkingLevel": "minimal" },
    "maxOutputTokens": 1024,
    // Gemini only, batch mode:
    "responseMimeType": "application/json",
    "responseJsonSchema": { "type": "object", "properties": { "t": { "type": "array", "items": { "type": "string" } } }, "required": ["t"] }
  }
}
```
- Leave `temperature` at the model default for Gemini 3.x (Google advises against lowering it for Gemini 3). For Gemma use `temperature: 0.3`.
- If a 400 says a field is unsupported (e.g. `thinkingLevel` value), retry once without that field and remember it per model (capability map).
- Use the plain REST API with `fetch` (no SDK needed; keeps the SW tiny). `@google/genai` is acceptable if you prefer, but it must run in the SW.
- Key test: `GET https://generativelanguage.googleapis.com/v1beta/models/{model}` with the key header → 200 = OK.
- Streaming (`:streamGenerateContent?alt=sse`) is **not required** in v1: we reveal only complete translations.

## Pipeline (background `translator.ts`)
1. **Normalize** source: trim, collapse whitespace, keep placeholders `⟦0⟧…` intact.
2. **Cache lookup** key = `v{PROMPT_VERSION}:{lang}:{hash(normalized)}` → memory LRU (500) → IndexedDB (`kibitz` db, store `tr`, cap ~5 000 entries, evict oldest). Value: `{ text, model, ts }`.
3. **Dedupe** in-flight requests by key (same promise).
4. **Queue** with concurrency 3 (a user can click through plies quickly; the site fires one request per ply).
5. **One request per ply** (all its paragraphs as an array; usually 1). Gemini: `responseJsonSchema` `{t: string[]}`. Gemma: `<t i="0">…</t>` tags.
6. **Timeout** 7 s per request (AbortController); the MAIN-world wrapper's own hard cap is 7.5 s → original response.
7. **Errors**: 401/403 → `auth`; 429 → `quota` (honour `RetryInfo.retryDelay`, exponential backoff, max 2 retries, then fallback); 5xx/network → 1 retry; `promptFeedback.blockReason` or empty candidates → `blocked`. Optional setting: on failure with Gemma, retry once with flash-lite.
8. **Post-validate** the output (see below); if validation fails → one retry, else fallback English.

## Where translation happens (verified, see SITE-MAP §1)
Per-move commentary is translated **inside the site's own fetch** (MAIN-world wrapper), before React ever sees it:
1. The page calls `fetch(POST …/v1/position-commentary)`. Wrapper awaits the real response and clones it. If `status !== "ready"` or the lang is `en` or anything is off, return the original.
2. For each `paragraph` in `commentary.content`, `richtext.ts` serializes the children to a source string:
   - `{text}` → the text itself
   - `{type:'san', san}` → token `⟦n⟧` (description for the prompt: `move d4`)
   - `{type:'player', player}` →
     - if `playerWords` (default **true**): the English word **"White"/"Black"** inline as plain text (the model translates it to سفید/سیاه and the node becomes a text node in the output). This avoids Latin usernames/color words stuck inside Persian.
     - else: token `⟦n⟧` (kept as a node → the site renders the name/color in English)
   - unknown node → token `⟦n⟧` (opaque, preserved)
3. Send all paragraphs of the ply in **one** request (JSON array in → array out).
4. Rebuild: split the translated string on `⟦n⟧` → `[{text}, originalNode, {text}, …]`. Also set `commentary.text` to the plain translated text. Keep every other field untouched. Return `new Response(JSON.stringify(json), { status, statusText, headers })`.
5. Store `{ original content, translated content, lang }` keyed by `positionId` in a MAIN-world Map. Use it for "hover original" and instant language switching (see 05).

Game Summary (Convex WebSocket data) is translated at the **DOM level** by `content/summary.ts`: pre-hide the summary box, serialize its inline children (`button` = san link, player `span`s) to tokens the same way, translate, then render into our own `div.kbz-tr` sibling while the original stays hidden (never mutate React-owned nodes).

Rules for the model: *keep every ⟦n⟧ exactly once, may move it to where the grammar needs it*. Validation: same multiset of tokens; otherwise one retry, then fallback to the original.

## Validation (`validate.ts`)
- Non-empty, length ratio vs source between 0.5× and 2.2×.
- All chess notation tokens from the source (regex below) appear unchanged in output.
- All `⟦n⟧` tokens preserved.
- For `fa`: output contains Arabic-script letters (U+0600–U+06FF) and no Arabic-specific letters `ي ك` (normalize to `ی ک` automatically instead of failing).
- No leading "Translation:" / quotes / markdown.

Notation regex (SAN / move numbers / squares / scores):
```
/\b(?:\d+\.(?:\.\.)?\s?)?(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?[!?]{0,2}|\b[a-h][1-8]\b|[+-]?\d+\.\d+|#-?\d+/g
```

## System prompt (template — `prompt.ts`)
```
You are a professional chess translator and titled-player-level coach. Translate short English chess
commentary from a game-review app into {LANGUAGE_NAME}.

Goals
- Sound like a strong native-speaking coach wrote it: natural, concise, confident, same tone and energy
  as the original (encouraging, dry, or critical exactly as the source).
- Use standard chess terminology in {LANGUAGE_NAME}. Use the glossary below; it overrides your own choices.
- Keep the same sentence count and similar length. Do not add explanations, do not drop details.

Hard rules
- Copy chess notation EXACTLY as written, in Latin letters: moves (e4, Nf3, Bxf7+, O-O, e8=Q, 12...Rd8),
  squares (d5, h7), evaluations (+1.2, #3). Never translate piece letters inside notation.
- Keep every placeholder like ⟦0⟧ exactly once.
- Keep player names and brand names unchanged.
- Output ONLY the translation. No quotes, no notes, no markdown.
{LANGUAGE_SPECIFIC_RULES}

Glossary (English → {LANGUAGE_NAME}):
{GLOSSARY_LINES}
```

**Persian-specific rules** (`fa`):
```
- Write fluent standard Persian (فارسی معیار), not word-for-word. Prefer active voice.
- Use the zero-width non-joiner correctly (می‌کند، مهره‌ها، خانه‌سفید، قلعه‌ی).
- Use Persian letters ی and ک (never Arabic ي ك). Use Persian punctuation: ، ؛ ؟ and «» for quotes.
- Keep digits inside notation Latin. Other numbers: Latin digits unless told otherwise.
- "White"/"Black" as players → «سفید» / «سیاه».
```
**German-specific rules** (`de`):
```
- Standard German chess register (as in German chess books/commentary). Use "du" address only if the
  source addresses the reader directly; otherwise neutral.
- Keep English SAN (Q, R, B, N) exactly as in the source — do NOT convert to D, T, L, S.
- "White"/"Black" → "Weiß"/"Schwarz".
```

**Context payload** (user turn, single item):
```
Move: 14. Nd5 (White)          ← when known
Previous comment (for consistency, do not translate): "..."
Text:
<commentary>
```
**Batch payload**: JSON `{"items":["...","..."]}` → expects `{"t":["...","..."]}` (Gemini). Gemma: items as `<t i="0">…</t>` lines, parse the same tags back.

## Few-shot examples (include 2–3 per language in the system prompt)
| EN | FA | DE |
|----|----|----|
| White stakes a claim in the center and opens pathways for the queen and light-squared bishop. This is the most popular starting move for a reason, leading to open and active play. *(real site sample)* | سفید در مرکز جای پا باز می‌کند و مسیر وزیر و فیل خانه‌سفید را می‌گشاید. این محبوب‌ترین حرکت شروع است و بی‌دلیل هم نیست؛ بازی را به سمت وضعیت‌های باز و فعال می‌برد. | Weiß besetzt das Zentrum und öffnet Wege für Dame und weißfeldrigen Läufer. Nicht ohne Grund der beliebteste Eröffnungszug – er führt zu offenem, aktivem Spiel. |
| White immediately challenges the center with ⟦0⟧, leading into the sharp lines of the Center Game. *(real, with token)* | سفید بلافاصله با ⟦0⟧ مرکز را به چالش می‌کشد و بازی وارد واریانت‌های تیز «بازی مرکز» می‌شود. | Weiß fordert mit ⟦0⟧ sofort das Zentrum heraus und steuert in die scharfen Linien des Mittelgambits. |
| This solid choice blunts the diagonal for White's light-squared bishop. | این انتخاب محکم، قطر فیل خانه‌سفیدِ سفید را خنثی می‌کند. | Diese solide Wahl entschärft die Diagonale von Weiß' weißfeldrigem Läufer. |
| Nf3 develops a piece and prepares to castle kingside. | Nf3 یک مهره‌ی دیگر را وارد بازی می‌کند و مقدمات قلعه‌ی کوچک را فراهم می‌کند. | Nf3 entwickelt eine Figur und bereitet die kurze Rochade vor. |
| A blunder! After Qxd5, Black loses the exchange to a knight fork on c7. | اشتباه فاحش! پس از Qxd5، سیاه با چنگال اسب روی c7 کیفیت را از دست می‌دهد. | Ein grober Fehler! Nach Qxd5 verliert Schwarz durch eine Springergabel auf c7 die Qualität. |

(The user is a native Persian speaker — ask them to review/replace the FA examples and glossary during M2; their edits win.)

## Glossaries
`glossary/fa.json`, `glossary/de.json` — flat `{ "english term": "translation" }`. The builder includes **only glossary entries whose English key appears in the source text** (case-insensitive, word-boundary) to keep prompts short, plus the six piece names always.

## Prompt versioning
`PROMPT_VERSION` constant; bump it whenever the prompt/glossary changes → cache naturally invalidates.
