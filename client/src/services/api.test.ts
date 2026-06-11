import { gameApi, ApiError, setApiSession, onApiSessionChange } from './api';

describe('gameApi', () => {
  const origFetch = global.fetch;
  afterEach(() => { global.fetch = origFetch; });

  function mockFetch(status: number, body: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
  }

  it('returns parsed JSON on success', async () => {
    mockFetch(200, [{ id: 'rogue' }]);
    const res = await gameApi.listBackgrounds();
    expect(res).toEqual([{ id: 'rogue' }]);
  });

  it('throws ApiError carrying the status on failure', async () => {
    mockFetch(400, { error: 'bad background' });
    await expect(gameApi.newGame('nope')).rejects.toMatchObject({
      status: 400,
      message: 'bad background',
    });
    await expect(gameApi.newGame('nope')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('gameApi shop/use', () => {
  const orig = global.fetch;
  afterEach(() => { global.fetch = orig; });
  function ok(body: unknown) {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }) as unknown as typeof fetch;
  }
  it('getShop GETs the shop', async () => {
    ok({ stock: [{ item: { id: 'dagger' }, price: 5 }] });
    const res = await gameApi.getShop('s1');
    expect(res.stock[0].price).toBe(5);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/sessions/s1/shop'), expect.anything());
  });
  it('buy POSTs the itemId', async () => {
    ok({ save: {}, effectiveStats: {} });
    await gameApi.buy('s1', 'dagger');
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/sessions/s1/buy'), expect.objectContaining({ method: 'POST' }));
  });
  it('useItem POSTs the itemId', async () => {
    ok({ save: {}, effectiveStats: {} });
    await gameApi.useItem('s1', 'healPotion');
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/sessions/s1/use'), expect.objectContaining({ method: 'POST' }));
  });
});

describe('gameApi auth handling', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
    setApiSession(null);
    onApiSessionChange(() => {});
  });

  it('attaches the Bearer token when a session is set', async () => {
    const f = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    global.fetch = f as unknown as typeof fetch;
    setApiSession({ token: 'at-1', refreshToken: 'rt-1' });
    await gameApi.listSaves();
    expect(f).toHaveBeenCalledWith(
      expect.stringContaining('/saves'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer at-1' }) }),
    );
  });

  it('on 401 refreshes once, retries, and reports the new session', async () => {
    const f = jest.fn()
      // 1: original request → 401
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
      // 2: POST /auth/refresh → new tokens
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 'at-2', refreshToken: 'rt-2', user: { id: 'u1', email: 'p@m.co' } }) })
      // 3: retried request → 200
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ id: 's1', routeId: 'r1', updatedAt: 'now' }] });
    global.fetch = f as unknown as typeof fetch;
    const changes: unknown[] = [];
    setApiSession({ token: 'at-1', refreshToken: 'rt-1' });
    onApiSessionChange((s) => changes.push(s));
    const res = await gameApi.listSaves();
    expect(res).toEqual([{ id: 's1', routeId: 'r1', updatedAt: 'now' }]);
    expect(f).toHaveBeenCalledTimes(3);
    expect(f.mock.calls[1][0]).toContain('/auth/refresh');
    expect((f.mock.calls[1][1] as RequestInit).body).toContain('rt-1');
    expect((f.mock.calls[2][1] as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe('Bearer at-2');
    expect(changes).toEqual([{ token: 'at-2', refreshToken: 'rt-2' }]);
  });

  it('when the refresh also fails, clears the session and rethrows the original 401', async () => {
    const f = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Invalid refresh token' }) });
    global.fetch = f as unknown as typeof fetch;
    const changes: unknown[] = [];
    setApiSession({ token: 'at-1', refreshToken: 'rt-1' });
    onApiSessionChange((s) => changes.push(s));
    await expect(gameApi.listSaves()).rejects.toMatchObject({ status: 401 });
    expect(changes).toEqual([null]);
  });

  it('does not attempt refresh when no session is set', async () => {
    const f = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
    global.fetch = f as unknown as typeof fetch;
    await expect(gameApi.listSaves()).rejects.toMatchObject({ status: 401 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('does not refresh on a 401 from /auth endpoints', async () => {
    const f = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Invalid email or password' }) });
    global.fetch = f as unknown as typeof fetch;
    setApiSession({ token: 'at-1', refreshToken: 'rt-1' });
    await expect(gameApi.login('p@m.co', 'wrong1')).rejects.toMatchObject({ status: 401 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('concurrent 401s share a single refresh', async () => {
    const f = jest.fn(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/auth/refresh')) {
        return { ok: true, status: 200, json: async () => ({ token: 'at-2', refreshToken: 'rt-2', user: { id: 'u1', email: 'p@m.co' } }) };
      }
      const auth = (init?.headers as Record<string, string>)?.Authorization ?? '';
      if (auth === 'Bearer at-1') {
        return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) };
      }
      return { ok: true, status: 200, json: async () => [] };
    });
    global.fetch = f as unknown as typeof fetch;
    setApiSession({ token: 'at-1', refreshToken: 'rt-1' });
    const [r1, r2] = await Promise.all([gameApi.listSaves(), gameApi.listSaves()]);
    expect(r1).toEqual([]);
    expect(r2).toEqual([]);
    const refreshCalls = f.mock.calls.filter(([url]) => String(url).includes('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('a 5xx refresh failure keeps the session (no forced logout)', async () => {
    const f = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    global.fetch = f as unknown as typeof fetch;
    const changes: unknown[] = [];
    setApiSession({ token: 'at-1', refreshToken: 'rt-1' });
    onApiSessionChange((s) => changes.push(s));
    await expect(gameApi.listSaves()).rejects.toMatchObject({ status: 401 });
    expect(changes).toEqual([]);
  });

  it('register POSTs credentials and returns the session', async () => {
    const body = { token: 'at', refreshToken: 'rt', user: { id: 'u1', email: 'p@m.co' } };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }) as unknown as typeof fetch;
    const res = await gameApi.register('p@m.co', 'secret1');
    expect(res).toEqual(body);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/register'), expect.objectContaining({ method: 'POST' }));
  });
});
