import { BACKGROUNDS } from './backgrounds';
import { ITEM_DB, SKILL_DB } from './fixtures';
import { STAT_KEYS } from './constants';

describe('BACKGROUNDS', () => {
  it('defines the three presets', () => {
    expect(Object.keys(BACKGROUNDS).sort()).toEqual(['fighter', 'mage', 'rogue']);
  });

  it('every preset has all six stat keys', () => {
    for (const bg of Object.values(BACKGROUNDS)) {
      for (const k of STAT_KEYS) {
        expect(typeof bg.baseStats[k]).toBe('number');
      }
    }
  });

  it('every referenced item id exists in ITEM_DB', () => {
    for (const bg of Object.values(BACKGROUNDS)) {
      for (const id of bg.inventory) expect(ITEM_DB[id]).toBeDefined();
      for (const id of Object.values(bg.equipped)) {
        if (id) expect(ITEM_DB[id]).toBeDefined();
      }
    }
  });

  it('every referenced skill id exists in SKILL_DB', () => {
    for (const bg of Object.values(BACKGROUNDS)) {
      for (const id of bg.skillPriority) expect(SKILL_DB[id]).toBeDefined();
    }
  });

  it('equipped items occupy their declared slot', () => {
    for (const bg of Object.values(BACKGROUNDS)) {
      for (const [slot, id] of Object.entries(bg.equipped)) {
        if (id) expect(ITEM_DB[id].slot).toBe(slot);
      }
    }
  });
});
