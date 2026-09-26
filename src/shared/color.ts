// Small colour helpers: hex ⇄ sRGB floats, and OKLCH for perceptually even lightness shifts.

export type RGBA = [number, number, number, number];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function hexToRgba01(hex: string): RGBA {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Invalid hex colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

export function rgb01ToHex(c: readonly number[]): string {
  return '#' + c.slice(0, 3).map((x) => Math.round(clamp01(x) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

const toLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const toGamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);

/** WCAG relative luminance of an sRGB hex colour. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgba01(hex).map(toLinear) as unknown as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

export function oklchToHex(L: number, C: number, h: number): string {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return rgb01ToHex([r, g, bl].map((x) => toGamma(clamp01(x))));
}

export function hexToOklch(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgba01(hex).map(toLinear) as unknown as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  const h = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return [L, C, h];
}

/** Shift OKLCH lightness by dL (e.g. ±0.04), keeping chroma and hue. */
export function shiftLightness(hex: string, dL: number): string {
  const [L, C, h] = hexToOklch(hex);
  return oklchToHex(clamp01(L + dL), C, h);
}
