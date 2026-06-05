import { CharacterState, CombatActor, Enemy, Item, Skill, Stats } from '../types';
import { STAT_KEYS, BASE_HP, HP_PER_CON } from '../constants';
import { applyEffect } from './effects';

export function effectiveStats(character: CharacterState, itemDb: Record<string, Item>): Stats {
  const result: Stats = { ...character.baseStats };
  for (const itemId of Object.values(character.equipped)) {
    if (!itemId) continue;
    const item = itemDb[itemId];
    if (!item?.statMods) continue;
    for (const key of STAT_KEYS) {
      const mod = item.statMods[key];
      if (mod) result[key] += mod;
    }
  }
  return result;
}

export function deriveMaxHp(stats: Stats): number {
  return BASE_HP + stats.con * HP_PER_CON;
}

function collectSkillBook(ids: string[], skillDb: Record<string, Skill>): Record<string, Skill> {
  const book: Record<string, Skill> = {};
  for (const id of ids) {
    if (skillDb[id]) book[id] = skillDb[id];
  }
  return book;
}

export function buildPlayerActor(
  character: CharacterState,
  itemDb: Record<string, Item>,
  skillDb: Record<string, Skill>,
): CombatActor {
  const stats = effectiveStats(character, itemDb);
  const maxHp = deriveMaxHp(stats);
  const actor: CombatActor = {
    id: 'player',
    name: 'Hero',
    stats,
    hp: maxHp,
    maxHp,
    statuses: [],
    skillPriority: [...character.skillPriority],
    skillBook: collectSkillBook(character.skillPriority, skillDb),
  };
  for (const itemId of Object.values(character.equipped)) {
    if (!itemId) continue;
    const item = itemDb[itemId];
    for (const eff of item?.onEquip ?? []) applyEffect(actor, eff);
  }
  return actor;
}

export function buildEnemyActor(enemy: Enemy, skillDb: Record<string, Skill>): CombatActor {
  return {
    id: enemy.id,
    name: enemy.name,
    stats: { ...enemy.stats },
    hp: enemy.hp,
    maxHp: enemy.hp,
    statuses: [],
    skillPriority: [...enemy.skillPriority],
    skillBook: collectSkillBook(enemy.skillPriority, skillDb),
  };
}
