// Settings schema, defaults and migrations (docs/02 → "Settings schema").
// Pure module: no browser APIs, so it can be unit-tested. Storage access lives in settings-store.ts.

import { isLangCode, type LangCode } from './languages';
import { DEFAULT_MODEL, isModelId, type ModelId } from './models';

export const SCHEMA_VERSION = 1 as const;

export interface CustomBoard {
  light: string;
  dark: string;
  gradient: boolean;
}

export interface Settings {
  schemaVersion: typeof SCHEMA_VERSION;
  /** Master switch. */
  enabled: boolean;
  translation: {
    enabled: boolean;
    lang: LangCode;
    model: ModelId;
    showOriginalOnHover: boolean;
    /** Send "White"/"Black" as words the model translates, instead of opaque player nodes. */
    playerWords: boolean;
    translateSummary: boolean;
  };
  board: { themeId: 'default' | 'custom' | string; custom: CustomBoard };
  pieces: { setId: 'default' | string };
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  enabled: true,
  translation: {
    enabled: true,
    lang: 'fa',
    model: DEFAULT_MODEL,
    showOriginalOnHover: true,
    playerWords: true,
    translateSummary: true,
  },
  board: { themeId: 'default', custom: { light: '#8A8C90', dark: '#585B5F', gradient: true } },
  pieces: { setId: 'default' },
};

export const SETTINGS_KEY = 'settings';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

/**
 * Bring any stored value (older schema, partial, corrupted) to the current schema.
 * Unknown fields are dropped, invalid ones fall back to defaults.
 */
export function migrate(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!isObj(raw)) return structuredClone(d);
  // Future: switch (raw.schemaVersion) { case 1: … } to upgrade step by step.
  const t = isObj(raw.translation) ? raw.translation : {};
  const b = isObj(raw.board) ? raw.board : {};
  const c = isObj(b.custom) ? b.custom : {};
  const p = isObj(raw.pieces) ? raw.pieces : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    enabled: bool(raw.enabled, d.enabled),
    translation: {
      enabled: bool(t.enabled, d.translation.enabled),
      lang: isLangCode(t.lang) ? t.lang : d.translation.lang,
      model: isModelId(t.model) ? t.model : d.translation.model,
      showOriginalOnHover: bool(t.showOriginalOnHover, d.translation.showOriginalOnHover),
      playerWords: bool(t.playerWords, d.translation.playerWords),
      translateSummary: bool(t.translateSummary, d.translation.translateSummary),
    },
    board: {
      themeId: str(b.themeId, d.board.themeId),
      custom: {
        light: hex(c.light, d.board.custom.light),
        dark: hex(c.dark, d.board.custom.dark),
        gradient: bool(c.gradient, d.board.custom.gradient),
      },
    },
    pieces: { setId: str(p.setId, d.pieces.setId) },
  };
}

/** True when translation should actually run (master on, section on, non-passthrough language). */
export const translationActive = (s: Settings) => s.enabled && s.translation.enabled && s.translation.lang !== 'en';
