import { describe, expect, it } from 'vitest';
import { resolveMove } from '../src/content/arrows';

// 1.e4 Nc6 2.d4 e5 3.d5 Nce7
const moves = ['e4', 'Nc6', 'd4', 'e5', 'd5', 'Nce7'];

describe('hover arrows: SAN → squares', () => {
  it('finds an alternative to the current move (position before it)', () => {
    // Current move = ply 1 (…Nc6). "Better was …e5" is Black's alternative.
    expect(resolveMove(moves, 1, { san: 'e5', color: 'black' })).toEqual({ from: 'e7', to: 'e5' });
  });

  it('finds a follow-up (position after the current move)', () => {
    // After 1.e4 Nc6, White's follow-up Nf3.
    expect(resolveMove(moves, 1, { san: 'Nf3', color: 'white' })).toEqual({ from: 'g1', to: 'f3' });
  });

  it('resolves the current move itself', () => {
    expect(resolveMove(moves, 5, { san: 'Nce7', color: 'black' })).toEqual({ from: 'c6', to: 'e7' });
  });

  it('works without colour info', () => {
    expect(resolveMove(moves, 0, { san: 'Nc6' })).toEqual({ from: 'b8', to: 'c6' });
  });

  it('returns null for impossible moves or a broken move list', () => {
    expect(resolveMove(moves, 1, { san: 'Qh5xf7', color: 'white' })).toBeNull();
    expect(resolveMove(['e4', 'garbage'], 1, { san: 'e5' })).toBeNull();
  });
});
