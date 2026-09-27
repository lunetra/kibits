// Enable/disable, settings changes, SPA navigation, cleanup (docs/05 → "Language switch / master switch").
import { browser } from 'wxt/browser';
import type { MainConfig } from '../shared/messages';
import { translationActive, type Settings } from '../shared/settings';
import { loadSettings, onSettingsChanged } from '../shared/settings-store';
import { boardToConfig, findBoard, PIECE_SETS } from '../themes';
import { clearSlots, rememberPly, scanSlots } from './decorate';
import { clearOriginal, installOriginal, scanOriginal, setShortcuts } from './original';
import { Relay } from './relay';
import { injectStyle, preloadFont, removeStyles, setPrehide } from './style';
import { clearSummary, scanSummary } from './summary';
import { installArrows, setChips, setFlipped, uninstallArrows } from './arrows';
import { clearRetry, recordFailure, scanRetry } from './retry';
import { removeUi } from './ui';

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
    scanSlots(settings.translation.lang);
    if (translationActive(settings)) scanRetry(relay, schedule);
    if (summaryOn(settings)) scanSummary(settings.translation.lang);
    if (translationActive(settings)) scanOriginal(settings.translation.lang, schedule);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  };

  relay.on((m) => {
    if (m.type === 'translatedPly') {
      rememberPly({ lang: m.lang, probes: m.probes, original: m.original, nodes: m.originalNodes });
      // React renders the text a moment after the response resolves; scan a few times to catch it.
      schedule();
      for (const ms of [120, 400, 1200]) setTimeout(schedule, ms);
    } else if (m.type === 'plySans') {
      setChips(m.plyIndex, m.sans);
    } else if (m.type === 'boardState') {
      setFlipped(m.flipped);
    } else if (m.type === 'plyError') {
      // Shown inside the commentary box with a "Try again" button (content/retry.ts).
      recordFailure(m.gameId, m.plyIndex, m.code, m.message);
      schedule();
      for (const ms of [150, 600]) setTimeout(schedule, ms);
    }
  });

  function apply(s: Settings) {
    settings = s;
    relay.setConfig(toMainConfig(s));
    if (!s.enabled) return teardown();

    setPrehide(summaryOn(s));
    const onBody = () => {
      injectStyle();
      installArrows();
      setShortcuts(s.translation.peekKey, s.translation.toggleKey);
      installOriginal();
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
    clearOriginal();
    uninstallArrows();
    clearSlots();
    clearSummary();
    clearRetry();
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
