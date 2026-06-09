import { serialize, deserialize } from './save';
import { SaveState, Stats } from '../types';
import { SAVE_VERSION } from '../constants';

const baseStats: Stats = { str: 7, dex: 9, int: 6, wis: 5, cha: 8, con: 6 };

function save(): SaveState {
  return {
    version: SAVE_VERSION, routeId: 'r1',
    character: { background: 'rogue', baseStats, inventory: ['key'], equipped: { weapon: 'dagger' }, skillPriority: ['slash'] },
    reputation: { hero: 2, villain: 1, factions: { guards: 3 } },
    flags: { doorOpen: true }, choiceLog: [{ nodeId: 'n1', choiceId: 'steal' }], currentNodeId: 'n3', seed: 42,
  };
}

describe('save serialization', () => {
  it('round-trips a SaveState unchanged', () => {
    const s = save();
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it('round-trips a SaveState carrying liveNodes overlays', () => {
    const s: SaveState = { ...save(), liveNodes: { n2: { prose: 'enriched', choiceTexts: ['go', 'stay'] } } };
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it('rejects an unsupported save version', () => {
    const bad = serialize({ ...save(), version: 999 });
    expect(() => deserialize(bad)).toThrow(/version/i);
  });
});
