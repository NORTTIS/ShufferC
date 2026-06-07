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
