import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, tokenStore, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

const toUser = (me) => ({
  id: me.id,
  username: me.username,
  role: me.role,
  fullName: me.full_name,
  clinicId: me.clinic_id,
  clinicName: me.clinic_name,
  guardianId: me.guardian_id,
});

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));
  const [sessionExpired, setSessionExpired] = useState(false);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  // any 401 from the API (expired token) signs the user out
  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      setSessionExpired(true);
    });
  }, [logout]);

  // restore a session on page load
  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .get('/me')
      .then((me) => setUser(toUser(me)))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const { token } = await api.post('/auth/login', { username, password });
    tokenStore.set(token);
    const me = await api.get('/me');
    setSessionExpired(false);
    setUser(toUser(me));
    return toUser(me);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, sessionExpired }),
    [user, loading, login, logout, sessionExpired],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}

// oxlint-disable-next-line react/only-export-components
export const canManage = (user) => user?.role === 'ADMIN' || user?.role === 'NURSE';
