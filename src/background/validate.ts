// Post-validation of model output (docs/04 → "Validation").
import type { LangCode } from '../shared/languages';
import { findNotation, tokensOf } from '../shared/notation';

export type ValidationResult = { ok: true; text: string } | { ok: false; reason: string };

/** Cleanup that never fails: stray prefixes/quotes/markdown, Arabic → Persian letters. */
export function cleanOutput(text: string, lang: LangCode): string {
  let t = text.trim();
  t = t.replace(/^(?:translation|übersetzung|ترجمه)\s*[:：]\s*/i, '');
  t = t.replace(/^\*\*|\*\*$/g, '');
  if (/^["“«].*["”»]$/s.test(t) && !/^["“«].*["”»].+["“«]/s.test(t)) t = t.slice(1, -1).trim();
  if (lang === 'fa') t = t.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ى/g, 'ی');
  return t;
}

export function validate(source: string, output: string, lang: LangCode): ValidationResult {
  const text = cleanOutput(output, lang);
  if (!text) return { ok: false, reason: 'empty' };

  const a = tokensOf(source).join(',');
  const b = tokensOf(text).join(',');
  if (a !== b) return { ok: false, reason: `placeholders changed (${a} → ${b})` };

  if (source.length >= 40) {
    const ratio = text.length / source.length;
    if (ratio < 0.5 || ratio > 2.2) return { ok: false, reason: `length ratio ${ratio.toFixed(2)}` };
  }

  for (const n of findNotation(source)) {
    if (!text.includes(n)) return { ok: false, reason: `notation "${n}" missing` };
  }

  if (lang === 'fa' && /[a-z]{3,}/i.test(source.replace(/⟦\d+⟧/g, '')) && !/[؀-ۿ]/.test(text)) {
    return { ok: false, reason: 'no Persian script in output' };
  }
  return { ok: true, text };
}
