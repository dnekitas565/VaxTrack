import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CalendarClock, FileText, Package, Phone, Syringe } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth, canManage } from '../auth.jsx';
import Timeline from '../components/Timeline.jsx';
import { Button, Card, CoverageRing, Field, Modal, PageHeader, QueryBoundary, Skeleton, inputClass, useToast } from '../components/ui.jsx';
import { addDays, fmtDate, todayStr } from '../lib/format.js';

function useRefreshAfterDoseChange(babyId) {
  const qc = useQueryClient();
  return () => {
    for (const key of ['baby', 'newborns', 'dashboard', 'alerts', 'inventory']) {
      qc.invalidateQueries({ queryKey: key === 'baby' ? ['baby', String(babyId)] : [key] });
    }
  };
}

// ---------------------------------------------------------------- Mark administered
function AdministerModal({ dose, baby, onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const refresh = useRefreshAfterDoseChange(baby.baby_id);
  const isAdmin = user.role === 'ADMIN';
  const [date, setDate] = useState(todayStr());
  const [clinicId, setClinicId] = useState(String(baby.clinic_id));
  const [error, setError] = useState('');

  const clinics = useQuery({ queryKey: ['clinics'], queryFn: () => api.get('/clinics'), enabled: isAdmin });
  const preview = useQuery({
    queryKey: ['batch-preview', dose.record_id, isAdmin ? clinicId : 'own'],
    queryFn: () => api.get(`/doses/${dose.record_id}/batch-preview${qs({ clinicId: isAdmin ? clinicId : '' })}`),
    staleTime: 0,
  });

  const submit = useMutation({
    mutationFn: () => api.post(`/doses/${dose.record_id}/administer`, { administeredDate: date, ...(isAdmin ? { clinicId: Number(clinicId) } : {}) }),
    onSuccess: () => {
      toast.success(`${dose.dose_name} recorded for ${baby.full_name}`);
      refresh();
      onClose();
    },
    onError: (err) => {
      setError(err.message);
      preview.refetch();
    },
  });

  const batch = preview.data?.batch;
  const noStock = preview.isSuccess && !batch;

  return (
    <Modal
      title={`Mark ${dose.dose_name} administered`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button icon={Syringe} loading={submit.isPending} disabled={!date || noStock || preview.isPending} onClick={() => { setError(''); submit.mutate(); }}>
            Confirm administered
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          {baby.full_name} · {baby.age_text} · due {fmtDate(dose.scheduled_date)}
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </p>
        )}
        <Field label="Date given" hint="Between the date of birth and today.">
          {(p) => <input {...p} type="date" className={inputClass} value={date} min={baby.date_of_birth} max={todayStr()} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        {isAdmin && (
          <Field label="Clinic whose stock is used">
            {(p) => (
              <select {...p} className={inputClass} value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
                {clinics.data?.map((c) => (
                  <option key={c.clinic_id} value={c.clinic_id}>
                    {c.clinic_name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        <div aria-live="polite" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="mb-1 flex items-center gap-2 font-medium">
            <Package className="size-4" aria-hidden="true" />
            Batch that will be used
          </p>
          {preview.isPending && <Skeleton className="h-5 w-48" />}
          {preview.isError && <p className="text-red-800">{preview.error.message}</p>}
          {batch && (
            <p>
              <span className="font-mono font-medium">{batch.batch_no}</span> · expires {fmtDate(batch.expiry_date)} · {batch.quantity} in stock
              <span className="block text-xs text-slate-600">Earliest-expiring valid batch is chosen automatically.</span>
            </p>
          )}
          {noStock && (
            <p className="flex items-start gap-2 text-red-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {preview.data.batch_error || 'No usable stock for this vaccine.'} Restock it before recording the dose.
            </p>
          )}
          {preview.data && !preview.data.allowed && (
            <p className="mt-2 text-amber-900">The baby is younger today than the minimum age for this dose. Pick a later date or wait.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Reschedule
function RescheduleModal({ dose, baby, onClose }) {
  const toast = useToast();
  const refresh = useRefreshAfterDoseChange(baby.baby_id);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);

  const submit = useMutation({
    mutationFn: () => api.post(`/doses/${dose.record_id}/reschedule`, { newDate: date, reason: reason.trim() }),
    onSuccess: () => {
      toast.success(`${dose.dose_name} rescheduled to ${fmtDate(date)}`);
      refresh();
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  const invalid = !date || !reason.trim();
  return (
    <Modal
      title={`Reschedule ${dose.dose_name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button
            icon={CalendarClock}
            loading={submit.isPending}
            onClick={() => {
              setTouched(true);
              setError('');
              if (!invalid) submit.mutate();
            }}
          >
            Reschedule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          Currently due {fmtDate(dose.scheduled_date)}. The new date must be today or later and inside this dose’s allowed age window; the server checks it.
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </p>
        )}
        <Field label="New date" error={touched && !date ? 'Choose a date.' : ''}>
          {(p) => <input {...p} type="date" className={inputClass} value={date} min={todayStr()} max={addDays(baby.date_of_birth, 3650)} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label="Reason" error={touched && !reason.trim() ? 'Give a short reason.' : ''}>
          {(p) => <textarea {...p} rows={3} maxLength={300} className={`${inputClass} py-2`} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- page
export default function BabyProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const [modal, setModal] = useState(null); // { kind: 'administer' | 'reschedule', dose }
  const profile = useQuery({ queryKey: ['baby', id], queryFn: () => api.get(`/newborns/${id}`), staleTime: 0 });

  return (
    <>
      <Link to="/newborns" className="no-print mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary-800 hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {canManage(user) ? 'All newborns' : 'My children'}
      </Link>
      <QueryBoundary query={profile} skeleton={<div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>}>
        {({ baby, timeline }) => (
          <>
            <Card className="mb-6 flex flex-wrap items-center gap-5 p-5">
              <CoverageRing value={baby.coverage_pct} />
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-semibold tracking-tight">{baby.full_name}</h1>
                <p className="text-sm text-slate-700">
                  {baby.age_text} · born {fmtDate(baby.date_of_birth)} · {baby.gender === 'F' ? 'Female' : baby.gender === 'M' ? 'Male' : 'Other'}
                  {baby.birth_weight_kg ? ` · ${baby.birth_weight_kg} kg` : ''}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-slate-600">
                  <span>Guardian: {baby.guardian_name}</span>
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3.5" aria-hidden="true" />
                    {baby.guardian_phone}
                  </span>
                  <span>{baby.clinic_name}</span>
                </p>
                <p className="mt-2 text-sm">
                  <span className="font-medium text-done-ink">{baby.doses_done} done</span> ·{' '}
                  <span className="font-medium text-due-ink">{baby.doses_pending} pending</span> ·{' '}
                  <span className="font-medium text-overdue-ink">{baby.doses_overdue} overdue</span> of {baby.doses_total}
                </p>
              </div>
              <Link to={`/newborns/${baby.baby_id}/card`} className="no-print inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">
                <FileText className="size-4" aria-hidden="true" />
                Vaccination card
              </Link>
            </Card>

            <PageHeader title="Vaccination timeline" subtitle="Green is given, amber is due within 14 days, red is overdue, grey is further ahead." />
            <Timeline
              rows={timeline}
              actions={
                canManage(user)
                  ? (dose) =>
                      dose.status !== 'DONE' && (
                        <>
                          <Button size="sm" icon={Syringe} onClick={() => setModal({ kind: 'administer', dose })}>
                            Mark administered
                          </Button>
                          <Button size="sm" variant="secondary" icon={CalendarClock} onClick={() => setModal({ kind: 'reschedule', dose })}>
                            Reschedule
                          </Button>
                        </>
                      )
                  : undefined
              }
            />
            {modal?.kind === 'administer' && <AdministerModal dose={modal.dose} baby={baby} onClose={() => setModal(null)} />}
            {modal?.kind === 'reschedule' && <RescheduleModal dose={modal.dose} baby={baby} onClose={() => setModal(null)} />}
          </>
        )}
      </QueryBoundary>
    </>
  );
}
