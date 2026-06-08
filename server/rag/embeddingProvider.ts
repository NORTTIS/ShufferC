import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiConfig } from '../ai/gemini';

/** Target embedding dimensionality. 1536 keeps gemini-embedding-001 within pgvector's HNSW index cap (2000). */
export const EMBED_DIM = 1536;

/** Thin embedding boundary, mirrors AIProvider. `available:false` when no API key. */
export interface EmbeddingProvider {
  readonly available: boolean;
  embed(texts: string[]): Promise<number[][]>;   // one vector per input, order-aligned
}

/** Deterministic 8-dim fake for offline tests (dimension-agnostic; the memory store computes cosine on whatever it's given). */
function defaultEmbed(text: string): number[] {
  const v = new Array(8).fill(0);
  for (const ch of text.toLowerCase()) v[ch.charCodeAt(0) % 8] += 1;
  return v;
}

export function createFakeEmbedder(fn: (text: string) => number[] = defaultEmbed): EmbeddingProvider {
  return {
    available: true,
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map(fn);
    },
  };
}

/**
 * Real Gemini embedder. Batches embedContent at outputDimensionality EMBED_DIM.
 * `available:false` with no key → never touches the network. Smoke-tested manually, never in Jest.
 */
export function createGeminiEmbedder(cfg: GeminiConfig): EmbeddingProvider {
  const available = !!cfg.apiKey;
  const client = available ? new GoogleGenerativeAI(cfg.apiKey as string) : null;

  return {
    available,
    async embed(texts: string[]): Promise<number[][]> {
      if (!client) throw new Error('Embedding provider unavailable: no API key');
      if (texts.length === 0) return [];
      const model = client.getGenerativeModel({ model: cfg.embedModel });
      const res = await model.batchEmbedContents({
        requests: texts.map((t) => ({
          content: { role: 'user', parts: [{ text: t }] },
          outputDimensionality: EMBED_DIM,
        })),
      });
      return res.embeddings.map((e) => e.values as number[]);
    },
  };
}
