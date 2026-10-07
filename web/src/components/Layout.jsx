import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Baby, Bell, LayoutDashboard, LogOut, Menu, Package, ScrollText, Syringe, UserPlus, X } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, canManage } from '../auth.jsx';
import { ROLE_LABEL } from '../lib/format.js';
import { ThemeToggle } from '../theme.jsx';
import { Avatar } from './ui.jsx';

function sectionsFor(user) {
  if (user.role === 'PARENT') return [{ title: null, items: [{ to: '/newborns', label: 'My children', icon: Baby }] }];
  const insights = [{ to: '/reports', label: 'Reports', icon: BarChart3 }];
  if (user.role === 'ADMIN') insights.push({ to: '/audit', label: 'Audit log', icon: ScrollText });
  return [
    {
      title: 'Clinic',
      items: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/register', label: 'Register newborn', icon: UserPlus },
        { to: '/newborns', label: 'Newborns', icon: Baby },
        { to: '/inventory', label: 'Inventory', icon: Package },
        { to: '/alerts', label: 'Alerts', icon: Bell, badge: true },
      ],
    },
    { title: 'Insights', items: insights },
  ];
}

function NavList({ sections, unread, onNavigate }) {
  return (
    <div className="space-y-5">
      {sections.map((s, i) => (
        <div key={s.title ?? i}>
          {s.title && <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-faint">{s.title}</p>}
          <ul className="space-y-0.5">
            {s.items.map(({ to, label, icon: Icon, end, badge }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                      isActive ? 'bg-primary-soft text-primary-soft-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" aria-hidden="true" />}
                      <Icon className="size-5 shrink-0" aria-hidden="true" />
                      <span className="flex-1">{label}</span>
                      {badge && unread > 0 && (
                        <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-semibold text-on-danger" aria-label={`${unread} unread`}>
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Brand({ small = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="rounded-xl p-2 text-white shadow-sm" style={{ background: 'var(--brand-grad)' }}>
        <Syringe className={small ? 'size-4' : 'size-5'} aria-hidden="true" />
      </span>
      <span className="text-lg font-semibold tracking-tight text-ink">VaxTrack</span>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  // unread alerts badge (shares its cache with the dashboard)
  const summary = useQuery({
    queryKey: ['dashboard', 'summary', user.role === 'ADMIN' ? 'all' : user.clinicId],
    queryFn: () => api.get('/dashboard/summary'),
    enabled: canManage(user),
    refetchInterval: 60_000,
  });
  const unread = summary.data?.unread_alerts ?? 0;
  const sections = sectionsFor(user);

  const footer = (
    <div className="space-y-3 border-t border-line p-4">
      <ThemeToggle />
      <div className="flex items-center gap-3">
        <Avatar name={user.fullName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{user.fullName}</p>
          <p className="truncate text-xs text-muted">
            {ROLE_LABEL[user.role]}
            {user.clinicName ? ` · ${user.clinicName}` : ''}
          </p>
        </div>
      </div>
      <button type="button" onClick={logout} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink">
        <LogOut className="size-4" aria-hidden="true" />
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[200] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-ink focus:shadow-pop">
        Skip to content
      </a>

      {/* desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 py-5">
          <Brand />
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
          <NavList sections={sections} unread={unread} />
        </nav>
        {footer}
      </aside>

      {/* narrow screens: top bar + collapsible menu */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        <div className="py-2.5">
          <Brand small />
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="-mr-2 flex size-11 items-center justify-center rounded-lg text-ink-2 hover:bg-hover"
        >
          {open ? <X className="size-6" aria-hidden="true" /> : <Menu className="size-6" aria-hidden="true" />}
        </button>
      </header>
      {open && (
        <div id="mobile-menu" className="no-print fixed inset-x-0 top-[61px] z-20 max-h-[calc(100vh-61px)] overflow-y-auto border-b border-line bg-surface shadow-pop lg:hidden">
          <nav aria-label="Main" className="p-3">
            <NavList sections={sections} unread={unread} onNavigate={() => setOpen(false)} />
          </nav>
          {footer}
        </div>
      )}

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
