// ALL host-site selectors and URL patterns live here. Source: docs/SITE-MAP.md (verified 27 Sep 2026).
// Asset names are content-hashed and the site deploys often: match with regexes, never exact names.

/** SITE-MAP §1: per-move commentary endpoint (POST {gameId, plyIndex}). */
export const COMMENTARY_URL_RE = /^https:\/\/commentary\.taketaketake\.com\/v1\/position-commentary(?:[?#].*)?$/;

/** SITE-MAP §4b: piece atlases, families × resolutions. Group 2 = resolution (1|2|4). */
export const ATLAS_RE = /\/assets\/(regular|newspaper|delta)([124])x-[\w-]+\.png(\?.*)?$/;

/** SITE-MAP §4a: board colours uniform. */
export const BOARD_UNIFORM = { label: 'globalUniformBuffer', size: 208 } as const;

/** SITE-MAP §2: scroll container of the Commentary tab. */
export const REVIEW_SCROLL = '.game-review-scrollbar';

/** SITE-MAP §2: per-move commentary slot (Tailwind arbitrary class `mt-[18px]`). */
export const COMMENTARY_SLOT = `${REVIEW_SCROLL} div.mt-\\[18px\\]`;

/** SITE-MAP §2: loading skeleton bars inside the slot. */
export const SLOT_SKELETON = 'span.animate-pulse';

/** SITE-MAP §3: Game Summary card and its text block (the element we hide/replace). */
export const SUMMARY_CARD = `${REVIEW_SCROLL} > div.mx-auto.rounded-lg`;
export const SUMMARY_TEXT = `${SUMMARY_CARD} > div.min-w-0`;

/** SITE-MAP §1: the san node renders as <span><span><svg/></span><span>d4</span></span>. */
export const SAN_WRAPPER = 'span:has(> span > svg)';

/** Review pages: /games/<id> (client-side routed). */
export const REVIEW_PATH_RE = /^\/games\/[\w-]+/;

/**
 * Current-move detection (verified live 27 Sep 2026): the move list stays in the DOM (hidden) while the
 * Commentary tab is open. Each half-move is a button, in order, so the button's index === the API's
 * plyIndex (e4 = 0). The current move's button has the class below (others have `border-transparent`).
 */
export const MOVE_LIST_BUTTON = '[data-move-list-scroll-container] button';
export const CURRENT_MOVE_CLASS = 'border-foreground';
