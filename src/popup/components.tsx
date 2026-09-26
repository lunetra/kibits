// Hand-rolled popup components (docs/07 → "Components"). No UI library.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: Array<{ value: T; label: string; title?: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Custom dropdown (the native <select> popup renders see-through in the extension popup). */
export function Select<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return setOpen(false);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open) choose(active);
      else setOpen(true);
    }
  };

  return (
    <div className="dropdown" ref={root}>
      <button
        type="button"
        className="dropdown-btn"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(!open); }}
        onKeyDown={onKey}
      >
        <span>{current?.label}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {open && (
        <ul className="dropdown-list" role="listbox" id={listId} aria-label={label}>
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`${i === active ? 'active' : ''}${o.value === value ? ' selected' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(i); }}
            >
              <span className="check" aria-hidden="true">{o.value === value ? '✓' : ''}</span>
              <span>{o.label}</span>
              {o.hint && <span className="hint">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SecretInput({ placeholder, onSave, label, action }: { placeholder: string; onSave: (v: string) => void; label: string; action?: string }) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const commit = () => {
    if (value.trim()) { onSave(value.trim()); setValue(''); }
  };
  return (
    <div className="secret">
      <span className="secret-field">
      <input
        type={show ? 'text' : 'password'}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      <button type="button" className="icon-btn" aria-label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          {show && <path d="M2.5 13.5l11-11" stroke="currentColor" strokeWidth="1.2" />}
        </svg>
      </button>
      </span>
      {action && (
        <button type="button" className="btn" disabled={!value.trim()} onClick={commit}>{action}</button>
      )}
    </div>
  );
}

export function Section({ title, right, children, disabled, note }: { title: string; right?: ReactNode; children: ReactNode; disabled?: boolean; note?: ReactNode }) {
  const id = useId();
  return (
    <section className={`section${disabled ? ' dim' : ''}`} aria-labelledby={id}>
      <header>
        <h2 id={id}>{title}</h2>
        {right}
      </header>
      {note && <p className="note">{note}</p>}
      <div className="section-body">{children}</div>
    </section>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <div className="row-control">{children}</div>
    </div>
  );
}

export function StatusPill({ tone, children, title }: { tone: 'ok' | 'warn' | 'err'; children: ReactNode; title?: string }) {
  return <span className={`pill ${tone}`} role="status" title={title}>{children}</span>;
}

export function Callout({ children }: { children: ReactNode }) {
  return <div className="callout">{children}</div>;
}

export interface Thumb {
  id: string;
  label: string;
  caption?: string;
  title?: string;
  swatch?: { light: string; dark: string; lightTo: string; darkTo: string };
  image?: string;
  text?: string;
}

export function ThumbGrid({ items, value, onChange, label }: { items: Thumb[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <div className="thumbs" role="radiogroup" aria-label={label}>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={value === t.id}
          className={`thumb${value === t.id ? ' on' : ''}`}
          title={t.title ?? t.label}
          onClick={() => onChange(t.id)}
        >
          <span className="thumb-art">
            {t.swatch && <Checker {...t.swatch} />}
            {t.image && <img src={t.image} alt="" />}
            {t.text && <span className="thumb-text">{t.text}</span>}
          </span>
          <span className="thumb-label">{t.label}</span>
          {t.caption && <span className="thumb-caption">{t.caption}</span>}
        </button>
      ))}
    </div>
  );
}

/** 4×4 board swatch drawn with CSS, including the subtle from→to gradient. */
export function Checker({ light, dark, lightTo, darkTo }: { light: string; dark: string; lightTo: string; darkTo: string }) {
  const cells = [];
  for (let r = 0; r < 4; r++)
    for (let f = 0; f < 4; f++) {
      const isLight = (r + f) % 2 === 0;
      const [a, b] = isLight ? [light, lightTo] : [dark, darkTo];
      cells.push(<span key={`${r}${f}`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} />);
    }
  return <span className="checker">{cells}</span>;
}
