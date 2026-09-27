import { describe, expect, it } from 'vitest';
import { nextSession, type Session } from '../src/content/line';

const chip = { san: 'Na4', color: 'white' as const };
const replay = (landed: number | null = null): Session => ({ entry: 32, branch: 31, replay: { chip, movePly: 32, landed } });
const at = (cur: number | null, exploring = false, busy = false) => ({ cur, exploring, busy, context: 32 });

describe('line session rules', () => {
  it('starts when you play a move off the game yourself', () => {
    expect(nextSession(null, at(-1, true))).toEqual({ entry: 32, branch: 32, replay: null });
    expect(nextSession(null, at(32))).toBeNull();
  });

  it('lives while you explore the line', () => {
    const s = replay();
    expect(nextSession(s, at(-1, true))).toBe(s);
  });

  it('survives Resume (back on the entry move) so you can replay again', () => {
    const s = replay();
    expect(nextSession(s, at(32))).toBe(s);
  });

  it('keeps the branch move (stepping back past the line start) and the landing move', () => {
    expect(nextSession(replay(), at(31))).not.toBeNull();
    expect(nextSession(replay(33), at(33))).not.toBeNull();
  });

  it('ends when you go to any other move', () => {
    expect(nextSession(replay(), at(35))).toBeNull();
    expect(nextSession(replay(), at(0))).toBeNull();
    expect(nextSession(replay(33), at(34))).toBeNull();
  });

  it('ends a line you started yourself as soon as you are back on the game', () => {
    expect(nextSession({ entry: 10, branch: 10, replay: null }, at(10))).toBeNull();
  });

  it('ignores intermediate positions while our own navigation runs', () => {
    const s = replay();
    expect(nextSession(s, at(5, false, true))).toBe(s);
  });
});

describe('replaying the move that was just played', () => {
  it('is not a session (it lands where you already are)', async () => {
    const { resolveMove } = await import('../src/site/moves');
    const moves = ['e4', 'Nc6', 'd4', 'e5', 'd5', 'Nce7'];
    const ply = 5; // commentary of 3...Nce7, chip "Nce7"
    const r = resolveMove(moves, ply, { san: 'Nce7', color: 'black' })!;
    const branch = r.before ? ply - 1 : ply;
    expect(moves[branch + 1] === 'Nce7' ? branch + 1 : null).toBe(ply);
  });
});
