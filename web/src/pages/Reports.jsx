import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Baby, Building2, CheckCircle2, Download, Percent } from 'lucide-react';
import { api } from '../api.js';
import { Button, Card, Chip, EmptyState, PageHeader, QueryBoundary, SectionTitle, Skeleton, StatTile } from '../components/ui.jsx';
import { downloadCsv, fmtDate } from '../lib/format.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { useTheme } from '../theme.jsx';

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
  const { resolved } = useTheme();
  const bar = resolved === 'dark' ? '#2dd4bf' : '#0f766e';
  const axis = resolved === 'dark' ? '#9aa8b8' : '#475569';
  const grid = resolved === 'dark' ? '#243242' : '#e2e8f0';
  const height = Math.max(160, rows.length * 56 + 40);
  return (
    <div style={{ height }} role="img" aria-label={`Bar chart of vaccination coverage for ${rows.length} clinics. The table below has the same values.`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
          <CartesianGrid horizontal={false} stroke={grid} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke={axis} tick={{ fontSize: 12, fill: axis }} />
          <YAxis type="category" dataKey="clinic_name" width={170} stroke={axis} tick={{ fontSize: 12, fill: axis }} />
          <Tooltip
            formatter={(v) => [`${v}%`, 'Coverage']}
            cursor={{ fill: resolved === 'dark' ? '#19232e' : '#f1f5f9' }}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', boxShadow: 'var(--shadow-pop)' }}
            itemStyle={{ color: 'var(--ink)' }}
            labelStyle={{ color: 'var(--ink)' }}
          />
          <Bar dataKey="coverage_pct" fill={bar} barSize={22} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Reports() {
  usePageTitle('Reports');
  const coverage = useQuery({ queryKey: ['reports', 'coverage'], queryFn: () => api.get('/reports/clinic-coverage') });
  const overdue = useQuery({ queryKey: ['dashboard', 'overdue', 'all'], queryFn: () => api.get('/dashboard/overdue') });

  const totals = (rows) => {
    const babies = rows.reduce((n, r) => n + Number(r.total_babies), 0);
    const doses = rows.reduce((n, r) => n + Number(r.total_doses), 0);
    const done = rows.reduce((n, r) => n + Number(r.doses_done), 0);
    return { babies, pct: doses ? Math.round((done / doses) * 1000) / 10 : 0 };
  };

  return (
    <>
      <PageHeader title="Reports" subtitle="Coverage per clinic and every dose that is overdue." />

      <QueryBoundary query={coverage} skeleton={<Skeleton className="mb-6 h-24 w-full" />}>
        {(rows) => {
          const t = totals(rows);
          return (
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 hd:grid-cols-4">
              <StatTile icon={Building2} tone="primary" label="Clinics" value={rows.length} />
              <StatTile icon={Baby} tone="primary" label="Babies" value={t.babies} />
              <StatTile icon={Percent} tone="done" label="Coverage" value={`${t.pct}%`} />
              <StatTile icon={AlertTriangle} tone="overdue" label="Overdue doses" value={overdue.data?.length ?? '—'} />
            </div>
          );
        }}
      </QueryBoundary>

      <Card className="mb-6 p-5">
        <SectionTitle
          action={
            <Button variant="secondary" size="sm" icon={Download} disabled={!coverage.data?.length} onClick={() => downloadCsv('clinic-coverage.csv', coverage.data, COVERAGE_COLUMNS)}>
              Export CSV
            </Button>
          }
        >
          Coverage by clinic
        </SectionTitle>
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
                    <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th scope="col" className="py-2.5 pr-4 font-semibold">Clinic</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Babies</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Given</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Overdue</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Coverage</th>
                        {rows.length > 1 && <th scope="col" className="py-2.5 pl-4 text-right font-semibold">Rank</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {rows.map((r) => (
                        <tr key={r.clinic_id} className="transition-colors hover:bg-hover/50">
                          <th scope="row" className="py-2.5 pr-4 font-medium text-ink">{r.clinic_name}<span className="block text-xs font-normal text-muted">{r.city}</span></th>
                          <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{r.total_babies}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{r.doses_done} / {r.total_doses}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{r.doses_overdue}</td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-ink">{r.coverage_pct}%</td>
                          {rows.length > 1 && <td className="py-2.5 pl-4 text-right tabular-nums text-ink-2">{r.coverage_rank}</td>}
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
        <SectionTitle
          action={
            <Button variant="secondary" size="sm" icon={Download} disabled={!overdue.data?.length} onClick={() => downloadCsv('overdue-doses.csv', overdue.data, OVERDUE_COLUMNS)}>
              Export CSV
            </Button>
          }
        >
          <span className="flex items-center gap-2">
            Overdue doses {overdue.data && <Chip tone="overdue">{overdue.data.length}</Chip>}
          </span>
        </SectionTitle>
        <QueryBoundary query={overdue} skeleton={<Skeleton className="h-48 w-full" />}>
          {(rows) =>
            rows.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing is overdue" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <caption className="sr-only">Overdue doses</caption>
                  <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th scope="col" className="py-2.5 pr-4 font-semibold">Baby</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">Dose</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">Was due</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">Days late</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">Guardian</th>
                      <th scope="col" className="py-2.5 pl-4 font-semibold">Clinic</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r) => (
                      <tr key={r.record_id} className="transition-colors hover:bg-hover/50">
                        <th scope="row" className="py-2.5 pr-4 font-medium"><Link to={`/newborns/${r.baby_id}`} className="text-primary-ink underline-offset-2 hover:underline">{r.baby_name}</Link></th>
                        <td className="px-4 py-2.5 text-ink-2">{r.dose_name}</td>
                        <td className="px-4 py-2.5 text-ink-2">{fmtDate(r.scheduled_date)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums"><Chip tone="overdue">{r.days_overdue}</Chip></td>
                        <td className="px-4 py-2.5 text-ink-2">{r.guardian_name}<span className="block text-xs text-muted">{r.guardian_phone}</span></td>
                        <td className="py-2.5 pl-4 text-ink-2">{r.clinic_name}</td>
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
