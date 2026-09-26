/**
 * Render every board preset with the site's real pieces, to tune colours before shipping.
 *
 *   npm run preview:boards -- <site-atlas-4x.png> [out.png]
 *
 * Get the atlas from the site: DevTools → Network → filter "regular4x" → open the PNG → save it.
 */
import sharp, { type OverlayOptions } from 'sharp';
import { contrast } from '../src/shared/color';
import { BOARD_PRESETS } from '../src/themes/presets';

const [atlasPath, out = 'board-presets.png'] = process.argv.slice(2);
if (!atlasPath) {
  console.error('usage: npm run preview:boards -- <site-atlas-4x.png> [out.png]');
  process.exit(1);
}

const CELL = 100;
const atlas = await sharp(atlasPath).resize(4 * CELL, 4 * CELL).png().toBuffer();
const piece = (c: number, r: number) =>
  sharp(atlas).extract({ left: c * CELL, top: r * CELL, width: CELL, height: CELL }).png().toBuffer();
// Atlas cells (SITE-MAP §4b): black row R N B Q K P, white row R N B Q K P.
const BLACK: Array<[number, number]> = [[2, 0], [3, 0], [0, 1], [1, 0], [0, 0], [1, 1]];
const WHITE: Array<[number, number]> = [[2, 2], [3, 2], [0, 3], [1, 2], [0, 2], [1, 3]];

const W = 6 * CELL, H = 3 * CELL, PAD = 30, LABEL = 24;
const layers: OverlayOptions[] = [];
for (const [i, p] of BOARD_PRESETS.entries()) {
  const ox = (i % 2) * (W + PAD);
  const oy = Math.floor(i / 2) * (H + PAD + LABEL);
  for (let r = 0; r < 3; r++)
    for (let f = 0; f < 6; f++) {
      const light = (r + f) % 2 === 0;
      const { from, to } = light ? p.light : p.dark;
      const svg = `<svg width="${CELL}" height="${CELL}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
      layers.push({ input: Buffer.from(svg), left: ox + f * CELL, top: oy + LABEL + r * CELL });
    }
  for (let f = 0; f < 6; f++) {
    layers.push({ input: await piece(...BLACK[f]!), left: ox + f * CELL, top: oy + LABEL });
    layers.push({ input: await piece(...WHITE[f]!), left: ox + f * CELL, top: oy + LABEL + 2 * CELL });
  }
  const label = `${p.label}  ${p.light.from} / ${p.dark.from}  ${contrast(p.light.from, p.dark.from).toFixed(2)}:1`;
  layers.push({ input: Buffer.from(`<svg width="${W}" height="${LABEL}"><text x="4" y="17" font-family="Helvetica" font-size="16" fill="#ddd">${label}</text></svg>`), left: ox, top: oy });
}
const rows = Math.ceil(BOARD_PRESETS.length / 2);
await sharp({ create: { width: 2 * W + PAD, height: rows * (H + PAD + LABEL), channels: 4, background: '#141416' } })
  .composite(layers)
  .png()
  .toFile(out);
console.log(`wrote ${out}`);
