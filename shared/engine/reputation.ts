import { Reputation, ReputationDelta } from '../types';

/** Merge a reputation delta into a reputation in place. */
export function applyRepDelta(rep: Reputation, delta: ReputationDelta): void {
  rep.hero += delta.hero ?? 0;
  rep.villain += delta.villain ?? 0;
  for (const [f, v] of Object.entries(delta.factions ?? {})) {
    rep.factions[f] = (rep.factions[f] ?? 0) + v;
  }
}
