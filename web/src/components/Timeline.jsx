import { CheckCircle2 } from 'lucide-react';
import { BUCKETS, Chip, StatusBadge, cx } from './ui.jsx';
import { fmtDate } from '../lib/format.js';

/** Groups timeline rows by age band, keeping the order the API returned them in */
function groupByAge(rows) {
  const groups = [];
  for (const r of rows) {
    let g = groups.find((x) => x.label === r.age_label);
    if (!g) groups.push((g = { label: r.age_label, rows: [] }));
    g.rows.push(r);
  }
  return groups;
}

/** Vertical, colour-coded timeline of every dose. `actions(row)` adds per-dose buttons. */
export default function Timeline({ rows, actions, filter = '' }) {
  return (
    <ol className="space-y-8">
      {groupByAge(rows).map((g) => {
        const done = g.rows.filter((r) => r.status === 'DONE').length;
        const complete = done === g.rows.length;
        // the group header always counts the whole age band; the filter only hides rows
        const visible = filter ? g.rows.filter((r) => r.status === filter) : g.rows;
        if (visible.length === 0) return null;
        return (
          <li key={g.label}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
              {g.label}
              <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium normal-case tracking-normal', complete ? 'bg-done-soft text-done-ink' : 'bg-subtle text-muted')}>
                {complete && <CheckCircle2 className="size-3" aria-hidden="true" />}
                {done} of {g.rows.length} given
              </span>
            </h3>
            <ol className="relative space-y-2.5 border-l-2 border-line pl-6">
              {visible.map((r) => {
                const b = BUCKETS[r.color_bucket] ?? BUCKETS.GREY;
                const Icon = b.icon;
                return (
                  <li key={r.record_id} className="relative">
                    <span className="absolute -left-[35px] top-4 rounded-full bg-canvas p-0.5">
                      <Icon className={cx('size-5', b.dot)} aria-hidden="true" />
                    </span>
                    <div className={cx('flex flex-wrap items-start justify-between gap-3 rounded-xl border border-l-4 border-line bg-surface p-3.5 shadow-card', b.edge)}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{r.dose_name}</span>
                          <StatusBadge bucket={r.color_bucket} />
                          {r.is_late === 'Y' && <Chip tone="due">Given late</Chip>}
                          {r.is_regional === 'Y' && <Chip tone="primary">JE area</Chip>}
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {r.disease_covered} · {r.route}
                        </p>
                        <p className="mt-1.5 text-sm text-ink-2">
                          {r.status === 'DONE' ? (
                            <>
                              Given {fmtDate(r.administered_date)}
                              {r.batch_no && <> · batch <span className="font-mono text-xs">{r.batch_no}</span></>}
                              {r.administered_by_name && <> · {r.administered_by_name}</>}
                            </>
                          ) : (
                            <>Due {fmtDate(r.scheduled_date)}</>
                          )}
                        </p>
                        {r.remarks && <p className="mt-1 text-xs italic text-muted">{r.remarks}</p>}
                      </div>
                      {actions && <div className="no-print flex flex-wrap gap-2">{actions(r)}</div>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}
