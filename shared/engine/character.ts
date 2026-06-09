import { CharacterState, CombatActor, Enemy, Item, Skill, Stats, StatusEffect } from '../types';
import { BASE_HP, HP_PER_CON } from '../constants';
import { applyEffect } from './effects';

export function effectiveStats(character: CharacterState, itemDb: Record<string, Item>): Stats {
  const result: Stats = { ...character.baseStats };
  for (const itemId of Object.values(character.equipped)) {
    if (!itemId) continue;
    const item = itemDb[itemId];
    if (!item?.statMods) continue;
    for (const [key, mod] of Object.entries(item.statMods)) {
      if (mod) result[key] = (result[key] ?? 0) + mod;
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

export interface BuildPlayerOptions {
  startHp?: number;             // persistent currentHp; clamped to [0, maxHp]
  extraBuffs?: StatusEffect[];  // pending buffs applied at combat start
}

export function buildPlayerActor(
  character: CharacterState,
  itemDb: Record<string, Item>,
  skillDb: Record<string, Skill>,
  opts: BuildPlayerOptions = {},
): CombatActor {
  const stats = effectiveStats(character, itemDb);
  const maxHp = deriveMaxHp(stats);

  // Equipped items may grant skills; append after the character's own priority.
  const granted: string[] = [];
  for (const itemId of Object.values(character.equipped)) {
    if (!itemId) continue;
    for (const sid of itemDb[itemId]?.grantsSkills ?? []) granted.push(sid);
  }
  const priority = [...character.skillPriority, ...granted.filter((s) => !character.skillPriority.includes(s))];

  const startHp = opts.startHp ?? maxHp;
  const actor: CombatActor = {
    id: 'player',
    name: 'Hero',
    stats,
    hp: Math.max(0, Math.min(maxHp, startHp)),
    maxHp,
    statuses: [],
    skillPriority: priority,
    skillBook: collectSkillBook(priority, skillDb),
  };
  for (const itemId of Object.values(character.equipped)) {
    if (!itemId) continue;
    const item = itemDb[itemId];
    for (const eff of item?.onEquip ?? []) applyEffect(actor, eff);
  }
  for (const eff of opts.extraBuffs ?? []) applyEffect(actor, eff);
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
