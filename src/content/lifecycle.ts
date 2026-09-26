// Enable/disable, settings changes, SPA navigation, cleanup (docs/05 → "Language switch / master switch").
import { browser } from 'wxt/browser';
import type { MainConfig } from '../shared/messages';
import { translationActive, type Settings } from '../shared/settings';
import { loadSettings, onSettingsChanged } from '../shared/settings-store';
import { boardToConfig, findBoard, PIECE_SETS } from '../themes';
import { clearSlots, rememberPly, scanSlots, setHover } from './decorate';
import { Relay } from './relay';
import { injectStyle, preloadFont, removeStyles, setPrehide } from './style';
import { clearSummary, scanSummary } from './summary';
import { removeUi, toast } from './ui';

export function toMainConfig(s: Settings): MainConfig {
  const set = s.pieces.setId === 'default' ? undefined : PIECE_SETS.find((p) => p.id === s.pieces.setId);
  const url = (p: string) => browser.runtime.getURL(`/${p}` as '/');
  return {
    enabled: s.enabled,
    translate: { on: s.translation.enabled, lang: s.translation.lang, playerWords: s.translation.playerWords },
    board: s.enabled ? boardToConfig(findBoard(s)) : null,
    pieces: s.enabled && set ? { '1': url(set.atlas['1']), '2': url(set.atlas['2']), '4': url(set.atlas['4']) } : null,
  };
}

export function start() {
  const relay = new Relay();
  let settings: Settings | null = null;
  let observer: MutationObserver | null = null;
  let scheduled = false;

  const summaryOn = (s: Settings) => translationActive(s) && s.translation.translateSummary;

  const scan = () => {
    scheduled = false;
    if (!settings?.enabled) return;
    scanSlots(settings.translation.showOriginalOnHover, settings.translation.lang);
    if (summaryOn(settings)) scanSummary(settings.translation.lang, settings.translation.showOriginalOnHover);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  };

  relay.on((m) => {
    if (m.type === 'translatedPly') {
      rememberPly({ lang: m.lang, probes: m.probes, original: m.original });
      // React renders the text a moment after the response resolves; scan a few times to catch it.
      schedule();
      for (const ms of [120, 400, 1200]) setTimeout(schedule, ms);
    } else if (m.type === 'plyError') {
      if (m.code === 'nokey') toast('Kibitz: add a Gemini API key in the extension panel. Showing original.', undefined, 6000);
      else if (m.code === 'auth') toast('Kibitz: the API key was rejected. Showing original.', undefined, 6000);
      else if (m.code === 'quota') toast('Kibitz: quota reached. Showing original.', undefined, 5000);
      else toast('Kibitz: translation unavailable. Showing original.', undefined, 4000);
    }
  });

  function apply(s: Settings) {
    settings = s;
    relay.setConfig(toMainConfig(s));
    if (!s.enabled) return teardown();

    setPrehide(summaryOn(s));
    const onBody = () => {
      injectStyle();
      setHover(s.translation.showOriginalOnHover);
      if (!summaryOn(s)) clearSummary();
      if (!observer) {
        observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      }
      schedule();
    };
    if (document.body) onBody();
    else document.addEventListener('DOMContentLoaded', onBody, { once: true });
  }

  function teardown() {
    observer?.disconnect();
    observer = null;
    setHover(false);
    clearSlots();
    clearSummary();
    removeUi();
    removeStyles();
  }

  void loadSettings().then((s) => {
    if (s.enabled && translationActive(s) && s.translation.lang === 'fa') preloadFont();
    apply(s);
  });

  // Changes that need a reload (pieces, language, master switch) are reloaded by the panel itself.
  onSettingsChanged((s) => apply(s));
}
