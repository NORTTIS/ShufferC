import { effectiveStats, deriveMaxHp, buildPlayerActor, buildEnemyActor } from './character';
import { CharacterState, Item, Skill, Enemy, Stats } from '../types';

const baseStats: Stats = { str: 8, dex: 6, int: 5, wis: 5, cha: 5, con: 4 };

const itemDb: Record<string, Item> = {
  sword: { id: 'sword', name: 'Sword', slot: 'weapon', statMods: { str: 3 }, storyTags: [] },
  ringOfRegen: {
    id: 'ringOfRegen', name: 'Ring of Regen', slot: 'ring', statMods: { con: 2 },
    onEquip: [{ id: 'regen', kind: 'hot', duration: 99, magnitude: 2 }], storyTags: [],
  },
};

const skillDb: Record<string, Skill> = {
  slash: { id: 'slash', name: 'Slash', targetStat: 'str', power: 1 },
};

describe('effectiveStats', () => {
  it('sums statMods from equipped items', () => {
    const c: CharacterState = {
      background: 'fighter', baseStats, inventory: ['sword', 'ringOfRegen'],
      equipped: { weapon: 'sword', ring: 'ringOfRegen' }, skillPriority: ['slash'],
    };
    const s = effectiveStats(c, itemDb);
    expect(s.str).toBe(11); // 8 + 3
    expect(s.con).toBe(6);  // 4 + 2
  });

  it('equals base stats when nothing is equipped', () => {
    const c: CharacterState = { background: 'fighter', baseStats, inventory: [], equipped: {}, skillPriority: [] };
    expect(effectiveStats(c, itemDb)).toEqual(baseStats);
  });
});

describe('deriveMaxHp', () => {
  it('is BASE_HP + con * HP_PER_CON', () => {
    expect(deriveMaxHp({ ...baseStats, con: 6 })).toBe(20 + 6 * 5); // 50
  });
});

describe('buildPlayerActor', () => {
  it('builds an actor with effective stats, full hp, and onEquip effects applied', () => {
    const c: CharacterState = {
      background: 'fighter', baseStats, inventory: ['sword', 'ringOfRegen'],
      equipped: { weapon: 'sword', ring: 'ringOfRegen' }, skillPriority: ['slash'],
    };
    const actor = buildPlayerActor(c, itemDb, skillDb);
    expect(actor.stats.str).toBe(11);
    expect(actor.maxHp).toBe(20 + 6 * 5); // con 6
    expect(actor.hp).toBe(actor.maxHp);
    expect(actor.skillBook.slash).toBeDefined();
    expect(actor.statuses.some((s) => s.id === 'regen')).toBe(true); // onEquip applied
  });
});

describe('buildEnemyActor', () => {
  it('builds an enemy actor from its definition', () => {
    const enemy: Enemy = {
      id: 'goblin', name: 'Goblin',
      stats: { str: 6, dex: 6, int: 2, wis: 2, cha: 2, con: 3 },
      hp: 18, skillPriority: ['slash'],
    };
    const actor = buildEnemyActor(enemy, skillDb);
    expect(actor.id).toBe('goblin');
    expect(actor.hp).toBe(18);
    expect(actor.maxHp).toBe(18);
    expect(actor.skillBook.slash).toBeDefined();
  });
});
