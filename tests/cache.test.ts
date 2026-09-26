import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { LRU, TranslationCache } from '../src/background/cache';

describe('LRU', () => {
  it('evicts least recently used', () => {
    const l = new LRU<number>(2);
    l.set('a', 1); l.set('b', 2); l.get('a'); l.set('c', 3);
    expect(l.get('b')).toBeUndefined();
    expect(l.get('a')).toBe(1);
    expect(l.size).toBe(2);
  });
});

describe('TranslationCache', () => {
  it('reads through IndexedDB after the memory tier is gone', async () => {
    const idb = new IDBFactory();
    const a = new TranslationCache({ idb, memCap: 1 });
    await a.set('k1', { texts: ['x'], model: 'm', ts: 1 });
    const b = new TranslationCache({ idb });
    expect((await b.get('k1'))?.texts).toEqual(['x']);
    expect(await b.count()).toBe(1);
  });

  it('evicts oldest entries beyond the cap', async () => {
    const c = new TranslationCache({ idb: new IDBFactory(), dbCap: 3 });
    for (let i = 0; i < 6; i++) await c.set(`k${i}`, { texts: [String(i)], model: 'm', ts: i });
    await c.evict();
    expect(await c.count()).toBe(3);
    const fresh = new TranslationCache({ idb: (c as unknown as { opts: { idb: IDBFactory } }).opts.idb });
    expect(await fresh.get('k0')).toBeUndefined();
    expect((await fresh.get('k5'))?.texts).toEqual(['5']);
  });

  it('clears', async () => {
    const c = new TranslationCache({ idb: new IDBFactory() });
    await c.set('k', { texts: ['x'], model: 'm', ts: 1 });
    await c.clear();
    expect(await c.get('k')).toBeUndefined();
  });
});

describe('per-move cache', () => {
  it('stores forever, reports size, and clears', async () => {
    const { plyKey } = await import('../src/background/cache');
    const c = new TranslationCache({ idb: new IDBFactory() });
    const k = plyKey('game1', 4, 'fa');
    expect(k).toBe('game1:4:fa');
    await c.setPly(k, { body: '{"status":"ready"}', original: 'x', probes: ['p'], ts: 1 });
    expect((await c.getPly(k))?.body).toBe('{"status":"ready"}');
    const s = await c.stats();
    expect(s.moves).toBe(1);
    expect(s.bytes).toBeGreaterThan(0);
    await c.clear();
    expect(await c.getPly(k)).toBeUndefined();
    expect((await c.stats()).moves).toBe(0);
  });
});
