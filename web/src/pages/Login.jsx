import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CalendarCheck, PackageCheck, ShieldCheck, Syringe } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { Button, Field, Notice, inputClass } from '../components/ui.jsx';
import { usePageTitle } from '../lib/usePageTitle.js';
import { ThemeToggle } from '../theme.jsx';

const DEMO = [
  ['admin', 'Admin@123', 'Administrator'],
  ['nurse1', 'Nurse@123', 'Nurse, Sunrise clinic'],
  ['nurse2', 'Nurse@123', 'Nurse, CityCare clinic'],
  ['parent1', 'Parent@123', 'Parent of Aarav'],
];

const POINTS = [
  [CalendarCheck, 'Every dose scheduled automatically from the date of birth'],
  [PackageCheck, 'Stock, batches and expiry tracked, so no dose comes from an empty or expired vial'],
  [ShieldCheck, 'Every change recorded in an audit log'],
];

export default function Login() {
  usePageTitle('Sign in');
  const { user, login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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

      <main className="relative flex min-h-screen items-center justify-center px-4 py-10 lg:min-h-0">
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
              {(p) => <input {...p} type="password" className={inputClass} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
            <Button type="submit" loading={busy} className="w-full">
              Sign in
            </Button>
          </form>

          {import.meta.env.DEV && (
            <div className="mt-6 rounded-xl border border-dashed border-line-strong p-4 text-sm text-ink-2">
              <p className="mb-2 font-medium">Demo logins (development only)</p>
              <ul className="space-y-1">
                {DEMO.map(([u, p, who]) => (
                  <li key={u}>
                    <button
                      type="button"
                      className="min-h-9 w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-hover"
                      onClick={() => {
                        setUsername(u);
                        setPassword(p);
                      }}
                    >
                      <span className="font-mono">{u}</span> <span className="text-muted">· {who}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
