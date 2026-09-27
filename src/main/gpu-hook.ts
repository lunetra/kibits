// GPUQueue.writeBuffer wrapper (MAIN world): recolours the site's WebGPU board to the chosen theme.
// Layouts verified live from the site's TypeGPU shader source (docs/SITE-MAP.md §4a, §4d).
// Synchronous like the original, always works on a copy, fails open.
import type { RGBA } from '../shared/color';
import type { BoardPalette, MainConfig } from '../shared/messages';
import { BOARD_UNIFORM, GPU_BUFFERS } from '../site/selectors';
import { getConfig, onConfig, send } from './bridge';

type WriteBuffer = GPUQueue['writeBuffer'];

// globalUniformBuffer (208 B): darkGradient, lightGradient, checkCenterColor, checkEdgeColor, selectedColor,
// guidedSourceColor, flipped. Gradients are {fromColor, toColor, center, axisU, axisV}.
const G = { darkFrom: 0, darkTo: 4, lightFrom: 16, lightTo: 20, checkCenter: 32, checkEdge: 36, selected: 40, guided: 44, flipped: 48 };
const ALPHA_SLOTS = [3, 7, 19, 23];

interface Last { queue: GPUQueue; buffer: GPUBuffer; original: Float32Array }

/** Copy the written bytes into a fresh Float32Array (never mutate the site's array). */
export function toFloat32Copy(data: BufferSource | SharedArrayBuffer, dataOffset?: number, size?: number): Float32Array | null {
  let bytes: Uint8Array;
  if (ArrayBuffer.isView(data)) {
    const el = data instanceof DataView ? 1 : (data as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
    const off = (dataOffset ?? 0) * el;
    const len = size != null ? size * el : data.byteLength - off;
    bytes = new Uint8Array(data.buffer, data.byteOffset + off, len);
  } else {
    const off = dataOffset ?? 0;
    const len = size ?? data.byteLength - off;
    bytes = new Uint8Array(data as ArrayBuffer, off, len);
  }
  if (bytes.byteLength % 4 !== 0) return null;
  return new Float32Array(new Uint8Array(bytes).buffer);
}

/** Layout guard: the four gradient alpha slots are 1 in every theme we've seen. */
export const layoutLooksRight = (f: Float32Array) => f.length >= 24 && ALPHA_SLOTS.every((i) => Math.abs(f[i]! - 1) < 1e-6);

/** Board colours in globalUniformBuffer. Keeps gradient geometry and `flipped` untouched. */
export function applyColors(f: Float32Array, p: Pick<BoardPalette, 'dark' | 'light'> & Partial<BoardPalette>): Float32Array {
  const out = new Float32Array(f);
  out.set(p.dark[0], G.darkFrom);
  out.set(p.dark[1], G.darkTo);
  out.set(p.light[0], G.lightFrom);
  out.set(p.light[1], G.lightTo);
  if (out.length >= 48) {
    if (p.mark) {
      out.set(p.mark.center, G.checkCenter);
      out.set(p.mark.edge, G.checkEdge);
    }
    if (p.selected) out.set(p.selected, G.selected);
    if (p.guided) out.set(p.guided, G.guided);
  }
  return out;
}

const near = (a: number, b: number, eps = 0.004) => Math.abs(a - b) < eps;

/**
 * Last-move squares (uniformBuffer, squareOverlay[64] vec4 at the start). The site paints the "from" square
 * in its move colour (= selectedColor rgb) and the "to" square in that colour mixed toward white.
 * Anything else (other overlay kinds) is left alone.
 */
export function recolorSquareOverlay(f: Float32Array, siteMove: readonly number[], p: BoardPalette): Float32Array | null {
  let out: Float32Array | null = null;
  const [r0, g0, b0] = siteMove as [number, number, number];
  for (let i = 0; i < 64 * 4; i += 4) {
    const a = f[i + 3]!;
    if (a <= 0) continue;
    const r = f[i]!, g = f[i + 1]!, b = f[i + 2]!;
    let target: RGBA | null = null;
    if (near(r, r0) && near(g, g0) && near(b, b0)) target = p.move.from;
    else {
      // Same colour mixed with white by t (the "to" square): r = r0 + (1 - r0)·t for every channel.
      const t = r0 < 0.99 ? (r - r0) / (1 - r0) : NaN;
      if (t > 0.05 && t < 0.8 && near(g, g0 + (1 - g0) * t, 0.01) && near(b, b0 + (1 - b0) * t, 0.01)) target = p.move.to;
    }
    if (!target) continue;
    out ??= new Float32Array(f);
    out.set([target[0], target[1], target[2], a], i);
  }
  return out;
}

/** Arrows drawn with the right mouse button: vertex = 8 floats, colour at +4 (vertexBuffer). */
export function recolorArrows(f: Float32Array, siteArrow: readonly number[], p: BoardPalette): Float32Array | null {
  let out: Float32Array | null = null;
  const [r0, g0, b0] = siteArrow as [number, number, number];
  for (let i = 4; i + 3 < f.length; i += 8) {
    if (near(f[i]!, r0) && near(f[i + 1]!, g0) && near(f[i + 2]!, b0)) {
      out ??= new Float32Array(f);
      out[i] = p.arrow[0];
      out[i + 1] = p.arrow[1];
      out[i + 2] = p.arrow[2];
    }
  }
  return out;
}

let flipped: boolean | null = null;
/** Board orientation as the site last wrote it (true = Black at the bottom); null until known. */
export const getFlipped = () => flipped;

export function installGpuHook() {
  const Q = (globalThis as { GPUQueue?: { prototype: GPUQueue } }).GPUQueue;
  if (!Q) return;
  const orig: WriteBuffer = Q.prototype.writeBuffer;
  let last: Last | null = null;
  let reported: 'ok' | 'unsupported' | null = null;
  /** The site theme's move colour, from its own selectedColor (rgb). */
  let siteMove: number[] = [0.624, 0.565, 1];

  const report = (ok: boolean, reason = '') => {
    const state = ok ? 'ok' : 'unsupported';
    if (reported === state) return;
    reported = state;
    send(ok ? { type: 'report', kind: 'boardOk' } : { type: 'report', kind: 'boardUnsupported', reason });
  };

  const active = (c: MainConfig | null): c is MainConfig & { board: BoardPalette } => !!c && c.enabled && !!c.board;

  function patched(buffer: GPUBuffer, offset: number, f: Float32Array, cfg: MainConfig & { board: BoardPalette }): Float32Array | null {
    const p = cfg.board;
    if (buffer.size === GPU_BUFFERS.squares.size && offset === 0 && f.length >= 256) return recolorSquareOverlay(f, siteMove, p);
    if (buffer.size === GPU_BUFFERS.notation.size && offset === 0 && f.length >= 8 && f[3] === 1 && f[7] === 1) {
      const out = new Float32Array(f);
      out.set(p.coords.dark, 0);
      out.set(p.coords.light, 4);
      return out;
    }
    if (buffer.size === GPU_BUFFERS.arrows.size && offset === 0) return recolorArrows(f, GPU_BUFFERS.arrows.siteColor, p);
    return null;
  }

  function writeBuffer(this: GPUQueue, buffer: GPUBuffer, offset: GPUSize64, data: BufferSource | SharedArrayBuffer, dataOffset?: GPUSize64, size?: GPUSize64) {
    try {
      const label = buffer?.label;
      if (label === BOARD_UNIFORM.label && offset === 0) {
        const f = toFloat32Copy(data, dataOffset, size);
        if (f && buffer.size === BOARD_UNIFORM.size && layoutLooksRight(f)) {
          last = { queue: this, buffer, original: f };
          if (f.length > G.flipped) {
            const was = flipped;
            flipped = f[G.flipped]! > 0.5;
            if (was !== flipped) send({ type: 'boardState', flipped });
          }
          if (f.length >= G.selected + 3) siteMove = [f[G.selected]!, f[G.selected + 1]!, f[G.selected + 2]!];
          const cfg = getConfig();
          if (active(cfg)) {
            report(true);
            return orig.call(this, buffer, 0, applyColors(f, cfg.board));
          }
        } else if (active(getConfig())) {
          report(false, `uniform layout changed (size ${buffer.size})`);
        }
      } else if ((label === GPU_BUFFERS.squares.label || label === GPU_BUFFERS.notation.label || label === GPU_BUFFERS.arrows.label)) {
        const cfg = getConfig();
        if (active(cfg)) {
          const f = toFloat32Copy(data, dataOffset, size);
          const out = f && patched(buffer, Number(offset), f, cfg);
          if (out) return orig.call(this, buffer, offset, out);
        }
      }
    } catch {
      /* fail open */
    }
    // eslint-disable-next-line prefer-rest-params
    return (orig as (...a: unknown[]) => void).apply(this, arguments as unknown as unknown[]);
  }
  Q.prototype.writeBuffer = writeBuffer as WriteBuffer;

  // Re-apply when config arrives late or changes (incl. back to the site's own colours).
  onConfig((cfg) => {
    // The isolated script may have missed the first orientation report (it connects a bit later).
    if (flipped !== null) send({ type: 'boardState', flipped });
    if (!last) return;
    try {
      // Best effort only: the site draws on demand, so this shows on its next full redraw. The panel reloads
      // the tab after a theme change, which is what makes it reliable.
      orig.call(last.queue, last.buffer, 0, active(cfg) ? applyColors(last.original, cfg.board) : last.original);
    } catch {
      /* buffer may be destroyed after navigation */
    }
  });
}
