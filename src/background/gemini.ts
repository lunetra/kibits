// Plain REST client for the Gemini API (docs/04 → "REST"). Runs in the service worker only.
import type { ErrorCode } from '../shared/messages';
import { MODELS, type ModelId } from '../shared/models';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    /** Retry-After in ms for quota errors, when the API tells us. */
    public retryAfterMs?: number,
    public retryable = false,
  ) {
    super(message);
  }
}

/** Fields a model rejected with a 400; remembered for the SW lifetime (capability map). */
const unsupported = new Map<ModelId, Set<'thinking' | 'schema'>>();

export interface GenerateOpts {
  apiKey: string;
  model: ModelId;
  system: string;
  user: string;
  json: boolean;
  signal: AbortSignal;
}

function body(o: GenerateOpts) {
  const off = unsupported.get(o.model) ?? new Set();
  const info = MODELS[o.model];
  const generationConfig: Record<string, unknown> = { maxOutputTokens: 1024 };
  if (!off.has('thinking')) {
    generationConfig.thinkingConfig = info.thinking === 'budget' ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' };
  }
  if (info.temperature != null) generationConfig.temperature = info.temperature;
  if (o.json && !off.has('schema')) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseJsonSchema = {
      type: 'object',
      properties: { t: { type: 'array', items: { type: 'string' } } },
      required: ['t'],
    };
  }
  return {
    systemInstruction: { parts: [{ text: o.system }] },
    contents: [{ role: 'user', parts: [{ text: o.user }] }],
    generationConfig,
  };
}

interface ApiError { error?: { code?: number; message?: string; status?: string; details?: Array<Record<string, unknown>> } }

function parseRetryDelay(e: ApiError): number | undefined {
  for (const d of e.error?.details ?? []) {
    const v = d.retryDelay;
    if (typeof v === 'string') {
      const s = parseFloat(v);
      if (!Number.isNaN(s)) return s * 1000;
    }
  }
  return undefined;
}

async function errorFrom(res: Response): Promise<GeminiError> {
  let j: ApiError = {};
  try { j = (await res.json()) as ApiError; } catch { /* non-JSON error body */ }
  const msg = j.error?.message ?? `HTTP ${res.status}`;
  if (res.status === 401 || res.status === 403) return new GeminiError('auth', 'Invalid or unauthorized API key');
  if (res.status === 400 && /api key/i.test(msg)) return new GeminiError('auth', 'Invalid API key');
  if (res.status === 404) return new GeminiError('model', 'Model not available for this key');
  if (res.status === 429) return new GeminiError('quota', 'Quota reached', parseRetryDelay(j), true);
  if (res.status >= 500) return new GeminiError('network', `Server error (${res.status})`, undefined, true);
  return new GeminiError('invalid', msg);
}

export async function generate(o: GenerateOpts): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE}/${o.model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': o.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body(o)),
        signal: o.signal,
      });
    } catch (e) {
      if (o.signal.aborted) throw new GeminiError('timeout', 'Translation timed out');
      throw new GeminiError('network', (e as Error).message || 'Network error', undefined, true);
    }
    if (res.status === 400) {
      // An unsupported field (thinkingLevel value, schema) → drop it once and remember per model.
      const err = await errorFrom(res.clone());
      const off = unsupported.get(o.model) ?? new Set();
      if (/thinking/i.test(err.message) && !off.has('thinking')) { off.add('thinking'); unsupported.set(o.model, off); continue; }
      if (/response_?(json_)?schema|responseMimeType|mime/i.test(err.message) && !off.has('schema')) { off.add('schema'); unsupported.set(o.model, off); continue; }
      throw err;
    }
    if (!res.ok) throw await errorFrom(res);

    const j = (await res.json()) as {
      promptFeedback?: { blockReason?: string };
      candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
    };
    if (j.promptFeedback?.blockReason) throw new GeminiError('blocked', `Blocked: ${j.promptFeedback.blockReason}`);
    const c = j.candidates?.[0];
    const text = (c?.content?.parts ?? []).filter((p) => !p.thought && p.text).map((p) => p.text).join('');
    if (!text) throw new GeminiError('blocked', `Empty response${c?.finishReason ? ` (${c.finishReason})` : ''}`);
    return text;
  }
  throw new GeminiError('invalid', 'Request rejected by the API');
}

/** Key test: GET models/{model} → 200 = OK. */
export async function testKey(apiKey: string, model: ModelId): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${model}`, { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(8000) });
  } catch (e) {
    throw new GeminiError('network', (e as Error).message || 'Network error');
  }
  if (!res.ok) throw await errorFrom(res);
}

/** Whether the model supports the JSON-schema batch mode (Gemma uses tagged text). */
export const usesJson = (model: ModelId) => MODELS[model].structuredOutput && !unsupported.get(model)?.has('schema');
