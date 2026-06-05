import { EFFECT_REGISTRY } from './registry';
import { CombatActor, StatusEffect } from '../types';

function actor(): CombatActor {
  return {
    id: 'a', name: 'A',
    stats: { str: 10, dex: 10, int: 10, wis: 10, cha: 10, con: 10 },
    hp: 20, maxHp: 30, statuses: [], skillPriority: [], skillBook: {},
  };
}

describe('EFFECT_REGISTRY', () => {
  it('defines the six baseline effects with correct kinds', () => {
    expect(EFFECT_REGISTRY.freeze.kind).toBe('control');
    expect(EFFECT_REGISTRY.stun.kind).toBe('control');
    expect(EFFECT_REGISTRY.poison.kind).toBe('dot');
    expect(EFFECT_REGISTRY.regen.kind).toBe('hot');
    expect(EFFECT_REGISTRY.attack_buff.kind).toBe('buff');
    expect(EFFECT_REGISTRY.defense_down.kind).toBe('debuff');
  });

  it('poison.tick subtracts magnitude and clamps at 0', () => {
    const a = actor(); a.hp = 3;
    const e: StatusEffect = { id: 'poison', kind: 'dot', duration: 2, magnitude: 5 };
    EFFECT_REGISTRY.poison.tick!(a, e);
    expect(a.hp).toBe(0);
  });

  it('regen.tick adds magnitude and clamps at maxHp', () => {
    const a = actor(); a.hp = 28;
    const e: StatusEffect = { id: 'regen', kind: 'hot', duration: 2, magnitude: 5 };
    EFFECT_REGISTRY.regen.tick!(a, e);
    expect(a.hp).toBe(30);
  });

  it('attack_buff raises str on apply and restores on expire', () => {
    const a = actor();
    const e: StatusEffect = { id: 'attack_buff', kind: 'buff', duration: 2, magnitude: 4 };
    EFFECT_REGISTRY.attack_buff.apply!(a, e);
    expect(a.stats.str).toBe(14);
    EFFECT_REGISTRY.attack_buff.onExpire!(a, e);
    expect(a.stats.str).toBe(10);
  });

  it('defense_down lowers con on apply and restores on expire', () => {
    const a = actor();
    const e: StatusEffect = { id: 'defense_down', kind: 'debuff', duration: 2, magnitude: 3 };
    EFFECT_REGISTRY.defense_down.apply!(a, e);
    expect(a.stats.con).toBe(7);
    EFFECT_REGISTRY.defense_down.onExpire!(a, e);
    expect(a.stats.con).toBe(10);
  });
});
