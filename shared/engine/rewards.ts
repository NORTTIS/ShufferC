import { Enemy, ReputationDelta } from '../types';
import { RNG } from './dice';

export interface Rewards {
  gold: number;
  xp: number;
  itemIds: string[];
  repDelta: ReputationDelta;
}

/** Pure, seeded reward roll for a set of defeated enemies. */
export function rollRewards(defeated: Enemy[], rng: RNG): Rewards {
  let gold = 0;
  let xp = 0;
  const itemIds: string[] = [];
  const repDelta: ReputationDelta = { hero: 0, villain: 0, factions: {} };

  for (const e of defeated) {
    const r = e.reward;
    if (!r) continue;
    if (r.gold) {
      const [min, max] = r.gold;
      gold += min + Math.floor(rng() * (max - min + 1));
    }
    if (r.xp) xp += r.xp;
    for (const d of r.drops ?? []) {
      if (rng() < d.chance) itemIds.push(d.itemId);
    }
    if (r.reputationDelta) {
      repDelta.hero = (repDelta.hero ?? 0) + (r.reputationDelta.hero ?? 0);
      repDelta.villain = (repDelta.villain ?? 0) + (r.reputationDelta.villain ?? 0);
      for (const [f, v] of Object.entries(r.reputationDelta.factions ?? {})) {
        repDelta.factions![f] = (repDelta.factions![f] ?? 0) + v;
      }
    }
  }
  return { gold, xp, itemIds, repDelta };
}
