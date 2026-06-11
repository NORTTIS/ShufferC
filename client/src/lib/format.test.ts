import { formatStats } from './format';

describe('formatStats', () => {
  const stats = { str: 9, dex: 8, int: 7, wis: 5, cha: 6, con: 6 };
  it('formats core stats in STAT_KEYS order', () => {
    expect(formatStats(stats)).toBe('STR 9 · DEX 8 · INT 7 · CON 6');
  });
  it('formats all stats when full', () => {
    expect(formatStats(stats, true)).toBe('STR 9 · DEX 8 · INT 7 · WIS 5 · CHA 6 · CON 6');
  });
  it('treats missing keys as 0', () => {
    expect(formatStats({ str: 3 })).toBe('STR 3 · DEX 0 · INT 0 · CON 0');
  });
});
