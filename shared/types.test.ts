import { Stats, StatusEffect, CombatActor, SaveState } from './types';

describe('types', () => {
  it('lets us build a Stats object with all six keys', () => {
    const s: Stats = { str: 10, dex: 10, int: 10, wis: 10, cha: 10, con: 10 };
    expect(Object.keys(s)).toHaveLength(6);
  });

  it('lets us build a StatusEffect', () => {
    const e: StatusEffect = { id: 'poison', kind: 'dot', duration: 3, magnitude: 2 };
    expect(e.id).toBe('poison');
  });

  it('lets us build a CombatActor and SaveState shell', () => {
    const stats: Stats = { str: 5, dex: 5, int: 5, wis: 5, cha: 5, con: 5 };
    const actor: CombatActor = {
      id: 'player', name: 'Hero', stats, hp: 25, maxHp: 25,
      statuses: [], skillPriority: [], skillBook: {},
    };
    const save: SaveState = {
      version: 1, routeId: 'r1',
      character: { background: 'rogue', baseStats: stats, inventory: [], equipped: {}, skillPriority: [] },
      reputation: { hero: 0, villain: 0, factions: {} },
      flags: {}, choiceLog: [], currentNodeId: 'n1', seed: 42,
      gold: 0, xp: 0, level: 1, consumables: {}, vitals: { currentHp: 40, pendingBuffs: [] },
    };
    expect(actor.maxHp).toBe(25);
    expect(save.seed).toBe(42);
  });
});
