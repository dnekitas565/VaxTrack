import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Baby, CalendarCheck, CheckCircle2, Info, UserPlus, Users } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Timeline from '../components/Timeline.jsx';
import { Button, Card, Field, Notice, PageHeader, inputClass, linkButtonClass, useToast } from '../components/ui.jsx';
import { todayStr } from '../lib/format.js';
import { usePageTitle } from '../lib/usePageTitle.js';

const EMPTY = {
  guardianName: '', guardianPhone: '', guardianEmail: '', guardianAddress: '',
  babyName: '', gender: '', dob: '', weight: '', clinicId: '', endemic: false,
};

function validate(f, isAdmin) {
  const e = {};
  if (!f.guardianName.trim()) e.guardianName = 'Enter the guardian’s name.';
  if (!/^[0-9+ -]{7,15}$/.test(f.guardianPhone.trim())) e.guardianPhone = 'Enter a phone number of 7 to 15 digits.';
  if (f.guardianEmail && !/^\S+@\S+\.\S+$/.test(f.guardianEmail)) e.guardianEmail = 'Enter a valid email address or leave it empty.';
  if (!f.babyName.trim()) e.babyName = 'Enter the baby’s name.';
  if (!f.gender) e.gender = 'Choose a gender.';
  if (!f.dob) e.dob = 'Enter the date of birth.';
  else if (f.dob > todayStr()) e.dob = 'The date of birth cannot be in the future.';
  if (f.weight !== '' && !(Number(f.weight) >= 0.5 && Number(f.weight) <= 9.99)) e.weight = 'Enter a weight between 0.5 and 9.99 kg.';
  if (isAdmin && !f.clinicId) e.clinicId = 'Choose a clinic.';
  return e;
}

function FormSection({ icon: Icon, title, children }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-5 flex items-center gap-2.5 text-base font-semibold text-ink">
        <span className="rounded-lg bg-primary-soft p-2 text-primary-soft-ink">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

export default function RegisterNewborn() {
  usePageTitle('Register newborn');
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState(null);

  const clinics = useQuery({ queryKey: ['clinics'], queryFn: () => api.get('/clinics'), enabled: isAdmin });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const register = useMutation({
    mutationFn: () =>
      api.post('/newborns', {
        guardian: {
          name: form.guardianName,
          phone: form.guardianPhone,
          ...(form.guardianEmail ? { email: form.guardianEmail } : {}),
          ...(form.guardianAddress ? { address: form.guardianAddress } : {}),
        },
        baby: {
          name: form.babyName,
          gender: form.gender,
          dob: form.dob,
          ...(form.weight !== '' ? { birthWeightKg: Number(form.weight) } : {}),
        },
        ...(isAdmin ? { clinicId: Number(form.clinicId) } : {}),
        includeRegional: form.endemic,
      }),
    onSuccess: (data) => {
      setResult({ ...data, name: form.babyName.trim() });
      toast.success(`${form.babyName.trim()} registered with ${data.timeline.length} scheduled doses`);
      queryClient.invalidateQueries({ queryKey: ['newborns'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => setFormError(err.message),
  });

  function submit(e) {
    e.preventDefault();
    setFormError('');
    const found = validate(form, isAdmin);
    setErrors(found);
    if (Object.keys(found).length === 0) register.mutate();
  }

  if (result) {
    return (
      <>
        <PageHeader title="Newborn registered" subtitle={`${result.name}: the full schedule was generated from the date of birth.`} />
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <p className="flex items-center gap-2.5 font-medium text-done-ink">
            <span className="rounded-full bg-done-soft p-1.5">
              <CheckCircle2 className="size-5" aria-hidden="true" />
            </span>
            {result.timeline.length} doses scheduled
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null);
                setForm(EMPTY);
              }}
            >
              Register another
            </Button>
            <Link to={`/newborns/${result.baby_id}`} className={linkButtonClass('primary')}>
              Open profile
            </Link>
          </div>
        </Card>
        <h2 className="sr-only">Generated vaccination schedule</h2>
        <Timeline rows={result.timeline} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Register newborn" subtitle="Enter the guardian and baby details. The vaccine schedule is created automatically." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_18rem]">
        <form onSubmit={submit} noValidate className="space-y-5">
          {formError && <Notice tone="error">{formError}</Notice>}

          <FormSection icon={Users} title="Guardian">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full name" error={errors.guardianName}>
                {(p) => <input {...p} className={inputClass} value={form.guardianName} onChange={set('guardianName')} autoComplete="off" />}
              </Field>
              <Field label="Phone" error={errors.guardianPhone} hint="An existing guardian with this phone number is reused.">
                {(p) => <input {...p} type="tel" inputMode="tel" className={inputClass} value={form.guardianPhone} onChange={set('guardianPhone')} autoComplete="off" />}
              </Field>
              <Field label="Email (optional)" error={errors.guardianEmail}>
                {(p) => <input {...p} type="email" className={inputClass} value={form.guardianEmail} onChange={set('guardianEmail')} autoComplete="off" />}
              </Field>
              <Field label="Address (optional)">
                {(p) => <input {...p} className={inputClass} value={form.guardianAddress} onChange={set('guardianAddress')} autoComplete="off" />}
              </Field>
            </div>
          </FormSection>

          <FormSection icon={Baby} title="Baby">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full name" error={errors.babyName}>
                {(p) => <input {...p} className={inputClass} value={form.babyName} onChange={set('babyName')} autoComplete="off" />}
              </Field>
              <Field label="Gender" error={errors.gender}>
                {(p) => (
                  <select {...p} className={inputClass} value={form.gender} onChange={set('gender')}>
                    <option value="">Choose…</option>
                    <option value="F">Female</option>
                    <option value="M">Male</option>
                    <option value="O">Other</option>
                  </select>
                )}
              </Field>
              <Field label="Date of birth" error={errors.dob}>
                {(p) => <input {...p} type="date" max={todayStr()} className={inputClass} value={form.dob} onChange={set('dob')} />}
              </Field>
              <Field label="Birth weight in kg (optional)" error={errors.weight}>
                {(p) => <input {...p} type="number" step="0.01" min="0.5" max="9.99" inputMode="decimal" className={inputClass} value={form.weight} onChange={set('weight')} />}
              </Field>
              {isAdmin ? (
                <Field label="Clinic" error={errors.clinicId}>
                  {(p) => (
                    <select {...p} className={inputClass} value={form.clinicId} onChange={set('clinicId')}>
                      <option value="">Choose…</option>
                      {clinics.data?.map((c) => (
                        <option key={c.clinic_id} value={c.clinic_id}>
                          {c.clinic_name}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              ) : (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-ink-2">Clinic</p>
                  <p className="flex min-h-11 items-center rounded-lg bg-subtle px-3 text-sm text-ink">{user.clinicName}</p>
                </div>
              )}
            </div>
            <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-line bg-subtle p-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={form.endemic} onChange={set('endemic')} />
              <span>
                <span className="font-medium text-ink">Endemic district (JE)</span>
                <span className="block text-muted">Adds the two Japanese encephalitis doses. The national schedule gives JE in endemic districts only.</span>
              </span>
            </label>
          </FormSection>

          <div className="flex justify-end">
            <Button type="submit" icon={UserPlus} loading={register.isPending}>
              Register and create schedule
            </Button>
          </div>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <CalendarCheck className="size-4 text-primary-ink" aria-hidden="true" />
              What happens next
            </h2>
            <ol className="space-y-3 text-sm text-muted">
              <li><span className="font-medium text-ink-2">1.</span> The guardian is saved, or reused if the phone number is known.</li>
              <li><span className="font-medium text-ink-2">2.</span> 24 doses are scheduled from the date of birth (26 with JE).</li>
              <li><span className="font-medium text-ink-2">3.</span> Everything is saved together: if any step fails, nothing is kept.</li>
            </ol>
          </Card>
          <Notice tone="info">
            <span className="flex items-start gap-1.5">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Doses that are already past due are flagged as overdue when the dashboard opens.
            </span>
          </Notice>
        </aside>
      </div>
    </>
  );
}
