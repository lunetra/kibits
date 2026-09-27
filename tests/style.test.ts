import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Every kbz-* class the content scripts create must have a rule in the injected stylesheet.
// (A missing rule once shipped unnoticed: square boxes existed but were invisible and unhoverable.)
const dir = new URL('../src/content/', import.meta.url);
const css = readFileSync(new URL('style.ts', dir), 'utf8');
const code = readdirSync(dir)
  .filter((f) => f.endsWith('.ts') && f !== 'style.ts')
  .map((f) => readFileSync(new URL(f, dir), 'utf8'))
  .join('\n');

/** Marker classes used only to find elements, styled through another class. */
const MARKERS = new Set(['kbz-swapped']);

describe('injected stylesheet', () => {
  const used = new Set<string>();
  for (const m of code.matchAll(/className\s*=\s*['`]([^'`]+)['`]/g)) for (const c of m[1]!.split(/\s+/)) if (c.startsWith('kbz-')) used.add(c);
  for (const m of code.matchAll(/classList\.toggle\('([^']+)'/g)) used.add(m[1]!);

  it.each([...used].filter((c) => !MARKERS.has(c)))('has a rule for .%s', (cls) => {
    expect(css).toMatch(new RegExp(`\\.${cls}(?![\\w-])`));
  });

  it('styles clickable chips but not the ones marked off', () => {
    expect(css).toContain('[data-kbz-chip=""]{cursor:pointer}');
    expect(css).not.toContain('[data-kbz-chip]{cursor:pointer}');
  });
});
