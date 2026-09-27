// Translation cache: in-memory LRU (500) in front of IndexedDB (docs/04 → "Pipeline" step 2).

export interface CacheValue { texts: string[]; model: string; ts: number }

export class LRU<V> {
  private map = new Map<string, V>();
  constructor(private cap: number) {}
  get(k: string): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) { this.map.delete(k); this.map.set(k, v); }
    return v;
  }
  set(k: string, v: V) {
    this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.cap) this.map.delete(this.map.keys().next().value!);
  }
  clear() { this.map.clear(); }
  get size() { return this.map.size; }
}

const DB = 'kibitz';
const DB_VERSION = 2;
/** Text cache: normalized source hash → translation (summary, preview, and as a second tier for plies). */
const STORE = 'tr';
/** Per-move cache: gameId:plyIndex:lang → full translated commentary response. Kept forever (user clears it). */
const PLY = 'ply';

export interface PlyValue {
  /** The translated JSON body served to the site. */
  body: string;
  /** Original English plain text, for "hover original". */
  original: string;
  probes: string[];
  /** English original with chip positions, for the "Original" toggle. */
  originalNodes?: import('../shared/messages').RetryNode[][];
  ts: number;
}

export const plyKey = (gameId: string, plyIndex: number, lang: string) => `${gameId}:${plyIndex}:${lang}`;

function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = idb.open(DB, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'k' }).createIndex('ts', 'ts');
      if (!db.objectStoreNames.contains(PLY)) db.createObjectStore(PLY, { keyPath: 'k' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export class TranslationCache {
  private mem: LRU<CacheValue>;
  private db: Promise<IDBDatabase> | null = null;
  private writes = 0;

  constructor(private opts: { memCap?: number; dbCap?: number; idb?: IDBFactory } = {}) {
    this.mem = new LRU(opts.memCap ?? 500);
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= openDb(this.opts.idb ?? indexedDB);
    return this.db;
  }

  async get(k: string): Promise<CacheValue | undefined> {
    const m = this.mem.get(k);
    if (m) return m;
    try {
      const db = await this.open();
      const row = await req(db.transaction(STORE).objectStore(STORE).get(k)) as (CacheValue & { k: string }) | undefined;
      if (!row) return undefined;
      const v = { texts: row.texts, model: row.model, ts: row.ts };
      this.mem.set(k, v);
      return v;
    } catch {
      return undefined;
    }
  }

  async set(k: string, v: CacheValue): Promise<void> {
    this.mem.set(k, v);
    try {
      const db = await this.open();
      await req(db.transaction(STORE, 'readwrite').objectStore(STORE).put({ k, ...v }));
      if (++this.writes % 50 === 0) await this.evict();
    } catch { /* cache is best-effort */ }
  }

  /** Drop the oldest entries beyond dbCap. */
  async evict(): Promise<void> {
    const cap = this.opts.dbCap ?? 5000;
    const db = await this.open();
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    let excess = (await req(store.count())) - cap;
    if (excess <= 0) return;
    await new Promise<void>((res, rej) => {
      const cur = store.index('ts').openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c || excess <= 0) return res();
        c.delete();
        excess--;
        c.continue();
      };
      cur.onerror = () => rej(cur.error);
    });
  }

  async count(): Promise<number> {
    try {
      const db = await this.open();
      return await req(db.transaction(STORE).objectStore(STORE).count());
    } catch {
      return this.mem.size;
    }
  }

  async clear(): Promise<void> {
    this.mem.clear();
    const db = await this.open();
    await req(db.transaction(STORE, 'readwrite').objectStore(STORE).clear());
    await req(db.transaction(PLY, 'readwrite').objectStore(PLY).clear());
  }

  // ---------- per-move cache ----------

  async getPly(k: string): Promise<PlyValue | undefined> {
    try {
      const db = await this.open();
      const row = (await req(db.transaction(PLY).objectStore(PLY).get(k))) as (PlyValue & { k: string }) | undefined;
      return row ? { body: row.body, original: row.original, probes: row.probes, originalNodes: row.originalNodes, ts: row.ts } : undefined;
    } catch {
      return undefined;
    }
  }

  async setPly(k: string, v: PlyValue): Promise<void> {
    try {
      const db = await this.open();
      await req(db.transaction(PLY, 'readwrite').objectStore(PLY).put({ k, ...v }));
    } catch { /* best-effort */ }
  }

  /** Number of cached moves and the approximate size of everything cached, in bytes. */
  async stats(): Promise<{ moves: number; bytes: number }> {
    try {
      const db = await this.open();
      let bytes = 0;
      const sizeOf = (store: string) =>
        new Promise<void>((res, rej) => {
          const cur = db.transaction(store).objectStore(store).openCursor();
          cur.onsuccess = () => {
            const c = cur.result;
            if (!c) return res();
            bytes += JSON.stringify(c.value).length * 2; // UTF-16 in memory; close enough for display
            c.continue();
          };
          cur.onerror = () => rej(cur.error);
        });
      await sizeOf(PLY);
      await sizeOf(STORE);
      const moves = await req(db.transaction(PLY).objectStore(PLY).count());
      return { moves, bytes };
    } catch {
      return { moves: 0, bytes: 0 };
    }
  }
}
