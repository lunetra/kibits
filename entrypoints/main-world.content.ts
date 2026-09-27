// Runs in the page's MAIN world at document_start, before any site script (docs/03 → decision 1).
import { installBridge } from '@/src/main/bridge';
import { installFetchHook, installRetry } from '@/src/main/fetch-hook';
import { installGpuHook } from '@/src/main/gpu-hook';

export default defineContentScript({
  matches: ['https://taketaketake.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  noScriptStartedPostMessage: true,
  main() {
    // Each hook is independent: one failing must never break the others or the page.
    try { installBridge(); } catch { /* fail open */ }
    try { installFetchHook(); installRetry(); } catch { /* fail open */ }
    try { installGpuHook(); } catch { /* fail open */ }
    console.debug('kbz ready');
  },
});
