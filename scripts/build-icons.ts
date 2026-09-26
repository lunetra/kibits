// public/icon/icon.svg → public/icon{,-off}/{16,32,48,128}.png. Run: npm run icons (outputs are committed).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const svg = await readFile(path.join(ROOT, 'public/icon/icon.svg'), 'utf8');
const off = svg.replaceAll('#EDEDEF', '#63636E');

for (const size of [16, 32, 48, 128]) {
  await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toFile(path.join(ROOT, `public/icon/${size}.png`));
  await sharp(Buffer.from(off), { density: 384 }).resize(size, size).png().toFile(path.join(ROOT, `public/icon-off/${size}.png`));
}
console.log('icons written');
