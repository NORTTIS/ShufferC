import { STAT_KEYS, EQUIP_SLOTS, DICE_MIN_MULT, DICE_MAX_MULT, BASE_HP, HP_PER_CON, SAVE_VERSION } from './constants';

describe('constants', () => {
  it('has all six stat keys', () => {
    expect(STAT_KEYS).toEqual(['str', 'dex', 'int', 'wis', 'cha', 'con']);
  });
  it('has five equip slots', () => {
    expect(EQUIP_SLOTS).toEqual(['weapon', 'armor', 'ring', 'scroll', 'quest']);
  });
  it('defines dice multiplier bounds', () => {
    expect(DICE_MIN_MULT).toBeCloseTo(0.1);
    expect(DICE_MAX_MULT).toBeCloseTo(2.0);
  });
  it('defines HP + save constants', () => {
    expect(BASE_HP).toBe(20);
    expect(HP_PER_CON).toBe(5);
    expect(SAVE_VERSION).toBe(3);
  });
});
