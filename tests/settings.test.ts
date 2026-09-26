import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, migrate, translationActive } from '../src/shared/settings';

describe('settings', () => {
  it('fills defaults for empty / corrupt values', () => {
    expect(migrate(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(migrate('x')).toEqual(DEFAULT_SETTINGS);
  });
  it('keeps valid values and drops invalid ones', () => {
    const s = migrate({ enabled: false, translation: { lang: 'de', model: 'nope' }, board: { themeId: 'forest', custom: { light: 'red' } } });
    expect(s.enabled).toBe(false);
    expect(s.translation.lang).toBe('de');
    expect(s.translation.model).toBe(DEFAULT_SETTINGS.translation.model);
    expect(s.board.themeId).toBe('forest');
    expect(s.board.custom.light).toBe(DEFAULT_SETTINGS.board.custom.light);
  });
  it('defaults to the site board', () => {
    expect(DEFAULT_SETTINGS.board.themeId).toBe('default');
  });
  it('knows when translation is active', () => {
    expect(translationActive(DEFAULT_SETTINGS)).toBe(true);
    expect(translationActive({ ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, lang: 'en' } })).toBe(false);
  });
});
