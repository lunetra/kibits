import { describe, expect, it } from 'vitest';
import { apply, collect, contentPlain, probesOf, rebuild, serialize, type Block } from '../src/main/richtext';
import { LRI, PDI } from '../src/shared/notation';
import { COMMENTARY_RESPONSE } from './fixtures';

const content = COMMENTARY_RESPONSE.commentary.content as Block[];

describe('richtext', () => {
  it('serializes with player words and san tokens', () => {
    const s = serialize(content[0]!.children!, true);
    expect(s.source).toBe(
      'White immediately challenges the center with ⟦0⟧, leading into the sharp lines of the Center Game. By attacking the e5 pawn, White forces Black to decide how to resolve the tension in the heart of the board.',
    );
    expect(s.nodes).toEqual([{ type: 'san', san: 'd4', color: 'white' }]);
    expect(s.hints).toEqual(['⟦0⟧ = move d4 (White)']);
  });

  it('keeps player nodes as tokens when playerWords is off', () => {
    const s = serialize(content[0]!.children!, false);
    expect(s.source.startsWith('⟦0⟧ immediately')).toBe(true);
    expect(s.nodes).toHaveLength(4);
  });

  it('treats unknown inline nodes as opaque tokens', () => {
    const s = serialize([{ text: 'See ' }, { type: 'arrow', from: 'e2' }, { text: ' here.' }], true);
    expect(s.source).toBe('See ⟦0⟧ here.');
    expect(s.nodes[0]).toEqual({ type: 'arrow', from: 'e2' });
  });

  it('rebuilds nodes and isolates notation for RTL', () => {
    const nodes = [{ type: 'san', san: 'd4', color: 'white' }];
    const out = rebuild('سفید با ⟦0⟧ به پیاده‌ی e5 حمله می‌کند.', nodes, true);
    expect(out).toEqual([
      { text: 'سفید با ' },
      nodes[0],
      { text: ` به پیاده‌ی ${LRI}e5${PDI} حمله می‌کند.` },
    ]);
  });

  it('round-trips a full ply without mutating the input', () => {
    const before = JSON.stringify(content);
    const plan = collect(content, true);
    expect(plan.items).toHaveLength(1);
    const next = apply(content, plan, ['Weiß fordert mit ⟦0⟧ sofort das Zentrum heraus.'], false);
    expect(JSON.stringify(content)).toBe(before);
    expect(contentPlain(next)).toBe('Weiß fordert mit d4 sofort das Zentrum heraus.');
    expect(probesOf(next[0]!.children!)).toEqual(['sofort das Zentrum heraus.', 'Weiß fordert mit']);
  });

  it('skips paragraphs with nothing to translate', () => {
    const plan = collect([{ type: 'paragraph', children: [{ type: 'san', san: 'e4' }] }, { type: 'image' }], true);
    expect(plan.items).toHaveLength(0);
  });
});
