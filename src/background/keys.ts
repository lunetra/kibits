// API key pool: spreads requests over several Gemini keys (least-recently-used first, so each key rests as
// long as possible between calls), with a per-key cooldown after a rate-limit error.
// Note: Gemini quotas are per Google Cloud *project*. Keys from the same project share one quota.
// Keys live only in chrome.storage.local and are read only by the service worker (CLAUDE.md rule 1).
// A key-free public view (id, last 4 chars, status) is mirrored for the panel.

export interface KeyEntry {
  id: string;
  key: string;
  addedAt: number;
  /** Epoch ms until which the key is rate-limited. */
  cooldownUntil?: number;
  /** Which limit it hit: a per-minute limit or the daily free-tier cap. */
  limit?: 'minute' | 'day';
  /** Epoch ms of the last request with this key (persisted, so rotation survives service-worker restarts). */
  lastUsedAt?: number;
  /** Rejected by the API (401/403); skipped until tested OK again. */
  invalid?: boolean;
  lastError?: string;
  lastOkAt?: number;
  uses?: number;
}

export type KeyState = 'ready' | 'cooling' | 'invalid';

export interface PublicKey {
  id: string;
  last4: string;
  state: KeyState;
  cooldownUntil?: number;
  limit?: 'minute' | 'day';
  lastError?: string;
  uses: number;
}

/** Default cooldown when a 429 doesn't say how long to wait. */
export const DEFAULT_COOLDOWN_MS = 60_000;

export interface KeyStore {
  load(): Promise<KeyEntry[]>;
  save(keys: KeyEntry[]): Promise<void>;
}

export const stateOf = (k: KeyEntry, now = Date.now()): KeyState =>
  k.invalid ? 'invalid' : k.cooldownUntil && k.cooldownUntil > now ? 'cooling' : 'ready';

export const toPublic = (k: KeyEntry, now = Date.now()): PublicKey => ({
  id: k.id,
  last4: k.key.slice(-4),
  state: stateOf(k, now),
  cooldownUntil: k.cooldownUntil && k.cooldownUntil > now ? k.cooldownUntil : undefined,
  limit: k.cooldownUntil && k.cooldownUntil > now ? k.limit : undefined,
  lastError: k.lastError,
  uses: k.uses ?? 0,
});

export type Pick = { entry: KeyEntry } | { waitMs: number } | { none: true };

export class KeyPool {
  private keys: KeyEntry[] | null = null;

  constructor(private store: KeyStore, private onChange: (keys: PublicKey[]) => void = () => {}) {}

  async all(): Promise<KeyEntry[]> {
    this.keys ??= await this.store.load();
    return this.keys;
  }

  private async commit() {
    await this.store.save(this.keys!);
    this.onChange(this.keys!.map((k) => toPublic(k)));
  }

  async list(): Promise<PublicKey[]> {
    return (await this.all()).map((k) => toPublic(k));
  }

  async add(key: string): Promise<'added' | 'duplicate' | 'empty'> {
    const k = key.trim();
    if (!k) return 'empty';
    const keys = await this.all();
    if (keys.some((e) => e.key === k)) return 'duplicate';
    keys.push({ id: crypto.randomUUID(), key: k, addedAt: Date.now() });
    await this.commit();
    return 'added';
  }

  async remove(id: string) {
    this.keys = (await this.all()).filter((k) => k.id !== id);
    await this.commit();
  }

  async get(id: string) {
    return (await this.all()).find((k) => k.id === id);
  }

  /**
   * The ready key that has rested longest (least recently used). This naturally gives key 1 → move 1,
   * key 2 → move 2, … and keeps working after the service worker restarts, because lastUsedAt is stored.
   * If none is ready: how long until the first one frees up.
   */
  async next(now = Date.now()): Promise<Pick> {
    const keys = await this.all();
    const usable = keys.filter((k) => !k.invalid);
    if (!usable.length) return { none: true };
    const ready = usable.filter((k) => stateOf(k, now) === 'ready');
    if (ready.length) {
      const entry = ready.reduce((a, b) => ((a.lastUsedAt ?? 0) <= (b.lastUsedAt ?? 0) ? a : b));
      entry.lastUsedAt = now;
      await this.commit();
      return { entry };
    }
    const soonest = Math.min(...usable.map((k) => k.cooldownUntil ?? now));
    return { waitMs: Math.max(0, soonest - now) };
  }

  /** Summary for error messages when nothing is usable. */
  async summary(now = Date.now()) {
    const keys = await this.all();
    const cooling = keys.filter((k) => stateOf(k, now) === 'cooling');
    return {
      total: keys.length,
      invalid: keys.filter((k) => k.invalid).length,
      daily: cooling.filter((k) => k.limit === 'day').length,
      minute: cooling.filter((k) => k.limit !== 'day').length,
      nextFreeAt: cooling.length ? Math.min(...cooling.map((k) => k.cooldownUntil!)) : undefined,
    };
  }

  async markOk(id: string) {
    const k = await this.get(id);
    if (!k) return;
    k.uses = (k.uses ?? 0) + 1;
    k.lastOkAt = Date.now();
    k.invalid = false;
    k.cooldownUntil = undefined;
    k.limit = undefined;
    k.lastError = undefined;
    await this.commit();
  }

  async markQuota(id: string, retryAfterMs?: number, kind: 'minute' | 'day' = 'minute') {
    const k = await this.get(id);
    if (!k) return;
    k.cooldownUntil = Date.now() + (retryAfterMs && retryAfterMs > 0 ? retryAfterMs : DEFAULT_COOLDOWN_MS);
    k.limit = kind;
    k.lastError = kind === 'day' ? 'Daily free limit reached' : 'Per-minute limit reached';
    await this.commit();
  }

  async markInvalid(id: string, message: string) {
    const k = await this.get(id);
    if (!k) return;
    k.invalid = true;
    k.lastError = message;
    await this.commit();
  }

  /** Publish the current view again (e.g. when a cooldown has expired). */
  async refresh() {
    if (this.keys) this.onChange(this.keys.map((k) => toPublic(k)));
  }
}
