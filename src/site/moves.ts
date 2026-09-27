// Game moves and SAN → squares, shared by the page-world hook (bogus-chip cleanup) and the content script
// (hover arrows, replay). The move list is always in the DOM (hidden on the Commentary tab).
import { Chess } from 'chess.js';
import type { ChipSan } from '../shared/messages';
import { MOVE_LIST_BUTTON, MOVE_LIST_SAN } from './selectors';

/** SANs of the game so far, from the move list ("Nc6+0.6" → "Nc6"). */
export function gameMoves(): string[] {
  return [...document.querySelectorAll(MOVE_LIST_BUTTON)].map((b) => (b.querySelector(MOVE_LIST_SAN)?.textContent ?? '').trim());
}

export interface Squares { from: string; to: string }
/** `before`: the move belongs to the position before the current move (an alternative), else after it. */
export interface Resolved extends Squares { before: boolean }

/**
 * Find the move on the board: try the position before the current move (alternatives: "better was …") and
 * after it (follow-ups), preferring the one where it's the chip's colour to move.
 */
export function resolveMove(moves: string[], ply: number, chip: ChipSan): Resolved | null {
  const game = new Chess();
  const positions: string[] = [];
  let beforeFen = '';
  try {
    for (let i = 0; i <= ply && i < moves.length; i++) {
      if (i === ply) positions.push((beforeFen = game.fen())); // before the current move
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
      if (m) return { from: m.from, to: m.to, before: fen === beforeFen };
    } catch { /* not legal here */ }
  }
  return null;
}


/** Is this chip a real move in the commentary's position (before or after game move `ply`)? */
export const isRealMove = (moves: string[], ply: number, chip: ChipSan) => resolveMove(moves, ply, chip) !== null;
