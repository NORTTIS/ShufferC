import request from 'supertest';
import { createApp } from './api';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';
import { createMemoryRouteStore } from './store/memoryRouteStore';
import { createMemoryContentStores } from './store/contentStores';
import { createFakeProvider, AIProvider } from './ai/provider';
import { createAuth } from './auth';
import { BACKGROUNDS } from '../shared/backgrounds';
import { SAMPLE_BUNDLE } from '../shared/fixtures';
import { createMemoryNovelStore } from './rag/novelStore';
import { createFakeEmbedder, EmbeddingProvider } from './rag/embeddingProvider';
import { createMemoryPlayerAuth } from './playerAuth/memoryPlayerAuth';

const ADMIN = { email: 'admin@test', password: 'pw' };
const PLAYER = { email: 'p@test.co', password: 'secret1' };

function app(
  provider: AIProvider = createFakeProvider([]),
  embedder: EmbeddingProvider = createFakeEmbedder(),
) {
  const routes = createMemoryRouteStore([structuredClone(SAMPLE_BUNDLE)]);
  const { novels, embeddings } = createMemoryNovelStore();
  const content = createMemoryContentStores();
  const saves = createMemoryStore();
  const session = createGameSession(saves, {
    backgrounds: BACKGROUNDS, content,
    routes, provider, embedder, embeddings,
  });
  return createApp(session, {
    provider, routes,
    content,
    auth: createAuth(ADMIN),
    novels, embeddings, embedder,
  }, { auth: createMemoryPlayerAuth(), saves });
}

async function token(a: ReturnType<typeof app>): Promise<string> {
  const res = await request(a).post('/admin/login').send(ADMIN);
  return res.body.token as string;
}

async function playerToken(a: ReturnType<typeof app>): Promise<string> {
  const res = await request(a).post('/auth/register').send(PLAYER);
  expect(res.status).toBe(200);
  return res.body.token as string;
}

describe('REST API', () => {
  it('GET /backgrounds returns the presets', async () => {
    const res = await request(app()).get('/backgrounds');
    expect(res.status).toBe(200);
    expect(res.body.map((b: { id: string }) => b.id).sort()).toEqual(['fighter', 'mage', 'rogue']);
  });

  it('POST /sessions creates a session and returns the start node', async () => {
    const a = app();
    const t = await playerToken(a);
    const res = await request(a).post('/sessions').set('Authorization', `Bearer ${t}`).send({ backgroundId: 'rogue' });
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.node.id).toBe('n1');
    expect(res.body.effectiveStats.str).toBe(9);
  });

  it('POST /sessions with bad background returns 400', async () => {
    const a = app();
    const t = await playerToken(a);
    const res = await request(a).post('/sessions').set('Authorization', `Bearer ${t}`).send({ backgroundId: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/background/i);
  });

  it('GET /sessions/:id returns 404 for an unknown id', async () => {
    const a = app();
    const t = await playerToken(a);
    const res = await request(a).get('/sessions/missing').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });

  it('POST /sessions/:id/choice (sneak) advances the node', async () => {
    const a = app();
    const t = await playerToken(a);
    const created = await request(a).post('/sessions').set('Authorization', `Bearer ${t}`).send({ backgroundId: 'rogue' });
    const id = created.body.sessionId;
    const res = await request(a).post(`/sessions/${id}/choice`).set('Authorization', `Bearer ${t}`).send({ choiceId: 'sneak' });
    expect(res.status).toBe(200);
    expect(res.body.save.currentNodeId).toBe('n3');
  });

  it('POST /sessions/:id/choice (fight) without skillPriority returns 400', async () => {
    const a = app();
    const t = await playerToken(a);
    const created = await request(a).post('/sessions').set('Authorization', `Bearer ${t}`).send({ backgroundId: 'fighter' });
    const id = created.body.sessionId;
    const res = await request(a).post(`/sessions/${id}/choice`).set('Authorization', `Bearer ${t}`).send({ choiceId: 'fight' });
    expect(res.status).toBe(400);
  });

  it('POST /sessions/:id/continue returns 409 when no further route remains', async () => {
    const a = app(); // default deps: a single published route, consumed by newGame
    const t = await playerToken(a);
    const created = await request(a).post('/sessions').set('Authorization', `Bearer ${t}`).send({ backgroundId: 'rogue' });
    const id = created.body.sessionId as string;
    const res = await request(a).post(`/sessions/${id}/continue`).set('Authorization', `Bearer ${t}`).send();
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no more routes/i);
  });

  it('POST /sessions/:id/equip recomputes effective stats', async () => {
    const a = app();
    const t = await playerToken(a);
    const created = await request(a).post('/sessions').set('Authorization', `Bearer ${t}`).send({ backgroundId: 'rogue' });
    const id = created.body.sessionId;
    const res = await request(a).post(`/sessions/${id}/equip`).set('Authorization', `Bearer ${t}`).send({ slot: 'weapon', itemId: null });
    expect(res.status).toBe(200);
    expect(res.body.effectiveStats.str).toBe(7);
  });
});

describe('Admin auth', () => {
  it('POST /admin/login with correct creds returns a token', async () => {
    const res = await request(app()).post('/admin/login').send(ADMIN);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('POST /admin/login with wrong creds returns 401', async () => {
    const res = await request(app()).post('/admin/login').send({ email: 'admin@test', password: 'bad' });
    expect(res.status).toBe(401);
  });

  it('GET /admin/routes without a token returns 401', async () => {
    const res = await request(app()).get('/admin/routes');
    expect(res.status).toBe(401);
  });

  it('GET /admin/routes with a bearer token returns 200', async () => {
    const a = app();
    const t = await token(a);
    const res = await request(a).get('/admin/routes').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /admin serves the console HTML', async () => {
    const res = await request(app()).get('/admin');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="login"');
  });

  it('GET /admin/status with a token reports provider availability', async () => {
    const a = app();
    const t = await token(a);
    const res = await request(a).get('/admin/status').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.providerAvailable).toBe('boolean');
  });
});

describe('Admin REST + AI route e2e', () => {
  // The provider returns the model's "gen" shape: nodes as an array.
  function genBundle() {
    const b = structuredClone(SAMPLE_BUNDLE);
    b.route.id = 'ai-route-1';
    b.route.title = 'AI Generated';
    b.route.status = 'draft';
    return { route: b.route, nodes: Object.values(b.nodes) };
  }

  it('generate → publish → play a generated route end-to-end', async () => {
    const a = app(createFakeProvider([genBundle()]));
    const t = await token(a);
    const pt = await playerToken(a);
    const auth = { Authorization: `Bearer ${t}` };

    const gen = await request(a).post('/admin/routes/generate').set(auth).send({ contextText: 'ctx', title: 'AI Generated' });
    expect(gen.status).toBe(200);
    expect(gen.body.routeId).toBe('ai-route-1');

    const list = await request(a).get('/admin/routes').set(auth);
    expect(list.body.map((r: { id: string }) => r.id)).toContain('ai-route-1');

    const pub = await request(a).post('/admin/routes/ai-route-1/publish').set(auth);
    expect(pub.status).toBe(204);

    const play = await request(a).post('/sessions').set('Authorization', `Bearer ${pt}`).send({ backgroundId: 'rogue', routeId: 'ai-route-1' });
    expect(play.status).toBe(200);
    expect(play.body.save.routeId).toBe('ai-route-1');
    expect(play.body.node.id).toBe('n1');
  });

  it('returns 422 with errors when generation never validates', async () => {
    const a = app(createFakeProvider([{}, {}, {}]));
    const t = await token(a);
    const res = await request(a).post('/admin/routes/generate').set('Authorization', `Bearer ${t}`).send({ contextText: 'ctx', title: 'X' });
    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.attempts).toBe(3);
  });

  it('returns 503 when the provider is unavailable', async () => {
    const unavailable: AIProvider = { available: false, async generateStructured() { throw new Error('x'); } };
    const a = app(unavailable);
    const t = await token(a);
    const res = await request(a).post('/admin/routes/generate').set('Authorization', `Bearer ${t}`).send({ contextText: 'ctx', title: 'X' });
    expect(res.status).toBe(503);
  });

  it('publish of an unknown route returns 404', async () => {
    const a = app();
    const t = await token(a);
    const res = await request(a).post('/admin/routes/ghost/publish').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });
});

describe('Admin novels + RAG', () => {
  function genBundle() {
    const b = structuredClone(SAMPLE_BUNDLE);
    b.route.id = 'rag-route-1';
    b.route.title = 'From Novel';
    b.route.status = 'draft';
    return { route: b.route, nodes: Object.values(b.nodes) };
  }

  it('POST /admin/novels ingests a novel and returns id + chunkCount', async () => {
    const a = app();
    const t = await token(a);
    const res = await request(a).post('/admin/novels').set('Authorization', `Bearer ${t}`)
      .send({ title: 'Test Novel', text: 'once upon a time '.repeat(200) });
    expect(res.status).toBe(200);
    expect(typeof res.body.novelId).toBe('string');
    expect(res.body.chunkCount).toBeGreaterThan(0);
  });

  it('POST /admin/novels without title/text returns 400', async () => {
    const a = app();
    const t = await token(a);
    const res = await request(a).post('/admin/novels').set('Authorization', `Bearer ${t}`).send({ title: 'x' });
    expect(res.status).toBe(400);
  });

  it('GET then DELETE /admin/novels/:id', async () => {
    const a = app();
    const t = await token(a);
    const auth = { Authorization: `Bearer ${t}` };
    const created = await request(a).post('/admin/novels').set(auth).send({ title: 'N', text: 'hello world' });
    const id = created.body.novelId as string;
    expect((await request(a).get(`/admin/novels/${id}`).set(auth)).status).toBe(200);
    expect((await request(a).delete(`/admin/novels/${id}`).set(auth)).status).toBe(204);
    expect((await request(a).get(`/admin/novels/${id}`).set(auth)).status).toBe(404);
  });

  it('POST /admin/routes/generate with novelId grounds generation and tags sourceNovelId', async () => {
    const a = app(createFakeProvider([genBundle()]));
    const t = await token(a);
    const auth = { Authorization: `Bearer ${t}` };
    const novel = await request(a).post('/admin/novels').set(auth).send({ title: 'N', text: 'a dark tower rose' });
    const novelId = novel.body.novelId as string;

    const gen = await request(a).post('/admin/routes/generate').set(auth)
      .send({ novelId, title: 'From Novel' });
    expect(gen.status).toBe(200);
    expect(gen.body.routeId).toBe('rag-route-1');
    expect(gen.body.bundle.route.sourceNovelId).toBe(novelId);
  });

  it('POST /admin/novels returns 503 when the embedder is unavailable', async () => {
    const offline: EmbeddingProvider = { available: false, async embed() { throw new Error('x'); } };
    const a = app(createFakeProvider([]), offline);
    const t = await token(a);
    const res = await request(a).post('/admin/novels').set('Authorization', `Bearer ${t}`).send({ title: 'N', text: 'x' });
    expect(res.status).toBe(503);
  });
});

describe('shop/use routes', () => {
  it('admin sets a merchant; requires auth', async () => {
    const a = app();
    await request(a).post('/admin/routes/demo-route/nodes/n2/merchant').send({ stock: [{ itemId: 'dagger' }] }).expect(401);
    const t = await token(a);
    await request(a).post('/admin/routes/demo-route/nodes/n2/merchant')
      .set('Authorization', `Bearer ${t}`).send({ stock: [{ itemId: 'dagger' }] }).expect(204);
  });

  it('admin merchant rejects unknown items', async () => {
    const a = app();
    const t = await token(a);
    await request(a).post('/admin/routes/demo-route/nodes/n2/merchant')
      .set('Authorization', `Bearer ${t}`).send({ stock: [{ itemId: 'ghost' }] }).expect(400);
  });

  it('player can read the shop after the merchant is set', async () => {
    const a = app();
    const t = await token(a);
    const pt = await playerToken(a);
    await request(a).post('/admin/routes/demo-route/nodes/n1/merchant')
      .set('Authorization', `Bearer ${t}`).send({ stock: [{ itemId: 'dagger', price: 5 }] }).expect(204);
    const { body: ng } = await request(a).post('/sessions').set('Authorization', `Bearer ${pt}`).send({ backgroundId: 'rogue', routeId: 'demo-route' }).expect(200);
    const { body: shop } = await request(a).get(`/sessions/${ng.sessionId}/shop`).set('Authorization', `Bearer ${pt}`).expect(200);
    expect(shop.stock[0].price).toBe(5);
  });

  it('POST /buy is wired (400 when no merchant at the current node)', async () => {
    const a = app();
    const pt = await playerToken(a);
    const { body: ng } = await request(a).post('/sessions').set('Authorization', `Bearer ${pt}`).send({ backgroundId: 'rogue', routeId: 'demo-route' }).expect(200);
    await request(a).post(`/sessions/${ng.sessionId}/buy`).set('Authorization', `Bearer ${pt}`).send({ itemId: 'dagger' }).expect(400);
  });

  it('POST /use is wired (400 when item not owned)', async () => {
    const a = app();
    const pt = await playerToken(a);
    const { body: ng } = await request(a).post('/sessions').set('Authorization', `Bearer ${pt}`).send({ backgroundId: 'rogue', routeId: 'demo-route' }).expect(200);
    await request(a).post(`/sessions/${ng.sessionId}/use`).set('Authorization', `Bearer ${pt}`).send({ itemId: 'healPotion' }).expect(400);
  });
});

describe('POST /admin/routes/:id/nodes/:nodeId/source', () => {
  it('flips a node source and is reflected in the route', async () => {
    const a = app();
    const t = await token(a);
    const auth = { Authorization: `Bearer ${t}` };
    const res = await request(a).post('/admin/routes/demo-route/nodes/n3/source').set(auth).send({ source: 'live' });
    expect(res.status).toBe(204);
    const got = await request(a).get('/admin/routes/demo-route').set(auth);
    expect(got.body.nodes.n3.source).toBe('live');
  });

  it('rejects a bad source value with 400', async () => {
    const a = app();
    const t = await token(a);
    const res = await request(a).post('/admin/routes/demo-route/nodes/n3/source').set('Authorization', `Bearer ${t}`).send({ source: 'nope' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown node', async () => {
    const a = app();
    const t = await token(a);
    const res = await request(a).post('/admin/routes/demo-route/nodes/ghost/source').set('Authorization', `Bearer ${t}`).send({ source: 'live' });
    expect(res.status).toBe(404);
  });

  it('requires auth', async () => {
    const res = await request(app()).post('/admin/routes/demo-route/nodes/n3/source').send({ source: 'live' });
    expect(res.status).toBe(401);
  });

  it('end-to-end: mark a node live → player sees Flash-enriched prose', async () => {
    // demo-route n3 is terminal (0 choices) → overlay has 0 choiceTexts.
    const a = app(createFakeProvider([{ prose: 'a generated ending', choiceTexts: [] }]));
    const t = await token(a);
    const pt = await playerToken(a);
    const auth = { Authorization: `Bearer ${t}` };
    await request(a).post('/admin/routes/demo-route/nodes/n3/source').set(auth).send({ source: 'live' });

    const created = await request(a).post('/sessions').set('Authorization', `Bearer ${pt}`).send({ backgroundId: 'rogue' });
    const id = created.body.sessionId;
    const choice = await request(a).post(`/sessions/${id}/choice`).set('Authorization', `Bearer ${pt}`).send({ choiceId: 'sneak' }); // n1 → n3
    expect(choice.status).toBe(200);
    expect(choice.body.save.currentNodeId).toBe('n3');
    expect(choice.body.node.prose).toBe('a generated ending');
  });
});

describe('Player auth', () => {
  it('POST /auth/register returns a session', async () => {
    const res = await request(app()).post('/auth/register').send(PLAYER);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.user.email).toBe('p@test.co');
  });

  it('POST /auth/register rejects a duplicate email with 409', async () => {
    const a = app();
    await request(a).post('/auth/register').send(PLAYER);
    const res = await request(a).post('/auth/register').send(PLAYER);
    expect(res.status).toBe(409);
  });

  it('POST /auth/register rejects bad input with 400', async () => {
    expect((await request(app()).post('/auth/register').send({ email: 'nope', password: 'secret1' })).status).toBe(400);
    expect((await request(app()).post('/auth/register').send({ email: 'p@test.co', password: '123' })).status).toBe(400);
  });

  it('POST /auth/login round-trips and rejects wrong credentials', async () => {
    const a = app();
    await request(a).post('/auth/register').send(PLAYER);
    const ok = await request(a).post('/auth/login').send(PLAYER);
    expect(ok.status).toBe(200);
    expect(typeof ok.body.token).toBe('string');
    const bad = await request(a).post('/auth/login').send({ ...PLAYER, password: 'wrong1' });
    expect(bad.status).toBe(401);
  });

  it('POST /auth/refresh rotates tokens', async () => {
    const a = app();
    const reg = await request(a).post('/auth/register').send(PLAYER);
    const res = await request(a).post('/auth/refresh').send({ refreshToken: reg.body.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.token).not.toBe(reg.body.token);
  });

  it('game endpoints require a player token', async () => {
    const a = app();
    const routes: Array<[method: 'get' | 'post', path: string]> = [
      ['post', '/sessions'],
      ['get', '/sessions/some-id'],
      ['post', '/sessions/some-id/choice'],
      ['post', '/sessions/some-id/continue'],
      ['post', '/sessions/some-id/equip'],
      ['get', '/sessions/some-id/shop'],
      ['post', '/sessions/some-id/buy'],
      ['post', '/sessions/some-id/use'],
      ['get', '/saves'],
    ];
    for (const [method, path] of routes) {
      expect((await request(a)[method](path)).status).toBe(401);
    }
    expect((await request(a).get('/backgrounds')).status).toBe(200); // stays public
  });

  it("a player cannot access another player's session (404)", async () => {
    const a = app();
    const t1 = await playerToken(a);
    const reg2 = await request(a).post('/auth/register').send({ email: 'other@test.co', password: 'secret1' });
    const t2 = reg2.body.token as string;
    const created = await request(a).post('/sessions').set('Authorization', `Bearer ${t1}`).send({ backgroundId: 'rogue' });
    const id = created.body.sessionId as string;
    expect((await request(a).get(`/sessions/${id}`).set('Authorization', `Bearer ${t2}`)).status).toBe(404);
    expect((await request(a).get(`/sessions/${id}`).set('Authorization', `Bearer ${t1}`)).status).toBe(200);
  });

  it('GET /saves lists only my saves, newest first', async () => {
    const a = app();
    const t1 = await playerToken(a);
    const reg2 = await request(a).post('/auth/register').send({ email: 'other@test.co', password: 'secret1' });
    const t2 = reg2.body.token as string;
    const mine = await request(a).post('/sessions').set('Authorization', `Bearer ${t1}`).send({ backgroundId: 'rogue' });
    await request(a).post('/sessions').set('Authorization', `Bearer ${t2}`).send({ backgroundId: 'mage' });
    const res = await request(a).get('/saves').set('Authorization', `Bearer ${t1}`);
    expect(res.status).toBe(200);
    expect(res.body.map((s: { id: string }) => s.id)).toEqual([mine.body.sessionId]);
    expect(res.body[0].routeId).toBeDefined();
    expect(typeof res.body[0].updatedAt).toBe('string');
  });
});
