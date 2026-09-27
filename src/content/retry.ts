// Failed moves: a small bar in the commentary box with the cause and a "Try again" button.
// A successful retry renders the translation next to the site's (hidden) English and is cached for next time.
import type { ErrorCode, RetryResult } from '../shared/messages';
import { currentPly } from '../site/ply';
import { COMMENTARY_SLOT, REVIEW_PATH_RE, SAN_WRAPPER, SLOT_SKELETON } from '../site/selectors';
import { chipsOf } from './chips';
import { mark, originals } from './decorate';
import { renderParagraphs } from './render';
import type { Relay } from './relay';

type Ok = Extract<RetryResult, { ok: true }>;

const failures = new Map<number, { code: ErrorCode; message: string }>();
const retried = new Map<number, Ok>();
const busy = new Set<number>();
let gameId: string | null = null;

let bar: HTMLElement | null = null;
let swap: { el: HTMLElement; ply: number; slot: HTMLElement } | null = null;

const gameOf = () => (REVIEW_PATH_RE.test(location.pathname) ? location.pathname.split('/')[2] ?? null : null);

function syncGame() {
  const g = gameOf();
  if (g !== gameId) {
    gameId = g;
    failures.clear();
    retried.clear();
  }
}

export function recordFailure(g: string | undefined, ply: number | undefined, code: ErrorCode, message: string) {
  syncGame();
  if (typeof ply !== 'number' || (g && g !== gameId)) return;
  failures.set(ply, { code, message });
}

function removeBar() {
  bar?.remove();
  bar = null;
}

function removeSwap() {
  if (!swap) return;
  swap.el.remove();
  swap.slot.removeAttribute('data-kbz-swap');
  swap = null;
}

function renderSwap(slot: HTMLElement, ply: number, r: Ok) {
  if (swap?.ply === ply && swap.slot === slot && swap.el.isConnected) return;
  removeSwap();
  const chips = [...slot.querySelectorAll(SAN_WRAPPER)];
  const box = document.createElement('div');
  box.className = 'kbz-tr kbz-swapped';
  box.append(renderParagraphs(r.paragraphs, chips, (i) => chipsOf(ply)?.[i]));
  mark(box, r.lang);
  originals.set(box, { plain: r.original });
  slot.setAttribute('data-kbz-swap', '');
  slot.after(box);
  swap = { el: box, ply, slot };
}

function renderBar(slot: HTMLElement, ply: number, relay: Relay) {
  const f = failures.get(ply)!;
  const isBusy = busy.has(ply);
  const key = `${ply}|${f.message}|${isBusy}`;
  if (bar?.dataset.kbzKey === key && bar.isConnected && bar.previousElementSibling === slot) return;
  removeBar();
  const el = document.createElement('div');
  el.className = 'kbz-fail';
  el.dataset.kbzKey = key;
  el.setAttribute('role', 'status');
  const icon = document.createElement('span');
  icon.className = 'kbz-fail-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '!';
  const text = document.createElement('span');
  text.className = 'kbz-fail-text';
  const title = document.createElement('b');
  title.textContent = isBusy ? 'Translating…' : "Couldn't translate this move.";
  text.append(title, document.createTextNode(isBusy ? '' : ` ${f.message}`));
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kbz-retry';
  btn.disabled = isBusy;
  btn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3.5H10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  btn.append(document.createTextNode(isBusy ? 'Working' : 'Try again'));
  btn.addEventListener('click', () => void doRetry(ply, relay));
  el.append(icon, text, btn);
  slot.after(el);
  bar = el;
}

async function doRetry(ply: number, relay: Relay) {
  if (!gameId || busy.has(ply)) return;
  busy.add(ply);
  rescan?.();
  const r = await relay.request<RetryResult>({ type: 'retryPly', gameId, plyIndex: ply }, 30_000, {
    ok: false,
    code: 'timeout',
    message: 'Gemini took too long to answer.',
  });
  busy.delete(ply);
  if (r.ok) {
    failures.delete(ply);
    retried.set(ply, r);
  } else {
    failures.set(ply, { code: r.code, message: r.message });
  }
  rescan?.();
}

let rescan: (() => void) | null = null;

/** Called from the lifecycle scan. */
export function scanRetry(relay: Relay, schedule: () => void) {
  rescan = schedule;
  syncGame();
  const slot = document.querySelector<HTMLElement>(COMMENTARY_SLOT);
  const ply = currentPly();
  if (!slot || ply === null || ply < 0 || slot.querySelector(SLOT_SKELETON)) {
    removeBar();
    if (swap && (!slot || swap.slot !== slot || swap.ply !== ply)) removeSwap();
    return;
  }
  const r = retried.get(ply);
  if (r && slot.dataset.kbz !== 'tr') {
    removeBar();
    renderSwap(slot, ply, r);
    return;
  }
  removeSwap();
  if (failures.has(ply) && slot.dataset.kbz !== 'tr') renderBar(slot, ply, relay);
  else removeBar();
}

export function clearRetry() {
  removeBar();
  removeSwap();
  failures.clear();
  retried.clear();
}
