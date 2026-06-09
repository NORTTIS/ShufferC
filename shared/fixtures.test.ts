import { ATTRIBUTE_DB, EFFECT_DB } from './fixtures';

describe('content seed', () => {
  it('seeds the original six attributes; con carries defense + maxHp', () => {
    expect(Object.keys(ATTRIBUTE_DB).sort()).toEqual(['cha', 'con', 'dex', 'int', 'str', 'wis']);
    expect(ATTRIBUTE_DB.str.roles).toEqual(['core']);
    expect(ATTRIBUTE_DB.con.roles.sort()).toEqual(['core', 'defense', 'maxHp']);
    expect(Object.values(ATTRIBUTE_DB).every((a) => a.builtin)).toBe(true);
  });

  it('seeds effect templates covering every legacy effect id', () => {
    for (const id of ['poison', 'regen', 'heal', 'attack_buff', 'defense_down', 'freeze', 'stun']) {
      expect(EFFECT_DB[id]).toBeDefined();
      expect(EFFECT_DB[id].builtin).toBe(true);
    }
    expect(EFFECT_DB.attack_buff.archetype).toBe('statMod');
    expect(EFFECT_DB.attack_buff.stat).toBe('str');
    expect(EFFECT_DB.heal.instant).toBe(true);
    expect(EFFECT_DB.freeze.archetype).toBe('control');
  });
});
