// Commentary content tree ⇄ "text with ⟦n⟧ tokens" (docs/04 → "Where translation happens").
import { isolateNotation, normText } from '../shared/notation';

export type Inline = { text: string; [k: string]: unknown } | { type: string; [k: string]: unknown };
export interface Block { type: string; children?: Inline[]; [k: string]: unknown }

export interface Serialized {
  source: string;
  /** Original node for each token index. */
  nodes: Inline[];
  hints: string[];
}

const isText = (n: Inline): n is { text: string } =>
  typeof (n as { text?: unknown }).text === 'string' && ((n as { type?: unknown }).type === undefined || (n as { type?: unknown }).type === 'text');

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function serialize(children: Inline[], playerWords: boolean): Serialized {
  let source = '';
  const nodes: Inline[] = [];
  const hints: string[] = [];
  const token = (n: Inline, hint: string) => {
    const i = nodes.length;
    nodes.push(n);
    hints.push(`⟦${i}⟧ = ${hint}`);
    source += `⟦${i}⟧`;
  };
  for (const n of children) {
    if (isText(n)) {
      source += n.text.replace(/⟦|⟧/g, '');
      continue;
    }
    const type = (n as { type: string }).type;
    if (type === 'player') {
      const p = String((n as { player?: unknown }).player ?? '');
      if (playerWords && (p === 'white' || p === 'black')) source += cap(p);
      else token(n, `the ${p || 'player'} player's name`);
    } else if (type === 'san') {
      const san = String((n as { san?: unknown }).san ?? '');
      const color = (n as { color?: unknown }).color;
      token(n, `move ${san}${typeof color === 'string' ? ` (${cap(color)})` : ''}`);
    } else {
      token(n, 'inline element (keep in place)');
    }
  }
  return { source, nodes, hints };
}

/** Plain-text rendering of a token node, for commentary.text and hover matching. */
export function nodePlain(n: Inline): string {
  if (isText(n)) return n.text;
  const t = n as { type: string; san?: unknown; player?: unknown };
  if (t.type === 'san') return String(t.san ?? '');
  if (t.type === 'player') return cap(String(t.player ?? ''));
  return '';
}

/** Rebuild children from a translated string; tokens map back to their original nodes. */
export function rebuild(translated: string, nodes: Inline[], rtl: boolean): Inline[] {
  const out: Inline[] = [];
  const parts = translated.split(/⟦(\d+)⟧/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      const text = parts[i]!;
      if (text) out.push({ text: rtl ? isolateNotation(text) : text });
    } else {
      const node = nodes[Number(parts[i])];
      if (node) out.push(node);
    }
  }
  return out;
}

export function plainOf(children: Inline[]): string {
  return children.map((n) => (isText(n) ? n.text : nodePlain(n))).join('');
}

/**
 * Text fragments that will appear verbatim in the rendered DOM (used by the isolated script to
 * recognise a translated slot and find its original for "hover original").
 */
export function probesOf(children: Inline[]): string[] {
  return children
    .filter(isText)
    .map((n) => normText(n.text))
    .filter((s) => s.length >= 8)
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);
}

export interface PlyTranslation {
  items: string[];
  hints: string[][];
  paragraphs: Array<{ index: number; nodes: Inline[] }>;
}

/** Collect translatable paragraphs of a commentary content array. Unknown block types stay untouched. */
export function collect(content: Block[], playerWords: boolean): PlyTranslation {
  const res: PlyTranslation = { items: [], hints: [], paragraphs: [] };
  content.forEach((b, index) => {
    if (b?.type !== 'paragraph' || !Array.isArray(b.children)) return;
    const s = serialize(b.children, playerWords);
    if (!/[A-Za-z]{2,}/.test(s.source.replace(/⟦\d+⟧/g, ''))) return; // nothing to translate
    res.items.push(s.source);
    res.hints.push(s.hints);
    res.paragraphs.push({ index, nodes: s.nodes });
  });
  return res;
}

/** Apply translated texts; returns a new content array (never mutates the input). */
export function apply(content: Block[], plan: PlyTranslation, texts: string[], rtl: boolean): Block[] {
  const out = content.map((b) => ({ ...b }));
  plan.paragraphs.forEach((p, i) => {
    out[p.index] = { ...out[p.index]!, children: rebuild(texts[i]!, p.nodes, rtl) };
  });
  return out;
}

export function contentPlain(content: Block[]): string {
  return content
    .filter((b) => Array.isArray(b.children))
    .map((b) => plainOf(b.children!))
    .join('\n\n');
}

/** Move chips (san nodes) in render order, for hover arrows. */
export function sansOf(content: Block[]): Array<{ san: string; color?: 'white' | 'black' }> {
  return content.flatMap((b) =>
    (b.children ?? [])
      .filter((n) => (n as { type?: string }).type === 'san')
      .map((n) => {
        const c = (n as { color?: unknown }).color;
        return { san: String((n as { san?: unknown }).san ?? ''), color: c === 'white' || c === 'black' ? c : undefined };
      }),
  );
}

/**
 * Turn move chips that aren't real moves into plain text (the site's generator sometimes tags a square, e.g.
 * "the bishop on c5", as a pawn move). Returns the input unchanged when nothing needs fixing.
 */
export function demoteChips(content: Block[], isMove: (san: string, color?: 'white' | 'black') => boolean): Block[] {
  let changed = false;
  const out = content.map((b) => {
    if (!Array.isArray(b.children)) return b;
    const children = b.children.map((n) => {
      const t = n as { type?: string; san?: unknown; color?: unknown };
      if (t.type !== 'san' || typeof t.san !== 'string') return n;
      const color = t.color === 'white' || t.color === 'black' ? t.color : undefined;
      if (isMove(t.san, color)) return n;
      changed = true;
      return { text: t.san };
    });
    return { ...b, children };
  });
  return changed ? out : content;
}
