import { createMemoryRouteStore } from './memoryRouteStore';
import { SAMPLE_BUNDLE } from '../../shared/fixtures';
import { RouteBundle } from '../../shared/types';

const draftBundle = (): RouteBundle => {
  const b = structuredClone(SAMPLE_BUNDLE);
  b.route.id = 'r1';
  b.route.status = 'draft';
  return b;
};

describe('memoryRouteStore', () => {
  it('create then get round-trips a clone (mutating the result does not affect the store)', async () => {
    const store = createMemoryRouteStore();
    const id = await store.create(draftBundle());
    expect(id).toBe('r1');
    const got = await store.get('r1');
    expect(got?.route.title).toBe(SAMPLE_BUNDLE.route.title);
    got!.route.title = 'mutated';
    const again = await store.get('r1');
    expect(again?.route.title).not.toBe('mutated');
  });

  it('get returns null for an unknown id', async () => {
    const store = createMemoryRouteStore();
    expect(await store.get('nope')).toBeNull();
  });

  it('list returns summaries; publish flips status to published', async () => {
    const store = createMemoryRouteStore([draftBundle()]);
    expect(await store.list()).toEqual([{ id: 'r1', title: SAMPLE_BUNDLE.route.title, status: 'draft' }]);
    await store.publish('r1');
    expect((await store.get('r1'))?.route.status).toBe('published');
  });

  it('publish throws for an unknown id', async () => {
    const store = createMemoryRouteStore();
    await expect(store.publish('ghost')).rejects.toThrow();
  });
});
