import { randomUUID } from 'crypto';

export interface NovelSummary { id: string; title: string; chunkCount: number; status: string; }
export interface ChunkInput { idx: number; content: string; embedding: number[]; }

export interface NovelStore {
  create(title: string, rawText: string): Promise<string>;            // returns novelId
  setChunks(novelId: string, chunks: ChunkInput[]): Promise<void>;
  markReady(novelId: string): Promise<void>;
  list(): Promise<NovelSummary[]>;
  get(id: string): Promise<NovelSummary | null>;
  remove(id: string): Promise<void>;
}

export interface EmbeddingHit { content: string; score: number; }
export interface EmbeddingStore {
  search(queryEmbedding: number[], k: number, novelId?: string): Promise<EmbeddingHit[]>;
}

/** Cosine similarity. Returns 0 if either vector is zero-length. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

interface NovelRow { id: string; title: string; rawText: string; chunkCount: number; status: string; }
interface ChunkRow { novelId: string; idx: number; content: string; embedding: number[]; }

/** In-memory NovelStore + EmbeddingStore sharing one chunk list (offline tests/dev). */
export function createMemoryNovelStore(): { novels: NovelStore; embeddings: EmbeddingStore } {
  const novelsMap = new Map<string, NovelRow>();
  let chunks: ChunkRow[] = [];

  const novels: NovelStore = {
    async create(title, rawText) {
      const id = randomUUID();
      novelsMap.set(id, { id, title, rawText, chunkCount: 0, status: 'embedding' });
      return id;
    },
    async setChunks(novelId, input) {
      chunks = chunks.filter((c) => c.novelId !== novelId);
      for (const c of input) chunks.push({ novelId, idx: c.idx, content: c.content, embedding: [...c.embedding] });
      const row = novelsMap.get(novelId);
      if (row) row.chunkCount = input.length;
    },
    async markReady(novelId) {
      const row = novelsMap.get(novelId);
      if (row) row.status = 'ready';
    },
    async list() {
      return [...novelsMap.values()].map((r): NovelSummary => ({ id: r.id, title: r.title, chunkCount: r.chunkCount, status: r.status }));
    },
    async get(id) {
      const r = novelsMap.get(id);
      return r ? { id: r.id, title: r.title, chunkCount: r.chunkCount, status: r.status } : null;
    },
    async remove(id) {
      novelsMap.delete(id);
      chunks = chunks.filter((c) => c.novelId !== id);
    },
  };

  const embeddings: EmbeddingStore = {
    async search(queryEmbedding, k, novelId) {
      const pool = novelId ? chunks.filter((c) => c.novelId === novelId) : chunks;
      return pool
        .map((c): EmbeddingHit => ({ content: c.content, score: cosine(queryEmbedding, c.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
  };

  return { novels, embeddings };
}
