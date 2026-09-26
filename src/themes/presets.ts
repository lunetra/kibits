// Built-in dark, low-glare board colour presets, tuned for the site's default ("Clean") pieces.
//
// The site's pieces (measured from its regular4x atlas): white = #FCFCFC body with a #504464 violet outline;
// black = an opaque dark violet-gray body (~#3E3850) with a #201C28 outline and a soft white halo.
// So the squares sit in the middle of the lightness range: dark squares clearly lighter than the black
// pieces, light squares clearly darker than the white pieces, and both well below glare level.
//
// Designed in OKLCH so every preset has the same perceived brightness:
//   light squares L 0.69–0.70, dark squares L 0.54–0.55, low chroma (≤ 0.042).
//   → ≈1.8:1 contrast between square types: the grid reads calmly, the pieces carry the contrast.
// Gradients are subtle: from/to = L ± 0.012 (same hue and chroma).
// Preview any change with the site's real pieces: `npm run preview:boards` (see scripts/preview-boards.ts).
import { oklchToHex } from '../shared/color';
import type { BoardTheme } from './types';

/** [L, C, h] */
type Oklch = readonly [number, number, number];

const G = 0.012;

function preset(id: string, label: string, mood: string, light: Oklch, dark: Oklch): BoardTheme {
  const pair = ([L, C, h]: Oklch) => ({ from: oklchToHex(L + G, C, h), to: oklchToHex(L - G, C, h) });
  return { id, label, mood, kind: 'preset', light: pair(light), dark: pair(dark) };
}

export const BOARD_PRESETS: BoardTheme[] = [
  preset('graphite', 'Graphite', 'Neutral gray with a hint of the pieces’ violet', [0.69, 0.008, 285], [0.545, 0.012, 285]),
  preset('forest', 'Forest', 'Muted deep green', [0.69, 0.032, 155], [0.54, 0.042, 160]),
  preset('slate', 'Slate', 'Night blue-gray', [0.69, 0.024, 255], [0.54, 0.036, 262]),
  preset('petrol', 'Petrol', 'Dark teal', [0.69, 0.028, 205], [0.54, 0.038, 212]),
  preset('olive', 'Olive', 'Dim olive and moss', [0.7, 0.034, 115], [0.55, 0.04, 120]),
  preset('espresso', 'Espresso', 'Dimmed walnut', [0.69, 0.028, 65], [0.545, 0.036, 55]),
  preset('dusk', 'Dusk', 'Muted plum, close to the site’s own tone', [0.69, 0.026, 305], [0.545, 0.036, 300]),
  preset('ash', 'Ash', 'Warm neutral gray', [0.7, 0.012, 75], [0.55, 0.014, 70]),
];
