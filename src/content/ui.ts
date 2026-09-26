// Small in-page UI: toast, hover tooltip. All nodes are ours (kbz-*), appended to <body>.

let toastEl: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string, action?: { label: string; run: () => void }, ttlMs = 10000) {
  hideToast();
  const el = document.createElement('div');
  el.className = 'kbz-toast';
  el.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.addEventListener('click', action.run);
    el.append(b);
  }
  const x = document.createElement('button');
  x.className = 'kbz-x';
  x.setAttribute('aria-label', 'Dismiss');
  x.textContent = '✕';
  x.addEventListener('click', hideToast);
  el.append(x);
  document.body.append(el);
  toastEl = el;
  toastTimer = setTimeout(hideToast, ttlMs);
}

export function hideToast() {
  clearTimeout(toastTimer);
  toastEl?.remove();
  toastEl = null;
}

let tipEl: HTMLElement | null = null;

export function showTip(anchor: Element, original: string) {
  hideTip();
  const el = document.createElement('div');
  el.className = 'kbz-tip';
  el.setAttribute('role', 'tooltip');
  const label = document.createElement('b');
  label.textContent = 'Original';
  el.append(label, document.createTextNode(original));
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  const top = r.top - h - 8 >= 8 ? r.top - h - 8 : Math.min(r.bottom + 8, innerHeight - h - 8);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  tipEl = el;
}

export function hideTip() {
  tipEl?.remove();
  tipEl = null;
}

export function removeUi() {
  hideToast();
  hideTip();
}
