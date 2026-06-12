import { createDb } from './client';
import { createPgRouteStore } from '../store/pgRouteStore';
import { createPgSaveStore } from '../store/pgSaveStore';
import { createPgNovelStore } from '../rag/pgNovelStore';
import { SAMPLE_BUNDLE } from '../../shared/fixtures';
import { SaveState } from '../../shared/types';

// Runs ONLY when DATABASE_URL is set (e.g. a disposable test database). Skipped offline / in normal CI.
const url = process.env.DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe('Postgres adapters (live DB)', () => {
  const db = createDb(url as string);

  it('routes round-trip + publish', async () => {
    const store = createPgRouteStore(db);
    const bundle = structuredClone(SAMPLE_BUNDLE);
    bundle.route.id = `it-route-${Date.now()}`;
    bundle.route.status = 'draft';
    await store.create(bundle);
    expect((await store.get(bundle.route.id))?.route.id).toBe(bundle.route.id);
    await store.publish(bundle.route.id);
    expect((await store.get(bundle.route.id))?.route.status).toBe('published');
  });

  it('saves round-trip', async () => {
    const store = createPgSaveStore(db);
    const sample: SaveState = {
      version: 1, routeId: 'r',
      character: { background: 'rogue', baseStats: { str: 1, dex: 1, int: 1, wis: 1, cha: 1, con: 1 }, inventory: [], equipped: {}, skillPriority: [] },
      reputation: { hero: 0, villain: 0, factions: {} }, flags: {}, choiceLog: [], currentNodeId: 'n1', seed: 7,
      gold: 0, xp: 0, level: 1, consumables: {}, vitals: { currentHp: 40, pendingBuffs: [] },
    };
    const id = await store.create(sample, '00000000-0000-4000-8000-000000000001');
    expect((await store.get(id))?.currentNodeId).toBe('n1');
    await store.put(id, { ...sample, currentNodeId: 'n2' });
    expect((await store.get(id))?.currentNodeId).toBe('n2');
  });

  it('novels: ingest chunks then cosine search returns the nearest', async () => {
    const { novels, embeddings } = createPgNovelStore(db);
    const id = await novels.create(`it-novel-${Date.now()}`, 'text');
    const dim = 1536;
    const near = new Array(dim).fill(0); near[0] = 1;
    const far = new Array(dim).fill(0); far[1] = 1;
    await novels.setChunks(id, [
      { idx: 0, content: 'near', embedding: near },
      { idx: 1, content: 'far', embedding: far },
    ]);
    await novels.markReady(id);
    const hits = await embeddings.search(near, 1, id);
    expect(hits[0].content).toBe('near');
    await novels.remove(id);
  });
});
