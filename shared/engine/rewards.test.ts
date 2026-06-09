import { rollRewards } from './rewards';
import { mulberry32 } from './dice';
import { Enemy } from '../types';

const base = { stats: { str: 1, dex: 1, int: 1, wis: 1, cha: 1, con: 1 }, hp: 1, skillPriority: [] };

const goblin: Enemy = {
  id: 'goblin', name: 'Goblin', ...base,
  reward: { gold: [5, 5], xp: 10, drops: [{ itemId: 'coin', chance: 1 }], reputationDelta: { villain: 1, factions: { goblins: -2 } } },
};
const certainNoDrop: Enemy = { id: 'g2', name: 'G2', ...base, reward: { drops: [{ itemId: 'never', chance: 0 }] } };
const noReward: Enemy = { id: 'g3', name: 'G3', ...base };

describe('rollRewards', () => {
  it('sums gold/xp, includes guaranteed drops, merges reputation', () => {
    const r = rollRewards([goblin], mulberry32(1));
    expect(r.gold).toBe(5);
    expect(r.xp).toBe(10);
    expect(r.itemIds).toEqual(['coin']);
    expect(r.repDelta).toEqual({ hero: 0, villain: 1, factions: { goblins: -2 } });
  });

  it('omits drops with chance 0 and ignores enemies without rewards', () => {
    const r = rollRewards([certainNoDrop, noReward], mulberry32(1));
    expect(r.itemIds).toEqual([]);
    expect(r.gold).toBe(0);
    expect(r.xp).toBe(0);
  });

  it('is deterministic for a given seed', () => {
    const ranged: Enemy = { id: 'g4', name: 'G4', ...base, reward: { gold: [1, 100] } };
    const first = rollRewards([ranged], mulberry32(99)).gold;
    const second = rollRewards([ranged], mulberry32(99)).gold;
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThanOrEqual(100);
  });
});
