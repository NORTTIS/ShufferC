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
