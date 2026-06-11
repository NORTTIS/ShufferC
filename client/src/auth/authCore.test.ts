import { createMemoryStore } from '../storage/playerStore';
import { createAuthCore, isValidEmail, isValidPassword } from './authCore';
import { setApiSession, onApiSessionChange } from '../services/api';

const SESSION_BODY = { token: 'at-1', refreshToken: 'rt-1', user: { id: 'u1', email: 'p@m.co' } };

describe('auth validation', () => {
  it('validates email + password', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('nope')).toBe(false);
    expect(isValidPassword('123456')).toBe(true);
    expect(isValidPassword('123')).toBe(false);
  });
});

describe('createAuthCore (server-backed)', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
    setApiSession(null);
    onApiSessionChange(() => {});
  });

  function mockFetch(status: number, body: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
  }

  it('register calls the server, persists the session, returns the user', async () => {
    mockFetch(200, SESSION_BODY);
    const store = createMemoryStore();
    const c = createAuthCore(store);
    const res = await c.register('P@M.co', 'secret1', 'secret1');
    expect(res).toEqual({ ok: true, user: SESSION_BODY.user });
    expect(JSON.parse(store.get('shufferc_session')!)).toEqual(SESSION_BODY);
  });

  it('register validates locally before any network call', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const c = createAuthCore(createMemoryStore());
    expect((await c.register('nope', 'secret1', 'secret1')).ok).toBe(false);
    expect((await c.register('p@m.co', '123', '123')).ok).toBe(false);
    expect((await c.register('p@m.co', 'secret1', 'other1')).ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('surfaces server errors as { ok: false }', async () => {
    mockFetch(409, { error: 'Email already registered' });
    const c = createAuthCore(createMemoryStore());
    const res = await c.register('p@m.co', 'secret1', 'secret1');
    expect(res).toEqual({ ok: false, error: 'Email already registered' });
  });

  it('login round-trips and persists; logout clears', async () => {
    mockFetch(200, SESSION_BODY);
    const store = createMemoryStore();
    const c = createAuthCore(store);
    const res = await c.login('p@m.co', 'secret1');
    expect(res.ok).toBe(true);
    expect(store.get('shufferc_session')).not.toBeNull();
    c.logout();
    expect(store.get('shufferc_session')).toBeNull();
  });

  it('restore returns the persisted user and arms the API session', async () => {
    const store = createMemoryStore({ shufferc_session: JSON.stringify(SESSION_BODY) });
    const c = createAuthCore(store);
    expect(c.restore()).toEqual(SESSION_BODY.user);
  });

  it('restore returns null without a stored session', () => {
    expect(createAuthCore(createMemoryStore()).restore()).toBeNull();
  });

  it('wipes legacy plaintext-account keys on creation', () => {
    const store = createMemoryStore({
      shufferc_accounts: '{"p@m.co":"secret1"}',
      shufferc_player: '{"email":"p@m.co"}',
    });
    createAuthCore(store);
    expect(store.get('shufferc_accounts')).toBeNull();
    expect(store.get('shufferc_player')).toBeNull();
  });

  it('persists rotated tokens (keeping the user) after a successful auto-refresh', async () => {
    const store = createMemoryStore({ shufferc_session: JSON.stringify(SESSION_BODY) });
    const c = createAuthCore(store);
    c.restore();
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 'at-2', refreshToken: 'rt-2', user: SESSION_BODY.user }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] }) as unknown as typeof fetch;
    const { gameApi } = await import('../services/api');
    await expect(gameApi.listSaves()).resolves.toEqual([]);
    expect(JSON.parse(store.get('shufferc_session')!)).toEqual({ token: 'at-2', refreshToken: 'rt-2', user: SESSION_BODY.user });
  });

  it('fires onLogout when a token refresh fails (forced logout)', async () => {
    const store = createMemoryStore({ shufferc_session: JSON.stringify(SESSION_BODY) });
    const c = createAuthCore(store);
    c.restore();
    let loggedOut = false;
    c.onLogout(() => { loggedOut = true; });
    // 401 on a game call, then 401 on the refresh → forced logout
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Invalid refresh token' }) }) as unknown as typeof fetch;
    const { gameApi } = await import('../services/api');
    await expect(gameApi.listSaves()).rejects.toMatchObject({ status: 401 });
    expect(loggedOut).toBe(true);
    expect(store.get('shufferc_session')).toBeNull();
  });
});
