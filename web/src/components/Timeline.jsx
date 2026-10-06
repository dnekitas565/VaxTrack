import { StatusBadge, BUCKETS, Chip } from './ui.jsx';
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

/** Vertical, color-coded timeline of every dose. `actions(row)` adds per-dose buttons. */
export default function Timeline({ rows, actions }) {
  return (
    <ol className="space-y-6">
      {groupByAge(rows).map((g) => (
        <li key={g.label}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">{g.label}</h3>
          <ol className="relative space-y-3 border-l-2 border-slate-200 pl-6">
            {g.rows.map((r) => {
              const b = BUCKETS[r.color_bucket] ?? BUCKETS.GREY;
              const Icon = b.icon;
              return (
                <li key={r.record_id} className="relative">
                  <span className="absolute -left-[35px] top-3 rounded-full bg-white p-0.5">
                    <Icon className={`size-5 ${b.dot}`} aria-hidden="true" />
                  </span>
                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.dose_name}</span>
                        <StatusBadge bucket={r.color_bucket} />
                        {r.is_late === 'Y' && <Chip tone="due">Given late</Chip>}
                        {r.is_regional === 'Y' && <Chip tone="primary">JE area</Chip>}
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {r.disease_covered} · {r.route}
                      </p>
                      <p className="mt-1 text-sm text-slate-800">
                        {r.status === 'DONE' ? (
                          <>
                            Given {fmtDate(r.administered_date)}
                            {r.batch_no && <> · batch {r.batch_no}</>}
                            {r.administered_by_name && <> · {r.administered_by_name}</>}
                          </>
                        ) : (
                          <>Due {fmtDate(r.scheduled_date)}</>
                        )}
                      </p>
                      {r.remarks && <p className="mt-1 text-xs italic text-slate-600">{r.remarks}</p>}
                    </div>
                    {actions && <div className="no-print flex flex-wrap gap-2">{actions(r)}</div>}
                  </div>
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ol>
  );
}
