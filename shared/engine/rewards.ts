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
  let hero = 0;
  let villain = 0;
  const factions: Record<string, number> = {};

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
      hero += r.reputationDelta.hero ?? 0;
      villain += r.reputationDelta.villain ?? 0;
      for (const [f, v] of Object.entries(r.reputationDelta.factions ?? {})) {
        factions[f] = (factions[f] ?? 0) + v;
      }
    }
  }
  return { gold, xp, itemIds, repDelta: { hero, villain, factions } };
}
