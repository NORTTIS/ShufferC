import { AttributeDef, EffectTemplate, Item, Skill, Enemy } from '../../shared/types';
import { ATTRIBUTE_DB, EFFECT_DB, ITEM_DB, SKILL_DB, ENEMY_DB } from '../../shared/fixtures';
import { EntityStore } from './EntityStore';
import { createMemoryEntityStore } from './memoryEntityStore';

export type AttributeStore = EntityStore<AttributeDef>;
export type EffectStore = EntityStore<EffectTemplate>;
export type ItemStore = EntityStore<Item>;
export type SkillStore = EntityStore<Skill>;
export type EnemyStore = EntityStore<Enemy>;

export interface ContentStores {
  attributes: AttributeStore;
  effects: EffectStore;
  items: ItemStore;
  skills: SkillStore;
  enemies: EnemyStore;
}

export function createMemoryContentStores(): ContentStores {
  return {
    attributes: createMemoryEntityStore<AttributeDef>(ATTRIBUTE_DB),
    effects: createMemoryEntityStore<EffectTemplate>(EFFECT_DB),
    items: createMemoryEntityStore<Item>(ITEM_DB),
    skills: createMemoryEntityStore<Skill>(SKILL_DB),
    enemies: createMemoryEntityStore<Enemy>(ENEMY_DB),
  };
}
