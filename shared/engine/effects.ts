import { CombatActor, StatusEffect } from '../types';
import { EFFECT_REGISTRY } from '../effects/registry';

export function applyEffect(target: CombatActor, effect: StatusEffect): void {
  const behavior = EFFECT_REGISTRY[effect.id];
  if (!behavior) return;
  const copy: StatusEffect = { ...effect, kind: behavior.kind }; // normalize kind from registry
  behavior.apply?.(target, copy);
  if (copy.duration > 0) target.statuses.push(copy);
}

export function hasControl(actor: CombatActor): boolean {
  return actor.statuses.some((s) => s.kind === 'control' && s.duration > 0);
}

export function tickEffects(actor: CombatActor): void {
  const remaining: StatusEffect[] = [];
  for (const s of actor.statuses) {
    const behavior = EFFECT_REGISTRY[s.id];
    behavior?.tick?.(actor, s);
    s.duration -= 1;
    if (s.duration <= 0) {
      behavior?.onExpire?.(actor, s);
    } else {
      remaining.push(s);
    }
  }
  actor.statuses = remaining;
}
