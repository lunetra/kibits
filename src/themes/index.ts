// All board themes / piece sets available to the panel and content script.
import { hexToRgba01, shiftLightness, type RGBA } from '../shared/color';
import type { MainConfig } from '../shared/messages';
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

const rgba = (h: string): RGBA => hexToRgba01(h);

export function boardToConfig(t: BoardTheme | null): MainConfig['board'] {
  if (!t) return null;
  return { dark: [rgba(t.dark.from), rgba(t.dark.to)], light: [rgba(t.light.from), rgba(t.light.to)] };
}
