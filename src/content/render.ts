// Render described commentary paragraphs (text + move chips) into our own DOM, cloning the site's chips.
import type { ChipSan, RetryNode } from '../shared/messages';

export function renderParagraphs(paragraphs: RetryNode[][], chips: Element[], chipInfo?: (i: number) => ChipSan | undefined): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const para of paragraphs) {
    const p = document.createElement('div');
    p.className = 'kbz-p';
    for (const n of para) {
      if ('text' in n) p.append(document.createTextNode(n.text));
      else if ('word' in n) p.append(document.createTextNode(n.word));
      else {
        const c = chips[n.chip];
        if (!c) continue;
        const clone = c.cloneNode(true) as HTMLElement;
        const info = chipInfo?.(n.chip);
        if (info) {
          clone.dataset.kbzSan = info.san; // hover arrows on cloned chips
          if (info.color) clone.dataset.kbzColor = info.color;
        }
        p.append(clone);
      }
    }
    frag.append(p);
  }
  return frag;
}
