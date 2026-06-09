import { applyArchetype, tickArchetype, expireArchetype } from './registry';
import { CombatActor, EffectTemplate, StatusEffect } from '../types';

function actor(): CombatActor {
  return { id: 'a', name: 'A', stats: { str: 5, con: 4 }, hp: 10, maxHp: 10, statuses: [], skillPriority: [], skillBook: {} };
}
const tpl = (t: Partial<EffectTemplate>): EffectTemplate =>
  ({ id: 'x', name: 'X', archetype: 'dot', kind: 'dot', builtin: false, ...t });
const inst = (e: Partial<StatusEffect>): StatusEffect => ({ id: 'x', kind: 'dot', duration: 1, ...e });

describe('effect archetypes', () => {
  it('dot tick subtracts magnitude (instance overrides template)', () => {
    const a = actor();
    tickArchetype(a, inst({ magnitude: 3 }), tpl({ archetype: 'dot', magnitude: 1 }));
    expect(a.hp).toBe(7);
  });
  it('hot instant applies once at apply-time and clamps to maxHp', () => {
    const a = actor(); a.hp = 2;
    applyArchetype(a, inst({ magnitude: 15, duration: 0 }), tpl({ archetype: 'hot', kind: 'hot', instant: true }));
    expect(a.hp).toBe(10);
  });
  it('statMod adds on apply and reverses on expire', () => {
    const a = actor();
    const t = tpl({ archetype: 'statMod', kind: 'buff', stat: 'str', magnitude: 1 });
    const e = inst({ magnitude: 2 });
    applyArchetype(a, e, t); expect(a.stats.str).toBe(7);
    expireArchetype(a, e, t); expect(a.stats.str).toBe(5);
  });
});
