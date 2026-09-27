// Move chips in the commentary (e.g. "♘ a4"):
// - hover → the site's own arrow for that move appears on the board (a right-button drag, removed the same way);
// - click → the move is played on the board (content/line.ts handles the exploration session).
// Chips the site tagged wrongly (a square like "c5" that isn't a legal move) stay plain.
import type { ChipSan } from '../shared/messages';
import { gameMoves, resolveMove, type Squares } from '../site/moves';
import { currentPly, inVariation } from '../site/ply';
import { BOARD_CANVAS, COMMENTARY_SLOT, REVIEW_PATH_RE, SAN_WRAPPER } from '../site/selectors';
import { rightDrag } from './board';

const sansByPly = new Map<number, ChipSan[]>();
/**
 * The game move whose commentary is on screen. While you explore a line the site keeps showing that move's
 * commentary (it doesn't generate commentary for off-game positions), so chips still belong to this move.
 */
let commentaryPly: number | null = null;
let gameId: string | null = null;
const gameListeners: Array<() => void> = [];

export const gameOf = () => (REVIEW_PATH_RE.test(location.pathname) ? location.pathname.split('/')[2] ?? null : null);

/** Called whenever another game is opened (SPA navigation). */
export const onGameChange = (cb: () => void) => gameListeners.push(cb);

function syncGame() {
  const g = gameOf();
  if (g === gameId) return;
  gameId = g;
  sansByPly.clear();
  commentaryPly = null;
  for (const cb of gameListeners) cb();
}

export function setChips(plyIndex: number, sans: ChipSan[]) {
  syncGame();
  sansByPly.set(plyIndex, sans);
}

export const chipsOf = (plyIndex: number) => sansByPly.get(plyIndex);

/** The game move the visible commentary belongs to (see commentaryPly). */
export function contextPly(): number | null {
  const cur = currentPly();
  if (cur !== null && cur >= 0) return cur;
  return inVariation() ? commentaryPly : cur;
}

export function chipFor(target: EventTarget | null): { chip: ChipSan } | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(SAN_WRAPPER);
  if (!el) return null;
  // A chip we cloned (retry / original view) carries its SAN directly.
  const own = el.closest<HTMLElement>('[data-kbz-san]');
  if (own) return { chip: { san: own.dataset.kbzSan!, color: own.dataset.kbzColor as ChipSan['color'] } };
  const slot = el.closest(COMMENTARY_SLOT);
  const ply = contextPly();
  if (!slot || ply === null || ply < 0) return null;
  const chips = [...slot.querySelectorAll(SAN_WRAPPER)];
  const chip = chipsOf(ply)?.[chips.indexOf(el)];
  return chip ? { chip } : null;
}

/** Keep commentaryPly current and mark real-move chips clickable. Called from the lifecycle scan. */
export function scanChips() {
  syncGame();
  const cur = currentPly();
  if (cur !== null && cur >= 0) commentaryPly = cur;
  const ply = contextPly();
  const moves = gameMoves();
  for (const el of document.querySelectorAll<HTMLElement>(`${COMMENTARY_SLOT} ${SAN_WRAPPER}, .kbz-tr ${SAN_WRAPPER}, .kbz-orig ${SAN_WRAPPER}`)) {
    // React reuses these elements between moves, so remember what we judged, not just that we did.
    const key = `${ply}:${el.textContent}`;
    if (el.dataset.kbzChipKey === key) continue;
    const hit = chipFor(el);
    if (!hit || ply === null || ply < 0) continue; // chip data not known yet: try again next scan
    const r = resolveMove(moves, ply, hit.chip);
    el.dataset.kbzChipKey = key;
    el.setAttribute('data-kbz-chip', r ? '' : 'off');
    // The move that was just played gets a different hint: clicking it only shows it again.
    if (r) el.title = r.before && moves[ply] === hit.chip.san ? 'Show this move again' : 'Play this move on the board';
    else el.removeAttribute('title');
  }
}

// ---------- hover arrows ----------

/** The arrow we drew (so the same drag can remove it), or null. */
let drawn: { key: string; ply: number | null; sq: Squares } | null = null;
/** While a replay runs (and its animation plays), hover arrows stay off so nothing pops in mid-move. */
let quietUntil = 0;
export const quiet = (ms: number) => (quietUntil = Math.max(quietUntil, Date.now() + ms));

function draw(sq: Squares) {
  const key = `${sq.from}${sq.to}`;
  if (drawn?.key === key) return;
  hideArrow();
  if (rightDrag(sq)) drawn = { key, ply: currentPly(), sq };
}

export function hideArrow() {
  if (!drawn) return;
  const d = drawn;
  drawn = null;
  // The site keeps arrows per position; if the move changed, ours is already gone.
  if (d.ply === currentPly()) rightDrag(d.sq);
}

/** A real click on the board clears the site's arrows: forget ours so we don't draw it back. */
function onBoardPointer(e: PointerEvent) {
  if (drawn && e.isTrusted && e.target instanceof Element && e.target.matches(BOARD_CANVAS)) drawn = null;
}

let hoveringChip = false;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;

function onOver(e: Event) {
  const hit = chipFor(e.target);
  hoveringChip = !!hit;
  if (!hit) return;
  clearTimeout(leaveTimer);
  const ply = currentPly();
  // While exploring a line the board isn't at this commentary's position, so an arrow would be misleading.
  if (ply === null || ply < 0 || inVariation() || Date.now() < quietUntil) return;
  const sq = resolveMove(gameMoves(), ply, hit.chip);
  if (sq) draw(sq);
}

function onOut(e: Event) {
  if (!drawn) return;
  const from = chipFor(e.target);
  const to = chipFor((e as MouseEvent).relatedTarget);
  if (from && to && from.chip.san === to.chip.san) return;
  // Moving between the chip's inner parts, or straight onto another chip, shouldn't flicker.
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => {
    if (!hoveringChip) hideArrow();
  }, 60);
}

// ---------- clicks ----------

let onPlay: (chip: ChipSan) => void = () => {};

function onClick(e: MouseEvent) {
  if (e.button !== 0) return;
  if (e.target instanceof Element && e.target.closest('[data-kbz-chip="off"]')) return;
  const hit = chipFor(e.target);
  if (!hit) return;
  e.preventDefault();
  onPlay(hit.chip);
}

let installed = false;
export function installChips(play: (chip: ChipSan) => void) {
  onPlay = play;
  if (installed) return;
  installed = true;
  document.addEventListener('mouseover', onOver, { passive: true });
  document.addEventListener('mouseout', onOut, { passive: true });
  document.addEventListener('pointerdown', onBoardPointer, { capture: true, passive: true });
  document.addEventListener('click', onClick, true);
}

export function uninstallChips() {
  if (!installed) return;
  installed = false;
  document.removeEventListener('mouseover', onOver);
  document.removeEventListener('mouseout', onOut);
  document.removeEventListener('pointerdown', onBoardPointer, { capture: true });
  document.removeEventListener('click', onClick, true);
  document.querySelectorAll('[data-kbz-chip]').forEach((el) => {
    el.removeAttribute('data-kbz-chip');
    el.removeAttribute('data-kbz-chip-key');
    el.removeAttribute('title');
  });
  hideArrow();
}
