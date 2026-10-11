import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Baby, CalendarCheck, CheckCircle2, Copy, KeyRound, UserPlus, Users } from 'lucide-react';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import Timeline from '../components/Timeline.jsx';
import { Button, Card, Field, Notice, PageHeader, inputClass, linkButtonClass, useToast } from '../components/ui.jsx';
import { todayStr } from '../lib/format.js';
import { usePageTitle } from '../lib/usePageTitle.js';

const EMPTY = {
  guardianName: '', guardianPhone: '', guardianEmail: '', guardianAddress: '',
  babyName: '', gender: '', dob: '', weight: '', clinicId: '', endemic: false,
};

const PHONE_RE = /^[0-9+ -]{7,15}$/;

// guardianKnown: the phone number belongs to a registered guardian, whose stored details are kept
function validate(f, isAdmin, guardianKnown) {
  const e = {};
  if (!guardianKnown && !f.guardianName.trim()) e.guardianName = 'Enter the guardian’s name.';
  if (!PHONE_RE.test(f.guardianPhone.trim())) e.guardianPhone = 'Enter a phone number of 7 to 15 digits.';
  if (!guardianKnown && !f.guardianAddress.trim()) e.guardianAddress = 'Enter the guardian’s address.';
  if (!guardianKnown && f.guardianEmail && !/^\S+@\S+\.\S+$/.test(f.guardianEmail)) e.guardianEmail = 'Enter a valid email address or leave it empty.';
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

/** The guardian's login: shown right after registration so the nurse can hand it to the family */
function ParentLoginCard({ login, guardianName }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Username: ${login.username}\nPassword: ${login.password ?? ''}`);
      toast.success('Login details copied');
    } catch {
      toast.error('Could not copy. Select the text and copy it by hand.');
    }
  };
  if (!login.created) {
    return (
      <Card className="mb-6 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary-soft p-2.5 text-primary-soft-ink">
            <Users className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">Added to an existing family</h2>
            <p className="text-sm text-muted">
              This guardian already has a parent login, so no new one was made. The parent signs in as usual and now sees this child as well.
            </p>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="mb-6 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary-soft p-2.5 text-primary-soft-ink">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">Parent login created</h2>
            <p className="text-sm text-muted">{guardianName} can now sign in to see this child's schedule and print the vaccination card.</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Username</dt>
              <dd className="font-mono font-medium text-ink">{login.username}</dd>
              <dt className="text-muted">Password</dt>
              <dd className="font-mono font-medium text-ink">{login.password}</dd>
            </dl>
          </div>
        </div>
        <Button variant="secondary" size="sm" icon={Copy} onClick={copy}>
          Copy login details
        </Button>
      </div>
    </Card>
  );
}

/** What the phone number means, without revealing anything about the guardian */
function phoneHint(phone, lookup) {
  if (!PHONE_RE.test(phone)) return 'Used to recognise a returning family and to name the parent login.';
  if (lookup.pending) return 'Checking the phone number…';
  if (lookup.failed) return 'Could not check this number. It is checked again when you register.';
  return lookup.known
    ? 'A guardian with this number is already registered. The baby will be added to that family and no new login is created.'
    : 'New guardian. A parent login is created with the baby.';
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

  // is the phone number already a registered guardian? (yes/no only; checked 0.4 s after typing stops)
  const phone = form.guardianPhone.trim();
  const [settledPhone, setSettledPhone] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSettledPhone(phone), 400);
    return () => clearTimeout(t);
  }, [phone]);
  const lookupOn = PHONE_RE.test(phone) && settledPhone === phone;
  const guardianLookup = useQuery({
    queryKey: ['guardian-lookup', settledPhone],
    queryFn: () => api.get(`/newborns/guardian-lookup${qs({ phone: settledPhone })}`),
    enabled: lookupOn,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const known = lookupOn && guardianLookup.data?.exists === true;
  const lookupState = {
    known,
    pending: PHONE_RE.test(phone) && (!lookupOn || guardianLookup.isFetching),
    failed: guardianLookup.isError,
  };

  const clinics = useQuery({ queryKey: ['clinics'], queryFn: () => api.get('/clinics'), enabled: isAdmin });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const register = useMutation({
    mutationFn: () =>
      api.post('/newborns', {
        guardian: known
          ? { phone: form.guardianPhone }
          : {
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
      setResult({ ...data, name: form.babyName.trim(), guardianName: known ? '' : form.guardianName.trim() });
      toast.success(`${form.babyName.trim()} registered with ${data.timeline.length} scheduled doses`);
      queryClient.invalidateQueries({ queryKey: ['newborns'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['guardian-lookup'] });
    },
    onError: (err) => setFormError(err.message),
  });

  function submit(e) {
    e.preventDefault();
    setFormError('');
    const found = validate(form, isAdmin, known);
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
        <ParentLoginCard login={result.parent_login} guardianName={result.guardianName} />
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
              <Field label="Full name" error={known ? undefined : errors.guardianName} hint={known ? 'Not needed: the registered guardian’s details are kept.' : undefined}>
                {(p) => <input {...p} className={inputClass} value={form.guardianName} onChange={set('guardianName')} autoComplete="off" disabled={known} />}
              </Field>
              <Field label="Phone" error={errors.guardianPhone} hint={<span aria-live="polite">{phoneHint(phone, lookupState)}</span>}>
                {(p) => <input {...p} type="tel" inputMode="tel" className={inputClass} value={form.guardianPhone} onChange={set('guardianPhone')} autoComplete="off" />}
              </Field>
              <Field label="Email (optional)" error={known ? undefined : errors.guardianEmail}>
                {(p) => <input {...p} type="email" className={inputClass} value={form.guardianEmail} onChange={set('guardianEmail')} autoComplete="off" disabled={known} />}
              </Field>
              <Field label="Address" error={known ? undefined : errors.guardianAddress}>
                {(p) => <input {...p} className={inputClass} value={form.guardianAddress} onChange={set('guardianAddress')} autoComplete="off" disabled={known} />}
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
              <li><span className="font-medium text-ink-2">1.</span> The guardian is saved with a parent login, or reused if the phone number is known (a second child joins the same family and login).</li>
              <li><span className="font-medium text-ink-2">2.</span> 24 doses are scheduled from the date of birth (26 with JE).</li>
              <li><span className="font-medium text-ink-2">3.</span> Everything is saved together: if any step fails, nothing is kept.</li>
            </ol>
          </Card>
          <Notice tone="info">Doses that are already past due are flagged as overdue when the dashboard opens.</Notice>
        </aside>
      </div>
    </>
  );
}
