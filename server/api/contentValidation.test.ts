import { GameError } from '../session';
import { validateAttribute, validateEffect, validateItem, validateSkill, validateEnemy } from './contentValidation';
import { ATTRIBUTE_DB, EFFECT_DB, ITEM_DB, SKILL_DB } from '../../shared/fixtures';

const ctx = { attributes: ATTRIBUTE_DB, effects: EFFECT_DB, items: ITEM_DB, skills: SKILL_DB };

describe('content validation', () => {
  it('accepts a valid attribute and rejects unknown roles', () => {
    expect(validateAttribute({ id: 'armor', name: 'Armor', abbrev: 'ARM', roles: ['defense'] }).builtin).toBe(false);
    expect(() => validateAttribute({ id: 'x', name: 'X', abbrev: 'X', roles: ['nope'] })).toThrow(GameError);
  });
  it('requires a valid stat for statMod effects', () => {
    expect(() => validateEffect({ id: 'e', name: 'E', archetype: 'statMod', kind: 'buff' }, ctx)).toThrow(/stat/);
    expect(validateEffect({ id: 'e', name: 'E', archetype: 'statMod', kind: 'buff', stat: 'str', magnitude: 2 }, ctx).stat).toBe('str');
  });
  it('rejects items whose stat-mod key or effect ref is unknown', () => {
    expect(() => validateItem({ id: 'i', name: 'I', slot: 'weapon', kind: 'gear', statMods: { ghost: 1 } }, ctx)).toThrow(/ghost/);
    expect(() => validateItem({ id: 'i', name: 'I', slot: 'weapon', kind: 'gear', onUse: [{ id: 'nope', kind: 'hot', duration: 0 }] }, ctx)).toThrow(/nope/);
  });
  it('rejects skills/enemies with unknown references', () => {
    expect(() => validateSkill({ id: 's', name: 'S', targetStat: 'ghost' }, ctx)).toThrow(/ghost/);
    expect(() => validateEnemy({ id: 'en', name: 'En', stats: { str: 1 }, hp: 5, skillPriority: ['ghost'] }, ctx)).toThrow(/ghost/);
  });
  it('rejects non-array array fields with GameError 400, not TypeError', () => {
    expect(() => validateItem({ id: 'i', name: 'I', slot: 'weapon', kind: 'gear', onUse: 'bad' }, ctx)).toThrow(GameError);
    expect(() => validateItem({ id: 'i', name: 'I', slot: 'weapon', kind: 'gear', onEquip: 42 }, ctx)).toThrow(GameError);
    expect(() => validateItem({ id: 'i', name: 'I', slot: 'weapon', kind: 'gear', grantsSkills: {} }, ctx)).toThrow(GameError);
    expect(() => validateSkill({ id: 's', name: 'S', effects: 'bad' }, ctx)).toThrow(GameError);
    expect(() => validateEnemy({ id: 'en', name: 'E', stats: { str: 1 }, hp: 5, skillPriority: 42 }, ctx)).toThrow(GameError);
  });
  it('rejects non-object object fields with GameError 400, not confusing message', () => {
    expect(() => validateItem({ id: 'i', name: 'I', slot: 'weapon', kind: 'gear', statMods: 'bad' }, ctx)).toThrow(GameError);
    expect(() => validateItem({ id: 'i', name: 'I', slot: 'weapon', kind: 'gear', statMods: [1, 2] }, ctx)).toThrow(GameError);
    expect(() => validateEnemy({ id: 'en', name: 'E', stats: 'bad', hp: 5 }, ctx)).toThrow(GameError);
  });
  describe('validateEnemy', () => {
    it('rejects hp:0 (dead on arrival)', () => {
      expect(() => validateEnemy({ id: 'e', name: 'E', stats: {}, hp: 0, skillPriority: [] }, ctx))
        .toThrow(/hp/);
    });
    const enemy = (reward: unknown) => ({ id: 'e', name: 'E', stats: {}, hp: 5, skillPriority: [], reward });
    it('rejects reward.gold with min > max', () => {
      expect(() => validateEnemy(enemy({ gold: [10, 1] }), ctx)).toThrow(/gold/);
    });
    it('rejects negative reward.xp', () => {
      expect(() => validateEnemy(enemy({ xp: -5 }), ctx)).toThrow(/xp/);
    });
    it('rejects a drop chance outside [0,1]', () => {
      expect(() => validateEnemy(enemy({ drops: [{ itemId: 'healPotion', chance: 5 }] }), ctx)).toThrow(/chance/);
    });
    it('accepts a well-formed reward', () => {
      const e = validateEnemy(enemy({ gold: [3, 8], xp: 10, drops: [{ itemId: 'healPotion', chance: 0.5 }] }), ctx);
      expect(e.reward).toEqual({ gold: [3, 8], xp: 10, drops: [{ itemId: 'healPotion', chance: 0.5 }] });
    });
    it('rejects a NaN drop chance', () => {
      expect(() => validateEnemy(enemy({ drops: [{ itemId: 'healPotion', chance: NaN }] }), ctx)).toThrow(/chance/);
    });
    it('rejects a non-integer reward.xp', () => {
      expect(() => validateEnemy(enemy({ xp: 1.5 }), ctx)).toThrow(/xp/);
    });
    it('rejects non-integer reward.gold', () => {
      expect(() => validateEnemy(enemy({ gold: [1.5, 3] }), ctx)).toThrow(/gold/);
    });
  });
});
