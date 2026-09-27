// Typed messages between contexts (docs/02 → "Message protocol").
import type { RGBA } from './color';
import type { LangCode } from './languages';
import type { ModelId } from './models';

export type TranslateKind = 'ply' | 'summary';

/** Who is who, so the model gets "you" and colours right (docs/04). */
export interface GameContext {
  /** 0-based half-move index: 0 = White's first move. */
  plyIndex?: number;
  /** The side the reader plays (the bottom of the board). */
  userColor?: 'white' | 'black';
  players?: { white?: string; black?: string };
}
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
  context?: { gameId?: string } & GameContext;
}

export type TranslateRes =
  | { type: 'translated'; id: string; texts: string[]; cached: boolean; ms: number; model: ModelId }
  | { type: 'translateError'; id: string; code: ErrorCode; message: string };

export type StatusReport =
  | { type: 'report'; kind: 'boardUnsupported'; reason: string }
  | { type: 'report'; kind: 'boardOk' };

/** Per-move cache lookup / store (MAIN → isolated → SW). */
export interface PlyGet { type: 'plyGet'; id: string; gameId: string; plyIndex: number; lang: LangCode }
export interface PlyPut { type: 'plyPut'; id: string; gameId: string; plyIndex: number; lang: LangCode; body: string; original: string; probes: string[]; originalNodes?: RetryNode[][] }
export interface PlyHit { body: string; original: string; probes: string[]; originalNodes?: RetryNode[][] }

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

export interface BoardPalette {
  /** Square gradients (from, to). */
  dark: [RGBA, RGBA];
  light: [RGBA, RGBA];
  /** Coordinate letters/numbers: drawn in the dark colour on light squares and vice versa. */
  coords: { dark: RGBA; light: RGBA };
  /** Last move: the square a piece left, and the square it landed on. */
  move: { from: RGBA; to: RGBA };
  /** Clicked/selected piece's square. */
  selected: RGBA;
  /** Guided-move source square. */
  guided: RGBA;
  /** King in check and right-click square marks (radial: centre → edge). */
  mark: { center: RGBA; edge: RGBA };
  /** Arrows you draw with the right mouse button. */
  arrow: RGBA;
}

export interface MainConfig {
  enabled: boolean;
  translate: { on: boolean; lang: LangCode; playerWords: boolean };
  /** Board palette, sRGB 0–1. null = site default. */
  board: null | BoardPalette;
  /** chrome-extension:// atlas URLs by resolution. null = site default. */
  pieces: null | { '1': string; '2': string; '4': string };
}

export interface ChipSan { san: string; color?: 'white' | 'black' }

/**
 * A commentary node rendered by the isolated script (retry result, or the English original when toggled).
 * `chip` = index of the move chip among the chips the site currently shows in the commentary box.
 */
export type RetryNode = { text: string } | { chip: number } | { word: string };
export type RetryResult =
  | { ok: true; lang: LangCode; paragraphs: RetryNode[][]; original: string }
  | { ok: false; code: ErrorCode; message: string };

/** isolated → MAIN */
export type ToMain =
  | { type: 'config'; config: MainConfig }
  | { type: 'reply'; id: string; data: unknown }
  | { type: 'retryPly'; id: string; gameId: string; plyIndex: number };

/** MAIN → isolated. Requests carrying an `id` get a `reply` with the same id. */
export type ToIsolated =
  | { type: 'mainReady' }
  | TranslateReq
  | PlyGet
  | PlyPut
  | { type: 'translatedPly'; lang: LangCode; probes: string[]; original: string; originalNodes?: RetryNode[][] }
  | { type: 'boardState'; flipped: boolean }
  /** Move chips of a commentary, in the order the site renders them (for hover arrows). */
  | { type: 'plySans'; plyIndex: number; sans: ChipSan[] }
  | { type: 'plyError'; code: ErrorCode; message: string; gameId?: string; plyIndex?: number }
  | { type: 'reply'; id: string; data: unknown }
  | StatusReport;

export interface Envelope<T> {
  kbz: 'msg';
  channel: string;
  to: 'main' | 'isolated';
  msg: T;
}
export interface Hello { kbz: 'hello'; channel: string }
export const MAIN_READY = { kbz: 'mainReady' } as const;
