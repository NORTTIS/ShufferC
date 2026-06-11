import request from 'supertest';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';
import { serialize, deserialize } from '../shared/engine/save';
import { createMemoryRouteStore } from './store/memoryRouteStore';
import { createMemoryContentStores } from './store/contentStores';
import { createApp } from './api';
import { createFakeProvider } from './ai/provider';
import { createFakeEmbedder } from './rag/embeddingProvider';
import { createMemoryNovelStore } from './rag/novelStore';
import { createAuth } from './auth';
import { createMemoryPlayerAuth } from './playerAuth/memoryPlayerAuth';
import { ITEM_DB, SAMPLE_BUNDLE } from '../shared/fixtures';
import { BACKGROUNDS } from '../shared/backgrounds';

const ADMIN = { email: 'admin@test', password: 'pw' };
function adminApp() {
  const routes = createMemoryRouteStore([structuredClone(SAMPLE_BUNDLE)]);
  const content = createMemoryContentStores();
  const { novels, embeddings } = createMemoryNovelStore();
  const provider = createFakeProvider([]);
  const embedder = createFakeEmbedder();
  const saves = createMemoryStore();
  const session = createGameSession(saves, { backgrounds: BACKGROUNDS, content, routes, provider, embedder, embeddings });
  return createApp(session, { provider, routes, content, auth: createAuth(ADMIN), novels, embeddings, embedder }, { auth: createMemoryPlayerAuth(), saves });
}

describe('server e2e (hardcoded route)', () => {
  it('rogue sneaks past and reaches the keep', async () => {
    const s = createGameSession(createMemoryStore());
    const { sessionId } = await s.newGame('u-test', 'rogue');
    const res = await s.applyChoice(sessionId, 'sneak');
    expect(res.save.currentNodeId).toBe('n3');
    expect(res.node.choices).toHaveLength(0); // terminal node
    expect(res.ending).toBe('reach-keep');

    // save round-trips after progression
    expect(deserialize(serialize(res.save))).toEqual(res.save);
  });

  it('fighter fights through the gate and reaches the cleared node', async () => {
    const s = createGameSession(createMemoryStore());
    const { sessionId } = await s.newGame('u-test', 'fighter');
    const res = await s.applyChoice(sessionId, 'fight', ['slash']);
    expect(res.combat!.winner).toBe('player');
    expect(res.save.currentNodeId).toBe('n2');

    // continue from n2 to n3 via its single choice
    const next = await s.applyChoice(sessionId, 'end');
    expect(next.save.currentNodeId).toBe('n3');
  });
});

describe('combat rewards', () => {
  it('grants gold/xp on a winning fight and carries HP forward', async () => {
    const s = createGameSession(createMemoryStore());
    const { sessionId, save } = await s.newGame('u-test', 'fighter');
    expect(save.gold).toBe(0);
    const startHp = save.vitals.currentHp;
    expect(startHp).toBeGreaterThan(0);
    const res = await s.applyChoice(sessionId, 'fight', ['slash']);
    expect(res.combat!.winner).toBe('player');
    expect(res.save.gold).toBeGreaterThan(0);
    expect(res.save.xp).toBe(25);
    expect(res.reward).toBeDefined();
    expect(res.save.vitals.currentHp).toBeLessThanOrEqual(startHp);
  });
});

function shopRouteDeps() {
  const bundle = {
    route: { id: 'shop-rt', title: 'Shop', sourceNovelId: 'x', acts: [{ id: 'a', title: 'A', nodeIds: ['s1'] }], itemPool: [], enemyPool: [], endings: [], status: 'published' as const },
    nodes: { s1: { id: 's1', source: 'pregen' as const, prose: 'A merchant waits.', choices: [], merchant: { stock: [{ itemId: 'dagger', price: 10 }] } } },
  };
  return { backgrounds: BACKGROUNDS, content: createMemoryContentStores(), routes: createMemoryRouteStore([bundle]), random: () => 0 };
}

describe('shop', () => {
  it('lists stock for the current node and rejects a buy without enough gold', async () => {
    const s = createGameSession(createMemoryStore(), shopRouteDeps());
    const { sessionId } = await s.newGame('u-test', 'rogue', 'shop-rt');
    const shop = await s.getShop(sessionId);
    expect(shop.stock).toEqual([{ item: ITEM_DB.dagger, price: 10 }]);
    await expect(s.buy(sessionId, 'dagger')).rejects.toMatchObject({ status: 400 });
  });
});

describe('useItem', () => {
  it('uses a healing potion won from combat: restores HP (clamped) and consumes it', async () => {
    const s = createGameSession(createMemoryStore());
    const { sessionId } = await s.newGame('u-test', 'fighter');
    const after = await s.applyChoice(sessionId, 'fight', ['slash']); // win → goblin drops healPotion (chance 1)
    expect(after.save.consumables.healPotion).toBe(1);
    const hpAfterFight = after.save.vitals.currentHp;
    const used = await s.useItem(sessionId, 'healPotion');
    expect(used.save.consumables.healPotion).toBeUndefined();             // consumed (qty 0 → key deleted)
    expect(used.save.vitals.currentHp).toBeGreaterThanOrEqual(hpAfterFight); // healed, clamped to maxHp
  });

  it('rejects using an item not owned', async () => {
    const s = createGameSession(createMemoryStore());
    const { sessionId } = await s.newGame('u-test', 'fighter');
    await expect(s.useItem(sessionId, 'healPotion')).rejects.toMatchObject({ status: 400 });
  });
});

describe('equip HP clamp', () => {
  it('clamps currentHp when unequipping a max-HP item drops max below current', async () => {
    const s = createGameSession(createMemoryStore());
    const { sessionId, save } = await s.newGame('u-test', 'fighter'); // fighter starts with ringOfRegen equipped (con +2 → higher maxHp)
    // currentHp starts at full (with ring). Unequip the ring → maxHp drops → currentHp must clamp down.
    const before = save.vitals.currentHp;
    const res = await s.equip(sessionId, 'ring', null);
    const newMax = res.effectiveStats.con * 5 + 20; // deriveMaxHp = BASE_HP(20) + con*HP_PER_CON(5)
    expect(res.save.vitals.currentHp).toBeLessThanOrEqual(newMax);
    expect(res.save.vitals.currentHp).toBeLessThanOrEqual(before);
  });
});

describe('admin-authored content is playable', () => {
  it('an admin-authored attribute + item flows into the engine', async () => {
    const a = adminApp();
    const t = (await request(a).post('/admin/login').send(ADMIN)).body.token as string;
    const h = { Authorization: `Bearer ${t}` };
    await request(a).post('/admin/attributes').set(h).send({ id: 'armor', name: 'Armor', abbrev: 'ARM', roles: ['defense'] }).expect(200);
    await request(a).post('/admin/items').set(h).send({ id: 'aegis', name: 'Aegis', slot: 'armor', kind: 'gear', statMods: { armor: 4 }, storyTags: [] }).expect(200);
    // the item is now in the live registry the session reads
    const list = await request(a).get('/admin/items').set(h);
    expect(list.body.map((i: any) => i.id)).toContain('aegis');
  });
});
