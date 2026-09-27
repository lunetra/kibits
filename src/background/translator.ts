// Translation pipeline (docs/04 → "Pipeline"): normalize → cache → dedupe → queue → model → validate.
import { hash } from '../shared/hash';
import type { LangCode } from '../shared/languages';
import type { TranslateReq, TranslateRes } from '../shared/messages';
import { MODELS, type ModelId } from '../shared/models';
import type { TranslationCache } from './cache';
import type { KeyPool } from './keys';
import { GeminiError, generate, usesJson } from './gemini';
import { buildJsonPayload, buildSystemPrompt, buildTaggedPayload, parseJson, parseTagged, PROMPT_VERSION } from './prompt';
import { validate } from './validate';

/** Budget for one model call. */
export const TIMEOUT_MS = 7000;
/** Overall budget, including waiting for a rate-limited key to free up. The MAIN world gives up at 25 s. */
export const TOTAL_BUDGET_MS = 22_000;
const CONCURRENCY = 3;

export const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

export const cacheKey = (lang: LangCode, items: string[]) =>
  `v${PROMPT_VERSION}:${lang}:${hash(items.join('␞'))}`;

class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;
  constructor(private max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const inWords = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  if (s < 90) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m} min` : `${Math.round(m / 60)} h`;
};
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Clear, user-facing explanation of a failure (shown in the commentary box and the panel). */
export function explain(err: GeminiError, model: ModelId): string {
  switch (err.code) {
    case 'nokey': return err.message;
    case 'auth': return 'Your API key was rejected. Check it in the Kibitz panel.';
    case 'quota': return err.message;
    case 'model': return `“${MODELS[model].label}” isn't available for your key. Pick another model in the Kibitz panel.`;
    case 'network': return "Couldn't reach Gemini. Check your internet connection.";
    case 'timeout': return 'Gemini took too long to answer.';
    case 'blocked': return 'Gemini declined to translate this text.';
    case 'invalid': return "Gemini's answer changed the moves or broke the text, so it wasn't used.";
  }
}

type Outcome = { texts: string[]; model: ModelId; cached: boolean };

export class Translator {
  private inflight = new Map<string, Promise<Outcome>>();
  private sem = new Semaphore(CONCURRENCY);

  constructor(
    private cache: TranslationCache,
    private keys: KeyPool,
    private getModel: () => Promise<ModelId>,
  ) {}

  async translate(req: Pick<TranslateReq, 'id' | 'lang' | 'items' | 'hints' | 'context'>): Promise<TranslateRes> {
    const t0 = Date.now();
    try {
      const items = req.items.map(normalize);
      const key = cacheKey(req.lang, items);
      const hit = await this.cache.get(key);
      if (hit) return { type: 'translated', id: req.id, texts: hit.texts, cached: true, ms: Date.now() - t0, model: hit.model as ModelId };

      let p = this.inflight.get(key);
      if (!p) {
        p = this.sem.run(() => this.run(key, { ...req, items })).finally(() => this.inflight.delete(key));
        this.inflight.set(key, p);
      }
      const out = await p;
      return { type: 'translated', id: req.id, texts: out.texts, cached: out.cached, ms: Date.now() - t0, model: out.model };
    } catch (e) {
      const err = e instanceof GeminiError ? e : new GeminiError('invalid', (e as Error).message);
      return { type: 'translateError', id: req.id, code: err.code, message: explain(err, await this.getModel()) };
    }
  }

  private async run(key: string, req: Pick<TranslateReq, 'lang' | 'items' | 'hints' | 'context'>): Promise<Outcome> {
    const model = await this.getModel();
    const deadline = Date.now() + TOTAL_BUDGET_MS;
    const system = buildSystemPrompt(req.lang, req.items);
    const json = usesJson(model);
    const payload = { items: req.items, hints: req.hints, context: req.context };
    const user = json ? buildJsonPayload(payload) : buildTaggedPayload(payload);

    let lastErr: GeminiError | null = null;
    let netRetries = 0;
    let invalidRetries = 0;

    for (let attempt = 0; attempt < 12 && Date.now() < deadline; attempt++) {
      const pick = await this.keys.next();
      if ('none' in pick) {
        const sum = await this.keys.summary();
        if (!sum.total) throw new GeminiError('nokey', 'No API key added yet. Add one in the Kibitz panel.');
        throw new GeminiError('auth', sum.total === 1 ? 'Your API key was rejected.' : 'All your API keys were rejected.');
      }
      if ('waitMs' in pick) {
        // Every key is rate-limited: wait for the first one to free up, if it fits in the budget.
        if (Date.now() + pick.waitMs + 1500 > deadline) {
          const sum = await this.keys.summary();
          const all = sum.total > 1 ? `all ${sum.total} keys` : 'your key';
          const next = sum.nextFreeAt ?? Date.now() + pick.waitMs;
          throw new GeminiError(
            'quota',
            sum.daily && !sum.minute
              ? `Daily free limit reached on ${all}. It resets at ${clock(next)} (in ${inWords(next - Date.now())}).`
              : `Rate limit reached on ${all}. Next key is free in ${inWords(next - Date.now())}.`,
          );
        }
        await sleep(pick.waitMs + 50);
        continue;
      }
      const k = pick.entry;
      const signal = AbortSignal.timeout(Math.max(1, Math.min(TIMEOUT_MS, deadline - Date.now())));
      try {
        const raw = await generate({ apiKey: k.key, model, system, user, json, signal });
        const parsed = json ? parseJson(raw, req.items.length) : parseTagged(raw, req.items.length);
        if (!parsed) throw new GeminiError('invalid', 'Could not parse model output');
        const texts: string[] = [];
        for (let i = 0; i < parsed.length; i++) {
          const v = validate(req.items[i]!, parsed[i]!, req.lang);
          if (!v.ok) throw new GeminiError('invalid', `Validation failed: ${v.reason}`);
          texts.push(v.text);
        }
        await this.keys.markOk(k.id);
        await this.cache.set(key, { texts, model, ts: Date.now() });
        return { texts, model, cached: false };
      } catch (e) {
        const err = e instanceof GeminiError ? e : new GeminiError('network', (e as Error).message);
        lastErr = err;
        if (err.code === 'quota') { await this.keys.markQuota(k.id, err.retryAfterMs, err.quotaKind); continue; } // next key
        if (err.code === 'auth') { await this.keys.markInvalid(k.id, err.message); continue; } // next key
        if (err.code === 'network' && netRetries < 1) { netRetries++; continue; }
        if (err.code === 'invalid' && invalidRetries < 1) { invalidRetries++; continue; }
        break;
      }
    }
    throw lastErr ?? new GeminiError('timeout', 'Translation timed out');
  }
}
