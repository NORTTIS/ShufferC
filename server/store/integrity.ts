import { ContentStores } from './contentStores';

export type RefKind = 'attribute' | 'effect' | 'skill' | 'item';

/** Returns descriptors ("item:dagger.statMods") of content entities referencing `id`. */
export async function findReferences(stores: ContentStores, kind: RefKind, id: string): Promise<string[]> {
  const [items, skills, enemies, effects] = await Promise.all([
    stores.items.list(), stores.skills.list(), stores.enemies.list(), stores.effects.list(),
  ]);
  const refs: string[] = [];

  if (kind === 'attribute') {
    for (const it of items) if (it.statMods && id in it.statMods) refs.push(`item:${it.id}.statMods`);
    for (const sk of skills) if (sk.targetStat === id) refs.push(`skill:${sk.id}.targetStat`);
    for (const ef of effects) if (ef.stat === id) refs.push(`effect:${ef.id}.stat`);
    for (const en of enemies) if (en.stats && id in en.stats) refs.push(`enemy:${en.id}.stats`);
  }
  if (kind === 'effect') {
    for (const it of items) {
      if ((it.onEquip ?? []).some((e) => e.id === id)) refs.push(`item:${it.id}.onEquip`);
      if ((it.onUse ?? []).some((e) => e.id === id)) refs.push(`item:${it.id}.onUse`);
    }
    for (const sk of skills) if ((sk.effects ?? []).some((e) => e.id === id)) refs.push(`skill:${sk.id}.effects`);
  }
  if (kind === 'skill') {
    for (const it of items) if ((it.grantsSkills ?? []).includes(id)) refs.push(`item:${it.id}.grantsSkills`);
    for (const en of enemies) if (en.skillPriority.includes(id)) refs.push(`enemy:${en.id}.skillPriority`);
  }
  if (kind === 'item') {
    for (const en of enemies) if ((en.reward?.drops ?? []).some((d) => d.itemId === id)) refs.push(`enemy:${en.id}.reward.drops`);
  }
  return refs;
}
