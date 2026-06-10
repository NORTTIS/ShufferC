import { createMemoryEntityStore } from './memoryEntityStore';
import { StoreError } from './EntityStore';

interface Thing { id: string; n: number; }

describe('memoryEntityStore', () => {
  it('seeds, lists clones, and round-trips create/update/remove', async () => {
    const store = createMemoryEntityStore<Thing>([{ id: 'a', n: 1 }]);
    expect(await store.list()).toEqual([{ id: 'a', n: 1 }]);

    const created = await store.create({ id: 'b', n: 2 });
    expect(created).toEqual({ id: 'b', n: 2 });
    expect((await store.all()).b.n).toBe(2);

    await store.update('a', { id: 'a', n: 9 });
    expect((await store.get('a'))?.n).toBe(9);

    await store.remove('a');
    expect(await store.get('a')).toBeNull();
  });

  it('list returns clones (mutating result does not mutate the store)', async () => {
    const store = createMemoryEntityStore<Thing>([{ id: 'a', n: 1 }]);
    (await store.list())[0].n = 99;
    expect((await store.get('a'))?.n).toBe(1);
  });

  it('create on an existing id throws conflict; update on a missing id throws notFound', async () => {
    const store = createMemoryEntityStore<Thing>([{ id: 'a', n: 1 }]);
    await expect(store.create({ id: 'a', n: 2 })).rejects.toMatchObject({ kind: 'conflict' });
    await expect(store.update('x', { id: 'x', n: 2 })).rejects.toMatchObject({ kind: 'notFound' });
  });
});
