import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '../api.js';
import { Button, QueryBoundary, Skeleton, StatusBadge } from '../components/ui.jsx';
import { fmtDate, todayStr } from '../lib/format.js';

export default function VaccinationCard() {
  const { id } = useParams();
  const [printedOn] = useState(todayStr);
  const profile = useQuery({ queryKey: ['baby', id], queryFn: () => api.get(`/newborns/${id}`) });

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/newborns/${id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary-800 hover:underline">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to profile
        </Link>
        <Button icon={Printer} onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>

      <QueryBoundary query={profile} skeleton={<Skeleton className="h-96 w-full" />}>
        {({ baby, timeline }) => (
          <article className="print-card rounded-xl border border-slate-300 bg-white p-6 shadow-sm" aria-label={`Vaccination card of ${baby.full_name}`}>
            <header className="mb-5 border-b border-slate-300 pb-4 text-center">
              <h1 className="text-xl font-semibold tracking-tight">Vaccination Card</h1>
              <p className="text-sm text-slate-600">Based on the National Immunization Schedule (India)</p>
            </header>

            <dl className="mb-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
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
                  <dt className="w-28 shrink-0 font-medium text-slate-600">{k}</dt>
                  <dd className="min-w-0 font-medium">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <caption className="sr-only">Doses with due date, date given, batch and status</caption>
                <thead>
                  <tr className="border-y border-slate-400 bg-slate-100 text-xs uppercase tracking-wide text-slate-700">
                    <th scope="col" className="px-2 py-2">Vaccine</th>
                    <th scope="col" className="px-2 py-2">Age</th>
                    <th scope="col" className="px-2 py-2">Due</th>
                    <th scope="col" className="px-2 py-2">Given</th>
                    <th scope="col" className="px-2 py-2">Batch</th>
                    <th scope="col" className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((r) => (
                    <tr key={r.record_id} className="border-b border-slate-200 break-inside-avoid">
                      <th scope="row" className="px-2 py-2 font-medium">{r.dose_name}</th>
                      <td className="px-2 py-2">{r.age_label}</td>
                      <td className="px-2 py-2">{fmtDate(r.scheduled_date)}</td>
                      <td className="px-2 py-2">{r.status === 'DONE' ? fmtDate(r.administered_date) : '—'}</td>
                      <td className="px-2 py-2 font-mono text-xs">{r.batch_no ?? '—'}</td>
                      <td className="px-2 py-2"><StatusBadge bucket={r.color_bucket} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="mt-8 flex justify-between gap-8 text-xs text-slate-600">
              <p>Printed {fmtDate(printedOn)}</p>
              <p className="w-56 border-t border-slate-500 pt-1 text-center">Health worker signature</p>
            </footer>
          </article>
        )}
      </QueryBoundary>
    </>
  );
}
