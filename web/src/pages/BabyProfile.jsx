import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Building2, CalendarClock, FileText, Package, Phone, Syringe, User } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth, canManage } from '../auth.jsx';
import Timeline from '../components/Timeline.jsx';
import { Avatar, Button, Card, CoverageRing, Field, FilterChips, Modal, Notice, QueryBoundary, Skeleton, StackedBar, inputClass, linkButtonClass, useToast } from '../components/ui.jsx';
import { addDays, fmtDate, todayStr } from '../lib/format.js';
import { usePageTitle } from '../lib/usePageTitle.js';

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
          <Button
            icon={Syringe}
            loading={submit.isPending}
            disabled={!date || noStock || preview.isPending}
            onClick={() => {
              setError('');
              submit.mutate();
            }}
          >
            Confirm administered
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-2">
          {baby.full_name} · {baby.age_text} · due {fmtDate(dose.scheduled_date)}
        </p>
        {error && <Notice tone="error">{error}</Notice>}
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

        <div aria-live="polite" className="rounded-xl border border-line bg-subtle p-4 text-sm">
          <p className="mb-2 flex items-center gap-2 font-medium text-ink">
            <Package className="size-4 text-muted" aria-hidden="true" />
            Batch that will be used
          </p>
          {preview.isPending && <Skeleton className="h-5 w-48" />}
          {preview.isError && <p className="text-overdue-ink">{preview.error.message}</p>}
          {batch && (
            <p className="text-ink-2">
              <span className="font-mono font-medium text-ink">{batch.batch_no}</span> · expires {fmtDate(batch.expiry_date)} · {batch.quantity} in stock
              <span className="mt-0.5 block text-xs text-muted">The earliest-expiring valid batch is chosen automatically.</span>
            </p>
          )}
          {noStock && (
            <p className="flex items-start gap-2 text-overdue-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{preview.data.batch_error || 'No usable stock for this vaccine.'} Restock it before recording the dose.</span>
            </p>
          )}
          {preview.data && !preview.data.allowed && (
            <p className="mt-2 text-due-ink">The baby is younger today than the minimum age for this dose. Pick a later date or wait.</p>
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
        <p className="text-sm text-ink-2">
          Currently due {fmtDate(dose.scheduled_date)}. The new date must be today or later and inside this dose’s allowed age window; the server checks it.
        </p>
        {error && <Notice tone="error">{error}</Notice>}
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
function Fact({ icon: Icon, label, children }) {
  // dt and dd stay the only children of the group, which keeps the definition list valid for screen readers
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="size-3.5 shrink-0 text-faint" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

export default function BabyProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const [modal, setModal] = useState(null); // { kind: 'administer' | 'reschedule', dose }
  const [filter, setFilter] = useState('');
  const profile = useQuery({ queryKey: ['baby', id], queryFn: () => api.get(`/newborns/${id}`), staleTime: 0 });
  usePageTitle(profile.data?.baby.full_name ?? 'Baby profile');

  return (
    <>
      <Link to="/newborns" className="no-print mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary-ink hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {canManage(user) ? 'All newborns' : 'My children'}
      </Link>
      <QueryBoundary query={profile} skeleton={<div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>}>
        {({ baby, timeline }) => {
          const count = (s) => timeline.filter((t) => t.status === s).length;
          return (
            <>
              <Card className="mb-8 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <Avatar name={baby.full_name} size="lg" />
                    <div className="min-w-0">
                      <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{baby.full_name}</h1>
                      <p className="text-sm text-muted">
                        {baby.age_text} · {baby.gender === 'F' ? 'Female' : baby.gender === 'M' ? 'Male' : 'Other'}
                        {baby.birth_weight_kg ? ` · ${baby.birth_weight_kg} kg at birth` : ''}
                      </p>
                    </div>
                  </div>
                  <Link to={`/newborns/${baby.baby_id}/card`} className={`no-print ${linkButtonClass('secondary')}`}>
                    <FileText className="size-4" aria-hidden="true" />
                    Vaccination card
                  </Link>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 border-t border-line pt-6 md:grid-cols-[auto_1fr_1fr]">
                  <div className="flex items-center gap-4">
                    <CoverageRing value={baby.coverage_pct} />
                    <p className="text-sm text-muted">of {baby.doses_total} scheduled doses given</p>
                  </div>
                  <dl className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2 md:grid-cols-1">
                    <Fact icon={CalendarClock} label="Date of birth">{fmtDate(baby.date_of_birth)}</Fact>
                    <Fact icon={Building2} label="Clinic">{baby.clinic_name}</Fact>
                  </dl>
                  <dl className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2 md:grid-cols-1">
                    <Fact icon={User} label="Guardian">{baby.guardian_name}</Fact>
                    <Fact icon={Phone} label="Guardian phone">{baby.guardian_phone}</Fact>
                  </dl>
                </div>

                <div className="mt-6 border-t border-line pt-5">
                  <StackedBar done={baby.doses_done} pending={baby.doses_pending} overdue={baby.doses_overdue} />
                </div>
              </Card>

              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-ink">Vaccination timeline</h2>
                  <p className="mt-1 text-sm text-muted">Green is given, amber is due within 14 days, red is overdue, grey is further ahead.</p>
                </div>
                <FilterChips
                  label="Filter doses by status"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    ['', 'All', timeline.length],
                    ['OVERDUE', 'Overdue', count('OVERDUE')],
                    ['PENDING', 'Pending', count('PENDING')],
                    ['DONE', 'Done', count('DONE')],
                  ]}
                />
              </div>

              <Timeline
                rows={timeline}
                filter={filter}
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
          );
        }}
      </QueryBoundary>
    </>
  );
}
