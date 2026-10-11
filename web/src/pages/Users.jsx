import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, FileText, KeyRound, UserPlus } from 'lucide-react';
import { api } from '../api.js';
import { Button, Card, Chip, Field, Modal, Notice, PageHeader, QueryBoundary, Skeleton, inputClass, useToast } from '../components/ui.jsx';
import { ROLE_LABEL } from '../lib/format.js';
import { usePageTitle } from '../lib/usePageTitle.js';

const ROLE_TONE = { ADMIN: 'primary', NURSE: 'neutral', PARENT: 'neutral' };

function AddAccountModal({ kind, options, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const isNurse = kind === 'nurse';
  const [fullName, setFullName] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [guardianId, setGuardianId] = useState('');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/users', isNurse ? { role: 'NURSE', fullName: fullName.trim(), clinicId: Number(clinicId) } : { role: 'PARENT', guardianId: Number(guardianId) }),
    onSuccess: (data) => {
      setCreated(data);
      for (const key of ['users', 'demo-logins']) qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (err) => setError(err.message),
  });

  const invalid = isNurse ? !fullName.trim() || !clinicId : !guardianId;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Username: ${created.username}\nPassword: ${created.password}`);
      toast.success('Login details copied');
    } catch {
      toast.error('Could not copy. Select the text and copy it by hand.');
    }
  };

  if (created) {
    return (
      <Modal
        title={isNurse ? 'Nurse account created' : 'Parent login created'}
        onClose={onClose}
        footer={
          <>
            <Button variant="secondary" icon={Copy} onClick={copy}>
              Copy login details
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        }
      >
        <Notice tone="success">The account is ready and already listed in LOGINS.md.</Notice>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Username</dt>
          <dd className="font-mono font-medium text-ink">{created.username}</dd>
          <dt className="text-muted">Password</dt>
          <dd className="font-mono font-medium text-ink">{created.password}</dd>
        </dl>
      </Modal>
    );
  }

  return (
    <Modal
      title={isNurse ? 'Add a nurse' : 'Add a parent login'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            icon={UserPlus}
            loading={create.isPending}
            onClick={() => {
              setTouched(true);
              setError('');
              if (!invalid) create.mutate();
            }}
          >
            Create account
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {isNurse
            ? 'The username is the next free nurseN. The account starts with the default nurse password.'
            : 'For a guardian who has no login yet. The username is made from their name and the password is the default parent password.'}
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        {isNurse ? (
          <>
            <Field label="Full name" error={touched && !fullName.trim() ? 'Enter the nurse’s name.' : ''}>
              {(p) => <input {...p} className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" maxLength={100} />}
            </Field>
            <Field label="Clinic" error={touched && !clinicId ? 'Choose a clinic.' : ''}>
              {(p) => (
                <select {...p} className={inputClass} value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
                  <option value="">Choose…</option>
                  {options.clinics.map((c) => (
                    <option key={c.clinic_id} value={c.clinic_id}>
                      {c.clinic_name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </>
        ) : (
          <Field label="Guardian" error={touched && !guardianId ? 'Choose a guardian.' : ''}>
            {(p) => (
              <select {...p} className={inputClass} value={guardianId} onChange={(e) => setGuardianId(e.target.value)}>
                <option value="">Choose…</option>
                {options.guardians_without_login.map((g) => (
                  <option key={g.guardian_id} value={g.guardian_id}>
                    {g.full_name} · {g.phone}
                    {g.children ? ` · ${g.children}` : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
      </div>
    </Modal>
  );
}

export default function Users() {
  usePageTitle('Users');
  const [showPasswords, setShowPasswords] = useState(true);
  const [modal, setModal] = useState(null); // 'nurse' | 'parent'
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users'), staleTime: 0 });
  const options = useQuery({ queryKey: ['users', 'options'], queryFn: () => api.get('/users/options'), staleTime: 0 });
  const withoutLogin = options.data?.guardians_without_login.length ?? 0;

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Everyone who can sign in. Every clinic has a nurse and every guardian gets a login when their baby is registered."
        actions={
          <>
            <Button icon={UserPlus} disabled={!options.data} onClick={() => setModal('nurse')}>
              Add nurse
            </Button>
            {withoutLogin > 0 && (
              <Button variant="secondary" icon={KeyRound} onClick={() => setModal('parent')}>
                Add parent login ({withoutLogin})
              </Button>
            )}
          </>
        }
      />

      <Notice tone="info" className="mb-4">
        <span className="flex items-start gap-2">
          <FileText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            This list is read live from the database and is also saved as <span className="font-mono">LOGINS.md</span> in the project folder,
            which is rewritten whenever accounts change. Passwords shown are the role defaults; an account whose password was changed says so.
          </span>
        </span>
      </Notice>

      <label className="mb-3 flex min-h-11 w-fit cursor-pointer items-center gap-2.5 text-sm text-ink-2">
        <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} />
        Show passwords
      </label>

      <QueryBoundary query={users} skeleton={<Skeleton className="h-72 w-full" />}>
        {(rows) => (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">All user accounts</caption>
              <thead className="border-b border-line bg-subtle text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Username</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Role</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Clinic / child</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((u) => (
                  <tr key={u.user_id} className="transition-colors hover:bg-hover/50">
                    <th scope="row" className="px-4 py-3 font-mono text-sm font-medium text-ink">{u.username}</th>
                    <td className="px-4 py-3"><Chip tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Chip></td>
                    <td className="px-4 py-3 text-ink">{u.full_name}</td>
                    <td className="px-4 py-3 text-ink-2">{u.role === 'ADMIN' ? 'All clinics' : u.clinic_name || u.children || <span className="text-muted">No child yet</span>}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-2">
                      {u.password ? (showPasswords ? u.password : '••••••••') : <span className="font-sans text-due-ink">changed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </QueryBoundary>
      {modal && options.data && <AddAccountModal kind={modal} options={options.data} onClose={() => setModal(null)} />}
    </>
  );
}
