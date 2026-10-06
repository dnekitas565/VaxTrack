import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Baby, Bell, LayoutDashboard, LogOut, Menu, Package, ScrollText, Syringe, UserPlus, X } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, canManage } from '../auth.jsx';
import { ROLE_LABEL } from '../lib/format.js';

function navFor(user) {
  if (user.role === 'PARENT') return [{ to: '/newborns', label: 'My children', icon: Baby }];
  const items = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/register', label: 'Register newborn', icon: UserPlus },
    { to: '/newborns', label: 'Newborns', icon: Baby },
    { to: '/inventory', label: 'Inventory', icon: Package },
    { to: '/alerts', label: 'Alerts', icon: Bell, badge: true },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
  ];
  if (user.role === 'ADMIN') items.push({ to: '/audit', label: 'Audit log', icon: ScrollText });
  return items;
}

function NavList({ items, unread, onNavigate }) {
  return (
    <ul className="space-y-1">
      {items.map(({ to, label, icon: Icon, end, badge }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                isActive ? 'bg-primary-700 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`
            }
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {badge && unread > 0 && (
              <span className="rounded-full bg-red-700 px-2 py-0.5 text-xs font-semibold text-white" aria-label={`${unread} unread`}>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
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
  const items = navFor(user);

  const identity = (
    <div className="border-t border-slate-200 p-4">
      <p className="truncate text-sm font-medium text-slate-900">{user.fullName}</p>
      <p className="truncate text-xs text-slate-600">
        {ROLE_LABEL[user.role]}
        {user.clinicName ? ` · ${user.clinicName}` : ''}
      </p>
      <button
        type="button"
        onClick={logout}
        className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        <LogOut className="size-4" aria-hidden="true" />
        Sign out
      </button>
    </div>
  );

  const brand = (
    <div className="flex items-center gap-2 px-4 py-5">
      <span className="rounded-lg bg-primary-700 p-1.5 text-white">
        <Syringe className="size-5" aria-hidden="true" />
      </span>
      <span className="text-lg font-semibold tracking-tight">VaxTrack</span>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg">
        Skip to content
      </a>

      {/* desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        {brand}
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3">
          <NavList items={items} unread={unread} />
        </nav>
        {identity}
      </aside>

      {/* narrow screens: top bar + collapsible menu */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <div className="flex items-center gap-2 py-2">
          <span className="rounded-lg bg-primary-700 p-1.5 text-white">
            <Syringe className="size-4" aria-hidden="true" />
          </span>
          <span className="font-semibold">VaxTrack</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="-mr-2 flex size-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
        >
          {open ? <X className="size-6" aria-hidden="true" /> : <Menu className="size-6" aria-hidden="true" />}
        </button>
      </header>
      {open && (
        <div id="mobile-menu" className="no-print fixed inset-x-0 top-[57px] z-20 max-h-[calc(100vh-57px)] overflow-y-auto border-b border-slate-200 bg-white shadow-lg lg:hidden">
          <nav aria-label="Main" className="p-3">
            <NavList items={items} unread={unread} onNavigate={() => setOpen(false)} />
          </nav>
          {identity}
        </div>
      )}

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
