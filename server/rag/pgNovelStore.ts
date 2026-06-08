import { eq, cosineDistance, sql, desc } from 'drizzle-orm';
import { Db } from '../db/client';
import { novels as novelsTable, novelChunks } from '../db/schema';
import { NovelStore, EmbeddingStore, NovelSummary, EmbeddingHit, ChunkInput } from './novelStore';

export function createPgNovelStore(db: Db): { novels: NovelStore; embeddings: EmbeddingStore } {
  const novels: NovelStore = {
    async create(title: string, rawText: string): Promise<string> {
      const rows = await db.insert(novelsTable).values({ title, rawText }).returning({ id: novelsTable.id });
      return rows[0].id;
    },
    async setChunks(novelId: string, chunks: ChunkInput[]): Promise<void> {
      await db.delete(novelChunks).where(eq(novelChunks.novelId, novelId));
      if (chunks.length) {
        await db.insert(novelChunks).values(
          chunks.map((c) => ({ novelId, idx: c.idx, content: c.content, embedding: c.embedding })),
        );
      }
      await db.update(novelsTable).set({ chunkCount: chunks.length }).where(eq(novelsTable.id, novelId));
    },
    async markReady(novelId: string): Promise<void> {
      await db.update(novelsTable).set({ status: 'ready' }).where(eq(novelsTable.id, novelId));
    },
    async list(): Promise<NovelSummary[]> {
      return db.select({
        id: novelsTable.id, title: novelsTable.title, chunkCount: novelsTable.chunkCount, status: novelsTable.status,
      }).from(novelsTable);
    },
    async get(id: string): Promise<NovelSummary | null> {
      const rows = await db.select({
        id: novelsTable.id, title: novelsTable.title, chunkCount: novelsTable.chunkCount, status: novelsTable.status,
      }).from(novelsTable).where(eq(novelsTable.id, id));
      return rows[0] ?? null;
    },
    async remove(id: string): Promise<void> {
      await db.delete(novelsTable).where(eq(novelsTable.id, id));   // cascade deletes chunks
    },
  };

  const embeddings: EmbeddingStore = {
    async search(queryEmbedding: number[], k: number, novelId?: string): Promise<EmbeddingHit[]> {
      const similarity = sql<number>`1 - (${cosineDistance(novelChunks.embedding, queryEmbedding)})`;
      const base = db.select({ content: novelChunks.content, score: similarity }).from(novelChunks);
      const rows = novelId
        ? await base.where(eq(novelChunks.novelId, novelId)).orderBy(desc(similarity)).limit(k)
        : await base.orderBy(desc(similarity)).limit(k);
      return rows.map((r): EmbeddingHit => ({ content: r.content, score: Number(r.score) }));
    },
  };

  return { novels, embeddings };
}
