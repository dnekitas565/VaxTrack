import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { PageSkeleton, linkButtonClass } from './components/ui.jsx';
import { usePageTitle } from './lib/usePageTitle.js';
import Login from './pages/Login.jsx';
import Newborns from './pages/Newborns.jsx';
import BabyProfile from './pages/BabyProfile.jsx';

// heavier or rarely used pages load on demand
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const RegisterNewborn = lazy(() => import('./pages/RegisterNewborn.jsx'));
const Inventory = lazy(() => import('./pages/Inventory.jsx'));
const Alerts = lazy(() => import('./pages/Alerts.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const VaccinationCard = lazy(() => import('./pages/VaccinationCard.jsx'));
const AuditLog = lazy(() => import('./pages/AuditLog.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));

const homeFor = (user) => (user.role === 'PARENT' ? '/newborns' : '/');

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-8"><PageSkeleton /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}

const STAFF = ['ADMIN', 'NURSE'];

export default function App() {
  return (
    <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route index element={<Protected roles={STAFF}><Dashboard /></Protected>} />
          <Route path="register" element={<Protected roles={STAFF}><RegisterNewborn /></Protected>} />
          <Route path="newborns" element={<Newborns />} />
          <Route path="newborns/:id" element={<BabyProfile />} />
          <Route path="newborns/:id/card" element={<VaccinationCard />} />
          <Route path="inventory" element={<Protected roles={STAFF}><Inventory /></Protected>} />
          <Route path="alerts" element={<Protected roles={STAFF}><Alerts /></Protected>} />
          <Route path="reports" element={<Protected roles={STAFF}><Reports /></Protected>} />
          <Route path="audit" element={<Protected roles={['ADMIN']}><AuditLog /></Protected>} />
          <Route path="users" element={<Protected roles={['ADMIN']}><Users /></Protected>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function NotFound() {
  usePageTitle('Page not found');
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-5xl font-semibold text-primary-ink">404</p>
      <h1 className="mt-3 text-2xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 text-sm text-muted">The page you opened does not exist or has moved.</p>
      <Link to={homeFor(user)} className={`${linkButtonClass('primary')} mt-6`}>
        Go to the start page
      </Link>
    </div>
  );
}
