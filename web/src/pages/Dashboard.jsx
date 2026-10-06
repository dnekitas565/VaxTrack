import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { AlertTriangle, Baby, Bell, CalendarClock, CheckCircle2, Clock, Phone } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Card, Chip, EmptyState, PageHeader, QueryBoundary, Skeleton, inputClass } from '../components/ui.jsx';
import { fmtDate, plural } from '../lib/format.js';

const SEGMENTS = [
  { key: 'doses_done', label: 'Done', color: '#16a34a', icon: CheckCircle2 },
  { key: 'doses_pending', label: 'Pending', color: '#d97706', icon: Clock },
  { key: 'doses_overdue', label: 'Overdue', color: '#dc2626', icon: AlertTriangle },
];

function StatCard({ label, value, icon: Icon, tone }) {
  const tones = {
    primary: 'bg-primary-100 text-primary-800',
    done: 'bg-done-soft text-done-ink',
    due: 'bg-due-soft text-due-ink',
    overdue: 'bg-overdue-soft text-overdue-ink',
  };
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className={`rounded-lg p-3 ${tones[tone]}`}>
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-sm text-slate-600">{label}</p>
      </div>
    </Card>
  );
}

function CoverageDonut({ summary }) {
  const data = SEGMENTS.map((s) => ({ ...s, value: Number(summary[s.key]) || 0 }));
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <Card className="p-5">
      <h2 className="mb-1 text-base font-semibold">Vaccination coverage</h2>
      <p className="mb-3 text-sm text-slate-600">Share of all scheduled doses already given.</p>
      {total === 0 ? (
        <EmptyState title="No doses yet">Register a newborn to see coverage here.</EmptyState>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="relative size-44 shrink-0" role="img" aria-label={`Coverage ${summary.coverage_pct} percent. ${data.map((d) => `${d.label} ${d.value}`).join(', ')}.`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="label" innerRadius={56} outerRadius={80} paddingAngle={2} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                  {data.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, name) => [`${v} doses`, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-semibold tabular-nums">{summary.coverage_pct}%</span>
              <span className="text-xs text-slate-600">covered</span>
            </div>
          </div>
          <ul className="w-full space-y-2 text-sm">
            {data.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span className="size-3 rounded-sm" style={{ background: d.color }} aria-hidden="true" />
                  <d.icon className="size-4 text-slate-600" aria-hidden="true" />
                  {d.label}
                </span>
                <span className="font-medium tabular-nums">{d.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function DoseList({ title, icon: Icon, query, empty, render }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <Icon className="size-5 text-slate-600" aria-hidden="true" />
        {title}
        {query.data && <Chip tone="neutral">{query.data.length}</Chip>}
      </h2>
      <QueryBoundary query={query} skeleton={<Skeleton className="h-40 w-full" />}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={empty} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.slice(0, 8).map((r) => (
                <li key={r.record_id}>
                  <Link to={`/newborns/${r.baby_id}`} className="flex items-center justify-between gap-3 rounded-lg px-1 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{r.baby_name}</span>
                      <span className="block truncate text-xs text-slate-600">
                        {r.dose_name} · <Phone className="inline size-3" aria-hidden="true" /> {r.guardian_phone}
                      </span>
                    </span>
                    {render(r)}
                  </Link>
                </li>
              ))}
              {rows.length > 8 && <li className="px-1 pt-2 text-xs text-slate-600">and {rows.length - 8} more. <Link to="/reports" className="font-medium text-primary-800 underline">See the full list in Reports</Link>.</li>}
            </ul>
          )
        }
      </QueryBoundary>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const [clinicId, setClinicId] = useState('');
  const scope = isAdmin ? clinicId : '';
  const q = qs({ clinicId: scope });

  const clinics = useQuery({ queryKey: ['clinics'], queryFn: () => api.get('/clinics'), enabled: isAdmin });
  const summary = useQuery({
    queryKey: ['dashboard', 'summary', isAdmin ? scope || 'all' : user.clinicId],
    queryFn: () => api.get(`/dashboard/summary${q}`),
  });
  const overdue = useQuery({ queryKey: ['dashboard', 'overdue', scope || 'all'], queryFn: () => api.get(`/dashboard/overdue${q}`) });
  const upcoming = useQuery({ queryKey: ['dashboard', 'upcoming', scope || 'all'], queryFn: () => api.get(`/dashboard/upcoming${qs({ clinicId: scope, days: 7 })}`) });

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={isAdmin ? 'All clinics' : user.clinicName}
        actions={
          isAdmin && (
            <div>
              <label htmlFor="clinic-filter" className="sr-only">
                Clinic
              </label>
              <select id="clinic-filter" className={`${inputClass} min-w-52`} value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
                <option value="">All clinics</option>
                {clinics.data?.map((c) => (
                  <option key={c.clinic_id} value={c.clinic_id}>
                    {c.clinic_name}
                  </option>
                ))}
              </select>
            </div>
          )
        }
      />

      <QueryBoundary query={summary} skeleton={<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>}>
        {(s) => (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Babies registered" value={s.total_babies} icon={Baby} tone="primary" />
              <StatCard label="Doses given" value={s.doses_done} icon={CheckCircle2} tone="done" />
              <StatCard label="Doses pending" value={s.doses_pending} icon={Clock} tone="due" />
              <StatCard label="Doses overdue" value={s.doses_overdue} icon={AlertTriangle} tone="overdue" />
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <CoverageDonut summary={s} />
              </div>
              <Link to="/alerts" className="block">
                <Card className="flex h-full items-center gap-4 p-5 hover:bg-slate-50">
                  <span className="rounded-lg bg-primary-100 p-3 text-primary-800">
                    <Bell className="size-6" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{s.unread_alerts}</p>
                    <p className="text-sm text-slate-600">{Number(s.unread_alerts) === 1 ? 'Unread alert' : 'Unread alerts'}</p>
                    <p className="mt-1 text-xs font-medium text-primary-800 underline">Open the alerts center</p>
                  </div>
                </Card>
              </Link>
            </div>
          </div>
        )}
      </QueryBoundary>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <DoseList
          title="Overdue now"
          icon={AlertTriangle}
          query={overdue}
          empty="Nothing is overdue"
          render={(r) => <Chip tone="overdue">{plural(r.days_overdue, 'day')} late</Chip>}
        />
        <DoseList
          title="Due in 7 days"
          icon={CalendarClock}
          query={upcoming}
          empty="No doses due this week"
          render={(r) => <Chip tone="due">{r.days_until_due === 0 ? 'Today' : fmtDate(r.scheduled_date)}</Chip>}
        />
      </div>
    </>
  );
}
