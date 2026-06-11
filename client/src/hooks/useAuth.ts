import { useCallback, useEffect, useState } from 'react';
import { createPlayerStore } from '../storage/playerStore';
import { createAuthCore, type AuthUser, type AuthResult } from '../auth/authCore';

const core = createAuthCore(createPlayerStore());

export type AuthStatus = 'loading' | 'out' | 'in';
export interface AuthState { user: AuthUser | null; status: AuthStatus; }

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, status: 'loading' });

  useEffect(() => {
    core.onLogout(() => setState({ user: null, status: 'out' })); // refresh failed → back to login
    const user = core.restore();
    setState({ user, status: user ? 'in' : 'out' });
    return () => core.onLogout(() => {});
  }, []);

  const register = useCallback(async (email: string, pw: string, confirm: string): Promise<AuthResult> => {
    const res = await core.register(email, pw, confirm);
    if (res.ok) setState({ user: res.user, status: 'in' });
    return res;
  }, []);

  const login = useCallback(async (email: string, pw: string): Promise<AuthResult> => {
    const res = await core.login(email, pw);
    if (res.ok) setState({ user: res.user, status: 'in' });
    return res;
  }, []);

  const logout = useCallback(() => {
    core.logout();
    setState({ user: null, status: 'out' });
  }, []);

  return { ...state, register, login, logout };
}
