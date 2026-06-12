import { randomUUID } from 'crypto';
import { GameError } from '../session';
import { PlayerAuthStore, AuthSession } from './PlayerAuthStore';

interface UserRec { id: string; email: string; password: string; }

/** In-memory fake for tests and for running without Supabase env vars. */
export function createMemoryPlayerAuth(): PlayerAuthStore {
  const users = new Map<string, UserRec>();        // email → user
  const access = new Map<string, string>();        // access token → userId
  const refreshTokens = new Map<string, string>(); // refresh token → userId

  function issue(user: UserRec): AuthSession {
    const token = randomUUID();
    const refreshToken = randomUUID();
    access.set(token, user.id);
    refreshTokens.set(refreshToken, user.id);
    return { token, refreshToken, user: { id: user.id, email: user.email } };
  }

  function byId(id: string): UserRec | undefined {
    for (const u of users.values()) if (u.id === id) return u;
    return undefined;
  }

  return {
    async register(email, password) {
      const e = email.trim().toLowerCase();
      if (users.has(e)) throw new GameError('Email already registered', 409);
      const user: UserRec = { id: randomUUID(), email: e, password };
      users.set(e, user);
      return issue(user);
    },
    async login(email, password) {
      const user = users.get(email.trim().toLowerCase());
      if (!user || user.password !== password) {
        throw new GameError('Invalid email or password', 401);
      }
      return issue(user);
    },
    async refresh(refreshToken) {
      const userId = refreshTokens.get(refreshToken);
      if (!userId) throw new GameError('Invalid refresh token', 401);
      refreshTokens.delete(refreshToken); // rotate
      return issue(byId(userId)!);
    },
    async verifyToken(accessToken) {
      const userId = access.get(accessToken);
      const user = userId ? byId(userId) : undefined;
      if (!user) throw new GameError('Unauthorized', 401);
      return { id: user.id, email: user.email };
    },
  };
}
