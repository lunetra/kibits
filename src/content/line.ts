// Exploring a line, chess.com style. One small bar above the commentary:
//
//   exploring a line   ‹  ›   Line · 18. c3        Resume ↩ 17… Qd2
//   back on the game   ↪ Replay 17… Na4                        (only after a chip replay)
//
// A session starts when you click a move chip, or when you play a move off the game yourself. ‹ › step
// through the line (the site's arrow-key navigation), Resume (or Esc) returns to the game move you left.
// The session ends as soon as you go to any other game move. Our own navigation is ignored while it runs, so
// passing through positions mid-replay can't end it by accident.
import type { ChipSan } from '../shared/messages';
import { gameMoves, resolveMove } from '../site/moves';
import { currentPly, inVariation } from '../site/ply';
import { COMMENTARY_SLOT, CURRENT_MOVE_CLASS, LINE_MOVE_BUTTON, MOVE_LIST_BUTTON, MOVE_LIST_SAN } from '../site/selectors';
import { clickMove, goToGamePly, sleep, step } from './board';
import { contextPly, hideArrow, onGameChange, quiet } from './chips';

export interface Session {
  /** Game move you left from; Resume returns here. */
  entry: number;
  /** Game move the line branches from (entry, or the move before it for an alternative). */
  branch: number;
  /** Set when the session came from a chip: lets you replay it after resuming. */
  replay: { chip: ChipSan; movePly: number; landed: number | null } | null;
}

let session: Session | null = null;
/** Our own navigation is in flight until this time: don't read intermediate positions as user moves. */
let busyUntil = 0;
let rescan: () => void = () => {};
let bar: HTMLElement | null = null;
let settleTimer: ReturnType<typeof setTimeout> | undefined;
/** Each replay gets a number; starting another (or any input of yours) cancels the one in flight. */
let run = 0;

onGameChange(() => {
  session = null;
});

const moveLabel = (ply: number, san: string) => `${Math.floor(ply / 2) + 1}${ply % 2 ? '…' : '.'} ${san}`;
const gameLabel = (ply: number) => (ply < 0 ? 'start' : moveLabel(ply, gameMoves()[ply] ?? ''));

const busy = (ms: number) => (busyUntil = Math.max(busyUntil, Date.now() + ms));

/** Play a chip's move from the position it belongs to (the commentary of game move `ply`). */
export async function play(chip: ChipSan, ply = contextPly()) {
  if (ply === null || ply < 0) return;
  const moves = gameMoves();
  const r = resolveMove(moves, ply, chip);
  if (!r) return;
  const id = ++run;
  const branch = r.before ? ply - 1 : ply;
  const landed = moves[branch + 1] === chip.san ? branch + 1 : null;
  // The chip is the move that was just played: replaying it lands exactly where you are, so there's
  // nothing to go "back" to. Just show the move again (step back, play it), without a session.
  const sameMove = landed === ply;
  session = sameMove ? null : { entry: ply, branch, replay: { chip, movePly: branch + 1, landed } };
  const jump = currentPly() !== branch || inVariation();
  busyUntil = Date.now() + (jump ? 900 : 400); // only as long as our own navigation actually takes
  quiet(1200);
  hideArrow();
  rescan();
  await sleep(60);
  if (id !== run) return;
  if (jump) {
    goToGamePly(branch);
    await sleep(430); // let the site finish animating back before our move starts
    if (id !== run) return;
  }
  clickMove(r);
  quiet(700);
  rescan();
}

/** Anything you do yourself (a click on the board, an arrow key) cancels a replay in flight and counts at once. */
function onUserInput(e: Event) {
  if (!e.isTrusted) return;
  if (e instanceof KeyboardEvent && !/^Arrow(Left|Right|Up|Down)$|^(Home|End)$/.test(e.key)) return;
  if (e instanceof PointerEvent && !(e.target instanceof Element && e.target.closest('[aria-label="Game board"], [data-move-list-scroll-container], button[aria-label]'))) return;
  if (e.target instanceof Element && e.target.closest('.kbz-line')) return; // our own bar's buttons
  run++;
  busyUntil = 0;
  setTimeout(rescan, 80);
}

function resume() {
  if (!session) return;
  run++;
  busy(600);
  hideArrow();
  goToGamePly(session.entry);
  if (!session.replay) session = null; // nothing to replay: the session is over
  rescan();
}

function stepLine(dir: -1 | 1) {
  busy(400);
  step(dir);
}

/** The line move on screen, e.g. "18. c3" (from the variation's row in the hidden move list). */
function lineMoveLabel(): string {
  const game = new Set(document.querySelectorAll(MOVE_LIST_BUTTON));
  const btn = [...document.querySelectorAll<HTMLElement>(LINE_MOVE_BUTTON)].find((b) => !game.has(b) && b.classList.contains(CURRENT_MOVE_CLASS));
  if (!btn) return '';
  const san = btn.querySelector(MOVE_LIST_SAN)?.textContent?.trim() ?? '';
  const num = btn.parentElement?.firstElementChild?.textContent?.trim() ?? '';
  const white = btn.parentElement?.querySelector('button') === btn;
  return num ? `${num}${white ? '.' : '…'} ${san}` : san;
}

// ---------- UI ----------

const ICON = {
  prev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  resume: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 3.5 2.5 7.5l4 4M3 7.5h6.5a4 4 0 0 1 0 8H8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  replay: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 3.5l4 4-4 4M13 7.5H6.5a4 4 0 0 0 0 8H8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function button(cls: string, icon: string, text: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.innerHTML = icon;
  if (text) b.append(document.createTextNode(text));
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', onClick);
  return b;
}

type View =
  | { kind: 'line'; move: string; back: string }
  | { kind: 'back'; back: string }
  | { kind: 'replay'; move: string }
  | null;

function render(slot: Element, view: NonNullable<View>) {
  const key = JSON.stringify(view);
  if (bar?.dataset.kbzKey === key && bar.isConnected && bar.nextElementSibling === slot) return;
  bar?.remove();
  bar = document.createElement('div');
  bar.className = 'kbz-line';
  bar.dataset.kbzKey = key;
  if (view.kind === 'line') {
    bar.dataset.kind = 'line';
    const nav = document.createElement('div');
    nav.className = 'kbz-line-nav';
    nav.append(
      button('kbz-icon', ICON.prev, '', 'Previous move in this line (←)', () => stepLine(-1)),
      button('kbz-icon', ICON.next, '', 'Next move in this line (→)', () => stepLine(1)),
    );
    const label = document.createElement('span');
    label.className = 'kbz-line-label';
    label.innerHTML = '<b>Line</b>';
    if (view.move) label.append(document.createTextNode(` · ${view.move}`));
    bar.append(nav, label, button('kbz-resume', ICON.resume, `Resume ${view.back}`, `Back to the game at ${view.back} (Esc)`, resume));
  } else if (view.kind === 'back') {
    bar.dataset.kind = 'replay';
    bar.append(button('kbz-resume', ICON.resume, `Back to ${view.back}`, `Back to the game at ${view.back}`, resume));
  } else {
    bar.dataset.kind = 'replay';
    bar.append(button('kbz-resume', ICON.replay, `Replay ${view.move}`, 'Play that move again', () => session?.replay && void play(session.replay.chip, session.entry)));
  }
  slot.before(bar);
}

function viewFor(): View {
  if (!session) return null;
  if (inVariation()) return { kind: 'line', move: lineMoveLabel(), back: gameLabel(session.entry) };
  const cur = currentPly();
  const r = session.replay;
  if (r && r.landed !== null && cur === r.landed) {
    // The replayed move was the game's own move: no line to explore, just a way back.
    return { kind: 'back', back: gameLabel(session.entry) };
  }
  if (r && cur === session.entry) return { kind: 'replay', move: moveLabel(r.movePly, r.chip.san) };
  return null;
}

export interface BoardState {
  exploring: boolean;
  /** Game move on screen (-1 = none / start); null = unknown. */
  cur: number | null;
  /** Game move the visible commentary belongs to. */
  context: number | null;
  /** Our own navigation is in flight. */
  busy: boolean;
}

/**
 * The session rules, as a pure function (unit-tested):
 * - playing a move off the game yourself starts a session at the commentary's move;
 * - a session lives while you're in its line, or on its entry / branch / landing move;
 * - a line you started yourself ends when you're back on the game;
 * - going to any other game move ends it; nothing changes while our own navigation runs.
 */
export function nextSession(s: Session | null, b: BoardState): Session | null {
  if (b.busy) return s;
  if (!s) return b.exploring ? { entry: b.context ?? -1, branch: b.context ?? -1, replay: null } : null;
  if (b.exploring) return s;
  if (!s.replay) return null;
  return [s.entry, s.branch, s.replay.landed].includes(b.cur) ? s : null;
}

/** Start/end the session from what's on the board, and keep the bar in place. Called from the lifecycle scan. */
export function scanLine(onChange: () => void) {
  rescan = onChange;
  const busyNow = Date.now() < busyUntil;
  session = nextSession(session, { exploring: inVariation(), cur: currentPly(), context: contextPly(), busy: busyNow });
  if (busyNow && !settleTimer) {
    // Re-evaluate once our own navigation has settled.
    settleTimer = setTimeout(() => {
      settleTimer = undefined;
      rescan();
    }, busyUntil - Date.now() + 20);
  }
  const slot = document.querySelector(COMMENTARY_SLOT);
  const view = slot ? viewFor() : null;
  if (slot && view) render(slot, view);
  else {
    bar?.remove();
    bar = null;
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !session || !inVariation()) return;
  const t = e.target;
  if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  resume();
}

let installed = false;
export function installLine() {
  if (installed) return;
  installed = true;
  addEventListener('keydown', onKey);
  addEventListener('keydown', onUserInput, true);
  addEventListener('pointerdown', onUserInput, true);
}

export function uninstallLine() {
  if (!installed) return;
  installed = false;
  removeEventListener('keydown', onKey);
  removeEventListener('keydown', onUserInput, true);
  removeEventListener('pointerdown', onUserInput, true);
  bar?.remove();
  bar = null;
  session = null;
}
