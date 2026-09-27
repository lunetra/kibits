// Scoped CSS injected into the page. Every rule targets [data-kbz*] or .kbz-* (CLAUDE.md rule 5).
import { browser } from 'wxt/browser';
import { LANGUAGES } from '../shared/languages';
import { SAN_WRAPPER, SUMMARY_TEXT } from '../site/selectors';

const STYLE_ID = 'kbz-style';
const PREHIDE_ID = 'kbz-prehide';

const ARABIC_RANGE = 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';
const LATIN_RANGE = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

function fontFaces(): string {
  const url = (f: string) => browser.runtime.getURL(`/fonts/${f}` as '/fonts/vazirmatn-arabic-wght-normal.woff2');
  const face = (file: string, range: string) =>
    `@font-face{font-family:'Kibitz Vazirmatn';font-style:normal;font-display:block;font-weight:100 900;src:url(${url(file)}) format('woff2-variations');unicode-range:${range}}`;
  return face('vazirmatn-arabic-wght-normal.woff2', ARABIC_RANGE) + face('vazirmatn-latin-wght-normal.woff2', LATIN_RANGE);
}

const css = () => `
${fontFaces()}
/* The site sets font-family/line-height as inline styles on each text span, so only !important wins.
   Scoped to commentary we translated (data-kbz="tr"), never the site's own text. */
[data-kbz="tr"][lang="fa"],[data-kbz="tr"][lang="fa"] :where(span,div,p,button,a){font-family:${LANGUAGES.fa.font}!important;line-height:${LANGUAGES.fa.lineHeight}!important}
[data-kbz="tr"][lang="fa"]{text-align:start}
[data-kbz="tr"][dir="rtl"] ${SAN_WRAPPER}{direction:ltr;unicode-bidi:isolate}
[data-kbz="tr"] .kbz-nt{direction:ltr;unicode-bidi:isolate}
${SUMMARY_TEXT}[data-kbz-done="tr"],${SUMMARY_TEXT}[data-kbz-done="pending"]{display:none}
.kbz-tr{margin-top:0.5rem}
.kbz-tr .kbz-p + .kbz-p{margin-top:0.75em}
.kbz-tr button{cursor:pointer}
.kbz-skel{display:flex;flex-direction:column;gap:12px;padding-top:4px;margin-top:0.5rem}
.kbz-skel span{display:block;height:12px;border-radius:6px;background:currentColor;opacity:.12;animation:kbz-pulse 1.6s ease-in-out infinite}
.kbz-skel span:nth-child(2){width:92%}.kbz-skel span:nth-child(3){width:64%}
@keyframes kbz-pulse{50%{opacity:.05}}
@media (prefers-reduced-motion:reduce){.kbz-skel span{animation:none}}
[data-kbz-chip]{cursor:pointer}
.kbz-line{display:flex;align-items:center;gap:8px;margin:10px 0 -2px;padding:4px 4px 4px 4px;border-radius:12px;background:rgba(255,255,255,.05);font:500 12.5px/1.4 'Inter Variable',system-ui,sans-serif;direction:ltr;animation:kbz-in .16s ease-out}
.kbz-line[data-kind="replay"]{background:none;padding:0}
.kbz-line button{all:unset;display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:8px;cursor:pointer;transition:background .14s,opacity .14s}
.kbz-line button:focus-visible{outline:2px solid #A1A1AA;outline-offset:2px}
.kbz-line svg{width:14px;height:14px;flex:none}
.kbz-line-nav{display:flex;gap:2px}
.kbz-line .kbz-icon{width:28px;height:28px;opacity:.75}
.kbz-line .kbz-icon:hover{opacity:1;background:rgba(255,255,255,.09)}
.kbz-line-label{flex:1;min-width:0;overflow:hidden;opacity:.75;text-overflow:ellipsis;white-space:nowrap}
.kbz-line-label b{font-weight:600;opacity:1}
.kbz-line .kbz-resume{padding:6px 11px 6px 9px;border-radius:999px;background:rgba(255,255,255,.09)}
.kbz-line .kbz-resume:hover{background:rgba(255,255,255,.15)}
@media (prefers-reduced-motion:reduce){.kbz-line{animation:none}}
[data-kbz-chip]:hover{filter:brightness(1.15)}
[data-kbz-swap],[data-kbz-off]{display:none!important}
[data-kbz-swap][data-kbz-peek],${SUMMARY_TEXT}[data-kbz-peek]{display:block!important;visibility:visible!important}
.kbz-orig{margin-top:18px;font-size:16px;line-height:1.6;text-align:left}
.kbz-orig .kbz-p + .kbz-p{margin-top:.75em}
.kbz-tools{display:flex;justify-content:flex-end;margin-top:10px}
.kbz-orig-btn{all:unset;display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;font:500 12px/1.4 'Inter Variable',system-ui,sans-serif;opacity:.55;cursor:pointer;transition:opacity .14s,background .14s}
.kbz-orig-btn:hover{opacity:1;background:rgba(255,255,255,.07)}
.kbz-orig-btn[aria-pressed="true"]{opacity:.9;background:rgba(255,255,255,.09)}
.kbz-orig-btn:focus-visible{outline:2px solid #A1A1AA;outline-offset:2px;opacity:1}
.kbz-orig-btn svg{width:14px;height:14px}
.kbz-fail{display:flex;align-items:center;gap:10px;margin-top:12px;padding:10px 10px 10px 12px;border-radius:10px;background:rgba(210,153,34,.08);color:inherit;font:13px/1.45 'Inter Variable',system-ui,sans-serif;direction:ltr;text-align:left}
.kbz-fail-icon{display:inline-flex;flex:none;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#D29922;color:#000;font:700 11px/1 system-ui,sans-serif}
.kbz-fail-text{flex:1;min-width:0;opacity:.85}
.kbz-fail-text b{font-weight:600;opacity:1}
.kbz-retry{all:unset;display:inline-flex;flex:none;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.08);font-weight:500;cursor:pointer}
.kbz-retry:hover{background:rgba(255,255,255,.14)}
.kbz-retry:disabled{opacity:.6;cursor:default}
.kbz-retry:focus-visible{outline:2px solid #A1A1AA;outline-offset:2px}
.kbz-retry svg{width:14px;height:14px}
.kbz-retry:disabled svg{animation:kbz-spin 1s linear infinite}
@keyframes kbz-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.kbz-retry:disabled svg{animation:none}}
.kbz-badge{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-inline-start:6px;border-radius:50%;background:#D29922;color:#000;font:700 11px/1 system-ui,sans-serif;vertical-align:middle;cursor:help}
.kbz-tip{position:fixed;z-index:2147483646;max-width:380px;padding:10px 12px;border:1px solid #1F1F23;border-radius:10px;background:#0B0B0C;color:#EDEDEF;font:13px/1.5 'Inter Variable',system-ui,sans-serif;direction:ltr;text-align:left;box-shadow:0 8px 24px rgba(0,0,0,.45);pointer-events:none;white-space:pre-wrap}
.kbz-tip b{display:block;margin-bottom:4px;color:#63636E;font-weight:500;font-size:11px;letter-spacing:.06em;text-transform:uppercase}
.kbz-toast{position:fixed;z-index:2147483647;right:16px;bottom:16px;display:flex;align-items:center;gap:12px;padding:10px 12px 10px 14px;border:1px solid #1F1F23;border-radius:10px;background:#0B0B0C;color:#EDEDEF;font:13px/1.45 'Inter Variable',system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45);animation:kbz-in .16s ease-out}
.kbz-toast button{all:unset;cursor:pointer;padding:5px 10px;border-radius:6px;background:#E8E8EA;color:#000;font-weight:500}
.kbz-toast button.kbz-x{background:transparent;color:#63636E;padding:5px 6px}
.kbz-toast button:focus-visible{outline:2px solid #A1A1AA;outline-offset:2px}
@keyframes kbz-in{from{opacity:0;transform:translateY(6px)}}
@media (prefers-reduced-motion:reduce){.kbz-toast{animation:none}}
`;

export function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css();
  (document.head ?? document.documentElement).append(s);
}

/** Pre-hide the English Game Summary until we've handled it (docs/05 → "Game Summary"). */
export function setPrehide(on: boolean) {
  const el = document.getElementById(PREHIDE_ID);
  if (!on) return el?.remove();
  if (el) return;
  const s = document.createElement('style');
  s.id = PREHIDE_ID;
  s.textContent = `${SUMMARY_TEXT}:not([data-kbz-done]){visibility:hidden}`;
  (document.head ?? document.documentElement).append(s);
}

export function removeStyles() {
  document.getElementById(STYLE_ID)?.remove();
  document.getElementById(PREHIDE_ID)?.remove();
}

export function preloadFont() {
  const l = document.createElement('link');
  l.rel = 'preload';
  l.as = 'font';
  l.type = 'font/woff2';
  l.crossOrigin = 'anonymous';
  l.href = browser.runtime.getURL('/fonts/vazirmatn-arabic-wght-normal.woff2');
  l.dataset.kbz = 'font';
  (document.head ?? document.documentElement).append(l);
}
