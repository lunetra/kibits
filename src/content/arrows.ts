// Hover a move chip in the commentary (e.g. "♘ a4") → the site's own arrow for that move appears on the board.
// We draw it exactly like a user does: a right-button drag on the canvas (verified live: synthetic pointer
// events work, and repeating the same drag removes the arrow). So it looks and sizes like the site's arrows,
// takes the board theme's arrow colour, and nothing extra is drawn over the page.
import { Chess } from 'chess.js';
import type { ChipSan } from '../shared/messages';
import { currentPly } from '../site/ply';
import { BOARD_CANVAS, COMMENTARY_SLOT, MOVE_LIST_BUTTON, MOVE_LIST_SAN, REVIEW_PATH_RE, SAN_WRAPPER } from '../site/selectors';

const sansByPly = new Map<number, ChipSan[]>();
let gameId: string | null = null;
let flipped: boolean | null = null;

const gameOf = () => (REVIEW_PATH_RE.test(location.pathname) ? location.pathname.split('/')[2] ?? null : null);

export function setChips(plyIndex: number, sans: ChipSan[]) {
  const g = gameOf();
  if (g !== gameId) {
    gameId = g;
    sansByPly.clear();
  }
  sansByPly.set(plyIndex, sans);
}

export const chipsOf = (plyIndex: number) => sansByPly.get(plyIndex);
export const setFlipped = (f: boolean) => (flipped = f);

/** SANs of the game so far, from the move list ("Nc6+0.6" → "Nc6"). */
function gameMoves(): string[] {
  return [...document.querySelectorAll(MOVE_LIST_BUTTON)].map((b) => (b.querySelector(MOVE_LIST_SAN)?.textContent ?? '').trim());
}

interface Squares { from: string; to: string }

/**
 * Find the move on the board: try the position before the current move (alternatives: "better was …") and
 * after it (follow-ups), preferring the one where it's the chip's colour to move.
 */
export function resolveMove(moves: string[], ply: number, chip: ChipSan): Squares | null {
  const game = new Chess();
  const positions: string[] = [];
  try {
    for (let i = 0; i <= ply && i < moves.length; i++) {
      if (i === ply) positions.push(game.fen()); // before the current move
      game.move(moves[i]!);
    }
  } catch {
    return null;
  }
  positions.push(game.fen()); // after the current move
  const side = chip.color === 'white' ? 'w' : chip.color === 'black' ? 'b' : null;
  const ordered = side ? [...positions].sort((a, b) => Number(b.split(' ')[1] === side) - Number(a.split(' ')[1] === side)) : positions;
  for (const fen of ordered) {
    try {
      const m = new Chess(fen).move(chip.san);
      if (m) return { from: m.from, to: m.to };
    } catch { /* not legal here */ }
  }
  return null;
}

/** The arrow we drew (so the same drag can remove it), or null. */
let drawn: { key: string; ply: number | null; sq: Squares } | null = null;

function squareCenter(canvas: HTMLCanvasElement, square: string) {
  const r = canvas.getBoundingClientRect();
  const s = r.width / 8;
  const f = square.charCodeAt(0) - 97;
  const k = Number(square[1]) - 1;
  const x = flipped ? 7 - f : f;
  const y = flipped ? k : 7 - k;
  return { x: r.left + (x + 0.5) * s, y: r.top + (y + 0.5) * s };
}

/** Right-button drag from → to on the site's board canvas. */
function rightDrag(sq: Squares): boolean {
  const canvas = document.querySelector<HTMLCanvasElement>(BOARD_CANVAS);
  if (!canvas) return false;
  const a = squareCenter(canvas, sq.from);
  const b = squareCenter(canvas, sq.to);
  const ev = (type: string, p: { x: number; y: number }, buttons: number, button: number) =>
    canvas.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y,
        button, buttons, pointerId: 31_337, pointerType: 'mouse', isPrimary: true,
      }),
    );
  ev('pointerdown', a, 2, 2);
  ev('pointermove', b, 2, -1);
  ev('pointerup', b, 0, 2);
  return true;
}

function draw(sq: Squares) {
  const key = `${sq.from}${sq.to}`;
  if (drawn?.key === key) return;
  hide();
  if (rightDrag(sq)) drawn = { key, ply: currentPly(), sq };
}

export function hide() {
  if (!drawn) return;
  const d = drawn;
  drawn = null;
  // The site keeps arrows per position; if the move changed, ours is already gone.
  if (d.ply === currentPly()) rightDrag(d.sq);
}

/** A real click on the board clears the site's arrows: forget ours so we don't draw it back. */
function onBoardPointer(e: PointerEvent) {
  if (drawn && e.isTrusted && e.target instanceof Element && e.target.matches(BOARD_CANVAS)) drawn = null;
}

function chipFor(target: EventTarget | null): { chip: ChipSan } | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(SAN_WRAPPER);
  if (!el) return null;
  // A chip we cloned (retry view) carries its SAN directly.
  const own = el.closest<HTMLElement>('[data-kbz-san]');
  if (own) return { chip: { san: own.dataset.kbzSan!, color: own.dataset.kbzColor as ChipSan['color'] } };
  const slot = el.closest(COMMENTARY_SLOT);
  const ply = currentPly();
  if (!slot || ply === null || ply < 0) return null;
  const chips = [...slot.querySelectorAll(SAN_WRAPPER)];
  const chip = chipsOf(ply)?.[chips.indexOf(el)];
  return chip ? { chip } : null;
}

function onOver(e: Event) {
  const hit = chipFor(e.target);
  hoveringChip = !!hit;
  if (!hit) return;
  clearTimeout(leaveTimer);
  const ply = currentPly();
  if (ply === null || ply < 0) return;
  const sq = resolveMove(gameMoves(), ply, hit.chip);
  if (sq) draw(sq);
}

let leaveTimer: ReturnType<typeof setTimeout> | undefined;

function onOut(e: Event) {
  if (!drawn) return;
  const from = chipFor(e.target);
  const to = chipFor((e as MouseEvent).relatedTarget);
  if (from && to && from.chip.san === to.chip.san) return;
  // Moving between the chip's inner parts, or straight onto another chip, shouldn't flicker.
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => { if (!hoveringChip) hide(); }, 60);
}

let hoveringChip = false;

let installed = false;
export function installArrows() {
  if (installed) return;
  installed = true;
  document.addEventListener('mouseover', onOver, { passive: true });
  document.addEventListener('mouseout', onOut, { passive: true });
  document.addEventListener('pointerdown', onBoardPointer, { capture: true, passive: true });
}

export function uninstallArrows() {
  if (!installed) return;
  installed = false;
  document.removeEventListener('mouseover', onOver);
  document.removeEventListener('mouseout', onOut);
  document.removeEventListener('pointerdown', onBoardPointer, { capture: true });
  hide();
}
