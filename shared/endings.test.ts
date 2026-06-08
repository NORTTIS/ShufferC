import { parseEndingCondition } from './endings';

describe('parseEndingCondition', () => {
  it('parses the bare unquoted form', () => {
    expect(parseEndingCondition('currentNodeId === n3')).toBe('n3');
  });

  it('parses a single-quoted node id (AI generators tend to quote it)', () => {
    expect(parseEndingCondition("currentNodeId === 'n7'")).toBe('n7');
  });

  it('parses a double-quoted node id', () => {
    expect(parseEndingCondition('currentNodeId === "n8"')).toBe('n8');
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseEndingCondition('  currentNodeId === n3  ')).toBe('n3');
  });

  it('returns null for mismatched quotes', () => {
    expect(parseEndingCondition("currentNodeId === 'n3\"")).toBeNull();
  });

  it('returns null for an unsupported condition', () => {
    expect(parseEndingCondition('player.wins')).toBeNull();
  });

  it('returns null for a different operator', () => {
    expect(parseEndingCondition('currentNodeId == n3')).toBeNull();
  });
});
