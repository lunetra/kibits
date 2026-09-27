// ALL host-site selectors and URL patterns live here. Source: docs/SITE-MAP.md (verified 27 Sep 2026).
// Asset names are content-hashed and the site deploys often: match with regexes, never exact names.

/** SITE-MAP §1: per-move commentary endpoint (POST {gameId, plyIndex}). */
export const COMMENTARY_URL_RE = /^https:\/\/commentary\.taketaketake\.com\/v1\/position-commentary(?:[?#].*)?$/;

/** SITE-MAP §4b: piece atlases, families × resolutions. Group 2 = resolution (1|2|4). */
export const ATLAS_RE = /\/assets\/(regular|newspaper|delta)([124])x-[\w-]+\.png(\?.*)?$/;

/** SITE-MAP §4a: board colours uniform. */
export const BOARD_UNIFORM = { label: 'globalUniformBuffer', size: 208 } as const;

/** SITE-MAP §4d: other buffers carrying colours (TypeGPU labels are shared, so size identifies them). */
export const GPU_BUFFERS = {
  /** squareOverlay[64] vec4 (+ uniqueInlay, checkOverlay…): last-move squares. Index = rank*8+file, a1 = 0. */
  squares: { label: 'uniformBuffer', size: 3088 },
  /** Coordinate font uniform: [0..3] dark colour, [4..7] light colour, then glyph metrics. */
  notation: { label: 'uniformBuffer', size: 304 },
  /** Arrow vertices, 8 floats each, rgba at +4. The site's right-click arrow colour is below. */
  arrows: { label: 'vertexBuffer', size: 36864, siteColor: [0.318, 0.749, 0.498] as const },
} as const;

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
export const MOVE_LIST_BUTTON = '[data-move-list-scroll-container] > div > div > div > button';
/**
 * Exploring a line (e.g. after a replay) inserts a variation box into the move list: its moves are nested
 * deeper (so MOVE_LIST_BUTTON above, with its fixed depth, only matches the game's own moves), the current
 * variation move gets CURRENT_MOVE_CLASS, and no game move is highlighted. Verified live 27 Sep 2026.
 */
export const ANY_MOVE_BUTTON = '[data-move-list-scroll-container] button';
/** Move buttons in move rows (game and line): `div.grid` rows = [move number, white move, spacer, black move]. */
export const LINE_MOVE_BUTTON = '[data-move-list-scroll-container] div.grid > button';
/** Inside a move button: the full SAN ("Nc6"); the eval ("+0.6") is a separate span. */
export const MOVE_LIST_SAN = 'span.truncate';

/** Review navigation: jump to the starting position. */
export const GO_TO_START = 'button[aria-label="Go to start"]';

/** SITE-MAP §4: the WebGPU board canvas. */
export const BOARD_CANVAS = '[aria-label="Game board"] canvas';
export const CURRENT_MOVE_CLASS = 'border-foreground';
