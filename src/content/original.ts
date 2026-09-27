// "Original" toggle: swap translated commentary back to the site's English, in place.
// - The button under the commentary flips a sticky mode (stays on while you step through moves).
// - Holding the peek key (Alt/Option by default) while hovering a translated block shows its original until
//   the key is released. Pressing the toggle key (O by default) flips the sticky mode, like the button.
import { LANGUAGES, type LangCode } from '../shared/languages';
import type { PeekKey, ToggleKey } from '../shared/settings';
import { COMMENTARY_SLOT, SAN_WRAPPER, SUMMARY_TEXT } from '../site/selectors';
import { chipsOf } from './arrows';
import { originals } from './decorate';
import { renderParagraphs } from './render';
import { currentPly } from '../site/ply';

let mode = false; // sticky "show original"
let alt = false;
let hovered: Element | null = null;
let lang: LangCode = 'fa';
let schedule: () => void = () => {};
let peekKey: PeekKey = 'alt';
let toggleKey: ToggleKey = 'o';

export function setShortcuts(peek: PeekKey, toggle: ToggleKey) {
  peekKey = peek;
  toggleKey = toggle;
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const PEEK_LABEL: Record<PeekKey, string> = { alt: isMac ? 'Option' : 'Alt', shift: 'Shift', mod: isMac ? 'Cmd' : 'Ctrl', none: '' };

function peekHeld(e: KeyboardEvent | MouseEvent): boolean {
  switch (peekKey) {
    case 'alt': return e.altKey;
    case 'shift': return e.shiftKey;
    case 'mod': return isMac ? e.metaKey : e.ctrlKey;
    case 'none': return false;
  }
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Our English rendering of a translated per-move slot. */
const origBoxes = new WeakMap<Element, HTMLElement>();
const tools = new WeakMap<Element, HTMLElement>();

/** Translated blocks currently on the page: the per-move slot, the Game Summary, a retried move. */
function blocks(): HTMLElement[] {
  const out: HTMLElement[] = [];
  const slot = document.querySelector<HTMLElement>(`${COMMENTARY_SLOT}[data-kbz="tr"]`);
  if (slot && originals.get(slot)?.nodes) out.push(slot);
  out.push(...document.querySelectorAll<HTMLElement>('.kbz-tr'));
  return out;
}

/** The block a DOM node belongs to (our English box maps back to its slot). */
function blockOf(t: EventTarget | null): Element | null {
  if (!(t instanceof Element)) return null;
  const orig = t.closest<HTMLElement>('.kbz-orig');
  if (orig) return orig.previousElementSibling;
  return t.closest(`${COMMENTARY_SLOT}[data-kbz="tr"], .kbz-tr`);
}

function showOriginal(b: HTMLElement) {
  if (b.classList.contains('kbz-tr')) {
    // Summary / retried move: the site's English is right there, just hidden.
    b.dataset.kbzOff = '';
    const source = b.classList.contains('kbz-swapped') ? b.previousElementSibling : b.previousElementSibling?.matches(SUMMARY_TEXT) ? b.previousElementSibling : null;
    (source as HTMLElement | null)?.setAttribute('data-kbz-peek', '');
    return;
  }
  // Per-move slot: React shows the translation, so render the English ourselves (with the site's chips).
  let box = origBoxes.get(b);
  if (!box?.isConnected || box.previousElementSibling !== b) {
    const o = originals.get(b);
    if (!o?.nodes) return;
    box = document.createElement('div');
    box.className = 'kbz-orig';
    box.setAttribute('lang', 'en');
    box.setAttribute('dir', 'ltr');
    const ply = currentPly() ?? -1;
    box.append(renderParagraphs(o.nodes, [...b.querySelectorAll(SAN_WRAPPER)], (i) => chipsOf(ply)?.[i]));
    b.after(box);
    origBoxes.set(b, box);
  }
  b.setAttribute('data-kbz-swap', '');
}

function hideOriginal(b: HTMLElement) {
  if (b.classList.contains('kbz-tr')) {
    b.removeAttribute('data-kbz-off');
    b.previousElementSibling?.removeAttribute('data-kbz-peek');
    return;
  }
  origBoxes.get(b)?.remove();
  origBoxes.delete(b);
  b.removeAttribute('data-kbz-swap');
}

const ICON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h6M5.5 2v1.5M3.5 3.5c.5 2.5 2.5 4.5 5 5.5M7.5 3.5C7 6 5 8.5 2.5 9.5M8.5 14l3-7 3 7M9.5 11.8h4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function ensureTools(b: HTMLElement) {
  let t = tools.get(b);
  const anchor = (origBoxes.get(b)?.isConnected ? origBoxes.get(b) : null) ?? b;
  const label = mode ? LANGUAGES[lang].native : 'Original';
  const key = `${label}|${peekKey}|${toggleKey}`;
  if (!t) {
    t = document.createElement('div');
    t.className = 'kbz-tools';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kbz-orig-btn';
    btn.addEventListener('click', () => {
      mode = !mode;
      schedule();
    });
    t.append(btn);
    tools.set(b, t);
  }
  const btn = t.firstElementChild as HTMLButtonElement;
  if (btn.dataset.kbzLabel !== key) {
    btn.dataset.kbzLabel = key;
    btn.innerHTML = ICON;
    btn.append(document.createTextNode(label));
    btn.setAttribute('aria-pressed', String(mode));
    const hints = [
      toggleKey !== 'none' && `press ${toggleKey.toUpperCase()}`,
      peekKey !== 'none' && `hold ${PEEK_LABEL[peekKey]} and hover`,
    ].filter(Boolean);
    btn.title = (mode ? 'Show the translation again' : 'Show the original English') + (hints.length ? ` (or ${hints.join(', or ')})` : '');
  }
  if (t.previousElementSibling !== anchor) anchor.after(t);
}

let current = new Set<HTMLElement>();

/** Called from the lifecycle scan. */
export function scanOriginal(l: LangCode, sched: () => void) {
  lang = l;
  schedule = sched;
  const now = new Set(blocks());
  // Blocks that went away (move changed): drop our nodes.
  for (const b of current) if (!now.has(b) || !b.isConnected) { hideOriginal(b); tools.get(b)?.remove(); }
  for (const b of now) {
    const want = mode || (alt && hovered === b);
    if (want) showOriginal(b);
    else hideOriginal(b);
    ensureTools(b);
  }
  // Remove stray toolbars (e.g. a slot that's no longer translated).
  for (const t of document.querySelectorAll('.kbz-tools')) {
    if (![...now].some((b) => tools.get(b) === t)) t.remove();
  }
  current = now;
}

const onKey = (e: KeyboardEvent) => {
  if (
    e.type === 'keydown' && toggleKey !== 'none' && !e.repeat && e.key.toLowerCase() === toggleKey &&
    !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && !typing(e.target)
  ) {
    mode = !mode;
    schedule();
    return;
  }
  const held = peekHeld(e);
  if (held === alt) return;
  alt = held;
  schedule();
};
const onBlur = () => {
  if (!alt) return;
  alt = false;
  schedule();
};
const onOver = (e: Event) => {
  const b = blockOf(e.target);
  if (b === hovered) return;
  hovered = b;
  if (alt) schedule();
};

let installed = false;
export function installOriginal() {
  if (installed) return;
  installed = true;
  addEventListener('keydown', onKey, true);
  addEventListener('keyup', onKey, true);
  addEventListener('blur', onBlur);
  document.addEventListener('mouseover', onOver, { passive: true });
}

export function clearOriginal() {
  if (installed) {
    removeEventListener('keydown', onKey, true);
    removeEventListener('keyup', onKey, true);
    removeEventListener('blur', onBlur);
    document.removeEventListener('mouseover', onOver);
    installed = false;
  }
  for (const b of current) {
    hideOriginal(b);
    tools.get(b)?.remove();
  }
  current = new Set();
  document.querySelectorAll('.kbz-tools, .kbz-orig').forEach((n) => n.remove());
  mode = false;
  alt = false;
}
