// All board themes / piece sets available to the panel and content script.
import { hexToOklch, hexToRgba01, oklchToHex, shiftLightness, type RGBA } from '../shared/color';
import type { BoardPalette } from '../shared/messages';
import type { Settings } from '../shared/settings';
import { BOARDS, PIECE_SETS } from './manifest.generated';
import { BOARD_PRESETS } from './presets';
import type { BoardTheme, GradientPair } from './types';

export { BOARD_PRESETS, BOARDS, PIECE_SETS };
export type { BoardTheme, PieceSet } from './types';

export const ALL_BOARDS: BoardTheme[] = [...BOARD_PRESETS, ...BOARDS];

/** Custom board: solid colours, or a subtle ±4 % OKLCH lightness gradient (docs/06 §B). */
export function customTheme(c: Settings['board']['custom']): BoardTheme {
  const pair = (hex: string): GradientPair =>
    c.gradient ? { from: shiftLightness(hex, 0.02), to: shiftLightness(hex, -0.02) } : { from: hex, to: hex };
  return { id: 'custom', label: 'Custom', kind: 'preset', light: pair(c.light), dark: pair(c.dark) };
}

export function findBoard(s: Settings): BoardTheme | null {
  const id = s.board.themeId;
  if (id === 'default') return null;
  if (id === 'custom') return customTheme(s.board.custom);
  return ALL_BOARDS.find((b) => b.id === id) ?? null;
}

const rgba = (h: string, alpha = 1): RGBA => {
  const c = hexToRgba01(h);
  c[3] = alpha;
  return c;
};

/** Accent hue: the theme's own, else the dark squares' hue, else the pieces' violet for near-grays. */
export function accentHueOf(t: BoardTheme): number {
  if (t.accentHue != null) return t.accentHue;
  const [, C, h] = hexToOklch(t.dark.from);
  return C < 0.015 ? 290 : h;
}

/**
 * Every colour the board draws, derived from the square colours and one accent hue (OKLCH), so highlights,
 * arrows and coordinates always belong to the board. Tuned with `npm run preview:boards`.
 */
export function boardPalette(t: BoardTheme): BoardPalette {
  const H = accentHueOf(t);
  const ok = (L: number, C: number, h: number, a = 1) => rgba(oklchToHex(L, C, h), a);
  return {
    dark: [rgba(t.dark.from), rgba(t.dark.to)],
    light: [rgba(t.light.from), rgba(t.light.to)],
    coords: { dark: rgba(t.dark.from), light: rgba(t.light.from) },
    move: { from: ok(0.6, 0.058, H), to: ok(0.66, 0.066, H) },
    selected: ok(0.63, 0.075, H, 0.8),
    guided: ok(0.58, 0.1, H),
    // Keep marks/check in the warm-red family so a check still reads as danger, just calmer than the site's.
    mark: { center: ok(0.8, 0.055, 35), edge: ok(0.6, 0.14, 28) },
    arrow: ok(0.74, 0.085, H, 0.8),
  };
}

export function boardToConfig(t: BoardTheme | null): BoardPalette | null {
  return t ? boardPalette(t) : null;
}
