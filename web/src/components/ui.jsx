import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock, Info, Loader2, X } from 'lucide-react';

// oxlint-disable-next-line react/only-export-components
export const cx = (...parts) => parts.filter(Boolean).join(' ');

// ------------------------------------------------------------------ Button
const BUTTON_STYLES = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover disabled:bg-subtle disabled:text-faint',
  secondary: 'border border-line-strong bg-surface text-ink-2 hover:bg-hover disabled:text-faint',
  danger: 'bg-danger text-on-danger hover:bg-danger-hover disabled:bg-subtle disabled:text-faint',
  ghost: 'text-ink-2 hover:bg-hover disabled:text-faint',
};

export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, className, children, disabled, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        size === 'sm' ? 'min-h-11 px-3 text-sm sm:min-h-9' : 'min-h-11 px-4 text-sm',
        BUTTON_STYLES[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

/** A router <Link> that looks like a Button */
// oxlint-disable-next-line react/only-export-components
export const linkButtonClass = (variant = 'primary') =>
  cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors', BUTTON_STYLES[variant]);

// ------------------------------------------------------------------ layout bits
export function Card({ className, children, ...rest }) {
  return (
    <div {...rest} className={cx('rounded-xl border border-line bg-surface shadow-card', className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ icon: Icon, children, count, action }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        {Icon && <Icon className="size-5 text-muted" aria-hidden="true" />}
        {children}
        {count !== undefined && <Chip>{count}</Chip>}
      </h2>
      {action}
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
      <span className="rounded-full bg-subtle p-3 text-muted">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="max-w-md text-sm text-muted">{children}</p>}
    </div>
  );
}

const NOTICE_TONES = {
  error: { box: 'bg-overdue-soft text-overdue-ink', icon: AlertTriangle },
  warn: { box: 'bg-due-soft text-due-ink', icon: AlertTriangle },
  info: { box: 'bg-primary-soft text-primary-soft-ink', icon: Info },
  success: { box: 'bg-done-soft text-done-ink', icon: CheckCircle2 },
};

/** Inline message box. Errors are announced to screen readers (role=alert). */
export function Notice({ tone = 'info', children, className }) {
  const t = NOTICE_TONES[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm', t.box, className)}>
      <t.icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-overdue/30 bg-overdue-soft px-4 py-8 text-center">
      <AlertTriangle className="size-6 text-overdue-ink" aria-hidden="true" />
      <p className="max-w-md text-sm text-overdue-ink">{error?.message || 'Something went wrong.'}</p>
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
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-2">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined,
      })}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-xs font-medium text-overdue-ink">
          {error}
        </p>
      )}
    </div>
  );
}

// oxlint-disable-next-line react/only-export-components
export const inputClass =
  'block min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink shadow-sm placeholder:text-faint transition-colors focus-visible:border-primary-ink aria-[invalid=true]:border-overdue disabled:bg-subtle disabled:text-faint';

/** Row of toggle buttons for filtering (aria-pressed) */
export function FilterChips({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(([val, text, count]) => {
        const active = value === val;
        return (
          <button
            key={val || 'all'}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(val)}
            className={cx(
              'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors sm:min-h-9',
              active ? 'border-primary bg-primary text-on-primary' : 'border-line-strong bg-surface text-ink-2 hover:bg-hover',
            )}
          >
            {text}
            {count !== undefined && (
              <span className={cx('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-on-primary font-semibold text-primary' : 'bg-subtle text-muted')}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ status
// oxlint-disable-next-line react/only-export-components
export const BUCKETS = {
  GREEN: { label: 'Done', icon: CheckCircle2, badge: 'bg-done-soft text-done-ink', dot: 'text-done', edge: 'border-l-done' },
  RED: { label: 'Overdue', icon: AlertTriangle, badge: 'bg-overdue-soft text-overdue-ink', dot: 'text-overdue', edge: 'border-l-overdue' },
  AMBER: { label: 'Due soon', icon: Clock, badge: 'bg-due-soft text-due-ink', dot: 'text-due', edge: 'border-l-due' },
  GREY: { label: 'Upcoming', icon: Circle, badge: 'bg-future-soft text-future-ink', dot: 'text-future', edge: 'border-l-future' },
};

export function StatusBadge({ bucket, label }) {
  const b = BUCKETS[bucket] ?? BUCKETS.GREY;
  const Icon = b.icon;
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', b.badge)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label ?? b.label}
    </span>
  );
}

export function Chip({ tone = 'neutral', children, className }) {
  const tones = {
    neutral: 'bg-subtle text-ink-2',
    done: 'bg-done-soft text-done-ink',
    due: 'bg-due-soft text-due-ink',
    overdue: 'bg-overdue-soft text-overdue-ink',
    primary: 'bg-primary-soft text-primary-soft-ink',
  };
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, label }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="flex items-center gap-2">
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 w-full overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-xs font-medium tabular-nums text-ink-2">{pct}%</span>
    </div>
  );
}

/** Stacked bar of done / pending / overdue doses with a text legend underneath */
export function StackedBar({ done, pending, overdue }) {
  const total = done + pending + overdue || 1;
  const seg = (n, color) => (n > 0 ? <div className={color} style={{ width: `${(n / total) * 100}%` }} /> : null);
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
        {seg(done, 'bg-done')}
        {seg(pending, 'bg-due')}
        {seg(overdue, 'bg-overdue')}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-done-ink">{done} done</span>
        <span className="font-medium text-due-ink">{pending} pending</span>
        <span className="font-medium text-overdue-ink">{overdue} overdue</span>
      </p>
    </div>
  );
}

export function CoverageRing({ value, size = 96 }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const r = 36;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Vaccination coverage ${pct} percent`}>
      <svg viewBox="0 0 88 88" className="size-full -rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" strokeWidth="8" style={{ stroke: 'var(--subtle)' }} />
        <circle cx="44" cy="44" r={r} fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} style={{ stroke: 'var(--primary)' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums text-ink">{pct}%</span>
    </div>
  );
}

export function Avatar({ name, size = 'md' }) {
  const initials = String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary-soft-ink',
        size === 'lg' ? 'size-14 text-lg' : size === 'sm' ? 'size-8 text-xs' : 'size-10 text-sm',
      )}
    >
      {initials}
    </span>
  );
}

const TILE_TONES = {
  primary: 'bg-primary-soft text-primary-soft-ink',
  done: 'bg-done-soft text-done-ink',
  due: 'bg-due-soft text-due-ink',
  overdue: 'bg-overdue-soft text-overdue-ink',
  neutral: 'bg-subtle text-ink-2',
};

export function StatTile({ icon: Icon, tone = 'primary', label, value, hint }) {
  return (
    <Card className="flex items-center gap-3.5 p-4">
      <span className={cx('shrink-0 rounded-xl p-2.5', TILE_TONES[tone])}>
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold tabular-nums leading-tight text-ink">{value}</p>
        <p className="text-sm text-muted">{label}</p>
        {hint && <p className="text-xs text-faint">{hint}</p>}
      </div>
    </Card>
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
      className={cx('m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-ink', size === 'lg' ? 'max-w-2xl' : 'max-w-lg')}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="-m-2 flex size-11 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink">
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-subtle/60 px-5 py-3">{footer}</div>}
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
      <p className="text-sm text-ink-2">{message}</p>
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
  const api = useMemo(() => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium text-white shadow-pop',
              t.kind === 'error' ? 'border-red-400/30 bg-red-800' : t.kind === 'success' ? 'border-green-400/30 bg-green-800' : 'border-slate-500/30 bg-slate-800',
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
