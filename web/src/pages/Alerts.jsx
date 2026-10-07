import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, CalendarClock, Check, Clock, Hourglass, PackageX } from 'lucide-react';
import { api, qs } from '../api.js';
import { Button, Card, Chip, EmptyState, FilterChips, PageHeader, QueryBoundary, Skeleton, cx, useToast } from '../components/ui.jsx';
import { ALERT_TYPES, fmtDate, prettifyDates } from '../lib/format.js';
import { usePageTitle } from '../lib/usePageTitle.js';

const TYPE_ICON = { OVERDUE: AlertTriangle, DUE_SOON: CalendarClock, LATE_DOSE: Clock, LOW_STOCK: PackageX, EXPIRY: Hourglass };
const TYPE_TONE = {
  OVERDUE: { tile: 'bg-overdue-soft text-overdue-ink', edge: 'border-l-overdue' },
  EXPIRY: { tile: 'bg-overdue-soft text-overdue-ink', edge: 'border-l-overdue' },
  DUE_SOON: { tile: 'bg-due-soft text-due-ink', edge: 'border-l-due' },
  LATE_DOSE: { tile: 'bg-due-soft text-due-ink', edge: 'border-l-due' },
  LOW_STOCK: { tile: 'bg-due-soft text-due-ink', edge: 'border-l-due' },
};

export default function Alerts() {
  usePageTitle('Alerts');
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

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <FilterChips label="Filter alerts by type" value={type} onChange={setType} options={filters} />
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink-2">
          <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={unread} onChange={(e) => setUnread(e.target.checked)} />
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
                const tone = TYPE_TONE[a.alert_type] ?? TYPE_TONE.DUE_SOON;
                const read = a.is_read === 'Y';
                return (
                  <li key={a.alert_id}>
                    <Card className={cx('flex flex-wrap items-start gap-4 border-l-4 p-4', tone.edge, read && 'bg-subtle shadow-none')}>
                      <span className={cx('rounded-xl p-2.5', tone.tile)}>
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wide text-muted">
                          <span>{ALERT_TYPES[a.alert_type]?.label}</span>
                          <span aria-hidden="true">·</span>
                          <span>{fmtDate(a.alert_date)}</span>
                          {a.clinic_name && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{a.clinic_name}</span>
                            </>
                          )}
                          {!read && <Chip tone="primary">New</Chip>}
                        </p>
                        <p className="mt-1.5 text-sm text-ink">{prettifyDates(a.message)}</p>
                        {a.baby_id && (
                          <Link to={`/newborns/${a.baby_id}`} className="mt-1.5 inline-block text-sm font-medium text-primary-ink underline-offset-2 hover:underline">
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
