import { describe, expect, it } from 'vitest';
import { findSquares } from '../src/content/squares';

const sq = (t: string) => findSquares(t).map((m) => m.square);

describe('square names in commentary text', () => {
  it('finds lone squares in English and Persian text', () => {
    expect(sq('The queen could go to d2, hitting the loose pawn on f4.')).toEqual(['d2', 'f4']);
    expect(sq('وزیر رو به d2 ببره، پیاده‌ی رهای f4 رو هدف بگیره')).toEqual(['d2', 'f4']);
    expect(sq('روی ⁦c5⁩ رو')).toEqual(['c5']); // bidi-isolated notation
  });

  it('ignores squares inside moves, captures, promotions and words', () => {
    expect(sq('Nf3 exd5 Qxh7+ e8=Q b2b4 h8x')).toEqual([]);
  });

  it('ignores things that only look similar', () => {
    expect(sq('in 1990 the a9 file i1')).toEqual([]);
  });
});
