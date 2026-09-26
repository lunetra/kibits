// chrome.storage.sync access for settings (never holds the API key).
import { browser } from 'wxt/browser';
import { migrate, SETTINGS_KEY, type Settings } from './settings';

export async function loadSettings(): Promise<Settings> {
  const r = await browser.storage.sync.get(SETTINGS_KEY);
  return migrate(r[SETTINGS_KEY]);
}

export async function saveSettings(s: Settings): Promise<void> {
  await browser.storage.sync.set({ [SETTINGS_KEY]: s });
}

export function onSettingsChanged(cb: (s: Settings, prev: Settings | null) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, area: string) => {
    if (area !== 'sync' || !changes[SETTINGS_KEY]) return;
    const { newValue, oldValue } = changes[SETTINGS_KEY]!;
    cb(migrate(newValue), oldValue === undefined ? null : migrate(oldValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
