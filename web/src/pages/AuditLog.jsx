import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { api, qs } from '../api.js';
import { Card, Chip, EmptyState, Field, PageHeader, QueryBoundary, Skeleton, inputClass } from '../components/ui.jsx';
import { fmtDateTime } from '../lib/format.js';

const ACTION_TONE = { INSERT: 'done', UPDATE: 'primary', DELETE: 'overdue' };

export default function AuditLog() {
  const [recordId, setRecordId] = useState('');
  const valid = /^\d*$/.test(recordId);
  const audit = useQuery({
    queryKey: ['audit', recordId],
    queryFn: () => api.get(`/audit${qs({ recordId })}`),
    enabled: valid,
  });

  return (
    <>
      <PageHeader title="Audit log" subtitle="Who changed which dose, and when. The most recent 200 changes." />
      <Field label="Filter by dose record id" error={valid ? '' : 'Enter digits only.'} className="mb-4 max-w-xs">
        {(p) => <input {...p} inputMode="numeric" className={inputClass} value={recordId} onChange={(e) => setRecordId(e.target.value.trim())} placeholder="All records" />}
      </Field>

      <QueryBoundary query={audit} skeleton={<Skeleton className="h-72 w-full" />}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <EmptyState icon={ScrollText} title="No audit entries">Nothing matches this record id.</EmptyState>
            </Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <caption className="sr-only">Audit log of changes</caption>
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-3">When</th>
                    <th scope="col" className="px-4 py-3">Who</th>
                    <th scope="col" className="px-4 py-3">Action</th>
                    <th scope="col" className="px-4 py-3">What</th>
                    <th scope="col" className="px-4 py-3">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {rows.map((r) => (
                    <tr key={r.audit_id}>
                      <td className="whitespace-nowrap px-4 py-3">{fmtDateTime(r.changed_at)}</td>
                      <td className="px-4 py-3">{r.changed_by}</td>
                      <td className="px-4 py-3"><Chip tone={ACTION_TONE[r.action]}>{r.action}</Chip></td>
                      <td className="px-4 py-3">
                        {r.baby_name ? <>{r.baby_name}<span className="block text-xs text-slate-600">{r.dose_name} · dose record {r.record_id}</span></> : <>{r.table_name.toLowerCase().replace('_', ' ')}<span className="block text-xs text-slate-600">record {r.record_id}</span></>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {r.old_value && <span className="block text-slate-600">{r.old_value}</span>}
                        {r.new_value && <span className="block">{r.old_value ? '→ ' : ''}{r.new_value}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )
        }
      </QueryBoundary>
    </>
  );
}
