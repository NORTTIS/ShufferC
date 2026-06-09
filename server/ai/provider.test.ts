import { createFakeProvider } from './provider';

describe('createFakeProvider', () => {
  it('is available and returns scripted responses in order', async () => {
    const p = createFakeProvider([{ a: 1 }, { b: 2 }]);
    expect(p.available).toBe(true);
    expect(await p.generateStructured('ignored', {})).toEqual({ a: 1 });
    expect(await p.generateStructured('ignored', {})).toEqual({ b: 2 });
  });

  it('throws when the queue is exhausted (loud test-script failure)', async () => {
    const p = createFakeProvider([]);
    await expect(p.generateStructured('x', {})).rejects.toThrow(/exhausted/i);
  });
});

describe('AIProvider options', () => {
  it('FakeProvider accepts and ignores a model option, still returning the queued response', async () => {
    const p = createFakeProvider([{ ok: 1 }]);
    const out = await p.generateStructured('prompt', {}, { model: 'flash' });
    expect(out).toEqual({ ok: 1 });
  });
});
