import { DICE_MIN_MULT, DICE_MAX_MULT } from '../constants';

export type RNG = () => number; // returns a float in [0, 1)

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollD20(rng: RNG): number {
  return Math.floor(rng() * 20) + 1; // 1..20
}

export function faceToMultiplier(face: number): number {
  const clamped = Math.max(1, Math.min(20, face));
  return DICE_MIN_MULT + ((clamped - 1) / 19) * (DICE_MAX_MULT - DICE_MIN_MULT);
}
