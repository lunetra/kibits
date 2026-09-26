// Isolated-world content script: relay to the service worker + DOM decoration (docs/02).
import { start } from '@/src/content/lifecycle';

export default defineContentScript({
  matches: ['https://taketaketake.com/*'],
  runAt: 'document_start',
  noScriptStartedPostMessage: true,
  main() {
    start();
  },
});
