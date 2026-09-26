// GPUQueue.writeBuffer wrapper (MAIN world): board colour override via the site's globalUniformBuffer.
// docs/06 §B, SITE-MAP §4a. Synchronous like the original, copies data, fails open.
import type { MainConfig } from '../shared/messages';
import { BOARD_UNIFORM } from '../site/selectors';
import { getConfig, onConfig, send } from './bridge';

type WriteBuffer = GPUQueue['writeBuffer'];

/** Float offsets of the gradient colours (rgba each). */
const DARK_FROM = 0, DARK_TO = 4, LIGHT_FROM = 16, LIGHT_TO = 20;
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
  const copy = new Uint8Array(bytes); // copies
  return new Float32Array(copy.buffer);
}

/** Layout guard: the four gradient alpha slots are 1 in every theme we've seen. */
export const layoutLooksRight = (f: Float32Array) => f.length >= 24 && ALPHA_SLOTS.every((i) => Math.abs(f[i]! - 1) < 1e-6);

export function applyColors(f: Float32Array, board: NonNullable<MainConfig['board']>): Float32Array {
  const out = new Float32Array(f);
  out.set(board.dark[0], DARK_FROM);
  out.set(board.dark[1], DARK_TO);
  out.set(board.light[0], LIGHT_FROM);
  out.set(board.light[1], LIGHT_TO);
  return out;
}

export function installGpuHook() {
  const Q = (globalThis as { GPUQueue?: { prototype: GPUQueue } }).GPUQueue;
  if (!Q) return;
  const orig: WriteBuffer = Q.prototype.writeBuffer;
  let last: Last | null = null;
  let reported: 'ok' | 'unsupported' | null = null;

  const report = (ok: boolean, reason = '') => {
    const state = ok ? 'ok' : 'unsupported';
    if (reported === state) return;
    reported = state;
    send(ok ? { type: 'report', kind: 'boardOk' } : { type: 'report', kind: 'boardUnsupported', reason });
  };

  const active = (c: MainConfig | null): c is MainConfig & { board: NonNullable<MainConfig['board']> } => !!c && c.enabled && !!c.board;

  function writeBuffer(this: GPUQueue, buffer: GPUBuffer, offset: GPUSize64, data: BufferSource | SharedArrayBuffer, dataOffset?: GPUSize64, size?: GPUSize64) {
    try {
      if (buffer?.label === BOARD_UNIFORM.label && offset === 0) {
        const f = toFloat32Copy(data, dataOffset, size);
        if (f && buffer.size === BOARD_UNIFORM.size && layoutLooksRight(f)) {
          last = { queue: this, buffer, original: f };
          const cfg = getConfig();
          if (active(cfg)) {
            report(true);
            return orig.call(this, buffer, 0, applyColors(f, cfg.board));
          }
        } else if (active(getConfig())) {
          report(false, `uniform layout changed (size ${buffer.size})`);
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
    if (!last) return;
    try {
      const data = active(cfg) ? applyColors(last.original, cfg.board) : last.original;
      // Best effort only: the site draws on demand, so this shows on its next full redraw. The panel reloads
      // the tab after a theme change, which is what makes it reliable.
      orig.call(last.queue, last.buffer, 0, data);
    } catch {
      /* buffer may be destroyed after navigation */
    }
  });
}
