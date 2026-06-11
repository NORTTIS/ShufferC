import { revealCount } from './typewriter';

describe('revealCount', () => {
  it('grows by charsPerTick and clamps at the text length', () => {
    expect(revealCount(10, 0, 3)).toBe(0);
    expect(revealCount(10, 2, 3)).toBe(6);
    expect(revealCount(10, 4, 3)).toBe(10);
    expect(revealCount(10, 99, 3)).toBe(10);
  });
});
