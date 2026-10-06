import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock, Info, Loader2, X } from 'lucide-react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

// ------------------------------------------------------------------ Button
const BUTTON_STYLES = {
  primary: 'bg-primary-700 text-white hover:bg-primary-800 disabled:bg-slate-300 disabled:text-slate-600',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-slate-300 disabled:text-slate-600',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
};

export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, className, children, disabled, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4 text-sm',
        BUTTON_STYLES[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ layout bits
export function Card({ className, children, ...rest }) {
  return (
    <div {...rest} className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cx('skeleton rounded-md', className)} aria-hidden="true" />;
}

export function PageSkeleton({ rows = 4 }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon = Info, title, children }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="rounded-full bg-slate-100 p-3 text-slate-500">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <p className="font-medium text-slate-900">{title}</p>
      {children && <p className="max-w-md text-sm text-slate-600">{children}</p>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center">
      <AlertTriangle className="size-6 text-red-700" aria-hidden="true" />
      <p className="max-w-md text-sm text-red-900">{error?.message || 'Something went wrong.'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Shows a skeleton, error or the content for a TanStack query */
export function QueryBoundary({ query, skeleton, children }) {
  if (query.isPending) return skeleton ?? <PageSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return children(query.data);
}

// ------------------------------------------------------------------ forms
export function Field({ label, error, hint, children, className }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined,
      })}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="mt-1 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

// oxlint-disable-next-line react/only-export-components
export const inputClass =
  'block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 aria-[invalid=true]:border-red-600 disabled:bg-slate-100';

// ------------------------------------------------------------------ status
// Status colors are fixed app-wide; each one also has an icon and a word, never color alone.
// oxlint-disable-next-line react/only-export-components
export const BUCKETS = {
  GREEN: { label: 'Done', icon: CheckCircle2, badge: 'bg-done-soft text-done-ink', dot: 'text-done' },
  RED: { label: 'Overdue', icon: AlertTriangle, badge: 'bg-overdue-soft text-overdue-ink', dot: 'text-overdue' },
  AMBER: { label: 'Due soon', icon: Clock, badge: 'bg-due-soft text-due-ink', dot: 'text-due' },
  GREY: { label: 'Upcoming', icon: Circle, badge: 'bg-future-soft text-future-ink', dot: 'text-future' },
};

export function StatusBadge({ bucket, label }) {
  const b = BUCKETS[bucket] ?? BUCKETS.GREY;
  const Icon = b.icon;
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', b.badge)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label ?? b.label}
    </span>
  );
}

export function Chip({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700',
    done: 'bg-done-soft text-done-ink',
    due: 'bg-due-soft text-due-ink',
    overdue: 'bg-overdue-soft text-overdue-ink',
    primary: 'bg-primary-100 text-primary-900',
  };
  return <span className={cx('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

export function ProgressBar({ value, label }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full bg-primary-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-xs font-medium tabular-nums text-slate-700">{pct}%</span>
    </div>
  );
}

export function CoverageRing({ value, size = 88 }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const r = 36;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Vaccination coverage ${pct} percent`}>
      <svg viewBox="0 0 88 88" className="size-full -rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="9" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="#0f766e"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums text-slate-900">{pct}%</span>
    </div>
  );
}

// ------------------------------------------------------------------ modal (native <dialog>: focus trap, Esc, inert page)
export function Modal({ title, onClose, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal();
    return () => dlg?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        'm-auto w-[calc(100%-2rem)] rounded-xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/55',
        size === 'lg' ? 'max-w-2xl' : 'max-w-lg',
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="-m-2 rounded-lg p-2 text-slate-600 hover:bg-slate-100">
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
    </dialog>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, loading, onConfirm, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-700">{message}</p>
    </Modal>
  );
}

// ------------------------------------------------------------------ toasts
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const remove = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind, message) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => remove(id), kind === 'error' ? 7000 : 4000);
    },
    [remove],
  );
  const api = useMemo(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex max-w-md items-start gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg',
              t.kind === 'error' ? 'bg-red-800' : t.kind === 'success' ? 'bg-green-800' : 'bg-slate-800',
            )}
          >
            {t.kind === 'error' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components
export function useToast() {
  return useContext(ToastContext);
}
