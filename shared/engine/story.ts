import { SaveState, StoryNode } from '../types';
import { RNG, mulberry32, rollD20, faceToMultiplier } from './dice';
import { STAT_KEYS } from '../constants';

export interface ChoiceResolution {
  save: SaveState;
  checkPassed?: boolean;
  roll?: number;
}

export function resolveChoice(
  save: SaveState,
  node: StoryNode,
  choiceId: string,
  rng?: RNG,
): ChoiceResolution {
  const choice = node.choices.find((c) => c.id === choiceId);
  if (!choice) throw new Error(`Choice ${choiceId} not in node ${node.id}`);

  const next: SaveState = structuredClone(save);
  let checkPassed: boolean | undefined;
  let roll: number | undefined;

  if (choice.skillCheck) {
    const r = rng ?? mulberry32(next.seed);
    roll = rollD20(r);
    const statValue = next.character.baseStats[choice.skillCheck.stat];
    const score = statValue * faceToMultiplier(roll);
    checkPassed = score >= choice.skillCheck.dc;
  }

  const outcome = choice.outcome;
  if (outcome) {
    if (outcome.statDelta) {
      for (const k of STAT_KEYS) {
        const d = outcome.statDelta[k];
        if (d) next.character.baseStats[k] += d;
      }
    }
    if (outcome.reputationDelta) {
      const rd = outcome.reputationDelta;
      if (rd.hero) next.reputation.hero += rd.hero;
      if (rd.villain) next.reputation.villain += rd.villain;
      if (rd.factions) {
        for (const [f, v] of Object.entries(rd.factions)) {
          next.reputation.factions[f] = (next.reputation.factions[f] ?? 0) + v;
        }
      }
    }
    if (outcome.addItems) next.character.inventory.push(...outcome.addItems);
    if (outcome.removeItems) {
      next.character.inventory = next.character.inventory.filter((i) => !outcome.removeItems!.includes(i));
    }
    if (outcome.setFlags) {
      for (const [f, v] of Object.entries(outcome.setFlags)) next.flags[f] = v;
    }
  }

  next.choiceLog.push({ nodeId: node.id, choiceId });
  if (choice.nextNodeId) next.currentNodeId = choice.nextNodeId;

  return { save: next, checkPassed, roll };
}
