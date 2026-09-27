// Square names in the commentary text ("d2", "f4"): subtly underlined, and hovering one marks that square on
// the board (the site's own right-click highlight), so it's easy to find.
//
// The text belongs to React, so we don't wrap it: the CSS Custom Highlight API styles text ranges without
// touching the DOM. Works for translated and English commentary alike (no translation involved).
import { currentPly } from '../site/ply';
import { COMMENTARY_SLOT, SAN_WRAPPER, SUMMARY_TEXT } from '../site/selectors';
import { rightClick } from './board';

const CONTAINERS = `${COMMENTARY_SLOT}, .kbz-tr, .kbz-orig, ${SUMMARY_TEXT}`;
/** Text we never scan: move chips/links and our own controls. */
const SKIP = `${SAN_WRAPPER}, button, a, .kbz-line, .kbz-tools, .kbz-fail, .kbz-skel`;
/** A lone square: not part of SAN ("Nf3", "exd5"), not a promotion ("e8=Q"), not inside a word. */
const SQUARE_RE = /(?<![A-Za-z0-9=])([a-h][1-8])(?![A-Za-z0-9=])/g;

interface Hit { range: Range; square: string }

let hits: Hit[] = [];
let lastKey = '';
const supported = () => typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

export function findSquares(text: string): Array<{ index: number; square: string }> {
  return [...text.matchAll(SQUARE_RE)].map((m) => ({ index: m.index!, square: m[1]! }));
}

/** Rebuild the highlighted ranges when the commentary text changed. Called from the lifecycle scan. */
export function scanSquares() {
  if (!supported()) return;
  const roots = [...document.querySelectorAll<HTMLElement>(CONTAINERS)].filter((el) => el.offsetParent !== null);
  const key = roots.map((r) => r.textContent).join('␞');
  if (key === lastKey && hits.every((h) => h.range.startContainer.isConnected)) return;
  lastKey = key;
  hits = [];
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      for (const { index, square } of findSquares(n.textContent ?? '')) {
        const range = new Range();
        range.setStart(n, index);
        range.setEnd(n, index + 2);
        hits.push({ range, square });
      }
    }
  }
  CSS.highlights.set('kbz-square', new Highlight(...hits.map((h) => h.range)));
  // The site re-renders the commentary (new text nodes) e.g. right after we mark a square. That must not
  // count as "mouse left": re-check what's under the pointer; the mark stays if it's the same square.
  if (hovered) evaluate();
}

// ---------- hover → mark the square on the board ----------

let hovered: Hit | null = null;
let marked: { square: string; ply: number | null } | null = null;
let pointer: { x: number; y: number; target: EventTarget | null } | null = null;

/**
 * Hover state is "which square name is under the pointer". The board is touched only when that changes:
 * one right-click to mark on enter, one to unmark on leave — exactly like doing it by hand.
 */
function setHover(h: Hit | null) {
  hovered = h;
  if (h) CSS.highlights.set('kbz-square-hot', new Highlight(h.range));
  else CSS.highlights.delete('kbz-square-hot');
  const want = h?.square ?? null;
  if (marked?.square === want) return;
  if (marked) {
    // The site keeps marks per position; if the move changed, it's gone already.
    if (marked.ply === currentPly()) rightClick(marked.square);
    marked = null;
  }
  if (want) {
    rightClick(want);
    marked = { square: want, ply: currentPly() };
  }
}

const inside = (r: DOMRect, x: number, y: number) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1;

function evaluate() {
  if (!pointer || !hits.length) return setHover(null);
  const { x, y, target } = pointer;
  if (!(target instanceof Element) || !target.isConnected || !target.closest(CONTAINERS)) {
    // The element under the pointer may have been replaced by a re-render: ask the page again.
    const el = document.elementFromPoint(x, y);
    if (!el?.closest(CONTAINERS)) return setHover(null);
  }
  setHover(hits.find((h) => [...h.range.getClientRects()].some((r) => inside(r, x, y))) ?? null);
}

let frame = 0;
function onMove(e: MouseEvent) {
  pointer = { x: e.clientX, y: e.clientY, target: e.target };
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    evaluate();
  });
}

function onLeave() {
  pointer = null;
  setHover(null);
}

/** A real click on the board: the site may clear marks itself, so forget ours. */
function onBoardPointer(e: PointerEvent) {
  if (marked && e.isTrusted && e.target instanceof Element && e.target.closest('[aria-label="Game board"]')) marked = null;
}

let installed = false;
export function installSquares() {
  if (installed || !supported()) return;
  installed = true;
  document.addEventListener('mousemove', onMove, { passive: true });
  document.documentElement.addEventListener('mouseleave', onLeave, { passive: true });
  document.addEventListener('pointerdown', onBoardPointer, { capture: true, passive: true });
}

export function uninstallSquares() {
  if (!installed) return;
  installed = false;
  document.removeEventListener('mousemove', onMove);
  document.documentElement.removeEventListener('mouseleave', onLeave);
  document.removeEventListener('pointerdown', onBoardPointer, { capture: true });
  setHover(null);
  hits = [];
  lastKey = '';
  CSS.highlights.delete('kbz-square');
  CSS.highlights.delete('kbz-square-hot');
}
