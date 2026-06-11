import { createMemoryStore } from './memoryStore';
import { SaveState, Stats } from '../../shared/types';

const baseStats: Stats = { str: 7, dex: 9, int: 6, wis: 5, cha: 8, con: 6 };

function save(): SaveState {
  return {
    version: 1, routeId: 'r1',
    character: { background: 'rogue', baseStats, inventory: [], equipped: {}, skillPriority: [] },
    reputation: { hero: 0, villain: 0, factions: {} },
    flags: {}, choiceLog: [], currentNodeId: 'n1', seed: 7,
    gold: 0, xp: 0, level: 1, consumables: {}, vitals: { currentHp: 40, pendingBuffs: [] },
  };
}

const SAVE_FIXTURE = save();

describe('memoryStore', () => {
  it('create returns a non-empty id and get round-trips the save', async () => {
    const store = createMemoryStore();
    const id = await store.create(save(), 'u1');
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
    const id = await store.create(save(), 'u1');
    const updated = { ...save(), currentNodeId: 'n3' };
    await store.put(id, updated);
    expect((await store.get(id))!.currentNodeId).toBe('n3');
  });

  it('stores an independent copy (no aliasing of caller objects)', async () => {
    const store = createMemoryStore();
    const s = save();
    const id = await store.create(s, 'u1');
    s.currentNodeId = 'MUTATED';
    expect((await store.get(id))!.currentNodeId).toBe('n1');
  });

  it('tracks the owner and lists saves per user', async () => {
    const store = createMemoryStore();
    const a = await store.create(SAVE_FIXTURE, 'u1');
    const b = await store.create(SAVE_FIXTURE, 'u2');
    expect(await store.owner(a)).toBe('u1');
    expect(await store.owner('missing')).toBeNull();
    const mine = await store.listByUser('u1');
    expect(mine.map((s) => s.id)).toEqual([a]);
    expect(mine[0].routeId).toBe(SAVE_FIXTURE.routeId);
    expect(typeof mine[0].updatedAt).toBe('string');
    expect((await store.listByUser('u2')).map((s) => s.id)).toEqual([b]);
  });
});
