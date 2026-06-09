import { CombatActor, EffectTemplate, StatusEffect } from '../types';

function clampHp(a: CombatActor): void {
  a.hp = Math.max(0, Math.min(a.maxHp, a.hp));
}

function amount(e: StatusEffect, tpl: EffectTemplate): number {
  return e.magnitude ?? tpl.magnitude ?? 1;
}

/** Called when an effect lands. Instant dot/hot apply once; statMod shifts the stat. */
export function applyArchetype(target: CombatActor, e: StatusEffect, tpl: EffectTemplate): void {
  switch (tpl.archetype) {
    case 'statMod':
      if (tpl.stat) target.stats[tpl.stat] = (target.stats[tpl.stat] ?? 0) + amount(e, tpl);
      break;
    case 'hot':
      if (tpl.instant) { target.hp += amount(e, tpl); clampHp(target); }
      break;
    case 'dot':
      if (tpl.instant) { target.hp -= amount(e, tpl); clampHp(target); }
      break;
    case 'control':
      break;
  }
}

/** Called once per turn while the effect persists. */
export function tickArchetype(target: CombatActor, e: StatusEffect, tpl: EffectTemplate): void {
  if (tpl.archetype === 'dot') { target.hp -= amount(e, tpl); clampHp(target); }
  if (tpl.archetype === 'hot') { target.hp += amount(e, tpl); clampHp(target); }
}

/** Called when a persisting effect's duration reaches 0. */
export function expireArchetype(target: CombatActor, e: StatusEffect, tpl: EffectTemplate): void {
  if (tpl.archetype === 'statMod' && tpl.stat) {
    target.stats[tpl.stat] = (target.stats[tpl.stat] ?? 0) - amount(e, tpl);
  }
}
