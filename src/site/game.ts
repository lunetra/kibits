// Who is playing: names from the page title, the reader's side from the board orientation.
import type { GameContext } from '../shared/messages';

/** SITE-MAP: review pages are titled "<white> vs <black> · Take Take Take" (verified on two games). */
const TITLE_RE = /^(.+?)\s+vs\s+(.+?)\s+·/;

export function playersFromTitle(title = document.title): GameContext['players'] {
  const m = TITLE_RE.exec(title);
  return m ? { white: m[1]!.trim(), black: m[2]!.trim() } : undefined;
}

/** The board shows the reader's side at the bottom; `flipped` means Black is at the bottom. */
export function userColorFrom(flipped: boolean | null): GameContext['userColor'] {
  return flipped === null ? undefined : flipped ? 'black' : 'white';
}
