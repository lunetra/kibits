/**
 * assets/ → public/themes/** + public/fonts/* + src/themes/manifest.generated.ts
 *
 * - Piece sets (assets/pieces/<set>/*.svg): 4×4 PNG atlases at 1x/2x/4x in the site's layout (docs/06 §A),
 *   calibrated on the white king so every set matches the site's piece size and baseline.
 * - Boards (assets/boards/*.{jpg,png,webp,svg}): light/dark gradient colours derived from the image,
 *   plus a 96-px thumbnail of the original (docs/06 §B).
 * - Fonts: copies the Vazirmatn woff2 files that the content script loads into the page.
 *
 * Run: npm run themes (also runs automatically before npm run build).
 */
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const OUT = path.join(ROOT, 'public', 'themes');
const MANIFEST = path.join(ROOT, 'src', 'themes', 'manifest.generated.ts');

const PIECES = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'] as const;
type Piece = (typeof PIECES)[number];
/** Atlas cell per piece: [col, row] (SITE-MAP §4b). */
const LAYOUT: Record<Piece, [number, number]> = {
  bK: [0, 0], bQ: [1, 0], bR: [2, 0], bN: [3, 0],
  bB: [0, 1], bP: [1, 1],
  wK: [0, 2], wQ: [1, 2], wR: [2, 2], wN: [3, 2],
  wB: [0, 3], wP: [1, 3],
};
const RES = { '1': 200, '2': 400, '4': 800 } as const;

const errors: string[] = [];
const warn = (m: string) => console.warn(`  ! ${m}`);

const titleCase = (id: string) => id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function listDirs(dir: string) {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of await readdir(dir)) if ((await stat(path.join(dir, e))).isDirectory()) out.push(e);
  return out.sort();
}

// ---------------------------------------------------------------- pieces

const NAME_VARIANTS: Array<[RegExp, (m: RegExpMatchArray) => Piece | null]> = [
  // wK, bq, WK
  [/^([wb])([kqrbnp])$/i, (m) => `${m[1]!.toLowerCase()}${m[2]!.toUpperCase()}` as Piece],
  // white-king, black_knight, white king
  [/^(white|black)[-_ ]?(king|queen|rook|bishop|knight|pawn)$/i, (m) => {
    const c = m[1]!.toLowerCase() === 'white' ? 'w' : 'b';
    const p = { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: 'P' }[m[2]!.toLowerCase()]!;
    return `${c}${p}` as Piece;
  }],
];

function normalizePieceName(base: string, files: string[]): Piece | null {
  for (const [re, fn] of NAME_VARIANTS) {
    const m = base.match(re);
    if (m) return fn(m);
  }
  // FEN style: K.svg / k.svg — only unambiguous on case-sensitive names and when both cases exist.
  if (/^[kqrbnp]$/i.test(base)) {
    const hasBoth = files.some((f) => f.startsWith(base.toLowerCase() + '.')) && files.some((f) => f.startsWith(base.toUpperCase() + '.'));
    if (!hasBoth) return null;
    return `${base === base.toUpperCase() ? 'w' : 'b'}${base.toUpperCase()}` as Piece;
  }
  return null;
}

interface SetConfig { scale: number; baseline: number; label?: string }

/** Opaque bbox of a rendered SVG in a size×size box (fit: contain). */
async function renderBox(svg: Buffer, size: number) {
  return sharp(svg, { density: 300 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function alphaBBox(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new Error('empty image');
  return { x0, y0, x1: x1 + 1, y1: y1 + 1, size: info.width };
}

async function buildPieceSet(dir: string, id: string) {
  const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.svg'));
  const map = new Map<Piece, string>();
  const unknown: string[] = [];
  for (const f of files) {
    const p = normalizePieceName(path.basename(f, path.extname(f)), files);
    if (p) map.set(p, path.join(dir, f));
    else unknown.push(f);
  }
  const missing = PIECES.filter((p) => !map.has(p));
  if (missing.length) {
    errors.push(
      `pieces/${id}: missing ${missing.join(', ')}` +
        (unknown.length ? ` (unrecognized files: ${unknown.join(', ')} — rename to wK.svg … bP.svg)` : ''),
    );
    return null;
  }

  const cfgPath = path.join(dir, 'set.json');
  const cfg: SetConfig = { scale: 0.885, baseline: 0.925 };
  if (existsSync(cfgPath)) Object.assign(cfg, JSON.parse(await readFile(cfgPath, 'utf8')));

  const svgs = new Map<Piece, Buffer>();
  for (const p of PIECES) svgs.set(p, await readFile(map.get(p)!));

  // Calibrate on the white king: bbox height → scale × cell, bbox bottom → baseline × cell.
  const CAL = 1024;
  const kb = await alphaBBox(await renderBox(svgs.get('wK')!, CAL));
  const hK = (kb.y1 - kb.y0) / CAL;
  const bottomK = kb.y1 / CAL;
  const cxK = (kb.x0 + kb.x1) / 2 / CAL;

  const outDir = path.join(OUT, 'pieces', id);
  await mkdir(outDir, { recursive: true });

  for (const [res, width] of Object.entries(RES)) {
    const cell = width / 4;
    const box = Math.max(1, Math.round((cfg.scale * cell) / hK));
    const left = Math.round(cell / 2 - cxK * box);
    const top = Math.round(cfg.baseline * cell - bottomK * box);
    const layers: OverlayOptions[] = [];
    for (const p of PIECES) {
      const img = await renderBox(svgs.get(p)!, box);
      // Crop to the cell (box may overflow when a set has a lot of viewBox padding).
      const sx = Math.max(0, -left), sy = Math.max(0, -top);
      const w = Math.min(box - sx, cell - Math.max(0, left));
      const h = Math.min(box - sy, cell - Math.max(0, top));
      const piece = await sharp(img).extract({ left: sx, top: sy, width: w, height: h }).png().toBuffer();
      const [col, row] = LAYOUT[p];
      layers.push({ input: piece, left: col * cell + Math.max(0, left), top: row * cell + Math.max(0, top) });
    }
    const atlas = sharp({ create: { width, height: width, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(layers).png({ compressionLevel: 9 });
    const file = path.join(outDir, `atlas-${res}x.png`);
    await atlas.toFile(file);
    const meta = await sharp(file).metadata();
    if (meta.width !== width || meta.height !== width) errors.push(`pieces/${id}: atlas-${res}x is ${meta.width}×${meta.height}, expected ${width}×${width}`);
  }

  // Preview for the panel: wN + bQ + wK on one row.
  const P = 64;
  const tiles = await Promise.all((['wN', 'bQ', 'wK'] as Piece[]).map((p) => renderBox(svgs.get(p)!, P)));
  await sharp({ create: { width: P * 3, height: P, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(tiles.map((input, i) => ({ input, left: i * P, top: 0 })))
    .png()
    .toFile(path.join(outDir, 'preview.png'));

  return {
    id,
    label: cfg.label ?? titleCase(id),
    atlas: {
      '1': `themes/pieces/${id}/atlas-1x.png`,
      '2': `themes/pieces/${id}/atlas-2x.png`,
      '4': `themes/pieces/${id}/atlas-4x.png`,
    },
    preview: `themes/pieces/${id}/preview.png`,
  };
}

// ---------------------------------------------------------------- boards

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const hex = (c: number[]) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('').toUpperCase();
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]!; };

async function buildBoard(file: string) {
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  const id = slug(base);
  const jsonPath = path.join(path.dirname(file), `${base}.json`);
  const override: { light?: string; dark?: string; gradient?: boolean; label?: string; type?: string } =
    existsSync(jsonPath) ? JSON.parse(await readFile(jsonPath, 'utf8')) : {};

  const N = 512, SQ = N / 8;
  const img = sharp(file, { density: 150 }).removeAlpha();
  const src = override.type === 'tile'
    ? // Small tileable texture: repeat it to a full board first.
      await sharp({ create: { width: N, height: N, channels: 3, background: '#000' } })
        .composite([{ input: await img.resize(SQ * 2, SQ * 2, { fit: 'cover' }).toBuffer(), tile: true, left: 0, top: 0 }])
        .raw().toBuffer({ resolveWithObject: true })
    : await img.resize(N, N, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const { data, info } = src;
  const ch = info.channels;

  const groups: [number[][], number[][]] = [[], []];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const rs: number[] = [], gs: number[] = [], bs: number[] = [];
      const m = Math.round(SQ * 0.2);
      for (let y = r * SQ + m; y < (r + 1) * SQ - m; y += 2)
        for (let x = f * SQ + m; x < (f + 1) * SQ - m; x += 2) {
          const i = (y * info.width + x) * ch;
          rs.push(data[i]!); gs.push(data[i + 1]!); bs.push(data[i + 2]!);
        }
      groups[(r + f) % 2 as 0 | 1].push([median(rs), median(gs), median(bs)]);
    }

  const summarize = (sq: number[][]) => {
    const byL = [...sq].sort((a, b) => lum(a[0]!, a[1]!, a[2]!) - lum(b[0]!, b[1]!, b[2]!));
    const med = [0, 1, 2].map((k) => median(sq.map((c) => c[k]!)));
    const p80 = byL[Math.floor(byL.length * 0.8)]!;
    const p20 = byL[Math.floor(byL.length * 0.2)]!;
    // Keep the gradient subtle: blend the percentiles halfway toward the median.
    const from = p80.map((v, k) => (v + med[k]!) / 2);
    const to = p20.map((v, k) => (v + med[k]!) / 2);
    return { med, from, to, L: lum(med[0]!, med[1]!, med[2]!) };
  };
  let [a, b] = [summarize(groups[0]), summarize(groups[1])];
  if (a.L < b.L) [a, b] = [b, a]; // lighter group = light squares

  const pair = (s: typeof a, forced?: string) =>
    forced ? { from: forced, to: forced } : override.gradient === false ? { from: hex(s.med), to: hex(s.med) } : { from: hex(s.from), to: hex(s.to) };

  const outDir = path.join(OUT, 'boards');
  await mkdir(outDir, { recursive: true });
  await sharp(file, { density: 150 }).resize(96, 96, { fit: 'cover' }).webp({ quality: 82 }).toFile(path.join(outDir, `${id}.thumb.webp`));

  return {
    id: `lichess-${id}`,
    label: override.label ?? titleCase(base),
    kind: 'lichess' as const,
    light: pair(a, override.light),
    dark: pair(b, override.dark),
    thumb: `themes/boards/${id}.thumb.webp`,
  };
}

// ---------------------------------------------------------------- fonts

async function copyFonts() {
  const dir = path.join(ROOT, 'public', 'fonts');
  await mkdir(dir, { recursive: true });
  const src = path.join(ROOT, 'node_modules', '@fontsource-variable', 'vazirmatn', 'files');
  for (const f of ['vazirmatn-arabic-wght-normal.woff2', 'vazirmatn-latin-wght-normal.woff2']) {
    await copyFile(path.join(src, f), path.join(dir, f));
  }
}

// ---------------------------------------------------------------- main

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const pieceSets = [];
  for (const id of await listDirs(path.join(ASSETS, 'pieces'))) {
    console.log(`pieces/${id}`);
    try {
      const s = await buildPieceSet(path.join(ASSETS, 'pieces', id), slug(id));
      if (s) pieceSets.push(s);
    } catch (e) {
      errors.push(`pieces/${id}: ${(e as Error).message}`);
    }
  }

  const boards = [];
  const boardDir = path.join(ASSETS, 'boards');
  if (existsSync(boardDir)) {
    for (const f of (await readdir(boardDir)).sort()) {
      if (!/\.(jpe?g|png|webp|svg)$/i.test(f)) continue;
      console.log(`boards/${f}`);
      try {
        boards.push(await buildBoard(path.join(boardDir, f)));
      } catch (e) {
        errors.push(`boards/${f}: ${(e as Error).message}`);
      }
    }
  }

  await copyFonts();

  const ts = `// GENERATED by scripts/build-themes.ts — do not edit. Run \`npm run themes\` to regenerate.
import type { BoardTheme, PieceSet } from './types';

export const BOARDS: BoardTheme[] = ${JSON.stringify(boards, null, 2)};

export const PIECE_SETS: PieceSet[] = ${JSON.stringify(pieceSets, null, 2)};
`;
  await writeFile(MANIFEST, ts);
  console.log(`themes: ${boards.length} board(s), ${pieceSets.length} piece set(s)`);

  if (errors.length) {
    for (const e of errors) warn(e);
    // Fail loudly (B6) but still leave a valid manifest behind so the extension builds.
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
