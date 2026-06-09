import { applyEffect, tickEffects, hasControl } from './effects';
import { CombatActor, StatusEffect } from '../types';
import { EFFECT_DB } from '../fixtures';

function actor(): CombatActor {
  return {
    id: 'a', name: 'A',
    stats: { str: 10, dex: 10, int: 10, wis: 10, cha: 10, con: 10 },
    hp: 20, maxHp: 30, statuses: [], skillPriority: [], skillBook: {},
  };
}

describe('applyEffect', () => {
  it('normalizes kind from the registry and retains effects with duration > 0', () => {
    const a = actor();
    applyEffect(a, { id: 'poison', kind: 'buff', duration: 3, magnitude: 2 }, EFFECT_DB); // wrong kind on purpose
    expect(a.statuses).toHaveLength(1);
    expect(a.statuses[0].kind).toBe('dot'); // corrected from registry
  });

  it('does not retain instantaneous (duration 0) effects but still runs apply', () => {
    const a = actor();
    applyEffect(a, { id: 'attack_buff', kind: 'buff', duration: 0, magnitude: 4 }, EFFECT_DB);
    expect(a.stats.str).toBe(14);     // apply ran
    expect(a.statuses).toHaveLength(0); // not retained
  });

  it('ignores unknown effect ids', () => {
    const a = actor();
    applyEffect(a, { id: 'nope', kind: 'buff', duration: 3 }, EFFECT_DB);
    expect(a.statuses).toHaveLength(0);
  });
});

describe('hasControl', () => {
  it('is true when a control status is active', () => {
    const a = actor();
    applyEffect(a, { id: 'freeze', kind: 'control', duration: 2 }, EFFECT_DB);
    expect(hasControl(a)).toBe(true);
  });
  it('is false with no control status', () => {
    expect(hasControl(actor())).toBe(false);
  });
});

describe('tickEffects', () => {
  it('ticks poison each round, counts down duration, and expires', () => {
    const a = actor();
    applyEffect(a, { id: 'poison', kind: 'dot', duration: 2, magnitude: 3 }, EFFECT_DB);
    tickEffects(a, EFFECT_DB); // round 1: -3, duration 2->1
    expect(a.hp).toBe(17);
    expect(a.statuses).toHaveLength(1);
    tickEffects(a, EFFECT_DB); // round 2: -3, duration 1->0, expires
    expect(a.hp).toBe(14);
    expect(a.statuses).toHaveLength(0);
  });

  it('restores a buff on expiry via onExpire', () => {
    const a = actor();
    applyEffect(a, { id: 'attack_buff', kind: 'buff', duration: 1, magnitude: 4 }, EFFECT_DB);
    expect(a.stats.str).toBe(14);
    tickEffects(a, EFFECT_DB); // duration 1->0, onExpire restores
    expect(a.stats.str).toBe(10);
    expect(a.statuses).toHaveLength(0);
  });
});
