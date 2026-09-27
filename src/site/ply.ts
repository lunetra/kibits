// Which move is the user looking at? Used to translate a ply only while it's on screen.
import { ANY_MOVE_BUTTON, CURRENT_MOVE_CLASS, MOVE_LIST_BUTTON } from './selectors';

/**
 * plyIndex of the game move on screen; -1 = Game Summary, or a variation (see inVariation());
 * null = can't tell (fail open).
 */
export function currentPly(): number | null {
  const buttons = document.querySelectorAll(MOVE_LIST_BUTTON);
  if (!buttons.length) return null;
  for (let i = 0; i < buttons.length; i++) if (buttons[i]!.classList.contains(CURRENT_MOVE_CLASS)) return i;
  return -1;
}

/**
 * Resolve true once `ply` is on screen (or we can't tell), false if the request was aborted or `cancelled()`
 * says translation no longer applies. Polls cheaply while waiting; nothing runs once it settles.
 */
export function waitForPly(
  ply: number,
  signal: AbortSignal | null | undefined,
  cancelled: () => boolean,
  /** Extra "it's on screen" test, e.g. the commentary box is loading this very request. */
  showing: () => boolean = () => false,
): Promise<boolean> {
  return new Promise((resolve) => {
    const check = () => {
      if (signal?.aborted || cancelled()) return done(false);
      const cur = currentPly();
      if (cur === null || cur === ply || showing()) return done(true);
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    const done = (v: boolean) => {
      clearInterval(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(v);
    };
    const onAbort = () => done(false);
    signal?.addEventListener('abort', onAbort);
    timer = setInterval(check, 150);
    check();
  });
}

/** True while the board shows a line off the game (a variation you're exploring). */
export function inVariation(): boolean {
  const game = new Set(document.querySelectorAll(MOVE_LIST_BUTTON));
  for (const b of document.querySelectorAll(ANY_MOVE_BUTTON)) if (!game.has(b) && b.classList.contains(CURRENT_MOVE_CLASS)) return true;
  return false;
}
