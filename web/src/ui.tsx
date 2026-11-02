import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatNumber } from './format.ts';

export interface AppContextValue {
  /** Shows the sign-in screen for auth errors, a toast for anything else. */
  report: (error: unknown) => void;
  notify: (message: string) => void;
  authRequired: boolean;
  /** Ends this browser's session, or with `everywhere` every session on every device. */
  signOut: (everywhere?: boolean) => void;
}

export const AppContext = createContext<AppContextValue>(null!);
export const useApp = () => useContext(AppContext);

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Eases a number toward `target` (ease-out, ~0.7s), starting from wherever it is now. */
export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const shown = useRef(value);
  useEffect(() => {
    if (prefersReducedMotion()) {
      shown.current = target;
      setValue(target);
      return;
    }
    const from = shown.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      shown.current = from + (target - from) * (1 - (1 - progress) ** 3);
      setValue(shown.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

/** False on the first frame, then true: lets a CSS transition run from the empty state when something mounts. */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return mounted;
}

/**
 * A value against a daily goal. "limit" goals (calories) turn the bar to a warning color when exceeded;
 * "target" goals (protein) turn it green when reached. Every state is also spelled out in text.
 */
export function Meter({
  label,
  value,
  goal,
  unit,
  kind = 'neutral',
  hero = false,
}: {
  label: string;
  value: number;
  goal?: number;
  unit: string;
  kind?: 'limit' | 'target' | 'neutral';
  hero?: boolean;
}) {
  const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
  const mounted = useMounted();
  const shownValue = useCountUp(value);
  const over = goal !== undefined && value > goal;
  const state = kind === 'limit' && over ? 'over' : kind === 'target' && goal !== undefined && value >= goal ? 'good' : 'normal';

  let note: ReactNode = goal === undefined ? 'No goal set' : null;
  if (goal !== undefined) {
    const diff = Math.abs(goal - value);
    if (state === 'good') note = <span className="status-good">✓ Goal reached</span>;
    else if (state === 'over') note = <span className="status-over">▲ {formatNumber(diff)} {unit} over</span>;
    else if (over) note = `${formatNumber(diff)} ${unit} over`;
    else note = `${formatNumber(diff)} ${unit} ${kind === 'target' ? 'to go' : 'left'}`;
  }

  const ariaValue = goal ? { 'aria-valuenow': Math.round(value), 'aria-valuemin': 0, 'aria-valuemax': goal } : {};
  return (
    <div className={`meter${hero ? ' hero-meter' : ''}`} role={goal ? 'meter' : undefined} aria-label={label} {...ariaValue}>
      {hero ? (
        <>
          <div className="meter-head">
            <span className="label">{label}</span>
          </div>
          <div className="hero">
            <span className="hero-value">{formatNumber(shownValue)}</span>
            <span className="hero-of">{goal ? `of ${formatNumber(goal)} ${unit}` : unit}</span>
          </div>
        </>
      ) : (
        <div className="meter-head">
          <span className="label">{label}</span>
          <span className="value">
            {formatNumber(value)}
            <span className="of">{goal ? ` / ${formatNumber(goal)}` : ''} {unit}</span>
          </span>
        </div>
      )}
      {goal !== undefined && (
        <div className="track">
          <div className="fill" data-state={state} style={{ width: `${mounted ? pct : 0}%` }} />
        </div>
      )}
      <div className="meter-note">{note}</div>
    </div>
  );
}

/**
 * A previous/next arrow. When there's nowhere to go it's a disabled button, which swallows the tap; a link made
 * click-through with pointer-events would hand the tap to whatever sits underneath.
 */
export function NavArrow({ href, label, direction, disabled = false }: { href: string; label: string; direction: 'prev' | 'next'; disabled?: boolean }) {
  const icon = (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d={direction === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  return disabled ? (
    <button type="button" className="icon-button" aria-label={label} disabled>
      {icon}
    </button>
  ) : (
    <a className="icon-button" href={href} aria-label={label}>
      {icon}
    </a>
  );
}

/** Bottom sheet. Closes on Escape or the Cancel button, not on backdrop taps, so a stray tap can't drop edits. */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('sheet-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('sheet-open');
    };
  }, [onClose]);

  return createPortal(
    <div className="sheet-backdrop">
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="link-button" onClick={onClose}>
            Cancel
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/** Delete button that needs a second tap within a few seconds. */
export function DeleteButton({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={`button danger${armed ? ' armed' : ''}`}
      disabled={disabled}
      onClick={() => {
        if (armed) return onConfirm();
        setArmed(true);
        timer.current = setTimeout(() => setArmed(false), 3000);
      }}
    >
      {armed ? 'Tap again to delete' : 'Delete'}
    </button>
  );
}

/** Number input that keeps "" as undefined, so optional fields can be cleared. */
export function NumberField({
  value,
  onChange,
  ...rest
}: { value: number | undefined; onChange: (value: number | undefined) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step="any"
      min={0}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
      {...rest}
    />
  );
}

export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const { report } = useApp();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);
    load()
      .then((result) => current && setData(result))
      .catch(report)
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [...deps, version]);
  // While reloading, `data` keeps the previous result so views can hold their frame instead of flashing.
  return { data, loading, reload: () => setVersion((v) => v + 1) };
}
