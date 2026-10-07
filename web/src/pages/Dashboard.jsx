import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { AlertTriangle, Baby, Bell, CalendarClock, CheckCircle2, ChevronRight, Clock, Package, Phone, UserPlus, BarChart3 } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, Card, Chip, EmptyState, PageHeader, QueryBoundary, SectionTitle, Skeleton, StatTile, inputClass } from '../components/ui.jsx';
import { fmtDate, plural } from '../lib/format.js';
import { usePageTitle } from '../lib/usePageTitle.js';
import { useTheme } from '../theme.jsx';

// status colours for marks (brighter in dark mode so they keep contrast against the dark surface)
const MARKS = {
  light: { done: '#16a34a', pending: '#d97706', overdue: '#dc2626', ring: '#ffffff' },
  dark: { done: '#22c55e', pending: '#f59e0b', overdue: '#ef4444', ring: '#121a23' },
};

function CoverageDonut({ summary }) {
  const { resolved } = useTheme();
  const m = MARKS[resolved];
  const data = [
    { key: 'doses_done', label: 'Done', color: m.done, icon: CheckCircle2 },
    { key: 'doses_pending', label: 'Pending', color: m.pending, icon: Clock },
    { key: 'doses_overdue', label: 'Overdue', color: m.overdue, icon: AlertTriangle },
  ].map((s) => ({ ...s, value: Number(summary[s.key]) || 0 }));
  const total = data.reduce((n, d) => n + d.value, 0);

  return (
    <Card className="h-full p-5">
      <SectionTitle>Vaccination coverage</SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-muted">Share of all scheduled doses already given.</p>
      {total === 0 ? (
        <EmptyState title="No doses yet">Register a newborn to see coverage here.</EmptyState>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative size-48 shrink-0" role="img" aria-label={`Coverage ${summary.coverage_pct} percent. ${data.map((d) => `${d.label} ${d.value}`).join(', ')}.`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="label" innerRadius={62} outerRadius={88} paddingAngle={2} stroke={m.ring} strokeWidth={2} isAnimationActive={false}>
                  {data.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, name) => [`${v} doses`, name]}
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', boxShadow: 'var(--shadow-pop)' }}
                  itemStyle={{ color: 'var(--ink)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-semibold tabular-nums text-ink">{summary.coverage_pct}%</span>
              <span className="text-xs text-muted">covered</span>
            </div>
          </div>
          <ul className="w-full space-y-3 text-sm">
            {data.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2.5">
                <span className="flex items-center gap-2.5 text-ink-2">
                  <span className="size-3 rounded-sm" style={{ background: d.color }} aria-hidden="true" />
                  <d.icon className="size-4 text-muted" aria-hidden="true" />
                  {d.label}
                </span>
                <span className="font-semibold tabular-nums text-ink">{d.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function DoseList({ title, icon, query, empty, render }) {
  return (
    <Card className="p-5">
      <SectionTitle icon={icon} count={query.data?.length}>
        {title}
      </SectionTitle>
      <QueryBoundary query={query} skeleton={<Skeleton className="h-40 w-full" />}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={empty} />
          ) : (
            <ul className="-mx-2 divide-y divide-line">
              {rows.slice(0, 8).map((r) => (
                <li key={r.record_id}>
                  <Link to={`/newborns/${r.baby_id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-hover">
                    <Avatar name={r.baby_name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{r.baby_name}</span>
                      <span className="block truncate text-xs text-muted">
                        {r.dose_name} · <Phone className="inline size-3" aria-hidden="true" /> {r.guardian_phone}
                      </span>
                    </span>
                    {render(r)}
                    <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden="true" />
                  </Link>
                </li>
              ))}
              {rows.length > 8 && (
                <li className="px-2 pt-3 text-xs text-muted">
                  and {rows.length - 8} more. <Link to="/reports" className="font-medium text-primary-ink underline">See the full list in Reports</Link>.
                </li>
              )}
            </ul>
          )
        }
      </QueryBoundary>
    </Card>
  );
}

function QuickLink({ to, icon: Icon, children }) {
  return (
    <Link to={to} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink">
      <span className="rounded-lg bg-primary-soft p-1.5 text-primary-soft-ink">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      {children}
      <ChevronRight className="ml-auto size-4 text-faint" aria-hidden="true" />
    </Link>
  );
}

export default function Dashboard() {
  usePageTitle('Dashboard');
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

      <QueryBoundary query={summary} skeleton={<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 hd:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>}>
        {(s) => (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 hd:grid-cols-4">
              <StatTile label="Babies" value={s.total_babies} icon={Baby} tone="primary" />
              <StatTile label="Doses given" value={s.doses_done} icon={CheckCircle2} tone="done" />
              <StatTile label="Doses pending" value={s.doses_pending} icon={Clock} tone="due" />
              <StatTile label="Doses overdue" value={s.doses_overdue} icon={AlertTriangle} tone="overdue" />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <CoverageDonut summary={s} />
              </div>
              <div className="space-y-4">
                <Link to="/alerts" className="block">
                  <Card className="flex items-center gap-4 p-5 transition-colors hover:bg-hover">
                    <span className="relative rounded-xl bg-primary-soft p-3 text-primary-soft-ink">
                      <Bell className="size-6" aria-hidden="true" />
                      {Number(s.unread_alerts) > 0 && <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-surface bg-danger" aria-hidden="true" />}
                    </span>
                    <div>
                      <p className="text-2xl font-semibold tabular-nums leading-tight text-ink">{s.unread_alerts}</p>
                      <p className="text-sm text-muted">{Number(s.unread_alerts) === 1 ? 'Unread alert' : 'Unread alerts'}</p>
                    </div>
                    <ChevronRight className="ml-auto size-5 text-faint" aria-hidden="true" />
                  </Card>
                </Link>
                <Card className="p-3">
                  <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-faint">Quick actions</p>
                  <QuickLink to="/register" icon={UserPlus}>Register a newborn</QuickLink>
                  <QuickLink to="/inventory" icon={Package}>Check stock and restock</QuickLink>
                  <QuickLink to="/reports" icon={BarChart3}>Open reports</QuickLink>
                </Card>
              </div>
            </div>
          </div>
        )}
      </QueryBoundary>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DoseList title="Overdue now" icon={AlertTriangle} query={overdue} empty="Nothing is overdue" render={(r) => <Chip tone="overdue">{plural(r.days_overdue, 'day')} late</Chip>} />
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
