// System prompt + payload builder (docs/04 → "System prompt", "Glossaries", "Few-shot examples").
import deGlossary from '../../glossary/de.json';
import faGlossary from '../../glossary/fa.json';
import { LANGUAGES, type LangCode } from '../shared/languages';
import type { GameContext } from '../shared/messages';

/** Bump whenever prompt/glossary/examples change → cache invalidates naturally. */
export const PROMPT_VERSION = 3;

type Glossary = Record<string, string>;
const GLOSSARIES: Partial<Record<LangCode, Glossary>> = { fa: faGlossary, de: deGlossary };
const ALWAYS = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Glossary entries whose English key occurs in the source (case-insensitive, word boundary), plus piece names. */
export function filterGlossary(lang: LangCode, sources: string[]): Array<[string, string]> {
  const g = GLOSSARIES[lang];
  if (!g) return [];
  const text = sources.join('\n');
  const out: Array<[string, string]> = [];
  for (const [en, tr] of Object.entries(g)) {
    if (en.startsWith('_')) continue;
    const re = new RegExp(`(?<![\\p{L}])${escapeRe(en)}(?![\\p{L}])`, 'iu');
    if (ALWAYS.includes(en) || re.test(text)) out.push([en, tr]);
  }
  return out;
}

const LANG_RULES: Partial<Record<LangCode, string>> = {
  fa: `Persian style (most important):
- Write the way a strong Iranian chess master actually talks to a friend while reviewing a game: relaxed,
  everyday spoken Persian (محاوره‌ی نوشتاری), warm and easy to read. NOT bookish, NOT formal, NOT news-style.
- Use colloquial verb forms: می‌کنه، می‌ره، می‌تونی، نمی‌خوای، بود، بزنی، هست → ـه (e.g. «وسوسه‌انگیزه»).
  Use «رو» instead of «را», «یه» instead of «یک», «ولی» instead of «اما»، «اگه» instead of «اگر»، «توی» instead of «در» where natural.
- Avoid formal/literary words: می‌باشد، گردید، نموده، جهت، لذا، در راستای، منجر به … شدن، در نهایت، بدین ترتیب، صرفاً.
- Use «تو» (never «شما») ONLY where the English literally says "you"/"your". Never turn an impersonal or
  third-person sentence into «تو»: "Capturing with the bishop was stronger" → «زدن با فیل قوی‌تر بود», and
  "Black should have played…" → «سیاه باید … بازی می‌کرد».
- Use the words Iranian chess players actually say, including common loanwords (متریال، تمپو، گامبی،
  فیانکتو). Prefer the glossary; avoid rare or dictionary-only words (e.g. never «مصالح» for material).
- Short, punchy sentences are fine; split long English sentences when that reads better in Persian.
- Faithfulness: rewrite freely for natural flow, but keep EXACTLY the same meaning and every detail.
  Never add ideas, jokes or explanations, never drop a detail.
- Nouns and chess terms stay in their standard written spelling (خانه‌سفید، پیاده، مهره). Use the glossary terms.
- Use the zero-width non-joiner correctly (می‌کنه، مهره‌ها، خانه‌سفید، پیاده‌ی).
- Use Persian letters ی and ک (never Arabic ي ك). Persian punctuation: ، ؛ ؟ and «» for names/quotes.
- Keep digits inside notation Latin.
- "White"/"Black" as players → سفید / سیاه.`,
  de: `- Standard German chess register (as in German chess books/commentary). Use "du" address only if the
  source addresses the reader directly; otherwise neutral.
- Keep English SAN (Q, R, B, N) exactly as in the source — do NOT convert to D, T, L, S.
- "White"/"Black" → "Weiß"/"Schwarz".`,
};

const EXAMPLES: Array<{ en: string; fa: string; de: string }> = [
  {
    en: 'White stakes a claim in the center and opens pathways for the queen and light-squared bishop. This is the most popular starting move for a reason, leading to open and active play.',
    fa: 'سفید همین اول توی مرکز جا باز می‌کنه و راه وزیر و فیل خانه‌سفید رو هم باز می‌کنه. بی‌دلیل نیست که محبوب‌ترین حرکت شروعه؛ بازی رو باز و پرتحرک می‌کنه.',
    de: 'Weiß besetzt das Zentrum und öffnet Wege für Dame und weißfeldrigen Läufer. Nicht ohne Grund der beliebteste Eröffnungszug – er führt zu offenem, aktivem Spiel.',
  },
  {
    en: 'White immediately challenges the center with ⟦0⟧, leading into the sharp lines of the Center Game.',
    fa: 'سفید با ⟦0⟧ همون اول مرکز رو به چالش می‌کشه و بازی می‌ره توی خط‌های تیز «گشایش مرکز».',
    de: 'Weiß fordert mit ⟦0⟧ sofort das Zentrum heraus und steuert in die scharfen Linien des Mittelgambits.',
  },
  {
    en: 'This check is a tempting distraction, but it misses the chance to settle the central tension immediately. Capturing on f6 with exf6 would have won a piece.',
    fa: 'این کیش وسوسه‌انگیزه، ولی فرصت روشن کردن تکلیف مرکز رو همین الان از دست می‌ده. زدن روی f6 با exf6 یه مهره می‌برد.',
    de: 'Dieses Schach ist eine verlockende Ablenkung, verpasst aber die Chance, die Spannung im Zentrum sofort aufzulösen. Mit exf6 auf f6 zu schlagen hätte eine Figur gewonnen.',
  },
  {
    en: 'You missed a chance here: Nxe5 wins a clean pawn, since Black has no good way to keep material level.',
    fa: 'اینجا یه فرصت رو از دست دادی: Nxe5 یه پیاده‌ی مفت می‌بره، چون سیاه راه خوبی برای حفظ تعادل متریال نداره.',
    de: 'Hier hast du eine Chance verpasst: Nxe5 gewinnt einen sauberen Bauern, da Schwarz das Materialgleichgewicht nicht gut halten kann.',
  },
  {
    en: 'A blunder! After Qxd5, Black loses the exchange to a knight fork on c7.',
    fa: 'اشتباه بزرگ! بعد از Qxd5، سیاه با چنگال اسب روی c7 کیفیت رو از دست می‌ده.',
    de: 'Ein grober Fehler! Nach Qxd5 verliert Schwarz durch eine Springergabel auf c7 die Qualität.',
  },
];

export function buildSystemPrompt(lang: LangCode, sources: string[]): string {
  const L = LANGUAGES[lang];
  const name = L.promptName;
  const glossary = filterGlossary(lang, sources).map(([en, tr]) => `${en} → ${tr}`).join('\n');
  const examples =
    lang === 'fa' || lang === 'de'
      ? EXAMPLES.map((e) => `EN: ${e.en}\n${lang.toUpperCase()}: ${e[lang]}`).join('\n\n')
      : '';
  return `You are a professional chess translator and titled-player-level coach. Translate short English chess
commentary from a game-review app into ${name}.

Goals
- Sound like a strong native-speaking chess master said it: natural, easy to read, same tone and energy
  as the original (encouraging, dry, or critical exactly as the source).
- Translate faithfully: same meaning and details. Never add or remove information.
- Use standard chess terminology in ${name}. Use the glossary below; it overrides your own choices.
- Keep the same sentence count and similar length. Do not add explanations, do not drop details.

Hard rules
- Copy chess notation EXACTLY as written, in Latin letters: moves (e4, Nf3, Bxf7+, O-O, e8=Q, 12...Rd8),
  squares (d5, h7), evaluations (+1.2, #3). Never translate piece letters inside notation.
- Keep every placeholder like ⟦0⟧ exactly once. You may move it to where the grammar needs it.
- Keep player names and brand names unchanged.
- Output ONLY the translation. No quotes, no notes, no markdown.
${LANG_RULES[lang] ?? ''}

Glossary (English → ${name}):
${glossary || '(none)'}
${examples ? `\nExamples:\n${examples}\n` : ''}`;
}

export interface PayloadInput {
  items: string[];
  hints: string[][];
  context?: GameContext;
}


const other = (c: 'white' | 'black') => (c === 'white' ? 'Black' : 'White');
const cap = (c: string) => c[0]!.toUpperCase() + c.slice(1);

export function contextLines(p: PayloadInput): string {
  const lines: string[] = [];
  const ctx = p.context;
  if (ctx?.plyIndex != null) {
    const ply = ctx.plyIndex;
    const mover = ply % 2 === 0 ? 'White' : 'Black';
    lines.push(`This comment is about move ${Math.floor(ply / 2) + 1}${ply % 2 ? '...' : '.'}, played by ${mover}.`);
  }
  if (ctx?.userColor) {
    lines.push(
      `The reader plays ${cap(ctx.userColor)}; their opponent plays ${other(ctx.userColor)}. "You" in the source means the reader (${cap(ctx.userColor)}).`,
    );
  }
  const names = [ctx?.players?.white && `"${ctx.players.white}" = White`, ctx?.players?.black && `"${ctx.players.black}" = Black`].filter(Boolean);
  if (names.length) lines.push(`Player names: ${names.join(', ')}. Replace these names with their colour (White/Black) in the translation.`);
  p.hints.forEach((h, i) => {
    if (h.length) lines.push(`Placeholders in item ${i}: ${h.join('; ')}`);
  });
  return lines.join('\n');
}

/** Gemini: JSON in → {"t": [...]} out (structured output). */
export function buildJsonPayload(p: PayloadInput): string {
  const ctx = contextLines(p);
  return `${ctx ? ctx + '\n' : ''}Translate every string in "items". Return {"t": [...]} with exactly ${p.items.length} string(s), same order.
${JSON.stringify({ items: p.items })}`;
}

/** Gemma: tagged text in → tagged text out. */
export function buildTaggedPayload(p: PayloadInput): string {
  const ctx = contextLines(p);
  const tagged = p.items.map((t, i) => `<t i="${i}">${t}</t>`).join('\n');
  return `${ctx ? ctx + '\n' : ''}Translate the text inside each <t> tag. Answer with the same tags and indices, one per line, nothing else.
${tagged}`;
}

export function parseTagged(text: string, n: number): string[] | null {
  const out: string[] = new Array(n);
  for (const m of text.matchAll(/<t i="(\d+)">([\s\S]*?)<\/t>/g)) {
    const i = Number(m[1]);
    if (i < n) out[i] = m[2]!.trim();
  }
  for (let i = 0; i < n; i++) if (typeof out[i] !== 'string') return null;
  return out;
}

export function parseJson(text: string, n: number): string[] | null {
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const v = JSON.parse(cleaned) as { t?: unknown };
    if (!Array.isArray(v.t) || v.t.length !== n || !v.t.every((x) => typeof x === 'string')) return null;
    return v.t as string[];
  } catch {
    return null;
  }
}
