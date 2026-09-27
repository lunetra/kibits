// Game Summary translation at DOM level (docs/04, docs/05 → "Game Summary").
// The React-owned original is only hidden (attributes); our translation renders into a sibling div.kbz-tr.
import { hash } from '../shared/hash';
import { LANGUAGES, type LangCode } from '../shared/languages';
import { isolateNotation, normText } from '../shared/notation';
import { SUMMARY_TEXT } from '../site/selectors';
import { mark, originals } from './decorate';
import { translate } from './relay';

interface Serialized { items: string[]; hints: string[][]; tokens: Element[][]; plain: string }

/** Inline elements we keep as opaque tokens: move links and anything with an icon. */
const isToken = (el: Element) => el.tagName === 'BUTTON' || el.tagName === 'A' || el.querySelector('svg') !== null || el.tagName === 'svg';

export function serializeSummary(root: Element): Serialized {
  const res: Serialized = { items: [], hints: [], tokens: [], plain: '' };
  const blocks = root.children.length ? [...root.children] : [root];
  for (const block of blocks) {
    let source = '';
    const tokens: Element[] = [];
    const hints: string[] = [];
    const walk = (n: Node) => {
      if (n.nodeType === Node.TEXT_NODE) {
        source += (n.textContent ?? '').replace(/⟦|⟧/g, '');
        return;
      }
      if (!(n instanceof Element)) return;
      if (isToken(n)) {
        const i = tokens.length;
        tokens.push(n);
        const label = normText(n.textContent ?? '');
        hints.push(`⟦${i}⟧ = ${label ? `move ${label}` : 'inline icon'}`);
        source += `⟦${i}⟧`;
        return;
      }
      n.childNodes.forEach(walk);
    };
    walk(block);
    if (!/[A-Za-z]{2,}/.test(source.replace(/⟦\d+⟧/g, ''))) continue;
    res.items.push(source.replace(/\s+/g, ' ').trim());
    res.hints.push(hints);
    res.tokens.push(tokens);
  }
  res.plain = normText(root.textContent ?? '');
  return res;
}

/** Clone of a site button whose clicks are forwarded to the original (A7). */
function cloneToken(original: Element): Node {
  const c = original.cloneNode(true) as HTMLElement;
  c.removeAttribute('id');
  c.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    (original as HTMLElement).click();
  });
  return c;
}

function render(ser: Serialized, texts: string[], lang: LangCode): HTMLElement {
  const L = LANGUAGES[lang];
  const box = document.createElement('div');
  box.className = 'kbz-tr';
  texts.forEach((t, i) => {
    const p = document.createElement('div');
    p.className = 'kbz-p';
    const parts = t.split(/⟦(\d+)⟧/);
    parts.forEach((part, j) => {
      if (j % 2 === 0) {
        if (part) p.append(document.createTextNode(L.dir === 'rtl' ? isolateNotation(part) : part));
      } else {
        const tok = ser.tokens[i]?.[Number(part)];
        if (tok) p.append(cloneToken(tok));
      }
    });
    box.append(p);
  });
  mark(box, lang);
  return box;
}

function skeleton(): HTMLElement {
  const s = document.createElement('div');
  s.className = 'kbz-skel';
  s.setAttribute('aria-hidden', 'true');
  s.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
  return s;
}

function badge(message: string): HTMLElement {
  const b = document.createElement('span');
  b.className = 'kbz-badge';
  b.textContent = '!';
  b.title = `Translation unavailable, showing original. ${message}`;
  b.setAttribute('role', 'img');
  b.setAttribute('aria-label', b.title);
  return b;
}

/** original summary element → our sibling node (translation, skeleton or badge). */
const siblings = new Map<Element, HTMLElement>();

function setSibling(el: Element, node: HTMLElement | null) {
  siblings.get(el)?.remove();
  siblings.delete(el);
  if (node) {
    el.after(node);
    siblings.set(el, node);
  }
}

let seq = 0;

export function scanSummary(lang: LangCode) {
  // Drop our nodes whose original React removed.
  for (const [el, node] of siblings) if (!el.isConnected) { node.remove(); siblings.delete(el); }

  for (const el of document.querySelectorAll<HTMLElement>(SUMMARY_TEXT)) {
    const ser = serializeSummary(el);
    const key = `${lang}:${hash(ser.items.join('␞'))}`;
    if (el.dataset.kbzSrc === key) continue; // already handled (or in flight) for this content
    el.dataset.kbzSrc = key;

    if (!ser.items.length) {
      el.dataset.kbzDone = 'orig';
      setSibling(el, null);
      continue;
    }
    el.dataset.kbzDone = 'pending';
    setSibling(el, skeleton());

    const id = `s${++seq}`;
    void translate({ type: 'translate', id, lang, kind: 'summary', items: ser.items, hints: ser.hints }, 8000).then((r) => {
      if (el.dataset.kbzSrc !== key) return; // content changed meanwhile; a newer run owns it
      if (r.type === 'translated' && r.texts.length === ser.items.length) {
        const box = render(ser, r.texts, lang);
        originals.set(box, { plain: ser.plain });
        setSibling(el, box);
        el.dataset.kbzDone = 'tr';
      } else {
        el.dataset.kbzDone = 'orig';
        const b = badge(r.type === 'translateError' ? r.message : '');
        setSibling(el, null);
        el.parentElement?.querySelector('p')?.append(b);
        siblings.set(el, b);
      }
    });
  }
}

export function clearSummary() {
  for (const node of siblings.values()) node.remove();
  siblings.clear();
  for (const el of document.querySelectorAll<HTMLElement>('[data-kbz-src]')) {
    el.removeAttribute('data-kbz-src');
    el.removeAttribute('data-kbz-done');
  }
}
