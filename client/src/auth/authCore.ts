import type { PlayerStore } from '../storage/playerStore';
import {
  gameApi, ApiError, setApiSession, onApiSessionChange,
  type AuthSession, type AuthUser,
} from '../services/api';

export type { AuthUser };
export type AuthResult = { ok: true; user: AuthUser } | { ok: false; error: string };

const SESSION_KEY = 'shufferc_session';
// Pre-server-auth era: accounts (email → plaintext password!) and user lived in localStorage.
const LEGACY_KEYS = ['shufferc_accounts', 'shufferc_player'];

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
export function isValidPassword(pw: string): boolean {
  return typeof pw === 'string' && pw.length >= 6;
}

interface StoredSession { token: string; refreshToken: string; user: AuthUser; }

export function createAuthCore(store: PlayerStore) {
  for (const k of LEGACY_KEYS) store.remove(k);

  let logoutListener: () => void = () => {};

  const read = (): StoredSession | null => {
    const raw = store.get(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as StoredSession; } catch { return null; }
  };
  const persist = (s: StoredSession) => store.set(SESSION_KEY, JSON.stringify(s));

  const adopt = (s: AuthSession): AuthUser => {
    persist({ token: s.token, refreshToken: s.refreshToken, user: s.user });
    setApiSession({ token: s.token, refreshToken: s.refreshToken });
    return s.user;
  };

  // Auto-refresh rotated the tokens → persist them; refresh failed → forced logout.
  onApiSessionChange((apiSession) => {
    if (!apiSession) {
      store.remove(SESSION_KEY);
      logoutListener();
      return;
    }
    const current = read();
    if (current) persist({ ...current, token: apiSession.token, refreshToken: apiSession.refreshToken });
  });

  return {
    /** Restore the persisted session on app boot. Returns the user, or null. */
    restore(): AuthUser | null {
      const s = read();
      if (!s) return null;
      setApiSession({ token: s.token, refreshToken: s.refreshToken });
      return s.user;
    },
    async register(email: string, pw: string, confirm: string): Promise<AuthResult> {
      const e = email.trim().toLowerCase();
      if (!isValidEmail(e)) return { ok: false, error: 'Enter a valid email.' };
      if (!isValidPassword(pw)) return { ok: false, error: 'Password must be at least 6 characters.' };
      if (pw !== confirm) return { ok: false, error: 'Passwords do not match.' };
      try {
        return { ok: true, user: adopt(await gameApi.register(e, pw)) };
      } catch (err) {
        return { ok: false, error: err instanceof ApiError ? err.message : 'Network error' };
      }
    },
    async login(email: string, pw: string): Promise<AuthResult> {
      const e = email.trim().toLowerCase();
      if (!isValidEmail(e)) return { ok: false, error: 'Enter a valid email.' };
      try {
        return { ok: true, user: adopt(await gameApi.login(e, pw)) };
      } catch (err) {
        return { ok: false, error: err instanceof ApiError ? err.message : 'Network error' };
      }
    },
    logout(): void {
      store.remove(SESSION_KEY);
      setApiSession(null);
    },
    /** Invoked when a token refresh fails and the player is force-logged-out. */
    onLogout(cb: () => void): void { logoutListener = cb; },
  };
}

export type AuthCore = ReturnType<typeof createAuthCore>;
