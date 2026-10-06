import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, CalendarClock, Check, Clock, PackageX, Hourglass } from 'lucide-react';
import { api, qs } from '../api.js';
import { Button, Card, EmptyState, PageHeader, QueryBoundary, Skeleton, useToast } from '../components/ui.jsx';
import { ALERT_TYPES, fmtDate } from '../lib/format.js';

const TYPE_ICON = { OVERDUE: AlertTriangle, DUE_SOON: CalendarClock, LATE_DOSE: Clock, LOW_STOCK: PackageX, EXPIRY: Hourglass };
const TYPE_TONE = {
  OVERDUE: 'bg-overdue-soft text-overdue-ink',
  DUE_SOON: 'bg-due-soft text-due-ink',
  LATE_DOSE: 'bg-due-soft text-due-ink',
  LOW_STOCK: 'bg-due-soft text-due-ink',
  EXPIRY: 'bg-overdue-soft text-overdue-ink',
};

export default function Alerts() {
  const toast = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState('');
  const [unread, setUnread] = useState(false);

  const alerts = useQuery({
    queryKey: ['alerts', type, unread],
    queryFn: () => api.get(`/alerts${qs({ type, unread: unread ? 1 : '' })}`),
  });

  const markRead = useMutation({
    mutationFn: (id) => api.patch(`/alerts/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const filters = [['', 'All'], ...Object.entries(ALERT_TYPES).map(([k, v]) => [k, v.label])];

  return (
    <>
      <PageHeader title="Alerts center" subtitle="Overdue and due-soon doses, late doses, low stock and expiring batches." />

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter alerts by type">
        {filters.map(([value, label]) => (
          <button
            key={value || 'all'}
            type="button"
            aria-pressed={type === value}
            onClick={() => setType(value)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${type === value ? 'border-primary-700 bg-primary-700 text-white' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}
          >
            {label}
          </button>
        ))}
        <label className="ml-auto flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-primary-700" checked={unread} onChange={(e) => setUnread(e.target.checked)} />
          Unread only
        </label>
      </div>

      <QueryBoundary query={alerts} skeleton={<div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <EmptyState icon={Bell} title="No alerts">{unread || type ? 'Nothing matches these filters.' : 'You are all caught up.'}</EmptyState>
            </Card>
          ) : (
            <ul className="space-y-3" aria-label="Alerts">
              {rows.map((a) => {
                const Icon = TYPE_ICON[a.alert_type] ?? Bell;
                const read = a.is_read === 'Y';
                return (
                  <li key={a.alert_id}>
                    <Card className={`flex flex-wrap items-start gap-3 p-4 ${read ? 'opacity-70' : ''}`}>
                      <span className={`rounded-lg p-2 ${TYPE_TONE[a.alert_type]}`}>
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                          {ALERT_TYPES[a.alert_type]?.label} · {fmtDate(a.alert_date)}
                          {a.clinic_name ? ` · ${a.clinic_name}` : ''}
                          {!read && <span className="ml-2 rounded bg-primary-100 px-1.5 py-0.5 text-primary-900">New</span>}
                        </p>
                        <p className="mt-1 text-sm">{a.message}</p>
                        {a.baby_id && (
                          <Link to={`/newborns/${a.baby_id}`} className="mt-1 inline-block text-sm font-medium text-primary-800 underline">
                            Open {a.baby_name}
                          </Link>
                        )}
                      </div>
                      {!read && (
                        <Button variant="secondary" size="sm" icon={Check} loading={markRead.isPending && markRead.variables === a.alert_id} onClick={() => markRead.mutate(a.alert_id)}>
                          Mark read
                        </Button>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )
        }
      </QueryBoundary>
    </>
  );
}
