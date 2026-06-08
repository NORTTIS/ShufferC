/**
 * Safety seam (spec decision #6). Default near-no-op with a tiny banned-word list.
 * A later slice plugs Gemini safety settings in behind this same signature.
 */
const BANNED_TERMS = ['gore'];

export function moderate(text: string): { ok: true } | { ok: false; reason: string } {
  const lower = text.toLowerCase();
  for (const term of BANNED_TERMS) {
    if (lower.includes(term)) return { ok: false, reason: `banned term: ${term}` };
  }
  return { ok: true };
}
