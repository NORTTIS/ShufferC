import { ingestNovel } from './ingest';
import { createMemoryNovelStore } from './novelStore';
import { createFakeEmbedder } from './embeddingProvider';

describe('ingestNovel', () => {
  it('chunks, embeds, stores, and marks the novel ready', async () => {
    const { novels, embeddings } = createMemoryNovelStore();
    const embedder = createFakeEmbedder();
    const text = 'abcdefghij'.repeat(10); // length 100

    const res = await ingestNovel({ novels, embedder, chunk: { size: 40, overlap: 10 } }, { title: 'T', text });

    expect(res.chunkCount).toBeGreaterThan(1);
    const summary = await novels.get(res.novelId);
    expect(summary).toMatchObject({ status: 'ready', chunkCount: res.chunkCount });
    const hits = await embeddings.search((await embedder.embed([text.slice(0, 40)]))[0], 1, res.novelId);
    expect(hits.length).toBe(1);
  });

  it('handles empty text as zero chunks but still creates a ready novel', async () => {
    const { novels } = createMemoryNovelStore();
    const res = await ingestNovel({ novels, embedder: createFakeEmbedder() }, { title: 'Empty', text: '' });
    expect(res.chunkCount).toBe(0);
    expect((await novels.get(res.novelId))?.status).toBe('ready');
  });
});
