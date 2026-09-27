// Service worker: the only context that reads the API key or talks to Gemini.
import { browser } from 'wxt/browser';
import { plyKey, TranslationCache } from '@/src/background/cache';
import { KeyPool, type KeyEntry } from '@/src/background/keys';
import { GeminiError, testKey } from '@/src/background/gemini';
import { Translator } from '@/src/background/translator';
import { LANGUAGES } from '@/src/shared/languages';
import {
  EMPTY_STATUS, KEYS_KEY, STATUS_KEY,
  type CacheStats, type PlyHit, type RuntimeReq, type SampleRes, type Status, type TestKeyRes, type TranslateRes,
} from '@/src/shared/messages';
import { loadSettings, onSettingsChanged } from '@/src/shared/settings-store';

const KEYS = 'apiKeys';
/** v0.1 stored a single key here; migrated into the pool on first load. */
const LEGACY_KEY = 'apiKey';
/** Real site sample (SITE-MAP §1), used for the panel preview. */
const SAMPLE =
  'White immediately challenges the center with d4, leading into the sharp lines of the Center Game. By attacking the e5 pawn, White forces Black to decide how to resolve the tension in the heart of the board.';

export default defineBackground(() => {
  const cache = new TranslationCache();
  const pool = new KeyPool(
    {
      async load() {
        const r = await browser.storage.local.get([KEYS, LEGACY_KEY]);
        const keys = (r[KEYS] as KeyEntry[] | undefined) ?? [];
        const legacy = r[LEGACY_KEY] as string | undefined;
        if (legacy && !keys.some((k) => k.key === legacy)) {
          keys.push({ id: crypto.randomUUID(), key: legacy, addedAt: Date.now() });
          await browser.storage.local.set({ [KEYS]: keys });
        }
        if (legacy) await browser.storage.local.remove(LEGACY_KEY);
        return keys;
      },
      async save(keys) {
        await browser.storage.local.set({ [KEYS]: keys });
      },
    },
    (pub) => void browser.storage.session.set({ [KEYS_KEY]: pub }),
  );
  // Publish the key-free view for the panel on startup (also migrates a legacy single key).
  void pool.list().then((pub) => browser.storage.session.set({ [KEYS_KEY]: pub }));
  const getModel = async () => (await loadSettings()).translation.model;
  const translator = new Translator(cache, pool, getModel);

  // ---------- status (chrome.storage.session: trusted contexts only) ----------
  let status: Status = structuredClone(EMPTY_STATUS);
  const statusReady = browser.storage.session.get(STATUS_KEY).then((r) => {
    status = { ...status, ...(r[STATUS_KEY] as Status | undefined) };
  });
  const setStatus = async (patch: Partial<Status>) => {
    await statusReady;
    status = { ...status, ...patch };
    await browser.storage.session.set({ [STATUS_KEY]: status });
    await browser.action.setBadgeText({ text: status.consecutiveErrors >= 2 ? '!' : '' });
    await browser.action.setBadgeBackgroundColor({ color: '#D29922' });
  };

  // ---------- toolbar icon reflects the master switch ----------
  const setIcon = (on: boolean) => {
    const dir = on ? 'icon' : 'icon-off';
    void browser.action.setIcon({ path: { 16: `/${dir}/16.png`, 32: `/${dir}/32.png`, 48: `/${dir}/48.png` } });
  };
  void loadSettings().then((s) => setIcon(s.enabled));
  onSettingsChanged((s) => setIcon(s.enabled));

  async function onTranslated(res: TranslateRes) {
    if (res.type === 'translated') {
      if (!res.cached) console.debug(`[kbz] translated in ${res.ms} ms (${res.model})`);
      await setStatus({ lastMs: res.ms, consecutiveErrors: 0 });
    } else {
      await setStatus({
        lastError: { code: res.code, message: res.message, ts: Date.now() },
        consecutiveErrors: status.consecutiveErrors + 1,
      });
    }
  }

  async function handle(msg: RuntimeReq): Promise<unknown> {
    switch (msg.type) {
      case 'translate': {
        const res = await translator.translate(msg);
        void onTranslated(res);
        return res;
      }
      case 'report':
        await setStatus({ board: msg.kind === 'boardUnsupported' ? { unsupported: true, reason: msg.reason } : { unsupported: false } });
        return null;
      case 'plyGet': {
        const v = await cache.getPly(plyKey(msg.gameId, msg.plyIndex, msg.lang));
        return (v ? { body: v.body, original: v.original, probes: v.probes, originalNodes: v.originalNodes } : null) satisfies PlyHit | null;
      }
      case 'plyPut':
        await cache.setPly(plyKey(msg.gameId, msg.plyIndex, msg.lang), { body: msg.body, original: msg.original, probes: msg.probes, originalNodes: msg.originalNodes, ts: Date.now() });
        return true;
      case 'keysList':
        return pool.list();
      case 'keyAdd':
        return pool.add(msg.key);
      case 'keyRemove':
        await pool.remove(msg.id);
        return true;
      case 'keyTest': {
        const k = await pool.get(msg.id);
        if (!k) return { ok: false, code: 'nokey', message: 'Key not found' } satisfies TestKeyRes;
        try {
          await testKey(k.key, msg.model);
          await pool.markOk(k.id);
          return { ok: true } satisfies TestKeyRes;
        } catch (e) {
          const err = e as GeminiError;
          if (err.code === 'auth') await pool.markInvalid(k.id, err.message);
          if (err.code === 'quota') await pool.markQuota(k.id, err.retryAfterMs, err.quotaKind);
          return { ok: false, code: err.code, message: err.message } satisfies TestKeyRes;
        }
      }
      case 'sample': {
        if (LANGUAGES[msg.lang].passthrough) return { ok: true, source: SAMPLE, text: SAMPLE } satisfies SampleRes;
        const res = await translator.translate({ id: 'sample', lang: msg.lang, items: [SAMPLE], hints: [[]] });
        void onTranslated(res);
        return (res.type === 'translated'
          ? { ok: true, source: SAMPLE, text: res.texts[0], ms: res.ms, cached: res.cached }
          : { ok: false, source: SAMPLE, message: res.message }) satisfies SampleRes;
      }
      case 'cacheStats':
        return (await cache.stats()) satisfies CacheStats;
      case 'clearCache':
        await cache.clear();
        return (await cache.stats()) satisfies CacheStats;
    }
  }

  browser.runtime.onMessage.addListener((msg: RuntimeReq, sender, sendResponse) => {
    // Only our own extension pages / content scripts can reach this listener (no externally_connectable).
    if (sender.id !== browser.runtime.id) return false;
    handle(msg).then(sendResponse, (e) => sendResponse({ type: 'translateError', id: (msg as { id?: string }).id ?? '', code: 'invalid', message: String(e) }));
    return true;
  });
});
