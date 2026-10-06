import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Baby, Phone, Search, UserPlus } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth, canManage } from '../auth.jsx';
import { Card, Chip, EmptyState, PageHeader, ProgressBar, QueryBoundary, Skeleton, inputClass } from '../components/ui.jsx';

export default function Newborns() {
  const { user } = useAuth();
  const staff = canManage(user);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');

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
            <Link to="/register" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-700 px-4 text-sm font-medium text-white hover:bg-primary-800">
              <UserPlus className="size-4" aria-hidden="true" />
              Register newborn
            </Link>
          )
        }
      />

      {staff && (
        <div className="relative mb-4 max-w-md">
          <label htmlFor="baby-search" className="sr-only">
            Search newborns
          </label>
          <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-slate-500" aria-hidden="true" />
          <input id="baby-search" type="search" className={`${inputClass} pl-9`} placeholder="Search name or phone" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}

      <QueryBoundary query={babies} skeleton={<div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <EmptyState icon={Baby} title={search ? 'No newborn matches your search' : 'No newborns yet'}>
                {search ? 'Check the spelling or try the guardian’s phone number.' : staff ? 'Register the first newborn to create a vaccination schedule.' : 'No child is linked to your account.'}
              </EmptyState>
            </Card>
          ) : (
            <ul className="space-y-3" aria-label="Newborns">
              {rows.map((b) => (
                <li key={b.baby_id}>
                  <Link to={`/newborns/${b.baby_id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-primary-600">
                    <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold">{b.full_name}</p>
                        <p className="text-sm text-slate-600">
                          {b.age_text} · {b.gender === 'F' ? 'Female' : b.gender === 'M' ? 'Male' : 'Other'}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-600">
                          <span>{b.guardian_name}</span>
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3" aria-hidden="true" />
                            {b.guardian_phone}
                          </span>
                          {user.role === 'ADMIN' && <span>{b.clinic_name}</span>}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-slate-600">Coverage</p>
                        <ProgressBar value={b.coverage_pct} label={`${b.full_name} vaccination coverage`} />
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <Chip tone="done">{b.doses_done} done</Chip>
                        <Chip tone="due">{b.doses_pending} pending</Chip>
                        {b.doses_overdue > 0 && <Chip tone="overdue">{b.doses_overdue} overdue</Chip>}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryBoundary>
    </>
  );
}
