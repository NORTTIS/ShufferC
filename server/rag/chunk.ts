export interface ChunkOptions { size: number; overlap: number; }

/** Default chunk window: ~1200 chars with 200 overlap. Tunable; balance tuning is sub-project E. */
export const DEFAULT_CHUNK: ChunkOptions = { size: 1200, overlap: 200 };

/**
 * Split text into fixed-size overlapping windows. Pure + deterministic.
 * Char-window (not word-aware) — boundary refinement is deferred (YAGNI).
 */
export function chunkText(text: string, opts: ChunkOptions = DEFAULT_CHUNK): string[] {
  const { size, overlap } = opts;
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const step = Math.max(1, size - overlap);
  const chunks: string[] = [];
  for (let start = 0; start < clean.length; start += step) {
    chunks.push(clean.slice(start, start + size));
    if (start + size >= clean.length) break;
  }
  return chunks;
}
