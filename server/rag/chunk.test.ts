import { chunkText, DEFAULT_CHUNK } from './chunk';

describe('chunkText', () => {
  it('returns an empty array for empty/whitespace text', () => {
    expect(chunkText('', DEFAULT_CHUNK)).toEqual([]);
    expect(chunkText('   \n  ', DEFAULT_CHUNK)).toEqual([]);
  });

  it('returns a single chunk when text is shorter than size', () => {
    expect(chunkText('hello world', { size: 100, overlap: 10 })).toEqual(['hello world']);
  });

  it('splits long text into overlapping windows that cover the whole text', () => {
    const text = 'abcdefghij'.repeat(5); // length 50
    const chunks = chunkText(text, { size: 20, overlap: 5 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(20);
    expect(text.endsWith(chunks[chunks.length - 1])).toBe(true);
    expect(chunks[1].startsWith(text.slice(15, 20))).toBe(true);
  });

  it('trims surrounding whitespace before chunking', () => {
    expect(chunkText('  hi  ', { size: 100, overlap: 0 })).toEqual(['hi']);
  });
});
