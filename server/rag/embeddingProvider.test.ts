import { createFakeEmbedder } from './embeddingProvider';

describe('createFakeEmbedder', () => {
  it('is available and returns one vector per input, deterministically', async () => {
    const e = createFakeEmbedder();
    expect(e.available).toBe(true);
    const a = await e.embed(['hello', 'world']);
    const b = await e.embed(['hello', 'world']);
    expect(a.length).toBe(2);
    expect(a).toEqual(b);
    expect(a[0]).not.toEqual(a[1]);
  });

  it('uses a custom mapping function when provided', async () => {
    const e = createFakeEmbedder((t) => (t === 'x' ? [1, 0] : [0, 1]));
    expect(await e.embed(['x', 'y'])).toEqual([[1, 0], [0, 1]]);
  });
});
