import { defineConfig } from 'wxt';

// See docs/02-ARCHITECTURE.md → "Manifest essentials".
export default defineConfig({
  // Visible folder (not .output) so it's easy to pick in Finder for "Load unpacked".
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Kibitz',
    description: 'Game Review commentary in your language, plus board and piece themes, for taketaketake.com.',
    minimum_chrome_version: '111', // content_scripts "world": "MAIN"
    permissions: ['storage'],
    host_permissions: ['https://taketaketake.com/*', 'https://generativelanguage.googleapis.com/*'],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    action: { default_title: 'Kibitz' },
    web_accessible_resources: [
      { resources: ['themes/*', 'fonts/*'], matches: ['https://taketaketake.com/*'] },
    ],
  },
});
