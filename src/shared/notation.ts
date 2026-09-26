// Chess notation helpers shared by validation (SW) and bidi isolation (MAIN world). docs/04 → "Validation".

/** SAN moves (with optional move number), bare squares, scores and mate distances. */
export const NOTATION_SOURCE =
  String.raw`\b(?:\d+\.(?:\.\.)?\s?)?(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?[!?]{0,2}|\b[a-h][1-8]\b|[+-]?\d+\.\d+|#-?\d+`;

export const notationRe = () => new RegExp(NOTATION_SOURCE, 'g');

export function findNotation(text: string): string[] {
  return [...text.matchAll(notationRe())].map((m) => m[0].replace(/^\d+\.(?:\.\.)?\s?/, '').trim());
}

export const LRI = '⁦';
export const PDI = '⁩';

/** Wrap notation in LRI … PDI so it stays LTR inside RTL text without touching the DOM. */
export function isolateNotation(text: string): string {
  return text.replace(notationRe(), (m) => `${LRI}${m}${PDI}`);
}

export const stripBidi = (s: string) => s.replace(/[⁦-⁩‎‏]/g, '');

/** Normalization used for matching rendered text with what we produced. */
export const normText = (s: string) => stripBidi(s).replace(/\s+/g, ' ').trim();

export const TOKEN_RE = /⟦(\d+)⟧/g;
export const tokensOf = (s: string) => [...s.matchAll(TOKEN_RE)].map((m) => m[0]).sort();
