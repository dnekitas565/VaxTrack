import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Baby, ChevronRight, Phone, Search, UserPlus } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth, canManage } from '../auth.jsx';
import { Avatar, Card, Chip, EmptyState, FilterChips, PageHeader, ProgressBar, QueryBoundary, Skeleton, inputClass, linkButtonClass } from '../components/ui.jsx';
import { usePageTitle } from '../lib/usePageTitle.js';

export default function Newborns() {
  const { user } = useAuth();
  const staff = canManage(user);
  usePageTitle(staff ? 'Newborns' : 'My children');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');

  // wait for a pause in typing before asking the server
  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const babies = useQuery({
    queryKey: ['newborns', search],
    queryFn: () => api.get(`/newborns${qs({ search })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title={staff ? 'Newborns' : 'My children'}
        subtitle={staff ? 'Search by baby name, guardian name or phone number.' : 'Open a child to see the vaccination schedule.'}
        actions={
          staff && (
            <Link to="/register" className={linkButtonClass('primary')}>
              <UserPlus className="size-4" aria-hidden="true" />
              Register newborn
            </Link>
          )
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {staff ? (
          <div className="relative w-full max-w-md">
            <label htmlFor="baby-search" className="sr-only">
              Search newborns
            </label>
            <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-faint" aria-hidden="true" />
            <input id="baby-search" type="search" className={`${inputClass} pl-9`} placeholder="Search name or phone" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        ) : (
          <span />
        )}
        {staff && babies.data && (
          <FilterChips
            label="Filter newborns"
            value={filter}
            onChange={setFilter}
            options={[
              ['', 'All', babies.data.length],
              ['overdue', 'With overdue doses', babies.data.filter((b) => b.doses_overdue > 0).length],
            ]}
          />
        )}
      </div>

      <QueryBoundary query={babies} skeleton={<div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>}>
        {(all) => {
          const rows = filter === 'overdue' ? all.filter((b) => b.doses_overdue > 0) : all;
          return rows.length === 0 ? (
            <Card>
              <EmptyState icon={Baby} title={search || filter ? 'No newborn matches' : 'No newborns yet'}>
                {search || filter ? 'Check the spelling, try the guardian’s phone number, or clear the filter.' : staff ? 'Register the first newborn to create a vaccination schedule.' : 'No child is linked to your account.'}
              </EmptyState>
            </Card>
          ) : (
            <ul className="space-y-3" aria-label="Newborns">
              {rows.map((b) => (
                <li key={b.baby_id}>
                  <Link to={`/newborns/${b.baby_id}`} className="group block rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary-ink/50 hover:bg-hover/40">
                    <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[1.5fr_1fr_1fr_auto]">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={b.full_name} />
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-ink">{b.full_name}</p>
                          <p className="text-sm text-muted">
                            {b.age_text} · {b.gender === 'F' ? 'Female' : b.gender === 'M' ? 'Male' : 'Other'}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                            <span>{b.guardian_name}</span>
                            <span className="inline-flex items-center gap-1">
                              <Phone className="size-3" aria-hidden="true" />
                              {b.guardian_phone}
                            </span>
                            {user.role === 'ADMIN' && <span>{b.clinic_name}</span>}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted">Coverage</p>
                        <ProgressBar value={b.coverage_pct} label={`${b.full_name} vaccination coverage`} />
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <Chip tone="done">{b.doses_done} done</Chip>
                        <Chip tone="due">{b.doses_pending} pending</Chip>
                        {b.doses_overdue > 0 && <Chip tone="overdue">{b.doses_overdue} overdue</Chip>}
                      </div>
                      <ChevronRight className="hidden size-5 text-faint transition-transform group-hover:translate-x-0.5 md:block" aria-hidden="true" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          );
        }}
      </QueryBoundary>
    </>
  );
}
