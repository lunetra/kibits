// Per-move commentary decoration (docs/05): dir/lang/font on the commentary slot, and a record of each
// translated block's English original for the "Original" toggle (content/original.ts).
// The text itself was already translated in the MAIN world; here we only set attributes.
import { LANGUAGES, type LangCode } from '../shared/languages';
import { normText } from '../shared/notation';
import { COMMENTARY_SLOT, SLOT_SKELETON } from '../site/selectors';
import type { RetryNode } from '../shared/messages';

interface Entry { lang: LangCode; probes: string[]; original: string; nodes?: RetryNode[][] }

/** The English behind a translated block: plain text, plus chip-aware nodes when we have them. */
export interface Original { plain: string; nodes?: RetryNode[][] }

/** Recent translated plies (capped, A8). */
const entries: Entry[] = [];
const CAP = 300;

export function rememberPly(e: Entry) {
  if (!e.probes.length) return;
  entries.unshift(e);
  if (entries.length > CAP) entries.length = CAP;
}

export const originals = new WeakMap<Element, Original>();

function match(text: string): Entry | undefined {
  return entries.find((e) => e.probes.every((p) => text.includes(p)));
}

export function mark(el: HTMLElement, lang: LangCode) {
  const L = LANGUAGES[lang];
  if (el.dataset.kbz !== 'tr') el.dataset.kbz = 'tr';
  if (el.getAttribute('lang') !== lang) el.setAttribute('lang', lang);
  if (el.getAttribute('dir') !== L.dir) el.setAttribute('dir', L.dir);
}

export function unmark(el: HTMLElement) {
  for (const a of ['data-kbz', 'lang', 'dir']) el.removeAttribute(a);
  originals.delete(el);
}

const PERSIAN = /[\u0600-\u06FF]/;

export function scanSlots(lang: LangCode) {
  for (const slot of document.querySelectorAll<HTMLElement>(COMMENTARY_SLOT)) {
    if (slot.querySelector(SLOT_SKELETON)) continue;
    const text = normText(slot.textContent ?? '');
    const e = match(text);
    if (e) {
      mark(slot, e.lang);
      originals.set(slot, { plain: e.original, nodes: e.nodes });
    } else if (lang === 'fa' && PERSIAN.test(text)) {
      // Translated text we have no record of (e.g. message raced the render): still get font + RTL right.
      mark(slot, 'fa');
    } else if (slot.dataset.kbz === 'tr') {
      unmark(slot); // English (or unknown) content now: leave the site's own rendering alone
    }
  }
}

export function clearSlots() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-kbz="tr"]')) unmark(el);
  entries.length = 0;
}
