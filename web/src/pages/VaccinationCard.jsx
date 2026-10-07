import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, Syringe } from 'lucide-react';
import { api } from '../api.js';
import { Button, QueryBoundary, Skeleton, StatusBadge } from '../components/ui.jsx';
import { fmtDate, todayStr } from '../lib/format.js';
import { usePageTitle } from '../lib/usePageTitle.js';

export default function VaccinationCard() {
  const { id } = useParams();
  const [printedOn] = useState(todayStr);
  const profile = useQuery({ queryKey: ['baby', id], queryFn: () => api.get(`/newborns/${id}`) });
  usePageTitle(profile.data ? `Vaccination card · ${profile.data.baby.full_name}` : 'Vaccination card');

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/newborns/${id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary-ink hover:underline">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to profile
        </Link>
        <Button icon={Printer} onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>

      <QueryBoundary query={profile} skeleton={<Skeleton className="h-96 w-full" />}>
        {({ baby, timeline }) => (
          <article className="print-card rounded-xl border border-line bg-surface p-6 shadow-card sm:p-8" aria-label={`Vaccination card of ${baby.full_name}`}>
            <header className="mb-6 flex items-center justify-between gap-4 border-b border-line pb-5">
              <div className="flex items-center gap-3">
                <span className="rounded-xl p-2.5 text-white" style={{ background: 'var(--brand-grad)' }}>
                  <Syringe className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-ink">Vaccination Card</h1>
                  <p className="text-sm text-muted">Based on the National Immunization Schedule (India)</p>
                </div>
              </div>
              <p className="hidden text-right text-sm text-muted sm:block">VaxTrack<br />{baby.clinic_name}</p>
            </header>

            <dl className="mb-6 grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
              {[
                ['Child', baby.full_name],
                ['Date of birth', fmtDate(baby.date_of_birth)],
                ['Gender', baby.gender === 'F' ? 'Female' : baby.gender === 'M' ? 'Male' : 'Other'],
                ['Birth weight', baby.birth_weight_kg ? `${baby.birth_weight_kg} kg` : '—'],
                ['Guardian', baby.guardian_name],
                ['Phone', baby.guardian_phone],
                ['Clinic', baby.clinic_name],
                ['Coverage', `${baby.coverage_pct}% (${baby.doses_done} of ${baby.doses_total} doses)`],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-28 shrink-0 text-muted">{k}</dt>
                  <dd className="min-w-0 font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <caption className="sr-only">Doses with due date, date given, batch and status</caption>
                <thead>
                  <tr className="border-y border-line-strong bg-subtle text-xs uppercase tracking-wide text-muted">
                    <th scope="col" className="px-2 py-2.5 font-semibold">Vaccine</th>
                    <th scope="col" className="px-2 py-2.5 font-semibold">Age</th>
                    <th scope="col" className="px-2 py-2.5 font-semibold">Due</th>
                    <th scope="col" className="px-2 py-2.5 font-semibold">Given</th>
                    <th scope="col" className="px-2 py-2.5 font-semibold">Batch</th>
                    <th scope="col" className="px-2 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((r) => (
                    <tr key={r.record_id} className="break-inside-avoid border-b border-line">
                      <th scope="row" className="px-2 py-2.5 font-medium text-ink">{r.dose_name}</th>
                      <td className="px-2 py-2.5 text-ink-2">{r.age_label}</td>
                      <td className="px-2 py-2.5 text-ink-2">{fmtDate(r.scheduled_date)}</td>
                      <td className="px-2 py-2.5 text-ink-2">{r.status === 'DONE' ? fmtDate(r.administered_date) : '—'}</td>
                      <td className="px-2 py-2.5 font-mono text-xs text-ink-2">{r.batch_no ?? '—'}</td>
                      <td className="px-2 py-2.5"><StatusBadge bucket={r.color_bucket} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="mt-10 flex justify-between gap-8 text-xs text-muted">
              <p>Printed {fmtDate(printedOn)}</p>
              <p className="w-56 border-t border-line-strong pt-1 text-center">Health worker signature</p>
            </footer>
          </article>
        )}
      </QueryBoundary>
    </>
  );
}
