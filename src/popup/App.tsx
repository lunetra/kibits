import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { LANG_ORDER, LANGUAGES, type LangCode } from '../shared/languages';
import type { CacheStats, ErrorCode, RuntimeReq, SampleRes } from '../shared/messages';
import { MODEL_ORDER, MODELS, type ModelId } from '../shared/models';
import type { Settings } from '../shared/settings';
import { BOARD_PRESETS, BOARDS, customTheme, PIECE_SETS } from '../themes';
import { Row, Section, Segmented, Select, StatusPill, Switch, ThumbGrid, type Thumb } from './components';
import { Keys, useKeys } from './Keys';
import { useSettings, useStatus } from './useSettings';

const send = <T,>(m: RuntimeReq) => browser.runtime.sendMessage(m) as Promise<T>;

const ERROR_TEXT: Record<ErrorCode, string> = {
  auth: 'API key rejected — showing original.',
  quota: 'Quota reached — showing original.',
  timeout: 'Translation timed out — showing original.',
  network: 'Network error — showing original.',
  blocked: 'Response blocked by the model — showing original.',
  invalid: 'Unusable model output — showing original.',
  model: 'Model not available for this key.',
  nokey: 'No API key set.',
};

const formatBytes = (b: number) => (b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 ** 2).toFixed(1)} MB`);

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4.5h16v11H13l-4 4v-4H4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.5 12.5V8.5h2.5V7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14.5" cy="7" r="1.2" fill="currentColor" />
    </svg>
  );
}

function needsReload(a: Settings | null, b: Settings) {
  if (!a) return false;
  return (
    a.enabled !== b.enabled ||
    a.pieces.setId !== b.pieces.setId ||
    // The site only uploads board colours when the board starts, so a new theme needs a reload too.
    a.board.themeId !== b.board.themeId ||
    (b.board.themeId === 'custom' && JSON.stringify(a.board.custom) !== JSON.stringify(b.board.custom)) ||
    a.translation.enabled !== b.translation.enabled ||
    a.translation.lang !== b.translation.lang ||
    a.translation.playerWords !== b.translation.playerWords
  );
}

async function activeSiteTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.url?.startsWith('https://taketaketake.com/') ? tab : undefined;
}

export function App() {
  const { settings: s, update, initial } = useSettings();
  const status = useStatus();
  const keys = useKeys();
  const [sample, setSample] = useState<SampleRes | null>(null);
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [siteTab, setSiteTab] = useState<number | undefined>();
  const [reloading, setReloading] = useState(false);
  /** Settings the site tab was last loaded with; reload-requiring changes are compared against it. */
  const applied = useRef<Settings | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const refreshCache = () => void send<CacheStats>({ type: 'cacheStats' }).then(setCache);
  useEffect(() => {
    refreshCache();
    void activeSiteTab().then((t) => setSiteTab(t?.id));
  }, []);
  useEffect(() => { applied.current ??= initial; }, [initial]);

  // Changes the page can't apply live (pieces, language, master switch…) → reload the tab automatically.
  // Debounced so several quick changes cause one reload. The panel stays open while the tab reloads.
  useEffect(() => {
    if (!s || siteTab == null || !applied.current || !needsReload(applied.current, s)) return;
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      applied.current = s;
      setReloading(true);
      void browser.tabs.reload(siteTab).finally(() => setTimeout(() => setReloading(false), 1200));
    }, s.board.themeId === 'custom' ? 900 : 500); // colour pickers fire continuously; wait for the pick to settle
  }, [s, siteTab]);

  const lang = s?.translation.lang;
  const model = s?.translation.model;
  const hasKey = !!keys?.length;
  useEffect(() => {
    if (!lang || !model || !hasKey || LANGUAGES[lang].passthrough) return setSample(null);
    setSample(null);
    let live = true;
    void send<SampleRes>({ type: 'sample', lang, model }).then((r) => {
      if (live) setSample(r);
    });
    return () => { live = false; };
  }, [lang, model, hasKey]);

  if (!s) return <div className="app" />;

  const t = s.translation;
  const off = !s.enabled;
  const L = LANGUAGES[t.lang];

  const recentError = status.lastError && Date.now() - status.lastError.ts < 5 * 60_000 && status.consecutiveErrors > 0 ? status.lastError : null;

  // ---------- board tiles ----------
  const boardItems: Thumb[] = [
    { id: 'default', label: 'Default', text: 'Site', title: "The site's own board theme" },
    ...BOARD_PRESETS.map((b) => ({
      id: b.id,
      label: b.label,
      title: `${b.label} — ${b.mood ?? ''}`,
      swatch: { light: b.light.from, lightTo: b.light.to, dark: b.dark.from, darkTo: b.dark.to },
    })),
    ...BOARDS.map((b) => ({
      id: b.id,
      label: b.label,
      caption: 'colors from',
      title: `Colors from ${b.label} (approximation of the image)`,
      image: b.thumb ? `/${b.thumb}` : undefined,
    })),
    (() => {
      const c = customTheme(s.board.custom);
      return { id: 'custom', label: 'Custom', swatch: { light: c.light.from, lightTo: c.light.to, dark: c.dark.from, darkTo: c.dark.to } };
    })(),
  ];

  const pieceItems: Thumb[] = [
    { id: 'default', label: 'Default', text: '♞♛', title: "The site's own pieces" },
    ...PIECE_SETS.map((p) => ({ id: p.id, label: p.label, image: `/${p.preview}` })),
  ];


  return (
    <div className={`app${off ? ' is-off' : ''}`}>
      <header className="top">
        <div className="brand">
          <Logo />
          <div>
            <h1>Kibitz</h1>
            <p className="sub">{off ? 'Paused — page restored' : 'Commentary, in your language.'}</p>
          </div>
        </div>
        <Switch label="Kibitz on/off" checked={s.enabled} onChange={(v) => update((x) => ({ ...x, enabled: v }))} />
      </header>

      {reloading && <div className="reload" role="status">Reloading the tab to apply…</div>}

      <Section
        title="Translation"
        disabled={off || !t.enabled}
        right={<Switch label="Translation" checked={t.enabled} onChange={(v) => update((x) => ({ ...x, translation: { ...x.translation, enabled: v } }))} />}
      >
        <Row label="Language">
          <Segmented<LangCode>
            label="Language"
            value={t.lang}
            options={LANG_ORDER.map((c) => ({ value: c, label: c.toUpperCase(), title: `${LANGUAGES[c].label} · ${LANGUAGES[c].native}` }))}
            onChange={(v) => update((x) => ({ ...x, translation: { ...x.translation, lang: v } }))}
          />
        </Row>

        {L.passthrough ? (
          <p className="note">Original text, no API calls.</p>
        ) : (
          <>
            <Row label="Model">
              <Select<ModelId>
                label="Model"
                value={t.model}
                options={MODEL_ORDER.map((id) => ({ value: id, label: MODELS[id].label, hint: MODELS[id].hint }))}
                onChange={(v) => update((x) => ({ ...x, translation: { ...x.translation, model: v } }))}
              />
            </Row>
            {recentError && <div className="pill-row"><StatusPill tone="warn">{ERROR_TEXT[recentError.code]}</StatusPill></div>}

            <div className="field">
              <span className="row-label">API keys{keys?.length ? ` · ${keys.length}` : ''}</span>
              <Keys keys={keys} model={t.model} />
            </div>

            <Row label="Show original on hover">
              <Switch label="Show original on hover" checked={t.showOriginalOnHover} onChange={(v) => update((x) => ({ ...x, translation: { ...x.translation, showOriginalOnHover: v } }))} />
            </Row>
            <Row label="Translate Game Summary">
              <Switch label="Translate Game Summary" checked={t.translateSummary} onChange={(v) => update((x) => ({ ...x, translation: { ...x.translation, translateSummary: v } }))} />
            </Row>

            {hasKey && (
              <div className="preview">
                <span className="preview-label">Preview</span>
                {sample === null ? (
                  <p className="preview-text muted">Translating sample…</p>
                ) : sample.ok ? (
                  <p className="preview-text" dir={L.dir} lang={t.lang} style={{ fontFamily: L.font === 'inherit' ? undefined : L.font }}>
                    {sample.text}
                  </p>
                ) : (
                  <p className="preview-text err">{sample.message}</p>
                )}
                {sample?.ok && sample.ms != null && <span className="preview-meta">{sample.cached ? 'cached' : `${(sample.ms / 1000).toFixed(1)} s`}</span>}
              </div>
            )}
          </>
        )}
      </Section>

      <Section
        title="Board colors"
        disabled={off || status.board.unsupported}
        note={status.board.unsupported ? `Unavailable: ${status.board.reason ?? 'the site changed its board renderer'}.` : undefined}
      >
        <ThumbGrid label="Board colors" items={boardItems} value={s.board.themeId} onChange={(id) => update((x) => ({ ...x, board: { ...x.board, themeId: id } }))} />
        {s.board.themeId === 'custom' && (
          <div className="custom">
            <label>
              <input type="color" value={s.board.custom.light} onChange={(e) => update((x) => ({ ...x, board: { ...x.board, custom: { ...x.board.custom, light: e.target.value.toUpperCase() } } }))} />
              Light
            </label>
            <label>
              <input type="color" value={s.board.custom.dark} onChange={(e) => update((x) => ({ ...x, board: { ...x.board, custom: { ...x.board.custom, dark: e.target.value.toUpperCase() } } }))} />
              Dark
            </label>
            <span className="grow" />
            <span className="row-label">Gradient</span>
            <Switch label="Gradient" checked={s.board.custom.gradient} onChange={(v) => update((x) => ({ ...x, board: { ...x.board, custom: { ...x.board.custom, gradient: v } } }))} />
          </div>
        )}
        <p className="note">The board is GPU-rendered; lichess images are converted to matching colors. The tab reloads to apply.</p>
      </Section>

      <Section title="Pieces" disabled={off}>
        <ThumbGrid label="Piece set" items={pieceItems} value={s.pieces.setId} onChange={(id) => update((x) => ({ ...x, pieces: { setId: id } }))} />
        {PIECE_SETS.length === 0 && <p className="note">Add SVG sets to <code>assets/pieces/&lt;name&gt;/</code> and run <code>npm run build</code>.</p>}
      </Section>

      <footer className="foot">
        <span>
          {cache ? `${cache.moves} moves cached · ${formatBytes(cache.bytes)}` : '—'}
          {status.lastMs != null && <> · last {(status.lastMs / 1000).toFixed(1)} s</>}
        </span>
        <button
          type="button"
          className="link"
          disabled={!cache || (cache.moves === 0 && cache.bytes === 0)}
          onClick={async () => setCache(await send<CacheStats>({ type: 'clearCache' }))}
        >
          Delete cache
        </button>
      </footer>
    </div>
  );
}
