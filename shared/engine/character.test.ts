import { effectiveStats, deriveMaxHp, buildPlayerActor, buildEnemyActor } from './character';
import { CharacterState, Item, Skill, Enemy, Stats } from '../types';

it('effectiveStats sums non-core attribute mods from equipped gear', () => {
  const itemDb: Record<string, Item> = {
    plate: { id: 'plate', name: 'Plate', slot: 'armor', kind: 'gear', statMods: { armor: 3, str: 1 }, storyTags: [] },
  };
  const character: CharacterState = {
    background: 'x', baseStats: { str: 5, con: 4 }, inventory: ['plate'], equipped: { armor: 'plate' }, skillPriority: [],
  };
  const stats = effectiveStats(character, itemDb);
  expect(stats.str).toBe(6);
  expect(stats.armor).toBe(3); // new attribute flows through even though baseStats lacked it
});

const baseStats: Stats = { str: 8, dex: 6, int: 5, wis: 5, cha: 5, con: 4 };

const itemDb: Record<string, Item> = {
  sword: { id: 'sword', name: 'Sword', slot: 'weapon', kind: 'gear', statMods: { str: 3 }, storyTags: [] },
  ringOfRegen: {
    id: 'ringOfRegen', name: 'Ring of Regen', slot: 'ring', kind: 'gear', statMods: { con: 2 },
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

const t4SkillDb: Record<string, Skill> = {
  slash: { id: 'slash', name: 'Slash', power: 1 },
  bless: { id: 'bless', name: 'Bless', power: 0 },
};
const t4ItemDb: Record<string, Item> = {
  blade: { id: 'blade', name: 'Blade', slot: 'weapon', kind: 'gear', statMods: { str: 2 }, grantsSkills: ['bless'], storyTags: [] },
};
function t4Char(): CharacterState {
  return { background: 'x', baseStats: { str: 5, dex: 5, int: 5, wis: 5, cha: 5, con: 4 }, inventory: ['blade'], equipped: { weapon: 'blade' }, skillPriority: ['slash'] };
}

describe('buildPlayerActor options', () => {
  it('merges grantsSkills from equipped items into priority and book', () => {
    const a = buildPlayerActor(t4Char(), t4ItemDb, t4SkillDb);
    expect(a.skillPriority).toContain('bless');
    expect(a.skillBook.bless).toBeDefined();
  });

  it('uses startHp clamped to maxHp when provided', () => {
    const c = t4Char();
    const maxHp = deriveMaxHp(effectiveStats(c, t4ItemDb));
    expect(buildPlayerActor(c, t4ItemDb, t4SkillDb, { startHp: 3 }).hp).toBe(3);
    expect(buildPlayerActor(c, t4ItemDb, t4SkillDb).hp).toBe(maxHp);
    expect(buildPlayerActor(c, t4ItemDb, t4SkillDb, { startHp: 9999 }).hp).toBe(maxHp);
  });

  it('applies extraBuffs as statuses', () => {
    const a = buildPlayerActor(t4Char(), t4ItemDb, t4SkillDb, { extraBuffs: [{ id: 'regen', kind: 'hot', duration: 3, magnitude: 2 }] });
    expect(a.statuses.some((s) => s.id === 'regen')).toBe(true);
  });
});
