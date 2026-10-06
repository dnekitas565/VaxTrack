import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Syringe } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { Button, Field, inputClass } from '../components/ui.jsx';

const DEMO = [
  ['admin', 'Admin@123', 'Administrator'],
  ['nurse1', 'Nurse@123', 'Nurse, Sunrise clinic'],
  ['nurse2', 'Nurse@123', 'Nurse, CityCare clinic'],
  ['parent1', 'Parent@123', 'Parent of Aarav'],
];

export default function Login() {
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="rounded-xl bg-primary-700 p-3 text-white">
            <Syringe className="size-7" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">VaxTrack</h1>
          <p className="text-sm text-slate-600">Newborn vaccination schedule tracker</p>
        </div>

        <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {sessionExpired && !error && (
            <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Your session ended. Please sign in again.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
              {error}
            </p>
          )}
          <Field label="Username">
            {(p) => <input {...p} className={inputClass} autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />}
          </Field>
          <Field label="Password">
            {(p) => <input {...p} type="password" className={inputClass} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Sign in
          </Button>
        </form>

        {import.meta.env.DEV && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-700">
            <p className="mb-2 font-medium">Demo logins (development only)</p>
            <ul className="space-y-1">
              {DEMO.map(([u, p, who]) => (
                <li key={u}>
                  <button
                    type="button"
                    className="w-full rounded px-1 py-1 text-left hover:bg-slate-100"
                    onClick={() => {
                      setUsername(u);
                      setPassword(p);
                    }}
                  >
                    <span className="font-mono">{u}</span> <span className="text-slate-600">· {who}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
