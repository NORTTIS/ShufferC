import { createMemoryRouteStore } from './memoryRouteStore';
import { SAMPLE_BUNDLE } from '../../shared/fixtures';
import { RouteBundle } from '../../shared/types';

function bundle(): RouteBundle {
  return {
    route: {
      id: 'rt', title: 'T', sourceNovelId: 'adhoc',
      acts: [{ id: 'a', title: 'A', nodeIds: ['n1'] }],
      itemPool: [], enemyPool: [], endings: [{ id: 'e', title: 'E', condition: 'currentNodeId === n1' }],
      status: 'draft',
    },
    nodes: { n1: { id: 'n1', source: 'pregen', prose: 'p', choices: [] } },
  };
}

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

describe('RouteStore.setNodeSource', () => {
  it('flips a node source and persists it', async () => {
    const store = createMemoryRouteStore([bundle()]);
    await store.setNodeSource('rt', 'n1', 'live');
    const got = await store.get('rt');
    expect(got!.nodes.n1.source).toBe('live');
    await store.setNodeSource('rt', 'n1', 'pregen');
    expect((await store.get('rt'))!.nodes.n1.source).toBe('pregen');
  });
  it('throws for an unknown route', async () => {
    const store = createMemoryRouteStore([bundle()]);
    await expect(store.setNodeSource('ghost', 'n1', 'live')).rejects.toThrow();
  });
  it('throws for an unknown node', async () => {
    const store = createMemoryRouteStore([bundle()]);
    await expect(store.setNodeSource('rt', 'ghost', 'live')).rejects.toThrow();
  });
});

describe('RouteStore.setMerchant', () => {
  it('sets and clears a node merchant', async () => {
    const store = createMemoryRouteStore([bundle()]);
    await store.setMerchant('rt', 'n1', { stock: [{ itemId: 'dagger', price: 12 }] });
    expect((await store.get('rt'))!.nodes.n1.merchant).toEqual({ stock: [{ itemId: 'dagger', price: 12 }] });
    await store.setMerchant('rt', 'n1', null);
    expect((await store.get('rt'))!.nodes.n1.merchant).toBeUndefined();
  });
  it('throws for an unknown route or node', async () => {
    const store = createMemoryRouteStore([bundle()]);
    await expect(store.setMerchant('ghost', 'n1', null)).rejects.toThrow();
    await expect(store.setMerchant('rt', 'ghost', null)).rejects.toThrow();
  });
});
