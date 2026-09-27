// Square names in the commentary text ("d2", "f4") get a small box. Hovering the box marks that square on
// the board (the site's own right-click highlight), leaving it clears the mark.
//
// The text belongs to React, so we never wrap it. Instead we find each square name as a text Range and put
// a box over it. The boxes live in a zero-height, position:relative layer at the top of the commentary's
// scroll container (the container itself is `position: static`, and changing that could move the site's
// own absolutely positioned bits), so they scroll and clip with the text without affecting layout.
// Boxes are a little larger than the text: easy to hover.
import { currentPly } from '../site/ply';
import { COMMENTARY_SLOT, REVIEW_SCROLL, SAN_WRAPPER, SUMMARY_TEXT } from '../site/selectors';
import { rightClick } from './board';

const CONTAINERS = `${COMMENTARY_SLOT}, .kbz-tr, .kbz-orig, ${SUMMARY_TEXT}`;
/** Text we never scan: move chips/links and our own controls. */
const SKIP = `${SAN_WRAPPER}, button, a, .kbz-line, .kbz-tools, .kbz-fail, .kbz-skel, .kbz-sq-layer`;
/** A lone square: not part of SAN ("Nf3", "exd5"), not a promotion ("e8=Q"), not inside a word. */
const SQUARE_RE = /(?<![A-Za-z0-9=])([a-h][1-8])(?![A-Za-z0-9=])/g;
/** Extra hover area around the text, in px. */
const PAD_X = 4;
const PAD_Y = 1;

export function findSquares(text: string): Array<{ index: number; square: string }> {
  return [...text.matchAll(SQUARE_RE)].map((m) => ({ index: m.index!, square: m[1]! }));
}

interface Hit { range: Range; square: string; box: HTMLElement; layer: HTMLElement }

let hits: Hit[] = [];
let lastKey = '';
const layers = new Set<HTMLElement>();

function layerFor(root: Element): HTMLElement | null {
  const scroller = root.closest<HTMLElement>(REVIEW_SCROLL);
  if (!scroller) return null;
  let layer = scroller.querySelector<HTMLElement>(':scope > .kbz-sq-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'kbz-sq-layer';
    layer.setAttribute('aria-hidden', 'true');
  }
  if (scroller.firstElementChild !== layer) scroller.prepend(layer);
  layers.add(layer);
  return layer;
}

function makeBox(square: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'kbz-sq';
  box.title = `Square ${square}`;
  box.addEventListener('mouseenter', () => setHover(square, box));
  box.addEventListener('mouseleave', () => setHover(null, null));
  return box;
}

/** Position every box over its text, relative to its layer (which scrolls with the content). */
function layout() {
  for (const h of hits) {
    const base = h.layer.getBoundingClientRect();
    const r = h.range.getClientRects()[0];
    if (!r || !r.width) {
      h.box.hidden = true;
      continue;
    }
    h.box.hidden = false;
    Object.assign(h.box.style, {
      left: `${r.left - base.left - PAD_X}px`,
      top: `${r.top - base.top - PAD_Y}px`,
      width: `${r.width + PAD_X * 2}px`,
      height: `${r.height + PAD_Y * 2}px`,
    });
  }
}

let layoutFrame = 0;
const scheduleLayout = () => {
  if (layoutFrame) return;
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    layout();
  });
};
let resizeObserver: ResizeObserver | null = null;
/** Created on first use (keeps this module importable where ResizeObserver doesn't exist, e.g. tests). */
const resizes = () => (resizeObserver ??= new ResizeObserver(scheduleLayout));

/** Rebuild boxes when the commentary text changed, re-place them otherwise. Called from the lifecycle scan. */
export function scanSquares() {
  const roots = [...document.querySelectorAll<HTMLElement>(CONTAINERS)].filter((el) => el.offsetParent !== null);
  const key = roots.map((r) => r.textContent).join('␞');
  const fresh = hits.every((h) => h.range.startContainer.isConnected && h.box.isConnected);
  if (key === lastKey && fresh) return scheduleLayout();
  lastKey = key;

  const hoveredSquare = hovered;
  for (const h of hits) h.box.remove();
  hits = [];
  resizes().disconnect();
  for (const root of roots) {
    const layer = layerFor(root);
    if (!layer) continue;
    resizes().observe(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      for (const { index, square } of findSquares(n.textContent ?? '')) {
        const range = new Range();
        range.setStart(n, index);
        range.setEnd(n, index + 2);
        const box = makeBox(square);
        layer.append(box);
        hits.push({ range, square, box, layer });
      }
    }
  }
  layout();
  // The site re-renders the commentary (e.g. right after we mark a square). That's not "mouse left":
  // if the pointer is still over a box for the same square, keep the mark.
  if (hoveredSquare) {
    const still = hits.find((h) => h.square === hoveredSquare && h.box.matches(':hover'));
    setHover(still ? still.square : null, still?.box ?? null);
  }
}

// ---------- hover → mark the square on the board ----------

let hovered: string | null = null;
let marked: { square: string; ply: number | null } | null = null;

/** One right-click to mark on enter, one to unmark on leave: exactly like doing it by hand. */
function setHover(square: string | null, box: HTMLElement | null) {
  for (const h of hits) h.box.classList.toggle('hot', h.box === box);
  hovered = square;
  if (marked?.square === square) return;
  if (marked) {
    // The site keeps marks per position; if the move changed, it's gone already.
    if (marked.ply === currentPly()) rightClick(marked.square);
    marked = null;
  }
  if (square) {
    rightClick(square);
    marked = { square, ply: currentPly() };
  }
}

/** A real click on the board: the site may clear marks itself, so forget ours. */
function onBoardPointer(e: PointerEvent) {
  if (marked && e.isTrusted && e.target instanceof Element && e.target.closest('[aria-label="Game board"]')) marked = null;
}

let installed = false;
export function installSquares() {
  if (installed) return;
  installed = true;
  document.addEventListener('pointerdown', onBoardPointer, { capture: true, passive: true });
  addEventListener('resize', scheduleLayout, { passive: true });
  document.fonts?.addEventListener?.('loadingdone', scheduleLayout);
}

export function uninstallSquares() {
  if (!installed) return;
  installed = false;
  document.removeEventListener('pointerdown', onBoardPointer, { capture: true });
  removeEventListener('resize', scheduleLayout);
  document.fonts?.removeEventListener?.('loadingdone', scheduleLayout);
  setHover(null, null);
  resizeObserver?.disconnect();
  for (const l of layers) l.remove();
  layers.clear();
  hits = [];
  lastKey = '';
}
