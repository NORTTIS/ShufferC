import { randomUUID } from 'crypto';

export interface AdminCredentials { email: string; password: string; }

export interface Auth {
  /** Returns a fresh bearer token on success, or null on bad credentials. */
  login(email: string, password: string): string | null;
  /** True iff the token was issued by this Auth instance. */
  verify(token: string): boolean;
}

/**
 * Minimal single-admin auth. Credentials come from config (env-backed). Issued
 * tokens are held in an in-memory Set (no expiry, resets on restart). Local/
 * academic only — real auth (Supabase, hashing, expiry) is sub-project D.
 */
export function createAuth(creds: AdminCredentials): Auth {
  const tokens = new Set<string>();
  return {
    login(email: string, password: string): string | null {
      if (email !== creds.email || password !== creds.password) return null;
      const token = randomUUID();
      tokens.add(token);
      return token;
    },
    verify(token: string): boolean {
      return tokens.has(token);
    },
  };
}
