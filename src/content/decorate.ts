// Per-move commentary decoration (docs/05): dir/lang/font on the commentary slot + hover-original.
// The text itself was already translated in the MAIN world; here we only set attributes.
import { LANGUAGES, type LangCode } from '../shared/languages';
import { normText } from '../shared/notation';
import { COMMENTARY_SLOT, SLOT_SKELETON } from '../site/selectors';
import { hideTip, showTip } from './ui';

interface Entry { lang: LangCode; probes: string[]; original: string }

/** Recent translated plies (capped, A8). */
const entries: Entry[] = [];
const CAP = 300;

export function rememberPly(e: Entry) {
  if (!e.probes.length) return;
  entries.unshift(e);
  if (entries.length > CAP) entries.length = CAP;
}

export const originals = new WeakMap<Element, string>();

function match(text: string): Entry | undefined {
  return entries.find((e) => e.probes.every((p) => text.includes(p)));
}

export function mark(el: HTMLElement, lang: LangCode) {
  const L = LANGUAGES[lang];
  if (el.dataset.kbz !== 'tr') el.dataset.kbz = 'tr';
  if (el.getAttribute('lang') !== lang) el.setAttribute('lang', lang);
  if (el.getAttribute('dir') !== L.dir) el.setAttribute('dir', L.dir);
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
}

export function unmark(el: HTMLElement) {
  for (const a of ['data-kbz', 'lang', 'dir', 'tabindex', 'data-kbz-hover']) el.removeAttribute(a);
  originals.delete(el);
}

const PERSIAN = /[\u0600-\u06FF]/;

export function scanSlots(hover: boolean, lang: LangCode) {
  for (const slot of document.querySelectorAll<HTMLElement>(COMMENTARY_SLOT)) {
    if (slot.querySelector(SLOT_SKELETON)) continue;
    const text = normText(slot.textContent ?? '');
    const e = match(text);
    if (e) {
      mark(slot, e.lang);
      originals.set(slot, e.original);
      if (hover) slot.dataset.kbzHover = '';
      else slot.removeAttribute('data-kbz-hover');
    } else if (lang === 'fa' && PERSIAN.test(text)) {
      // Translated text we have no record of (e.g. message raced the render): still get font + RTL right.
      mark(slot, 'fa');
      slot.removeAttribute('data-kbz-hover');
    } else if (slot.dataset.kbz === 'tr') {
      unmark(slot); // English (or unknown) content now: leave the site's own rendering alone
    }
  }
}

export function clearSlots() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-kbz="tr"]')) unmark(el);
  entries.length = 0;
}

// ---------- hover / focus → original (600 ms) ----------

let timer: ReturnType<typeof setTimeout> | undefined;
let current: Element | null = null;
let hoverOn = true;

const targetOf = (t: EventTarget | null) => (t instanceof Element ? t.closest('[data-kbz="tr"]') : null);

function enter(e: Event) {
  if (!hoverOn) return;
  const el = targetOf(e.target);
  if (!el || el === current) return;
  current = el;
  clearTimeout(timer);
  const original = originals.get(el);
  if (!original) return;
  timer = setTimeout(() => showTip(el, original), e.type === 'focusin' ? 0 : 600);
}

function leave(e: Event) {
  const el = targetOf(e.target);
  const to = targetOf((e as MouseEvent | FocusEvent).relatedTarget);
  if (el && el === to) return;
  current = null;
  clearTimeout(timer);
  hideTip();
}

let listening = false;
export function setHover(on: boolean) {
  hoverOn = on;
  if (on && !listening) {
    document.addEventListener('mouseover', enter, { passive: true });
    document.addEventListener('mouseout', leave, { passive: true });
    document.addEventListener('focusin', enter);
    document.addEventListener('focusout', leave);
    addEventListener('scroll', hideTip, { passive: true, capture: true });
    listening = true;
  } else if (!on && listening) {
    document.removeEventListener('mouseover', enter);
    document.removeEventListener('mouseout', leave);
    document.removeEventListener('focusin', enter);
    document.removeEventListener('focusout', leave);
    removeEventListener('scroll', hideTip, { capture: true });
    listening = false;
    clearTimeout(timer);
    hideTip();
  }
}
