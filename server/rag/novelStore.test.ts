import { createMemoryNovelStore } from './novelStore';

describe('createMemoryNovelStore', () => {
  it('creates a novel, stores chunks, marks ready, and lists summaries', async () => {
    const { novels } = createMemoryNovelStore();
    const id = await novels.create('Moby Dick', 'call me ishmael');
    let summary = await novels.get(id);
    expect(summary).toMatchObject({ title: 'Moby Dick', status: 'embedding', chunkCount: 0 });

    await novels.setChunks(id, [
      { idx: 0, content: 'call me', embedding: [1, 0] },
      { idx: 1, content: 'ishmael', embedding: [0, 1] },
    ]);
    await novels.markReady(id);

    summary = await novels.get(id);
    expect(summary).toMatchObject({ status: 'ready', chunkCount: 2 });
    expect((await novels.list()).map((n) => n.id)).toContain(id);
  });

  it('search returns chunk contents ordered by cosine similarity, top-k', async () => {
    const { novels, embeddings } = createMemoryNovelStore();
    const id = await novels.create('N', 'x');
    await novels.setChunks(id, [
      { idx: 0, content: 'near',  embedding: [1, 0] },
      { idx: 1, content: 'far',   embedding: [0, 1] },
      { idx: 2, content: 'near2', embedding: [0.9, 0.1] },
    ]);
    const hits = await embeddings.search([1, 0], 2);
    expect(hits.map((h) => h.content)).toEqual(['near', 'near2']);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it('search can scope to a single novel', async () => {
    const { novels, embeddings } = createMemoryNovelStore();
    const a = await novels.create('A', 't');
    const b = await novels.create('B', 't');
    await novels.setChunks(a, [{ idx: 0, content: 'a-chunk', embedding: [1, 0] }]);
    await novels.setChunks(b, [{ idx: 0, content: 'b-chunk', embedding: [1, 0] }]);
    const hits = await embeddings.search([1, 0], 5, b);
    expect(hits.map((h) => h.content)).toEqual(['b-chunk']);
  });

  it('remove deletes the novel and its chunks', async () => {
    const { novels, embeddings } = createMemoryNovelStore();
    const id = await novels.create('N', 't');
    await novels.setChunks(id, [{ idx: 0, content: 'gone', embedding: [1, 0] }]);
    await novels.remove(id);
    expect(await novels.get(id)).toBeNull();
    expect(await embeddings.search([1, 0], 5)).toEqual([]);
  });
});
