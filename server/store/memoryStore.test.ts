import { createMemoryStore } from './memoryStore';
import { SaveState, Stats } from '../../shared/types';

const baseStats: Stats = { str: 7, dex: 9, int: 6, wis: 5, cha: 8, con: 6 };

function save(): SaveState {
  return {
    version: 1, routeId: 'r1',
    character: { background: 'rogue', baseStats, inventory: [], equipped: {}, skillPriority: [] },
    reputation: { hero: 0, villain: 0, factions: {} },
    flags: {}, choiceLog: [], currentNodeId: 'n1', seed: 7,
  };
}

describe('memoryStore', () => {
  it('create returns a non-empty id and get round-trips the save', async () => {
    const store = createMemoryStore();
    const id = await store.create(save());
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(await store.get(id)).toEqual(save());
  });

  it('get returns null for an unknown id', async () => {
    const store = createMemoryStore();
    expect(await store.get('missing')).toBeNull();
  });

  it('put overwrites an existing save', async () => {
    const store = createMemoryStore();
    const id = await store.create(save());
    const updated = { ...save(), currentNodeId: 'n3' };
    await store.put(id, updated);
    expect((await store.get(id))!.currentNodeId).toBe('n3');
  });

  it('stores an independent copy (no aliasing of caller objects)', async () => {
    const store = createMemoryStore();
    const s = save();
    const id = await store.create(s);
    s.currentNodeId = 'MUTATED';
    expect((await store.get(id))!.currentNodeId).toBe('n1');
  });
});
