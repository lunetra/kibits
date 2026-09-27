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
  if (hovered && !hits.includes(hovered)) setHover(null);
}

// ---------- hover → mark the square on the board ----------

let hovered: Hit | null = null;
let marked: { square: string; ply: number | null } | null = null;

function setHover(h: Hit | null) {
  if (h?.square === hovered?.square && h?.range === hovered?.range) return;
  hovered = h;
  if (h) CSS.highlights.set('kbz-square-hot', new Highlight(h.range));
  else CSS.highlights.delete('kbz-square-hot');
  // Unmark the previous square (the site keeps marks per position; if the move changed it's gone already).
  if (marked && (!h || marked.square !== h.square)) {
    if (marked.ply === currentPly()) rightClick(marked.square);
    marked = null;
  }
  if (h && !marked) {
    rightClick(h.square);
    marked = { square: h.square, ply: currentPly() };
  }
}

const inside = (r: DOMRect, x: number, y: number) => x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2;

let frame = 0;
function onMove(e: MouseEvent) {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!hits.length) return setHover(null);
    const t = e.target;
    if (!(t instanceof Element) || !t.closest(CONTAINERS)) return setHover(null);
    const h = hits.find((x) => [...x.range.getClientRects()].some((r) => inside(r, e.clientX, e.clientY)));
    setHover(h ?? null);
  });
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
  document.addEventListener('pointerdown', onBoardPointer, { capture: true, passive: true });
}

export function uninstallSquares() {
  if (!installed) return;
  installed = false;
  document.removeEventListener('mousemove', onMove);
  document.removeEventListener('pointerdown', onBoardPointer, { capture: true });
  setHover(null);
  hits = [];
  lastKey = '';
  CSS.highlights.delete('kbz-square');
  CSS.highlights.delete('kbz-square-hot');
}
