# 06 — Board & piece theming (WebGPU-aware)

Read SITE-MAP §4 first. The board is a single WebGPU canvas. All theming happens in the **MAIN world** by
wrapping two browser APIs; there is **no CSS theming** of the board.

## Principles
- **Default = pass-through.** With board/pieces on Default, the wrappers call the originals unchanged.
- Wrappers must be tiny, synchronous where the original is synchronous, and **fail open** (try/catch → original).
- Never write the site's localStorage settings.

## A. Pieces — atlas substitution (supported)

### Input
```
assets/pieces/<set-name>/wK.svg wQ.svg wR.svg wB.svg wN.svg wP.svg bK.svg bQ.svg bR.svg bB.svg bN.svg bP.svg
```
Normalize common name variants (`wk.svg`, `white-king.svg`, FEN `K.svg`/`k.svg` → ask the user if ambiguous). Report missing pieces.

### Build (`scripts/build-themes.ts`, `npm run themes`, also run before `wxt build`)
For each set, render with `sharp` three PNG atlases matching the site's format:
```
public/themes/pieces/<set>/atlas-4x.png   800×800   (cell 200)
public/themes/pieces/<set>/atlas-2x.png   400×400   (cell 100)
public/themes/pieces/<set>/atlas-1x.png   200×200   (cell 50)
layout (row-major, 4×4, transparent):
  row0: bK bQ bR bN
  row1: bB bP  ·  ·
  row2: wK wQ wR wN
  row3: wB wP  ·  ·
```
- Placement: calibrate per set **using the king**, then apply the same transform to all 12 pieces to keep
  their relative sizes. The site's black king (4x cell 200 px) has an opaque bbox of x 35–163, y 8–185:
  **height ≈ 0.885 × cell, bottom ≈ 0.925 × cell**, centered horizontally. So: rasterize the user's wK at high
  resolution, measure its opaque bbox, compute scale + offset so that bbox height = `scale` × cell and bottom =
  `baseline` × cell, and render every piece of the set with that transform (SVG viewBox mapped into the cell).
  Defaults `scale 0.885`, `baseline 0.925`. Override in `assets/pieces/<set>/set.json`, then run `npm run themes` again.
- Rasterize from SVG at the target size (don't downscale the 4x PNG; render each size from vector for crispness).
- Also emit `preview.png` (wN + bQ + wK) for the panel.
- Manifest: `src/themes/manifest.generated.ts` → `PIECE_SETS = [{ id, label, atlas: { '1': 'themes/pieces/<id>/atlas-1x.png', '2': …, '4': … }, preview }]`.

### Runtime (`main/fetch-hook.ts`)
```ts
const ATLAS_RE = /\/assets\/(regular|newspaper|delta)([124])x-[\w-]+\.png(\?.*)?$/;
// inside the fetch wrapper:
const m = url.match(ATLAS_RE);
if (m) {
  const cfg = await configReadyOrTimeout(400);
  if (cfg?.enabled && cfg.pieces) {
    try { return await origFetch(cfg.pieces[m[2]]); }            // chrome-extension://…/atlas-Nx.png (web_accessible)
    catch { /* fall through */ }
  }
}
return origFetch(input, init);
```
- The site fetches **all** families at init, so replacing all three means the user's set shows no matter which set is picked in the site's own settings.
- Validate at build time that the atlas dimensions equal the site's (`800/400/200`). If the site ever changes its atlas size, compare the original response's image size at runtime (createImageBitmap) and pass through on a mismatch, logging a warning.
- Changing the set: reload required (panel button "Reload tab").

## B. Board colors — uniform override (supported)

### Runtime (`main/gpu-hook.ts`)
```ts
const orig = GPUQueue.prototype.writeBuffer;
GPUQueue.prototype.writeBuffer = function (buffer, offset, data, dataOffset, size) {
  if (active && buffer.label === 'globalUniformBuffer' && offset === 0) {
    try {
      const f = toFloat32Copy(data, dataOffset, size);   // copy; never mutate the site's array
      remember(this, buffer, f);                          // for re-apply when config changes
      applyColors(f, cfg.board);                          // f[0..3],f[4..7] dark from/to; f[16..19],f[20..23] light from/to
      return orig.call(this, buffer, 0, f);
    } catch {}
  }
  return orig.apply(this, arguments as any);
};
```
- Colors are **sRGB floats 0..1**, alpha kept at 1.
- Solid color: from = to. Gradient: from/to differ slightly (≈ ±4 % lightness), keeping the site's center/axis values untouched (indices 8–15, 24–31).
- **Guard**: only patch if the buffer size is 208 and the original floats at [3], [7], [19], [23] are all `1` (the RGBA alpha slots). Otherwise the layout changed → pass through and set a `board: unsupported` status for the panel.
- Re-apply: when config changes (or arrives late), re-issue `orig.call(queue, buffer, 0, patched(lastData))`. The canvas updates on the site's next render. Optionally nudge a redraw by dispatching a `resize` event on `window` (test whether it helps; don't rely on it).
- Leave highlight colors (floats 32+) alone in v1. Optional later: "highlight tint" override.

### Deriving themes from lichess images (build step)
For each `assets/boards/*.{jpg,png,webp,svg}`:
1. Rasterize to 512×512 with `sharp`. Sample the 64 squares (inner 60 % of each to avoid borders/grain).
2. Light = median color of squares where (file+rank) is even; Dark = the others. Detect orientation by luminance (lighter set = light squares).
3. Gradient: take the 20th/80th percentile luminance per group as `from`/`to` (clamped so the difference stays subtle).
4. Emit `BOARDS = [{ id, label, light: {from,to}, dark: {from,to}, thumb: 'themes/boards/<id>.thumb.webp' }]` and copy a 96-px webp thumbnail of the **original image** for the panel.
5. Let the user override the colors per board in `assets/boards/<id>.json` (`{ "light": "#…", "dark": "#…", "gradient": true }`).

## C. Image textures (experimental spike, M6, do not block v1)
Goal: real wood/marble lichess textures. Known facts: the shader ignores uniform alpha, and `alphaMode: "premultiplied"` alone didn't help (SITE-MAP §4a).
Spike options, time-boxed to ~2 h, then report to the user:
1. Wrap `GPUDevice.prototype.createShaderModule`, find the board-square fragment code (it references `darkGradient`/`lightGradient`), and make it output `alpha = 0` for squares when a flag uniform is set. Also wrap `getContext('webgpu').configure` to force `alphaMode: 'premultiplied'`. Then place the lichess image as a CSS background **behind** the canvas (same rounded rect). Risks: TypeGPU-generated WGSL changes every deploy; blending with highlights/blur; performance.
2. Sample a texture in the patched shader (needs a bind group change, which is much harder). Likely not worth it.
If the spike isn't robust, keep F2 as color themes only.

## Licensing note
Lichess boards/pieces carry various licenses (CC BY-SA, GPL, MIT, and some with specific attribution). Personal use is fine. Fill `assets/ATTRIBUTION.md`, and warn before any public distribution.
