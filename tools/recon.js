/*
 * Kibitz recon helper — paste into DevTools console on a taketaketake.com game page.
 *
 * 1. Open a finished game, open Game Review.
 * 2. Paste this whole file into the Console and press Enter.
 * 3. Step through 5–10 moves (wait for each commentary to appear), go back a few moves.
 * 4. Run:  kbzRecon.report()   → copies JSON to clipboard and downloads kibitz-recon.json
 *
 * Read-only: it never modifies the page or network traffic.
 */
(() => {
  if (window.kbzRecon) { console.warn('[kbz] recon already running'); return; }
  const t0 = performance.now();
  const now = () => Math.round(performance.now() - t0);
  const clip = (s, n = 400) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) + '…' : s) : s);

  const cssPath = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && parts.length < 8; e = e.parentElement) {
      let p = e.tagName.toLowerCase();
      if (e.id) { p += '#' + e.id; parts.unshift(p); break; }
      const cls = [...e.classList].slice(0, 3).join('.');
      if (cls) p += '.' + cls;
      const data = [...e.attributes].filter(a => /^(data-|role|aria-)/.test(a.name)).map(a => `[${a.name}${a.value && a.value.length < 40 ? `="${a.value}"` : ''}]`).join('');
      parts.unshift(p + data);
    }
    return parts.join(' > ');
  };
  const attrs = (el) => Object.fromEntries([...el.attributes].map(a => [a.name, clip(a.value, 120)]));

  // ---------- Network ----------
  const net = [];
  const looksTexty = (ct) => /json|text|event-stream/.test(ct || '');
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = String(args[0]?.url || args[0]);
      const ct = res.headers.get('content-type');
      const entry = { t: now(), kind: 'fetch', url, status: res.status, ct };
      net.push(entry);
      if (looksTexty(ct) && !/event-stream/.test(ct)) res.clone().text().then(b => { entry.body = clip(b, 3000); }).catch(() => {});
      if (/event-stream/.test(ct)) entry.note = 'SSE via fetch (streaming)';
    } catch {}
    return res;
  };
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u, ...r) { this.__kbz = { m, u }; return XO.call(this, m, u, ...r); };
  XMLHttpRequest.prototype.send = function (...a) {
    this.addEventListener('load', () => {
      try { const ct = this.getResponseHeader('content-type'); net.push({ t: now(), kind: 'xhr', url: this.__kbz?.u, status: this.status, ct, body: looksTexty(ct) ? clip(String(this.responseText), 3000) : undefined }); } catch {}
    });
    return XS.apply(this, a);
  };
  const OWS = window.WebSocket;
  window.WebSocket = function (url, p) {
    const ws = p ? new OWS(url, p) : new OWS(url);
    net.push({ t: now(), kind: 'ws-open', url: String(url) });
    ws.addEventListener('message', (e) => net.push({ t: now(), kind: 'ws-msg', url: String(url), body: clip(typeof e.data === 'string' ? e.data : '[binary]', 1500) }));
    return ws;
  };
  window.WebSocket.prototype = OWS.prototype;
  const OES = window.EventSource;
  if (OES) {
    window.EventSource = function (url, cfg) {
      const es = new OES(url, cfg);
      net.push({ t: now(), kind: 'sse-open', url: String(url) });
      es.addEventListener('message', (e) => net.push({ t: now(), kind: 'sse-msg', url: String(url), body: clip(e.data, 1500) }));
      return es;
    };
    window.EventSource.prototype = OES.prototype;
  }

  // ---------- DOM text mutations ----------
  const textEvents = [];      // {t, path, len, text}
  const byContainer = new Map(); // path -> {count, samples, firstSeen, lastSeen, attrs}
  const isProse = (s) => s && s.trim().length >= 25 && /[a-z]{3,}\s+[a-z]{2,}/i.test(s);
  const record = (el) => {
    if (!el || el.nodeType !== 1) return;
    const text = el.innerText?.trim();
    if (!isProse(text) || text.length > 1200) return;
    const path = cssPath(el);
    textEvents.push({ t: now(), path, len: text.length, text: clip(text, 300) });
    const c = byContainer.get(path) || { count: 0, samples: [], firstSeen: now(), attrs: attrs(el), childTags: [] };
    c.count++; c.lastSeen = now();
    if (!c.samples.includes(text) && c.samples.length < 8) c.samples.push(clip(text, 300));
    c.childTags = [...new Set([...el.querySelectorAll('*')].map(n => n.tagName.toLowerCase()))].slice(0, 15);
    c.html = clip(el.outerHTML, 1500);
    byContainer.set(path, c);
  };
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      const target = m.type === 'characterData' ? m.target.parentElement : m.target;
      // record the nearest block-ish ancestor
      let el = target;
      while (el && el.parentElement && getComputedStyle(el).display === 'inline') el = el.parentElement;
      record(el);
    }
  });
  mo.observe(document.body, { subtree: true, childList: true, characterData: true });

  // ---------- Board / pieces ----------
  const boardScan = () => {
    const out = { canvases: [], cgBoard: null, gridCandidates: [], pieceImgs: [], svgBoards: [], shadowHosts: 0, iframes: document.querySelectorAll('iframe').length };
    document.querySelectorAll('canvas').forEach(c => { const r = c.getBoundingClientRect(); if (r.width > 200 && Math.abs(r.width - r.height) < 10) out.canvases.push({ path: cssPath(c), w: r.width }); });
    const cg = document.querySelector('cg-board, .cg-wrap'); if (cg) out.cgBoard = { path: cssPath(cg), html: clip(cg.outerHTML, 1500) };
    document.querySelectorAll('div, svg, g').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 200 || Math.abs(r.width - r.height) > 12) return;
      const n = el.children.length;
      if (n === 8 || n === 64 || (n > 60 && n < 110)) out.gridCandidates.push({ path: cssPath(el), children: n, w: Math.round(r.width), sampleChild: clip(el.children[0]?.outerHTML, 400), bg: getComputedStyle(el).backgroundImage.slice(0, 200) });
    });
    document.querySelectorAll('img').forEach(i => { if (/(^|\/)([wb][KQRBNP]|[wb][kqrbnp]|king|queen|rook|bishop|knight|pawn)/i.test(i.src)) out.pieceImgs.push({ path: cssPath(i), src: clip(i.src, 200), alt: i.alt }); });
    document.querySelectorAll('[class*="piece" i], [data-piece], [data-square]').forEach((el, idx) => { if (idx < 20) out.pieceImgs.push({ path: cssPath(el), attrs: attrs(el), bg: getComputedStyle(el).backgroundImage.slice(0, 200), html: clip(el.outerHTML, 300) }); });
    document.querySelectorAll('svg').forEach(s => { const r = s.getBoundingClientRect(); if (r.width > 200 && Math.abs(r.width - r.height) < 12) out.svgBoards.push({ path: cssPath(s), rects: s.querySelectorAll('rect').length, images: s.querySelectorAll('image,use').length }); });
    document.querySelectorAll('*').forEach(e => { if (e.shadowRoot) out.shadowHosts++; });
    out.gridCandidates = out.gridCandidates.slice(0, 15); out.pieceImgs = out.pieceImgs.slice(0, 40);
    return out;
  };

  window.kbzRecon = {
    report() {
      mo.takeRecords().forEach(() => {});
      const containers = [...byContainer.entries()].map(([path, c]) => ({ path, ...c }))
        .sort((a, b) => b.samples.length - a.samples.length).slice(0, 12);
      const commentaryTexts = new Set(containers.flatMap(c => c.samples.map(s => s.slice(0, 60))));
      const netHits = net.filter(n => n.body && [...commentaryTexts].some(s => s.length > 20 && n.body.includes(s.slice(0, 40))));
      const report = {
        url: location.href, ua: navigator.userAgent, elapsedMs: now(),
        commentaryContainerCandidates: containers,
        textTimeline: textEvents.slice(-80),
        networkRequestsContainingCommentary: netHits,
        network: net.filter(n => /taketaketake/.test(n.url || '')).slice(-120),
        board: boardScan(),
      };
      const json = JSON.stringify(report, null, 2);
      try { copy(json); console.log('[kbz] report copied to clipboard'); } catch {}
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'kibitz-recon.json'; a.click();
      console.log(report);
      return report;
    },
    stop() { mo.disconnect(); window.fetch = origFetch; XMLHttpRequest.prototype.open = XO; XMLHttpRequest.prototype.send = XS; window.WebSocket = OWS; if (OES) window.EventSource = OES; console.log('[kbz] recon stopped'); },
  };
  console.log('%c[kbz] recon running — step through moves, then run kbzRecon.report()', 'color:#3FB950');
})();
