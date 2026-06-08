import { chunkText, ChunkOptions, DEFAULT_CHUNK } from './chunk';
import { EmbeddingProvider } from './embeddingProvider';
import { NovelStore } from './novelStore';

export interface IngestDeps { novels: NovelStore; embedder: EmbeddingProvider; chunk?: ChunkOptions; }

/** Chunk → embed → store → mark ready. Admin-in-loop: failures propagate (no silent fallback). */
export async function ingestNovel(
  deps: IngestDeps,
  input: { title: string; text: string },
): Promise<{ novelId: string; chunkCount: number }> {
  const parts = chunkText(input.text, deps.chunk ?? DEFAULT_CHUNK);
  const novelId = await deps.novels.create(input.title, input.text);
  const vectors = parts.length ? await deps.embedder.embed(parts) : [];
  await deps.novels.setChunks(
    novelId,
    parts.map((content, idx) => ({ idx, content, embedding: vectors[idx] })),
  );
  await deps.novels.markReady(novelId);
  return { novelId, chunkCount: parts.length };
}
