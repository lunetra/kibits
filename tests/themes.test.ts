import { describe, expect, it } from 'vitest';
import { applyColors, layoutLooksRight, toFloat32Copy } from '../src/main/gpu-hook';
import { contrast, hexToRgba01, luminance, oklchToHex, shiftLightness } from '../src/shared/color';
import { BOARD_PRESETS } from '../src/themes/presets';
import { boardToConfig, customTheme } from '../src/themes';

/** The site's default pieces (measured from its regular4x atlas). */
const BLACK_PIECE = '#3E3850';
const WHITE_PIECE = '#FCFCFC';

describe('board presets', () => {
  it('are low-glare, calm, and keep both piece colours readable', () => {
    for (const p of BOARD_PRESETS) {
      for (const h of [p.light.from, p.light.to, p.dark.from, p.dark.to]) expect(hexToRgba01(h)[3]).toBe(1);
      const sq = contrast(p.light.from, p.dark.from);
      expect(sq, p.id).toBeGreaterThan(1.6);
      expect(sq, p.id).toBeLessThan(2.1);
      expect(luminance(p.light.from), `${p.id} light glare`).toBeLessThan(0.4);
      expect(contrast(p.dark.to, BLACK_PIECE), `${p.id} black pieces on dark squares`).toBeGreaterThanOrEqual(2);
      expect(contrast(p.light.from, WHITE_PIECE), `${p.id} white pieces on light squares`).toBeGreaterThanOrEqual(2.3);
    }
  });
  it('have unique ids', () => {
    expect(new Set(BOARD_PRESETS.map((p) => p.id)).size).toBe(BOARD_PRESETS.length);
  });
  it('converts OKLCH as documented', () => {
    expect(oklchToHex(0.64, 0.006, 255)).toBe('#8A8C90');
    expect(oklchToHex(0.46, 0.05, 158)).toBe('#40614D');
  });
});

describe('custom theme', () => {
  it('uses solid colours without gradient and a subtle one with it', () => {
    expect(customTheme({ light: '#808080', dark: '#404040', gradient: false }).light).toEqual({ from: '#808080', to: '#808080' });
    const g = customTheme({ light: '#808080', dark: '#404040', gradient: true });
    expect(g.light.from).toBe(shiftLightness('#808080', 0.02));
    expect(luminance(g.light.from)).toBeGreaterThan(luminance(g.light.to));
  });
});

describe('gpu uniform patch', () => {
  const site = new Float32Array(52);
  site.set([0.518, 0.447, 0.675, 1], 0);
  site.set([0.518, 0.447, 0.675, 1], 4);
  site.set([0.69, 0.647, 0.796, 1], 16);
  site.set([0.69, 0.647, 0.796, 1], 20);
  site.set([0.945, 0.722, 0.678, 1], 32);

  it('copies typed arrays and ArrayBuffers with offsets', () => {
    const f = toFloat32Copy(site)!;
    expect(f).not.toBe(site);
    expect(f.length).toBe(52);
    expect(toFloat32Copy(site.buffer, 16, 32)!.length).toBe(8);
    expect(toFloat32Copy(site, 4, 4)![0]).toBeCloseTo(0.518);
  });

  it('guards the layout', () => {
    expect(layoutLooksRight(site)).toBe(true);
    const bad = new Float32Array(site); bad[19] = 0.5;
    expect(layoutLooksRight(bad)).toBe(false);
  });

  it('writes only the gradient colours and never mutates the input', () => {
    const cfg = boardToConfig(BOARD_PRESETS[0]!)!;
    const before = Array.from(site);
    const out = applyColors(site, cfg);
    expect(Array.from(site)).toEqual(before);
    expect(Array.from(out.slice(0, 4))).toEqual(cfg.dark[0].map(Math.fround));
    expect(Array.from(out.slice(20, 24))).toEqual(cfg.light[1].map(Math.fround));
    expect(Array.from(out.slice(8, 16))).toEqual(before.slice(8, 16));
    expect(Array.from(out.slice(32))).toEqual(before.slice(32));
  });
});
