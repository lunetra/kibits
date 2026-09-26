// API key manager: several keys used in rotation, each testable; rate-limited keys cool down and come back.
import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { PublicKey } from '../background/keys';
import { KEYS_KEY, type RuntimeReq, type TestKeyRes } from '../shared/messages';
import type { ModelId } from '../shared/models';
import { Callout, SecretInput, StatusPill } from './components';

const send = <T,>(m: RuntimeReq) => browser.runtime.sendMessage(m) as Promise<T>;

export function useKeys(): PublicKey[] | null {
  const [keys, setKeys] = useState<PublicKey[] | null>(null);
  useEffect(() => {
    void send<PublicKey[]>({ type: 'keysList' }).then(setKeys);
    const l = (c: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'session' && c[KEYS_KEY]) setKeys((c[KEYS_KEY]!.newValue as PublicKey[]) ?? []);
    };
    browser.storage.onChanged.addListener(l);
    return () => browser.storage.onChanged.removeListener(l);
  }, []);
  return keys;
}

/** Re-render every second while a countdown is visible. */
function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function Keys({ keys, model }: { keys: PublicKey[] | null; model: ModelId }) {
  const [tests, setTests] = useState<Record<string, 'busy' | TestKeyRes>>({});
  const [note, setNote] = useState('');
  const now = useNow(!!keys?.some((k) => k.cooldownUntil));

  const add = async (key: string) => {
    const r = await send<'added' | 'duplicate' | 'empty'>({ type: 'keyAdd', key });
    setNote(r === 'duplicate' ? 'That key is already in the list.' : '');
  };
  const test = async (id: string) => {
    setTests((t) => ({ ...t, [id]: 'busy' }));
    const r = await send<TestKeyRes>({ type: 'keyTest', id, model });
    setTests((t) => ({ ...t, [id]: r }));
  };

  return (
    <div className="keys">
      {keys?.map((k) => {
        const t = tests[k.id];
        const left = k.cooldownUntil ? Math.max(0, Math.ceil((k.cooldownUntil - now) / 1000)) : 0;
        const state = k.state === 'cooling' && left === 0 ? 'ready' : k.state;
        return (
          <div className="key" key={k.id}>
            <span className={`dot ${state}`} aria-hidden="true" />
            <code className="key-id">•••• {k.last4}</code>
            <span className="key-state">
              {t && t !== 'busy' ? (
                t.ok ? <StatusPill tone="ok">✓ Works</StatusPill> : <StatusPill tone="err" title={t.message}>✕ {t.message}</StatusPill>
              ) : state === 'cooling' ? (
                `Rate-limited · ${left}s`
              ) : state === 'invalid' ? (
                <span className="err-text" title={k.lastError}>Rejected</span>
              ) : (
                `${k.uses} used`
              )}
            </span>
            <button type="button" className="btn small" disabled={t === 'busy'} onClick={() => test(k.id)}>
              {t === 'busy' ? '…' : 'Test'}
            </button>
            <button type="button" className="icon-btn inline" aria-label={`Remove key ending ${k.last4}`} onClick={() => send({ type: 'keyRemove', id: k.id })}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" /></svg>
            </button>
          </div>
        );
      })}
      <SecretInput label="Add a Gemini API key" placeholder={keys?.length ? 'Add another key' : 'Paste a Gemini API key'} onSave={add} action="Add" />
      {note && <p className="note">{note}</p>}
      {keys && keys.length === 0 && (
        <Callout>
          No API key yet.{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get a free key at aistudio.google.com</a>
        </Callout>
      )}
      {keys && keys.length > 1 && <p className="note">Keys are used in turn. A rate-limited key rests until its limit resets, then rejoins.</p>}
    </div>
  );
}
