import { moderate } from './moderate';

describe('moderate', () => {
  it('passes clean text', () => {
    expect(moderate('A calm meadow at dawn.')).toEqual({ ok: true });
  });

  it('blocks text containing a banned term and reports the reason', () => {
    const res = moderate('The scene is full of gore and viscera.');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/gore/);
  });
});
