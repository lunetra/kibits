import { describe, expect, it } from 'vitest';
import { cleanOutput, validate } from '../src/background/validate';
import { findNotation, isolateNotation } from '../src/shared/notation';

describe('notation', () => {
  it('finds moves, squares, scores', () => {
    expect(findNotation('After 12...Rd8 and Bxf7+ the e5 pawn falls, O-O-O, e8=Q, +1.2, #3')).toEqual([
      'Rd8', 'Bxf7+', 'e5', 'O-O-O', 'e8=Q', '+1.2', '#3',
    ]);
  });
  it('does not match ordinary words', () => {
    expect(findNotation('White castles and develops a knight.')).toEqual([]);
  });
  it('wraps notation in LRI/PDI', () => {
    expect(isolateNotation('با Nf3')).toBe('با ⁦Nf3⁩');
  });
});

describe('validate', () => {
  const src = 'A blunder! After Qxd5, Black loses the exchange to a knight fork on c7 via ⟦0⟧.';
  it('accepts a good Persian translation', () => {
    const r = validate(src, 'اشتباه فاحش! پس از Qxd5، سیاه با چنگال اسب روی c7 از طریق ⟦0⟧ کیفیت را از دست می‌دهد.', 'fa');
    expect(r.ok).toBe(true);
  });
  it('rejects lost placeholders', () => {
    expect(validate(src, 'اشتباه فاحش! پس از Qxd5، سیاه با چنگال اسب روی c7 کیفیت را از دست می‌دهد.', 'fa')).toMatchObject({ ok: false });
  });
  it('rejects altered notation', () => {
    expect(validate(src, 'Ein grober Fehler! Nach Dxd5 verliert Schwarz durch eine Springergabel auf c7 über ⟦0⟧ die Qualität.', 'de')).toMatchObject({ ok: false });
  });
  it('rejects absurd length', () => {
    expect(validate(src, 'بد ⟦0⟧ Qxd5 c7', 'fa')).toMatchObject({ ok: false });
  });
  it('normalizes Arabic letters and strips prefixes', () => {
    expect(cleanOutput('Translation: «يك كيش»', 'fa')).toBe('یک کیش');
  });
});
