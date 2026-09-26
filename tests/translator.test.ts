import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generate = vi.fn();
vi.mock('../src/background/gemini', async (orig) => ({
  ...(await orig<typeof import('../src/background/gemini')>()),
  generate: (...a: unknown[]) => generate(...a),
}));

const { TranslationCache } = await import('../src/background/cache');
const { Translator } = await import('../src/background/translator');
const { GeminiError } = await import('../src/background/gemini');
const { KeyPool } = await import('../src/background/keys');
type KeyEntry = import('../src/background/keys').KeyEntry;

const req = { id: '1', lang: 'fa' as const, items: ['A blunder! After Qxd5, Black loses the exchange.'], hints: [[]] };
const GOOD = JSON.stringify({ t: ['اشتباه بزرگ! بعد از Qxd5، سیاه کیفیت رو از دست می‌ده.'] });

function pool(keys: string[]) {
  let saved: KeyEntry[] = keys.map((key, i) => ({ id: `k${i}`, key, addedAt: i }));
  return new KeyPool({ load: async () => saved, save: async (k) => { saved = k; } });
}
const translator = (p = pool(['A'])) =>
  new Translator(new TranslationCache({ idb: new IDBFactory() }), p, async () => 'gemini-3.1-flash-lite');

let t: InstanceType<typeof Translator>;
beforeEach(() => {
  generate.mockReset();
  t = translator();
});

describe('Translator', () => {
  it('translates, then serves from cache', async () => {
    generate.mockResolvedValue(GOOD);
    expect(await t.translate(req)).toMatchObject({ type: 'translated', cached: false });
    expect(await t.translate({ ...req, id: '2' })).toMatchObject({ type: 'translated', cached: true, id: '2' });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent identical requests', async () => {
    generate.mockImplementation(() => new Promise((r) => setTimeout(() => r(GOOD), 20)));
    const [a, b] = await Promise.all([t.translate(req), t.translate({ ...req, id: '2' })]);
    expect(a.type).toBe('translated');
    expect(b.type).toBe('translated');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('retries once on invalid output, then falls back', async () => {
    generate.mockResolvedValue(JSON.stringify({ t: ['bad'] }));
    expect(await t.translate(req)).toMatchObject({ type: 'translateError', code: 'invalid' });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('reports a missing key', async () => {
    expect(await translator(pool([])).translate(req)).toMatchObject({ type: 'translateError', code: 'nokey' });
  });

  it('rotates keys round-robin', async () => {
    generate.mockResolvedValue(GOOD);
    const tr = translator(pool(['A', 'B', 'C']));
    for (let i = 0; i < 4; i++) await tr.translate({ ...req, items: [`${req.items[0]} ${'!'.repeat(i)}`] });
    expect(generate.mock.calls.map((c) => (c[0] as { apiKey: string }).apiKey)).toEqual(['A', 'B', 'C', 'A']);
  });

  it('moves on to the next key when one is rate-limited, and rests the limited key', async () => {
    const p = pool(['A', 'B']);
    generate.mockImplementation(async ({ apiKey }: { apiKey: string }) => {
      if (apiKey === 'A') throw new GeminiError('quota', 'Quota reached', 30_000, true);
      return GOOD;
    });
    expect(await translator(p).translate(req)).toMatchObject({ type: 'translated' });
    const list = await p.list();
    expect(list.find((k) => k.last4 === 'A')?.state).toBe('cooling');
    expect(list.find((k) => k.last4 === 'B')?.state).toBe('ready');
  });

  it('skips a rejected key', async () => {
    const p = pool(['A', 'B']);
    generate.mockImplementation(async ({ apiKey }: { apiKey: string }) => {
      if (apiKey === 'A') throw new GeminiError('auth', 'Invalid API key');
      return GOOD;
    });
    expect(await translator(p).translate(req)).toMatchObject({ type: 'translated' });
    expect((await p.list()).find((k) => k.last4 === 'A')?.state).toBe('invalid');
  });

  it('waits for a rate-limited key when it frees up soon', async () => {
    const p = pool(['A']);
    await p.markQuota('k0', 300);
    generate.mockResolvedValue(GOOD);
    const t0 = Date.now();
    expect(await translator(p).translate(req)).toMatchObject({ type: 'translated' });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250);
  });

  it('gives up when every key is limited for longer than the budget', async () => {
    const p = pool(['A']);
    await p.markQuota('k0', 60_000);
    expect(await translator(p).translate(req)).toMatchObject({ type: 'translateError', code: 'quota' });
    expect(generate).not.toHaveBeenCalled();
  });
});
