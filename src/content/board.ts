// Driving the site's board like a user would (verified live, docs/SITE-MAP.md §4c):
// - board input only accepts synthetic events with the mouse's own pointer id (1) plus mouse events;
// - right-button drag draws an arrow, and the same drag again removes it;
// - click piece → click square plays a move with the site's normal animation (a drag-drop lands instantly);
// - ArrowLeft/ArrowRight step through the game *and* through a line you're exploring (the site's own ‹ ›
//   buttons are disabled inside a variation);
// - clicking a game move in the (hidden) move list jumps there and leaves any line.
import type { Squares } from '../site/moves';
import { BOARD_CANVAS, GO_TO_START, MOVE_LIST_BUTTON } from '../site/selectors';

let flipped: boolean | null = null;
export const setFlipped = (f: boolean) => (flipped = f);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Pt = { x: number; y: number };

function squareCenter(canvas: HTMLCanvasElement, square: string): Pt {
  const r = canvas.getBoundingClientRect();
  const s = r.width / 8;
  const f = square.charCodeAt(0) - 97;
  const k = Number(square[1]) - 1;
  const x = flipped ? 7 - f : f;
  const y = flipped ? k : 7 - k;
  return { x: r.left + (x + 0.5) * s, y: r.top + (y + 0.5) * s };
}

function fire(canvas: HTMLCanvasElement, type: string, p: Pt, buttons: number, button: number) {
  canvas.dispatchEvent(
    new PointerEvent(`pointer${type}`, {
      bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y,
      button: type === 'move' ? -1 : button, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true,
      pressure: buttons ? 0.5 : 0,
    }),
  );
  canvas.dispatchEvent(new MouseEvent(`mouse${type}`, { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button, buttons }));
}

const canvas = () => document.querySelector<HTMLCanvasElement>(BOARD_CANVAS);

/** Right-button drag from → to: draws the site's arrow, or removes it if it's already there. */
export function rightDrag(sq: Squares): boolean {
  const c = canvas();
  if (!c) return false;
  const a = squareCenter(c, sq.from);
  const b = squareCenter(c, sq.to);
  fire(c, 'move', a, 0, 2);
  fire(c, 'down', a, 2, 2);
  for (let k = 1; k <= 4; k++) fire(c, 'move', { x: a.x + ((b.x - a.x) * k) / 4, y: a.y + ((b.y - a.y) * k) / 4 }, 2, 2);
  fire(c, 'up', b, 0, 2);
  return true;
}

/**
 * Click the piece, then its target square. Both clicks go out in the same task, so the site never paints a
 * frame with the piece selected: no legal-move dots, and the move keeps the site's own animation.
 */
export function clickMove(sq: Squares): boolean {
  const c = canvas();
  if (!c) return false;
  for (const square of [sq.from, sq.to]) {
    const p = squareCenter(c, square);
    fire(c, 'move', p, 0, 0);
    fire(c, 'down', p, 1, 0);
    fire(c, 'up', p, 0, 0);
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0 }));
  }
  return true;
}

/** Step back/forward (in the game, or in the line you're exploring). */
export function step(dir: -1 | 1) {
  const key = dir < 0 ? 'ArrowLeft' : 'ArrowRight';
  document.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
  document.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true, cancelable: true }));
}

/** Jump to game move `ply` (-1 = the starting position). Leaves any line you're exploring. */
export function goToGamePly(ply: number) {
  if (ply >= 0) document.querySelectorAll<HTMLElement>(MOVE_LIST_BUTTON)[ply]?.click();
  else document.querySelector<HTMLElement>(GO_TO_START)?.click();
}

/** Right-click a square: marks it (the site's square highlight), or clears the mark if it's already there. */
export function rightClick(square: string): boolean {
  const c = canvas();
  if (!c) return false;
  const p = squareCenter(c, square);
  fire(c, 'move', p, 0, 2);
  fire(c, 'down', p, 2, 2);
  fire(c, 'up', p, 0, 2);
  return true;
}
