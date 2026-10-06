import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, UserPlus } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Timeline from '../components/Timeline.jsx';
import { Button, Card, Field, PageHeader, inputClass, useToast } from '../components/ui.jsx';
import { todayStr } from '../lib/format.js';

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

export default function RegisterNewborn() {
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
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="flex items-center gap-2 font-medium text-done-ink">
            <CheckCircle2 className="size-5" aria-hidden="true" />
            {result.timeline.length} doses scheduled
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null);
                setForm(EMPTY);
              }}
            >
              Register another
            </Button>
            <Link to={`/newborns/${result.baby_id}`} className="inline-flex min-h-11 items-center rounded-lg bg-primary-700 px-4 text-sm font-medium text-white hover:bg-primary-800">
              Open profile
            </Link>
          </div>
        </Card>
        <Card className="p-5">
          <Timeline rows={result.timeline} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Register newborn" subtitle="Enter the guardian and baby details. The vaccine schedule is created automatically." />
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
            {formError}
          </p>
        )}
        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold">Guardian</h2>
          <div className="grid gap-4 sm:grid-cols-2">
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
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold">Baby</h2>
          <div className="grid gap-4 sm:grid-cols-2">
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
                <p className="mb-1 text-sm font-medium text-slate-800">Clinic</p>
                <p className="flex min-h-11 items-center rounded-lg bg-slate-100 px-3 text-sm">{user.clinicName}</p>
              </div>
            )}
          </div>
          <label className="mt-4 flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 size-5 accent-primary-700" checked={form.endemic} onChange={set('endemic')} />
            <span>
              <span className="font-medium">Endemic district (JE)</span>
              <span className="block text-slate-600">Adds the two Japanese encephalitis doses. The national schedule gives JE in endemic districts only.</span>
            </span>
          </label>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" icon={UserPlus} loading={register.isPending}>
            Register and create schedule
          </Button>
        </div>
      </form>
    </>
  );
}
