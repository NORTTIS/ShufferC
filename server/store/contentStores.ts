import { AttributeDef, EffectTemplate, Item, Skill, Enemy } from '../../shared/types';
import { ATTRIBUTE_DB, EFFECT_DB, ITEM_DB, SKILL_DB, ENEMY_DB } from '../../shared/fixtures';
import { EntityStore } from './EntityStore';
import { createMemoryEntityStore } from './memoryEntityStore';
import { Db } from '../db/client';
import { createPgEntityStore } from './pgEntityStore';
import { attributes, effects, items, skills, enemies } from '../db/schema';

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

export function createPgContentStores(db: Db): ContentStores {
  return {
    attributes: createPgEntityStore<AttributeDef>(db, attributes),
    effects: createPgEntityStore<EffectTemplate>(db, effects),
    items: createPgEntityStore<Item>(db, items),
    skills: createPgEntityStore<Skill>(db, skills),
    enemies: createPgEntityStore<Enemy>(db, enemies),
  };
}

/** Seed any empty store from fixtures (idempotent — run on boot for pg). */
export async function seedContentStores(c: ContentStores): Promise<void> {
  const seeds: [keyof ContentStores, Record<string, { id: string }>][] = [
    ['attributes', ATTRIBUTE_DB], ['effects', EFFECT_DB], ['items', ITEM_DB], ['skills', SKILL_DB], ['enemies', ENEMY_DB],
  ];
  for (const [key, db] of seeds) {
    const store = c[key] as EntityStore<{ id: string }>;
    if ((await store.list()).length > 0) continue;
    for (const entity of Object.values(db)) await store.create(entity);
  }
}
