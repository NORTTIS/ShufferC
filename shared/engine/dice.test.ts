import { mulberry32, rollD20, faceToMultiplier } from './dice';

describe('faceToMultiplier', () => {
  it('maps face 1 to 0.10 and face 20 to 2.00', () => {
    expect(faceToMultiplier(1)).toBeCloseTo(0.1, 5);
    expect(faceToMultiplier(20)).toBeCloseTo(2.0, 5);
  });
  it('maps face 10 to ~1.0 (mid)', () => {
    expect(faceToMultiplier(10)).toBeCloseTo(1.0, 5);
  });
  it('is monotonically increasing across all faces', () => {
    for (let f = 2; f <= 20; f++) {
      expect(faceToMultiplier(f)).toBeGreaterThan(faceToMultiplier(f - 1));
    }
  });
  it('clamps out-of-range faces', () => {
    expect(faceToMultiplier(0)).toBeCloseTo(0.1, 5);
    expect(faceToMultiplier(99)).toBeCloseTo(2.0, 5);
  });
});

describe('seeded RNG + rollD20', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const rollsA = [rollD20(a), rollD20(a), rollD20(a)];
    const rollsB = [rollD20(b), rollD20(b), rollD20(b)];
    expect(rollsA).toEqual(rollsB);
  });
  it('always returns a face within 1..20', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const r = rollD20(rng);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(20);
    }
  });
});
