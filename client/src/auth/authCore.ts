import type { PlayerStore } from '../storage/playerStore';

export interface AuthUser { email: string; }
export type AuthResult = { ok: true; user: AuthUser } | { ok: false; error: string };

const ACCOUNTS_KEY = 'shufferc_accounts';
const SESSION_KEY = 'shufferc_player';

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
export function isValidPassword(pw: string): boolean {
  return typeof pw === 'string' && pw.length >= 6;
}

type Accounts = Record<string, string>;

export function createAuthCore(store: PlayerStore) {
  const readAccounts = (): Accounts => {
    const raw = store.get(ACCOUNTS_KEY);
    if (!raw) return {};
    try { return JSON.parse(raw) as Accounts; } catch { return {}; }
  };
  const writeAccounts = (a: Accounts) => store.set(ACCOUNTS_KEY, JSON.stringify(a));
  const setSession = (user: AuthUser) => store.set(SESSION_KEY, JSON.stringify(user));

  return {
    current(): AuthUser | null {
      const raw = store.get(SESSION_KEY);
      if (!raw) return null;
      try { return JSON.parse(raw) as AuthUser; } catch { return null; }
    },
    register(email: string, pw: string, confirm: string): AuthResult {
      const e = email.trim().toLowerCase();
      if (!isValidEmail(e)) return { ok: false, error: 'Enter a valid email.' };
      if (!isValidPassword(pw)) return { ok: false, error: 'Password must be at least 6 characters.' };
      if (pw !== confirm) return { ok: false, error: 'Passwords do not match.' };
      const accounts = readAccounts();
      if (accounts[e] != null) return { ok: false, error: 'That email is already registered.' };
      accounts[e] = pw;
      writeAccounts(accounts);
      const user: AuthUser = { email: e };
      setSession(user);
      return { ok: true, user };
    },
    login(email: string, pw: string): AuthResult {
      const e = email.trim().toLowerCase();
      if (!isValidEmail(e)) return { ok: false, error: 'Enter a valid email.' };
      const accounts = readAccounts();
      if (accounts[e] == null || accounts[e] !== pw) {
        return { ok: false, error: 'Invalid email or password.' };
      }
      const user: AuthUser = { email: e };
      setSession(user);
      return { ok: true, user };
    },
    logout(): void { store.remove(SESSION_KEY); },
  };
}

export type AuthCore = ReturnType<typeof createAuthCore>;
