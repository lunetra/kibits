// window.fetch wrapper (MAIN world): commentary translation + piece-atlas substitution.
// Fails open: any error, timeout or disabled state → the site's original Response.
import { LANGUAGES, type LangCode } from '../shared/languages';
import type { MainConfig, PlyHit, TranslateRes } from '../shared/messages';
import { ATLAS_RE, COMMENTARY_URL_RE } from '../site/selectors';
import { call, configReady, getConfig, send } from './bridge';
import { waitForPly } from './ply';
import { apply, collect, contentPlain, probesOf, type Block } from './richtext';

/** Hard cap for one translation round-trip (the SW may wait for a rate-limited key; it gives up at ~22 s). */
const HARD_CAP_MS = 25_000;
/** Per-move cache lookup must never slow the site down noticeably. */
const CACHE_LOOKUP_MS = 600;

const urlOf = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

const methodOf = (input: RequestInfo | URL, init?: RequestInit) =>
  (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

const translating = (c: MainConfig | null) => !!c && c.enabled && c.translate.on && !LANGUAGES[c.translate.lang].passthrough;

interface CommentaryJson {
  status?: string;
  commentary?: { gameId?: string; plyIndex?: number; content?: Block[]; text?: string; [k: string]: unknown };
  [k: string]: unknown;
}

interface PlyRef { gameId: string; plyIndex: number }

async function plyRefOf(input: RequestInfo | URL, init?: RequestInit): Promise<PlyRef | null> {
  try {
    let body: unknown = init?.body;
    if (body == null && input instanceof Request) body = await input.clone().text();
    if (typeof body !== 'string') return null;
    const j = JSON.parse(body) as { gameId?: unknown; plyIndex?: unknown };
    return typeof j.gameId === 'string' && typeof j.plyIndex === 'number' ? { gameId: j.gameId, plyIndex: j.plyIndex } : null;
  } catch {
    return null;
  }
}

function jsonResponse(body: string, like?: Response): Response {
  const headers = new Headers(like?.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('content-type', 'application/json');
  const res = new Response(body, { status: like?.status ?? 200, statusText: like?.statusText ?? 'OK', headers });
  if (like) {
    try { Object.defineProperty(res, 'url', { value: like.url }); } catch { /* cosmetic */ }
  }
  return res;
}

async function translateResponse(res: Response, ref: PlyRef | null, lang: LangCode, signal: AbortSignal | null | undefined): Promise<Response> {
  if (!res.ok) return res;
  const json = (await res.clone().json()) as CommentaryJson;
  const c = json.commentary;
  if (json.status !== 'ready' || !c || !Array.isArray(c.content)) return res;

  const plan = collect(c.content, getConfig()!.translate.playerWords);
  if (!plan.items.length) return res;

  // Only spend a translation once the user is actually looking at this move. If they've moved on, keep the
  // site waiting (it shows its skeleton for this move) until they come back — or until the request is aborted.
  const plyIndex = ref?.plyIndex ?? c.plyIndex;
  if (typeof plyIndex === 'number') {
    const onScreen = await waitForPly(plyIndex, signal, () => !translating(getConfig()));
    if (!onScreen) {
      if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
      return res; // translation switched off meanwhile
    }
  }

  const r = await call<TranslateRes>(
    { type: 'translate', lang, kind: 'ply', items: plan.items, hints: plan.hints, context: { gameId: c.gameId, plyIndex } },
    HARD_CAP_MS,
    { type: 'translateError', id: '', code: 'timeout', message: 'Translation timed out' },
  );
  // Settings may have changed while we waited: re-check before swapping content.
  if (!translating(getConfig()) || getConfig()!.translate.lang !== lang) return res;
  if (r.type !== 'translated' || r.texts.length !== plan.items.length) {
    if (r.type === 'translateError') send({ type: 'plyError', code: r.code, message: r.message });
    return res;
  }

  const original = contentPlain(c.content);
  const content = apply(c.content, plan, r.texts, LANGUAGES[lang].dir === 'rtl');
  const out: CommentaryJson = { ...json, commentary: { ...c, content, text: contentPlain(content) } };
  const probes = content.flatMap((b) => (Array.isArray(b.children) ? probesOf(b.children) : []));
  const body = JSON.stringify(out);
  send({ type: 'translatedPly', lang, probes, original });

  const gameId = ref?.gameId ?? c.gameId;
  if (typeof gameId === 'string' && typeof plyIndex === 'number') {
    void call({ type: 'plyPut', gameId, plyIndex, lang, body, original, probes }, 5000, null);
  }
  return jsonResponse(body, res);
}

async function handleCommentary(origFetch: typeof fetch, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const cfg = await configReady();
  if (!translating(cfg)) return origFetch.call(window, input, init);
  const lang = cfg!.translate.lang;
  const ref = await plyRefOf(input, init);

  // 1) Our per-move cache: serve instantly, without asking the site to generate anything.
  if (ref) {
    const hit = await call<PlyHit | null>({ type: 'plyGet', gameId: ref.gameId, plyIndex: ref.plyIndex, lang }, CACHE_LOOKUP_MS, null);
    if (hit?.body) {
      send({ type: 'translatedPly', lang, probes: hit.probes, original: hit.original });
      return jsonResponse(hit.body);
    }
  }

  // 2) The site's own response, translated when the user is on that move.
  const res = await origFetch.call(window, input, init);
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  try {
    return await translateResponse(res, ref, lang, signal);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    return res;
  }
}

export function installFetchHook() {
  const origFetch = window.fetch;

  const wrapped = async function (this: unknown, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url = '';
    try { url = urlOf(input); } catch { /* fall through */ }

    // --- piece atlases (SITE-MAP §4b): fetched once at board-module init ---
    const m = url ? ATLAS_RE.exec(url) : null;
    if (m) {
      try {
        const cfg = await configReady();
        const target = cfg?.enabled ? cfg.pieces?.[m[2] as '1' | '2' | '4'] : undefined;
        if (target) {
          const res = await origFetch.call(window, target);
          if (res.ok) return res;
        }
      } catch { /* fall through to the site's atlas */ }
      return origFetch.call(window, input, init);
    }

    // --- per-move commentary (SITE-MAP §1) ---
    if (url && COMMENTARY_URL_RE.test(url) && methodOf(input, init) === 'POST') {
      try {
        return await handleCommentary(origFetch, input, init);
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') throw e;
        return origFetch.call(window, input, init);
      }
    }

    return origFetch.call(window, input, init);
  };

  // Look like the native function to code that inspects it.
  try {
    Object.defineProperty(wrapped, 'name', { value: 'fetch' });
    wrapped.toString = () => origFetch.toString();
  } catch { /* cosmetic */ }
  window.fetch = wrapped as typeof fetch;
}
