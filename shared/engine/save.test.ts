import { serialize, deserialize } from './save';
import { SAVE_VERSION, BASE_HP, HP_PER_CON } from '../constants';
import { SaveState } from '../types';

function v3save(): SaveState {
  return {
    version: SAVE_VERSION, routeId: 'r1',
    character: { background: 'rogue', baseStats: { str: 1, dex: 1, int: 1, wis: 1, cha: 1, con: 4 }, inventory: [], equipped: {}, skillPriority: [] },
    reputation: { hero: 0, villain: 0, factions: {} },
    flags: {}, choiceLog: [], currentNodeId: 'n1', seed: 7,
    gold: 5, xp: 0, level: 1, consumables: {}, vitals: { currentHp: 10, pendingBuffs: [] },
  };
}

describe('save serialize/deserialize', () => {
  it('round-trips a current (v3) save unchanged', () => {
    const s = v3save();
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it('migrates a legacy v2 save, backfilling new fields', () => {
    const legacy = {
      version: 2, routeId: 'r1',
      character: { background: 'rogue', baseStats: { str: 1, dex: 1, int: 1, wis: 1, cha: 1, con: 4 }, inventory: ['torch'], equipped: {}, skillPriority: [] },
      reputation: { hero: 0, villain: 0, factions: {} },
      flags: {}, choiceLog: [], currentNodeId: 'n1', seed: 7,
    };
    const migrated = deserialize(JSON.stringify(legacy));
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.gold).toBe(0);
    expect(migrated.xp).toBe(0);
    expect(migrated.level).toBe(1);
    expect(migrated.consumables).toEqual({});
    expect(migrated.vitals.pendingBuffs).toEqual([]);
    expect(migrated.vitals.currentHp).toBe(BASE_HP + 4 * HP_PER_CON);
  });

  it('throws for a version newer than supported', () => {
    expect(() => deserialize(JSON.stringify({ version: 99 }))).toThrow(/version/i);
  });

  it('round-trips a v3 save carrying liveNodes overlays', () => {
    const s: SaveState = { ...v3save(), liveNodes: { n2: { prose: 'enriched', choiceTexts: ['go', 'stay'] } } };
    expect(deserialize(serialize(s))).toEqual(s);
  });
});
