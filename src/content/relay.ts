// Isolated-world side of the MAIN ⇄ isolated channel, and relay to the service worker.
import { browser } from 'wxt/browser';
import type { Envelope, MainConfig, RuntimeReq, ToIsolated, ToMain, TranslateReq, TranslateRes } from '../shared/messages';

export class Relay {
  readonly channel = crypto.randomUUID();
  private config: MainConfig | null = null;
  private handlers: Array<(m: ToIsolated) => void> = [];

  constructor() {
    window.addEventListener('message', this.onMessage);
    this.hello();
  }

  private hello() {
    window.postMessage({ kbz: 'hello', channel: this.channel }, location.origin);
  }

  private post(msg: ToMain) {
    const env: Envelope<ToMain> = { kbz: 'msg', channel: this.channel, to: 'main', msg };
    window.postMessage(env, location.origin);
  }

  setConfig(c: MainConfig) {
    this.config = c;
    this.post({ type: 'config', config: c });
  }

  on(h: (m: ToIsolated) => void) {
    this.handlers.push(h);
  }

  private onMessage = (e: MessageEvent) => {
    if (e.source !== window) return;
    const d = e.data as { kbz?: string } | null;
    if (!d || typeof d !== 'object') return;
    if (d.kbz === 'mainReady') {
      // MAIN started after us: repeat the handshake.
      this.hello();
      if (this.config) this.post({ type: 'config', config: this.config });
      return;
    }
    const env = d as Envelope<ToIsolated>;
    if (env.kbz !== 'msg' || env.channel !== this.channel || env.to !== 'isolated') return;
    const m = env.msg;
    if (m.type === 'translate') {
      void translate(m, 25_000).then((data) => this.post({ type: 'reply', id: m.id, data }));
      return;
    }
    if (m.type === 'plyGet' || m.type === 'plyPut') {
      void sendRuntime(m).then((data) => this.post({ type: 'reply', id: m.id, data: data ?? null }));
      return;
    }
    if (m.type === 'report') {
      void sendRuntime(m);
    }
    for (const h of this.handlers) {
      try { h(m); } catch (err) { console.debug('[kbz]', err); }
    }
  };
}

export async function sendRuntime<T>(msg: RuntimeReq): Promise<T | undefined> {
  try {
    return (await browser.runtime.sendMessage(msg)) as T;
  } catch {
    return undefined; // extension reloaded / SW unavailable
  }
}

/** Translate via the service worker, with a hard timeout. Never throws. */
export async function translate(req: TranslateReq, timeoutMs = 7500): Promise<TranslateRes> {
  const timeout = new Promise<TranslateRes>((r) =>
    setTimeout(() => r({ type: 'translateError', id: req.id, code: 'timeout', message: 'Translation timed out' }), timeoutMs),
  );
  const res = sendRuntime<TranslateRes>(req).then(
    (r) => r ?? ({ type: 'translateError', id: req.id, code: 'network', message: 'Extension unavailable' } as TranslateRes),
  );
  return Promise.race([res, timeout]);
}
