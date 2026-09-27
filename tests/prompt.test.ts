import { describe, expect, it } from 'vitest';
import { buildJsonPayload, buildSystemPrompt, buildTaggedPayload, filterGlossary, parseJson, parseTagged } from '../src/background/prompt';

describe('game context', () => {
  it('names the side that moved, 0-based (e4 = ply 0 = White)', async () => {
    const { contextLines } = await import('../src/background/prompt');
    expect(contextLines({ items: [], hints: [], context: { plyIndex: 0 } })).toContain('move 1., played by White');
    expect(contextLines({ items: [], hints: [], context: { plyIndex: 1 } })).toContain('move 1..., played by Black');
  });
  it('tells the model who "you" is and maps names to colours', async () => {
    const { contextLines } = await import('../src/background/prompt');
    const l = contextLines({ items: [], hints: [], context: { userColor: 'white', players: { white: 'alice', black: 'bob' } } });
    expect(l).toContain('The reader plays White');
    expect(l).toContain('"alice" = White, "bob" = Black');
  });
});

describe('prompt', () => {
  it('filters the glossary to terms in the source, plus piece names', () => {
    const g = filterGlossary('fa', ['The pin on the e-file wins material.']);
    const keys = g.map(([k]) => k);
    expect(keys).toEqual(expect.arrayContaining(['pin', 'file', 'material', 'king', 'pawn']));
    expect(keys).not.toContain('fork');
    expect(keys).not.toContain('_comment');
  });

  it('respects word boundaries', () => {
    const keys = filterGlossary('de', ['The checkers were mated.']).map(([k]) => k);
    expect(keys).not.toContain('check');
    expect(keys).not.toContain('mate');
  });

  it('builds a system prompt with language rules and examples', () => {
    const p = buildSystemPrompt('fa', ['A fork!']);
    expect(p).toContain('Persian');
    expect(p).toContain('zero-width non-joiner');
    expect(p).toContain('fork → چنگال');
    expect(p).toContain('FA: ');
  });

  it('builds payloads and parses answers', () => {
    const input = { items: ['A ⟦0⟧', 'B'], hints: [['⟦0⟧ = move e4 (White)'], []], context: { plyIndex: 3 } };
    expect(buildJsonPayload(input)).toContain('"items":["A ⟦0⟧","B"]');
    expect(buildJsonPayload(input)).toContain('move 2..., played by Black');
    expect(buildTaggedPayload(input)).toContain('<t i="1">B</t>');
    expect(parseJson('{"t":["x","y"]}', 2)).toEqual(['x', 'y']);
    expect(parseJson('```json\n{"t":["x"]}\n```', 1)).toEqual(['x']);
    expect(parseJson('{"t":["x"]}', 2)).toBeNull();
    expect(parseTagged('<t i="1">y</t>\n<t i="0">x</t>', 2)).toEqual(['x', 'y']);
    expect(parseTagged('<t i="0">x</t>', 2)).toBeNull();
  });
});
