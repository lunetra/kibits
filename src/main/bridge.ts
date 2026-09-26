// MAIN-world side of the postMessage channel (docs/02 → "Boot race").
// No chrome.* APIs here. The API key never crosses into this world.
import type { Envelope, Hello, MainConfig, ToIsolated, ToMain } from '../shared/messages';

let channel: string | null = null;
let config: MainConfig | null = null;
let resolveReady!: (c: MainConfig) => void;
const ready = new Promise<MainConfig>((r) => (resolveReady = r));
const pending = new Map<string, (data: unknown) => void>();
const configListeners: Array<(c: MainConfig) => void> = [];

export const getConfig = () => config;

/** Resolve with the config, or null if it hasn't arrived within `ms`. */
export function configReady(ms = 400): Promise<MainConfig | null> {
  if (config) return Promise.resolve(config);
  return Promise.race([ready, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

export function onConfig(cb: (c: MainConfig) => void) {
  configListeners.push(cb);
}

export function send(msg: ToIsolated) {
  if (!channel) return;
  const env: Envelope<ToIsolated> = { kbz: 'msg', channel, to: 'isolated', msg };
  window.postMessage(env, location.origin);
}

let seq = 0;
type WithId = Extract<ToIsolated, { id: string }>;
type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never;

/** Request/response over the channel. Resolves with the reply, or `onTimeout` after `timeoutMs`. */
export function call<R>(msg: Distribute<WithId>, timeoutMs: number, onTimeout: R): Promise<R> {
  const id = `m${Date.now().toString(36)}${(seq++).toString(36)}`;
  return new Promise((resolve) => {
    if (!channel) return resolve(onTimeout);
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(onTimeout);
    }, timeoutMs);
    pending.set(id, (data) => { clearTimeout(timer); resolve(data as R); });
    send({ ...msg, id } as WithId);
  });
}

export function installBridge() {
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window) return;
    const d = e.data as Hello | Envelope<ToMain> | null;
    if (!d || typeof d !== 'object') return;
    if (d.kbz === 'hello') {
      if (!channel && typeof d.channel === 'string') channel = d.channel; // keep only the first hello
      return;
    }
    if (d.kbz !== 'msg' || d.channel !== channel || d.to !== 'main') return;
    const m = d.msg;
    if (m.type === 'config') {
      config = m.config;
      resolveReady(config);
      for (const cb of configListeners) { try { cb(config); } catch { /* fail open */ } }
    } else if (m.type === 'reply') {
      pending.get(m.id)?.(m.data);
      pending.delete(m.id);
    }
  });
  // Ask the isolated script to (re)send hello + config, in case it ran first.
  window.postMessage({ kbz: 'mainReady' }, location.origin);
}
