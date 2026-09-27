// window.fetch wrapper (MAIN world): commentary translation + piece-atlas substitution.
// Fails open: any error, timeout or disabled state → the site's original Response.
import { LANGUAGES, type LangCode } from '../shared/languages';
import type { ErrorCode, MainConfig, PlyHit, RetryNode, RetryResult, TranslateRes } from '../shared/messages';
import { ATLAS_RE, COMMENTARY_URL_RE } from '../site/selectors';
import { call, configReady, getConfig, onRetry, send } from './bridge';
import { playersFromTitle, userColorFrom } from '../site/game';
import { waitForPly } from '../site/ply';
import { getFlipped } from './gpu-hook';
import { apply, collect, contentPlain, nodePlain, probesOf, sansOf, type Block, type Inline } from './richtext';

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

type PlyOutcome =
  | { ok: true; body: string; content: Block[]; original: string; probes: string[] }
  | { ok: false; code: ErrorCode; message: string };

/** Moves whose translation failed, kept (capped) so the "Try again" button can retry without the site. */
const failed = new Map<string, { json: CommentaryJson; gameId: string; plyIndex: number }>();
const FAILED_CAP = 100;
const failKey = (gameId: string, plyIndex: number) => `${gameId}:${plyIndex}`;

/** Translate one commentary JSON; on success cache it per move and tell the isolated script. */
async function translatePly(json: CommentaryJson, gameId: string | undefined, plyIndex: number | undefined, lang: LangCode): Promise<PlyOutcome> {
  const c = json.commentary!;
  const plan = collect(c.content!, getConfig()!.translate.playerWords);
  const r = await call<TranslateRes>(
    {
      type: 'translate', lang, kind: 'ply', items: plan.items, hints: plan.hints,
      context: { gameId, plyIndex, userColor: userColorFrom(getFlipped()), players: playersFromTitle() },
    },
    HARD_CAP_MS,
    { type: 'translateError', id: '', code: 'timeout', message: 'Gemini took too long to answer.' },
  );
  if (r.type !== 'translated' || r.texts.length !== plan.items.length) {
    return r.type === 'translateError' ? { ok: false, code: r.code, message: r.message } : { ok: false, code: 'invalid', message: 'Unexpected answer' };
  }
  const original = contentPlain(c.content!);
  const content = apply(c.content!, plan, r.texts, LANGUAGES[lang].dir === 'rtl');
  const out: CommentaryJson = { ...json, commentary: { ...c, content, text: contentPlain(content) } };
  const probes = content.flatMap((b) => (Array.isArray(b.children) ? probesOf(b.children) : []));
  const body = JSON.stringify(out);
  const originalNodes = describe(c.content!, content);
  send({ type: 'translatedPly', lang, probes, original, originalNodes });
  if (typeof plyIndex === 'number') send({ type: 'plySans', plyIndex, sans: sansOf(content) });
  if (typeof gameId === 'string' && typeof plyIndex === 'number') {
    failed.delete(failKey(gameId, plyIndex));
    void call({ type: 'plyPut', gameId, plyIndex, lang, body, original, probes, originalNodes }, 5000, null);
  }
  return { ok: true, body, content, original, probes };
}

async function translateResponse(res: Response, ref: PlyRef | null, lang: LangCode, signal: AbortSignal | null | undefined): Promise<Response> {
  if (!res.ok) return res;
  const json = (await res.clone().json()) as CommentaryJson;
  const c = json.commentary;
  if (json.status !== 'ready' || !c || !Array.isArray(c.content)) return res;
  if (!collect(c.content, getConfig()!.translate.playerWords).items.length) return res;

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

  const gameId = ref?.gameId ?? c.gameId;
  const r = await translatePly(json, gameId, plyIndex, lang);
  // Settings may have changed while we waited: re-check before swapping content.
  if (!translating(getConfig()) || getConfig()!.translate.lang !== lang) return res;
  if (!r.ok) {
    // Show the English, and let the user retry from the commentary box.
    if (typeof gameId === 'string' && typeof plyIndex === 'number') {
      failed.set(failKey(gameId, plyIndex), { json, gameId, plyIndex });
      if (failed.size > FAILED_CAP) failed.delete(failed.keys().next().value!);
    }
    send({ type: 'plyError', code: r.code, message: r.message, gameId, plyIndex });
    if (typeof plyIndex === 'number') send({ type: 'plySans', plyIndex, sans: sansOf(c.content) });
    return res;
  }
  return jsonResponse(r.body, res);
}

/**
 * Describe `source` paragraphs for DOM rendering, with move chips referenced by their position among the
 * chips the site renders for `rendered` (same node objects: rebuild() reuses the original san nodes).
 */
function describe(source: Block[], rendered: Block[]): RetryNode[][] {
  const shown: Inline[] = rendered.flatMap((b) => (b.children ?? []).filter((n) => (n as { type?: string }).type === 'san'));
  return source
    .filter((b) => Array.isArray(b.children))
    .map((b) =>
      b.children!.map((n): RetryNode => {
        if (typeof (n as { text?: unknown }).text === 'string') return { text: (n as { text: string }).text };
        const i = shown.indexOf(n);
        return i >= 0 ? { chip: i } : { word: nodePlain(n) };
      }),
    );
}

/** "Try again": translate a failed move again. The site already shows its English, so we return render data. */
async function retry(gameId: string, plyIndex: number): Promise<RetryResult> {
  const f = failed.get(failKey(gameId, plyIndex));
  const cfg = getConfig();
  if (!f || !translating(cfg)) return { ok: false, code: 'invalid', message: 'Nothing to retry. Reload the page.' };
  const lang = cfg!.translate.lang;
  const r = await translatePly(f.json, gameId, plyIndex, lang);
  if (!r.ok) return r;
  // The site still shows the English, so chips are referenced by their position in the original text.
  return { ok: true, lang, paragraphs: describe(r.content, f.json.commentary!.content!), original: r.original };
}

export function installRetry() {
  onRetry(retry);
}

async function reportSans(res: Response, plyIndex: number) {
  try {
    const content = ((await res.clone().json()) as CommentaryJson).commentary?.content;
    if (Array.isArray(content)) send({ type: 'plySans', plyIndex, sans: sansOf(content) });
  } catch { /* not JSON / not ready */ }
}

async function handleCommentary(origFetch: typeof fetch, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const cfg = await configReady();
  const ref = await plyRefOf(input, init);
  if (!translating(cfg)) {
    const res = await origFetch.call(window, input, init);
    if (cfg?.enabled && ref) void reportSans(res, ref.plyIndex); // hover arrows work in English too
    return res;
  }
  const lang = cfg!.translate.lang;

  // 1) Our per-move cache: serve instantly, without asking the site to generate anything.
  if (ref) {
    const hit = await call<PlyHit | null>({ type: 'plyGet', gameId: ref.gameId, plyIndex: ref.plyIndex, lang }, CACHE_LOOKUP_MS, null);
    if (hit?.body) {
      send({ type: 'translatedPly', lang, probes: hit.probes, original: hit.original, originalNodes: hit.originalNodes });
      try {
        const content = (JSON.parse(hit.body) as CommentaryJson).commentary?.content;
        if (content) send({ type: 'plySans', plyIndex: ref.plyIndex, sans: sansOf(content) });
      } catch { /* cosmetic */ }
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
