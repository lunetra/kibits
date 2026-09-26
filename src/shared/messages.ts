// Typed messages between contexts (docs/02 → "Message protocol").
import type { RGBA } from './color';
import type { LangCode } from './languages';
import type { ModelId } from './models';

export type TranslateKind = 'ply' | 'summary';
export type ErrorCode = 'timeout' | 'auth' | 'quota' | 'network' | 'blocked' | 'invalid' | 'model' | 'nokey';

// ---------- content ⇄ service worker (chrome.runtime) ----------

export interface TranslateReq {
  type: 'translate';
  id: string;
  lang: LangCode;
  kind: TranslateKind;
  /** One entry per paragraph; placeholders ⟦n⟧ are numbered per item. */
  items: string[];
  /** Per item: descriptions of its tokens, e.g. ["⟦0⟧ = move d4 (White)"]. */
  hints: string[][];
  context?: { gameId?: string; plyIndex?: number };
}

export type TranslateRes =
  | { type: 'translated'; id: string; texts: string[]; cached: boolean; ms: number; model: ModelId }
  | { type: 'translateError'; id: string; code: ErrorCode; message: string };

export type StatusReport =
  | { type: 'report'; kind: 'boardUnsupported'; reason: string }
  | { type: 'report'; kind: 'boardOk' };

/** Per-move cache lookup / store (MAIN → isolated → SW). */
export interface PlyGet { type: 'plyGet'; id: string; gameId: string; plyIndex: number; lang: LangCode }
export interface PlyPut { type: 'plyPut'; id: string; gameId: string; plyIndex: number; lang: LangCode; body: string; original: string; probes: string[] }
export interface PlyHit { body: string; original: string; probes: string[] }

export type RuntimeReq =
  | TranslateReq
  | StatusReport
  | PlyGet
  | PlyPut
  | { type: 'keysList' }
  | { type: 'keyAdd'; key: string }
  | { type: 'keyRemove'; id: string }
  | { type: 'keyTest'; id: string; model: ModelId }
  | { type: 'sample'; lang: LangCode; model: ModelId }
  | { type: 'cacheStats' }
  | { type: 'clearCache' };

export interface TestKeyRes { ok: boolean; code?: ErrorCode; message?: string }
export interface SampleRes { ok: boolean; source: string; text?: string; ms?: number; cached?: boolean; message?: string }
export interface CacheStats { moves: number; bytes: number }
/** Mirrored by the SW into chrome.storage.session (no secrets). */
export const KEYS_KEY = 'keys';

/** Written by the service worker into chrome.storage.session under STATUS_KEY. */
export interface Status {
  lastMs: number | null;
  lastError: { code: ErrorCode; message: string; ts: number } | null;
  consecutiveErrors: number;
  board: { unsupported: boolean; reason?: string };
}
export const STATUS_KEY = 'status';
export const EMPTY_STATUS: Status = { lastMs: null, lastError: null, consecutiveErrors: 0, board: { unsupported: false } };

// ---------- MAIN ⇄ isolated (window.postMessage) ----------

export interface MainConfig {
  enabled: boolean;
  translate: { on: boolean; lang: LangCode; playerWords: boolean };
  /** Gradient from/to per square colour, sRGB 0–1. null = site default. */
  board: null | { dark: [RGBA, RGBA]; light: [RGBA, RGBA] };
  /** chrome-extension:// atlas URLs by resolution. null = site default. */
  pieces: null | { '1': string; '2': string; '4': string };
}

/** isolated → MAIN */
export type ToMain =
  | { type: 'config'; config: MainConfig }
  | { type: 'reply'; id: string; data: unknown };

/** MAIN → isolated. Requests carrying an `id` get a `reply` with the same id. */
export type ToIsolated =
  | { type: 'mainReady' }
  | TranslateReq
  | PlyGet
  | PlyPut
  | { type: 'translatedPly'; lang: LangCode; probes: string[]; original: string }
  | { type: 'plyError'; code: ErrorCode; message: string }
  | StatusReport;

export interface Envelope<T> {
  kbz: 'msg';
  channel: string;
  to: 'main' | 'isolated';
  msg: T;
}
export interface Hello { kbz: 'hello'; channel: string }
export const MAIN_READY = { kbz: 'mainReady' } as const;
