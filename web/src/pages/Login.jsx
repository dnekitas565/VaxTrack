import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Eye, EyeOff, PackageCheck, ShieldCheck, Syringe } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Button, Field, Notice, inputClass } from '../components/ui.jsx';
import { usePageTitle } from '../lib/usePageTitle.js';
import { ThemeToggle } from '../theme.jsx';

const POINTS = [
  [CalendarCheck, 'Every dose scheduled automatically from the date of birth'],
  [PackageCheck, 'Stock, batches and expiry tracked, so no dose comes from an empty or expired vial'],
  [ShieldCheck, 'Every change recorded in an audit log'],
];

const GROUPS = [
  ['ADMIN', 'Administrator'],
  ['NURSE', 'Nurses (one per clinic)'],
  ['PARENT', 'Parents and guardians'],
];

/**
 * Development helper: every account with its password, read live from the database
 * (the API only answers when DEMO_LOGINS=true, so this block simply disappears otherwise).
 */
function QuickLogins({ onPick }) {
  const logins = useQuery({
    queryKey: ['demo-logins'],
    queryFn: () => api.get('/auth/demo-logins'),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  if (!logins.data) return null;

  return (
    <section aria-labelledby="quick-title" className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface p-4">
      <h2 id="quick-title" className="text-sm font-semibold text-ink">
        Quick sign-in (development)
      </h2>
      <p className="mb-3 mt-0.5 text-xs text-muted">Click an account to fill in the username and password. Also saved in LOGINS.md.</p>
      <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
        {GROUPS.map(([role, title]) => {
          const rows = logins.data.filter((u) => u.role === role);
          if (rows.length === 0) return null;
          return (
            <div key={role}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">{title}</h3>
              <ul>
                {rows.map((u) => (
                  <li key={u.username}>
                    <button
                      type="button"
                      onClick={() => onPick(u)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-hover"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-sm text-ink">{u.username}</span>
                        <span className="block truncate text-xs text-muted">
                          {u.full_name}
                          {u.clinic_name ? ` · ${u.clinic_name}` : ''}
                          {u.children ? ` · ${u.children}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-ink-2">{u.password ?? '(changed)'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function Login() {
  usePageTitle('Sign in');
  const { user, login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from?.pathname ?? (user.role === 'PARENT' ? '/newborns' : '/')} replace />;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    try {
      const u = await login(username.trim(), password);
      navigate(location.state?.from?.pathname ?? (u.role === 'PARENT' ? '/newborns' : '/'), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* brand panel (desktop) */}
      <aside className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between" style={{ background: 'var(--brand-grad)' }}>
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-white/15 p-2.5 backdrop-blur">
            <Syringe className="size-6" aria-hidden="true" />
          </span>
          <span className="text-xl font-semibold tracking-tight">VaxTrack</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Never miss a newborn’s vaccine dose.</h2>
          <p className="mt-3 text-white/80">A vaccination schedule tracker for clinics and parents, built on the National Immunization Schedule.</p>
          <ul className="mt-8 space-y-4">
            {POINTS.map(([Icon, text]) => (
              <li key={text} className="flex items-start gap-3 text-sm text-white/90">
                <span className="mt-0.5 rounded-lg bg-white/15 p-1.5">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">BCSE302P Database Systems Laboratory · Oracle PL/SQL</p>
        <div className="pointer-events-none absolute -bottom-24 -right-24 size-80 rounded-full bg-white/5" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-10 top-24 size-40 rounded-full bg-white/5" aria-hidden="true" />
      </aside>

      <main className="relative flex min-h-screen items-center justify-center px-4 py-14 lg:min-h-0">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-2 text-center lg:items-start lg:text-left">
            <span className="rounded-xl p-3 text-white lg:hidden" style={{ background: 'var(--brand-grad)' }}>
              <Syringe className="size-7" aria-hidden="true" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in to VaxTrack</h1>
            <p className="text-sm text-muted">Newborn vaccination schedule tracker</p>
          </div>

          <form onSubmit={submit} noValidate className="space-y-4">
            {sessionExpired && !error && <Notice tone="warn">Your session ended. Please sign in again.</Notice>}
            {error && <Notice tone="error">{error}</Notice>}
            <Field label="Username">
              {(p) => <input {...p} className={inputClass} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />}
            </Field>
            <Field label="Password">
              {(p) => (
                <div className="relative">
                  <input
                    {...p}
                    type={showPassword ? 'text' : 'password'}
                    className={`${inputClass} pr-12`}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide characters' : 'Show characters'}
                    aria-pressed={showPassword}
                    title={showPassword ? 'Hide what you type' : 'Show what you type'}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted transition-colors hover:text-ink"
                  >
                    {showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
                  </button>
                </div>
              )}
            </Field>
            <Button type="submit" loading={busy} className="w-full">
              Sign in
            </Button>
          </form>

          <QuickLogins
            onPick={(u) => {
              setUsername(u.username);
              setPassword(u.password ?? '');
              setShowPassword(true); // show what was filled in, so there is no doubt about the password
              setError('');
            }}
          />
        </div>
      </main>
    </div>
  );
}
