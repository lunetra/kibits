// API key pool: round-robin over several Gemini keys, with per-key cooldown after a quota error.
// Keys live only in chrome.storage.local and are read only by the service worker (CLAUDE.md rule 1).
// A key-free public view (id, last 4 chars, status) is mirrored for the panel.

export interface KeyEntry {
  id: string;
  key: string;
  addedAt: number;
  /** Epoch ms until which the key is rate-limited. */
  cooldownUntil?: number;
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
  lastError: k.lastError,
  uses: k.uses ?? 0,
});

export type Pick = { entry: KeyEntry } | { waitMs: number } | { none: true };

export class KeyPool {
  private keys: KeyEntry[] | null = null;
  private cursor = 0;

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

  /** Next usable key in round-robin order; otherwise how long until one frees up. */
  async next(now = Date.now()): Promise<Pick> {
    const keys = await this.all();
    const usable = keys.filter((k) => !k.invalid);
    if (!usable.length) return { none: true };
    for (let i = 0; i < keys.length; i++) {
      const k = keys[(this.cursor + i) % keys.length]!;
      if (stateOf(k, now) === 'ready') {
        this.cursor = (this.cursor + i + 1) % keys.length;
        return { entry: k };
      }
    }
    const soonest = Math.min(...usable.map((k) => k.cooldownUntil ?? now));
    return { waitMs: Math.max(0, soonest - now) };
  }

  async markOk(id: string) {
    const k = await this.get(id);
    if (!k) return;
    k.uses = (k.uses ?? 0) + 1;
    k.lastOkAt = Date.now();
    const changed = k.invalid || k.cooldownUntil || k.lastError;
    k.invalid = false;
    k.cooldownUntil = undefined;
    k.lastError = undefined;
    // Only persist state flips eagerly; plain use counters are saved at most every 10 uses.
    if (changed || k.uses % 10 === 0) await this.commit();
  }

  async markQuota(id: string, retryAfterMs?: number) {
    const k = await this.get(id);
    if (!k) return;
    k.cooldownUntil = Date.now() + (retryAfterMs && retryAfterMs > 0 ? retryAfterMs : DEFAULT_COOLDOWN_MS);
    k.lastError = 'Rate limit reached';
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
