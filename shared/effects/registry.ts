import { CombatActor, EffectBehavior, StatusEffect } from '../types';

function clampHp(a: CombatActor): void {
  a.hp = Math.max(0, Math.min(a.maxHp, a.hp));
}

export const EFFECT_REGISTRY: Record<string, EffectBehavior> = {
  freeze: { kind: 'control' },
  stun: { kind: 'control' },
  poison: {
    kind: 'dot',
    tick(target: CombatActor, e: StatusEffect) { target.hp -= e.magnitude ?? 1; clampHp(target); },
  },
  regen: {
    kind: 'hot',
    tick(target: CombatActor, e: StatusEffect) { target.hp += e.magnitude ?? 1; clampHp(target); },
  },
  attack_buff: {
    kind: 'buff',
    apply(target: CombatActor, e: StatusEffect) { target.stats.str += e.magnitude ?? 1; },
    onExpire(target: CombatActor, e: StatusEffect) { target.stats.str -= e.magnitude ?? 1; },
  },
  defense_down: {
    kind: 'debuff',
    apply(target: CombatActor, e: StatusEffect) { target.stats.con -= e.magnitude ?? 1; },
    onExpire(target: CombatActor, e: StatusEffect) { target.stats.con += e.magnitude ?? 1; },
  },
};
