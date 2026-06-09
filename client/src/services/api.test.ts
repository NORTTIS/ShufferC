import { gameApi, ApiError } from './api';

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
