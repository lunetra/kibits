import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { EMPTY_STATUS, STATUS_KEY, type Status } from '../shared/messages';
import type { Settings } from '../shared/settings';
import { loadSettings, onSettingsChanged, saveSettings } from '../shared/settings-store';

/** Settings with immediate persistence (no Save button). `initial` = snapshot when the popup opened. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const initial = useRef<Settings | null>(null);
  useEffect(() => {
    void loadSettings().then((s) => {
      initial.current ??= s;
      setSettings(s);
    });
    return onSettingsChanged((s) => setSettings(s));
  }, []);
  const update = useCallback((fn: (s: Settings) => Settings) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = fn(structuredClone(prev));
      void saveSettings(next);
      return next;
    });
  }, []);
  return { settings, update, initial: initial.current };
}

export function useStatus(): Status {
  const [status, setStatus] = useState<Status>(EMPTY_STATUS);
  useEffect(() => {
    void browser.storage.session.get(STATUS_KEY).then((r) => r[STATUS_KEY] && setStatus(r[STATUS_KEY] as Status));
    const l = (c: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'session' && c[STATUS_KEY]) setStatus((c[STATUS_KEY]!.newValue as Status) ?? EMPTY_STATUS);
    };
    browser.storage.onChanged.addListener(l);
    return () => browser.storage.onChanged.removeListener(l);
  }, []);
  return status;
}
