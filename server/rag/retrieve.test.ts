import { retrieveContext } from './retrieve';
import { createMemoryNovelStore } from './novelStore';
import { createFakeEmbedder } from './embeddingProvider';

describe('retrieveContext', () => {
  it('embeds the query, finds top-k chunks, and joins them into one context string', async () => {
    const { novels, embeddings } = createMemoryNovelStore();
    const embedder = createFakeEmbedder((t) => {
      if (t === 'QUERY') return [1, 0];
      if (t === 'near') return [1, 0];
      if (t === 'far') return [0, 1];
      return [0.5, 0.5];
    });
    const id = await novels.create('N', 't');
    await novels.setChunks(id, [
      { idx: 0, content: 'near', embedding: (await embedder.embed(['near']))[0] },
      { idx: 1, content: 'far', embedding: (await embedder.embed(['far']))[0] },
    ]);

    const ctx = await retrieveContext({ embedder, embeddings }, { query: 'QUERY', novelId: id, k: 1 });
    expect(ctx).toBe('near');
  });

  it('joins multiple chunks with a separator', async () => {
    const { novels, embeddings } = createMemoryNovelStore();
    const embedder = createFakeEmbedder(() => [1, 0]);
    const id = await novels.create('N', 't');
    await novels.setChunks(id, [
      { idx: 0, content: 'one', embedding: [1, 0] },
      { idx: 1, content: 'two', embedding: [1, 0] },
    ]);
    const ctx = await retrieveContext({ embedder, embeddings }, { query: 'q', novelId: id, k: 2 });
    expect(ctx).toContain('one');
    expect(ctx).toContain('two');
    expect(ctx).toContain('---');
  });

  it('returns an empty string when there are no chunks', async () => {
    const { embeddings } = createMemoryNovelStore();
    const ctx = await retrieveContext({ embedder: createFakeEmbedder(), embeddings }, { query: 'q' });
    expect(ctx).toBe('');
  });
});
