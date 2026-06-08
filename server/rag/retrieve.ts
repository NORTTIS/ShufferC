import { EmbeddingProvider } from './embeddingProvider';
import { EmbeddingStore } from './novelStore';

export interface RetrieveDeps { embedder: EmbeddingProvider; embeddings: EmbeddingStore; }

const SEPARATOR = '\n\n---\n\n';

/** Embed the query, fetch top-k nearest chunks, and concatenate their contents for the gen prompt. */
export async function retrieveContext(
  deps: RetrieveDeps,
  input: { query: string; novelId?: string; k?: number },
): Promise<string> {
  const k = input.k ?? 5;
  const [queryVec] = await deps.embedder.embed([input.query]);
  const hits = await deps.embeddings.search(queryVec, k, input.novelId);
  return hits.map((h) => h.content).join(SEPARATOR);
}
