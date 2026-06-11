import { createRemoteJWKSet, jwtVerify } from 'jose';
import { GameError } from '../session';
import { PlayerAuthStore, AuthSession, AuthUser } from './PlayerAuthStore';

export interface SupabaseAuthConfig {
  url: string;                 // e.g. https://xyz.supabase.co
  anonKey: string;
  jwtSecret?: string | null;   // legacy HS256 projects; null/absent → remote JWKS
}

interface GoTrueSession {
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string };
}

/**
 * Real adapter: register/login/refresh proxy Supabase GoTrue REST; verifyToken
 * checks the JWT locally (no network per request — JWKS is fetched once and
 * cached by jose).
 */
export function createSupabasePlayerAuth(
  cfg: SupabaseAuthConfig,
  fetchFn: typeof fetch = fetch,
): PlayerAuthStore {
  const base = cfg.url.replace(/\/$/, '');
  const hsKey = cfg.jwtSecret ? new TextEncoder().encode(cfg.jwtSecret) : null;
  const jwks = hsKey ? null : createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));

  async function goTrue(path: string, body: unknown): Promise<GoTrueSession> {
    const res = await fetchFn(`${base}/auth/v1${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw mapGoTrueError(res.status, data);
    if (!data.access_token) {
      throw new GameError(
        'Supabase returned no session — email confirmation is still enabled; disable "Confirm email" in the dashboard',
        409,
      );
    }
    return data as unknown as GoTrueSession;
  }

  const toSession = (s: GoTrueSession): AuthSession => ({
    token: s.access_token,
    refreshToken: s.refresh_token,
    user: { id: s.user.id, email: s.user.email },
  });

  return {
    register: (email, password) => goTrue('/signup', { email, password }).then(toSession),
    login: (email, password) => goTrue('/token?grant_type=password', { email, password }).then(toSession),
    refresh: (refreshToken) =>
      goTrue('/token?grant_type=refresh_token', { refresh_token: refreshToken }).then(toSession),
    async verifyToken(accessToken): Promise<AuthUser> {
      try {
        const { payload } = hsKey
          ? await jwtVerify(accessToken, hsKey, { audience: 'authenticated' })
          : await jwtVerify(accessToken, jwks!, { audience: 'authenticated' });
        if (!payload.sub) throw new Error('missing sub claim');
        return { id: payload.sub, email: (payload.email as string | undefined) ?? '' };
      } catch {
        throw new GameError('Unauthorized', 401);
      }
    },
  };
}

function mapGoTrueError(status: number, data: Record<string, unknown>): GameError {
  const code = typeof data.error_code === 'string' ? data.error_code : '';
  const msg =
    (typeof data.msg === 'string' && data.msg) ||
    (typeof data.error_description === 'string' && data.error_description) ||
    (typeof data.message === 'string' && data.message) ||
    'Auth provider error';
  if (code === 'user_already_exists' || /already registered/i.test(msg)) {
    return new GameError('Email already registered', 409);
  }
  if (/invalid login credentials/i.test(msg) || code === 'invalid_credentials') {
    return new GameError('Invalid email or password', 401);
  }
  if (/refresh token/i.test(msg) || code.startsWith('refresh_token')) {
    return new GameError('Invalid refresh token', 401);
  }
  if (status === 400 || status === 401 || status === 422) return new GameError(msg, status === 422 ? 400 : status);
  return new GameError(msg, 502);
}
