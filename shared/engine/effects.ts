import { CombatActor, EffectTemplate, StatusEffect } from '../types';
import { applyArchetype, tickArchetype, expireArchetype } from '../effects/registry';

export type EffectMap = Record<string, EffectTemplate>;

export function applyEffect(target: CombatActor, effect: StatusEffect, effects: EffectMap): void {
  const tpl = effects[effect.id];
  if (!tpl) return;
  const copy: StatusEffect = { ...effect, kind: tpl.kind }; // normalize kind from the template
  applyArchetype(target, copy, tpl);
  if (copy.duration > 0) target.statuses.push(copy);
}

export function hasControl(actor: CombatActor): boolean {
  return actor.statuses.some((s) => s.kind === 'control' && s.duration > 0);
}

export function tickEffects(actor: CombatActor, effects: EffectMap): void {
  const remaining: StatusEffect[] = [];
  for (const s of actor.statuses) {
    const tpl = effects[s.id];
    if (tpl) tickArchetype(actor, s, tpl);
    s.duration -= 1;
    if (s.duration <= 0) {
      if (tpl) expireArchetype(actor, s, tpl);
    } else {
      remaining.push(s);
    }
  }
  actor.statuses = remaining;
}
