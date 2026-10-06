import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, Download } from 'lucide-react';
import { api } from '../api.js';
import { Button, Card, Chip, EmptyState, PageHeader, QueryBoundary, Skeleton } from '../components/ui.jsx';
import { downloadCsv, fmtDate } from '../lib/format.js';

const COVERAGE_COLUMNS = [
  { key: 'clinic_name', label: 'Clinic' },
  { key: 'city', label: 'City' },
  { key: 'total_babies', label: 'Babies' },
  { key: 'total_doses', label: 'Doses scheduled' },
  { key: 'doses_done', label: 'Doses given' },
  { key: 'doses_overdue', label: 'Doses overdue' },
  { key: 'coverage_pct', label: 'Coverage %' },
];
const OVERDUE_COLUMNS = [
  { key: 'baby_name', label: 'Baby' },
  { key: 'dose_name', label: 'Dose' },
  { key: 'scheduled_date', label: 'Was due' },
  { key: 'days_overdue', label: 'Days overdue' },
  { key: 'guardian_name', label: 'Guardian' },
  { key: 'guardian_phone', label: 'Phone' },
  { key: 'clinic_name', label: 'Clinic' },
];

function CoverageChart({ rows }) {
  const height = Math.max(160, rows.length * 56 + 40);
  return (
    <>
      <div style={{ height }} role="img" aria-label={`Bar chart of vaccination coverage for ${rows.length} clinics. The table below has the same values.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
            <CartesianGrid horizontal={false} stroke="#e2e8f0" />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#64748b" tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="clinic_name" width={170} stroke="#64748b" tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => [`${v}%`, 'Coverage']} cursor={{ fill: '#f1f5f9' }} />
            <Bar dataKey="coverage_pct" fill="#0f766e" barSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export default function Reports() {
  const coverage = useQuery({ queryKey: ['reports', 'coverage'], queryFn: () => api.get('/reports/clinic-coverage') });
  const overdue = useQuery({ queryKey: ['dashboard', 'overdue', 'all'], queryFn: () => api.get('/dashboard/overdue') });

  return (
    <>
      <PageHeader title="Reports" subtitle="Coverage per clinic and every dose that is overdue." />

      <Card className="mb-6 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Coverage by clinic</h2>
          <Button variant="secondary" size="sm" icon={Download} disabled={!coverage.data?.length} onClick={() => downloadCsv('clinic-coverage.csv', coverage.data, COVERAGE_COLUMNS)}>
            Export CSV
          </Button>
        </div>
        <QueryBoundary query={coverage} skeleton={<Skeleton className="h-48 w-full" />}>
          {(rows) =>
            rows.length === 0 ? (
              <EmptyState title="No clinics" />
            ) : (
              <>
                <CoverageChart rows={rows} />
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <caption className="sr-only">Coverage by clinic</caption>
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th scope="col" className="py-2 pr-4">Clinic</th>
                        <th scope="col" className="px-4 py-2 text-right">Babies</th>
                        <th scope="col" className="px-4 py-2 text-right">Given</th>
                        <th scope="col" className="px-4 py-2 text-right">Overdue</th>
                        <th scope="col" className="px-4 py-2 text-right">Coverage</th>
                        <th scope="col" className="py-2 pl-4 text-right">Rank</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r) => (
                        <tr key={r.clinic_id}>
                          <th scope="row" className="py-2 pr-4 font-medium">{r.clinic_name}<span className="block text-xs font-normal text-slate-600">{r.city}</span></th>
                          <td className="px-4 py-2 text-right tabular-nums">{r.total_babies}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{r.doses_done} / {r.total_doses}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{r.doses_overdue}</td>
                          <td className="px-4 py-2 text-right font-medium tabular-nums">{r.coverage_pct}%</td>
                          <td className="py-2 pl-4 text-right tabular-nums">{r.coverage_rank}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          }
        </QueryBoundary>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            Overdue doses {overdue.data && <Chip tone="overdue">{overdue.data.length}</Chip>}
          </h2>
          <Button variant="secondary" size="sm" icon={Download} disabled={!overdue.data?.length} onClick={() => downloadCsv('overdue-doses.csv', overdue.data, OVERDUE_COLUMNS)}>
            Export CSV
          </Button>
        </div>
        <QueryBoundary query={overdue} skeleton={<Skeleton className="h-48 w-full" />}>
          {(rows) =>
            rows.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing is overdue" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <caption className="sr-only">Overdue doses</caption>
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th scope="col" className="py-2 pr-4">Baby</th>
                      <th scope="col" className="px-4 py-2">Dose</th>
                      <th scope="col" className="px-4 py-2">Was due</th>
                      <th scope="col" className="px-4 py-2 text-right">Days late</th>
                      <th scope="col" className="px-4 py-2">Guardian</th>
                      <th scope="col" className="py-2 pl-4">Clinic</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.record_id}>
                        <th scope="row" className="py-2 pr-4 font-medium"><Link to={`/newborns/${r.baby_id}`} className="text-primary-800 underline">{r.baby_name}</Link></th>
                        <td className="px-4 py-2">{r.dose_name}</td>
                        <td className="px-4 py-2">{fmtDate(r.scheduled_date)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{r.days_overdue}</td>
                        <td className="px-4 py-2">{r.guardian_name}<span className="block text-xs text-slate-600">{r.guardian_phone}</span></td>
                        <td className="py-2 pl-4">{r.clinic_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </QueryBoundary>
      </Card>
    </>
  );
}
