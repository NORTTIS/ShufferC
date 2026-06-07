import request from 'supertest';
import { createApp } from './api';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';
import { createMemoryRouteStore } from './store/memoryRouteStore';
import { createFakeProvider, AIProvider } from './ai/provider';
import { BACKGROUNDS } from '../shared/backgrounds';
import { SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_BUNDLE } from '../shared/fixtures';

function app(provider: AIProvider = createFakeProvider([])) {
  const routes = createMemoryRouteStore([structuredClone(SAMPLE_BUNDLE)]);
  const session = createGameSession(createMemoryStore(), {
    backgrounds: BACKGROUNDS, itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB, routes,
  });
  return createApp(session, { provider, routes, registries: { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB } });
}

describe('REST API', () => {
  it('GET /backgrounds returns the presets', async () => {
    const res = await request(app()).get('/backgrounds');
    expect(res.status).toBe(200);
    expect(res.body.map((b: { id: string }) => b.id).sort()).toEqual(['fighter', 'mage', 'rogue']);
  });

  it('POST /sessions creates a session and returns the start node', async () => {
    const res = await request(app()).post('/sessions').send({ backgroundId: 'rogue' });
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.node.id).toBe('n1');
    expect(res.body.effectiveStats.str).toBe(9);
  });

  it('POST /sessions with bad background returns 400', async () => {
    const res = await request(app()).post('/sessions').send({ backgroundId: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/background/i);
  });

  it('GET /sessions/:id returns 404 for an unknown id', async () => {
    const res = await request(app()).get('/sessions/missing');
    expect(res.status).toBe(404);
  });

  it('POST /sessions/:id/choice (sneak) advances the node', async () => {
    const a = app();
    const created = await request(a).post('/sessions').send({ backgroundId: 'rogue' });
    const id = created.body.sessionId;
    const res = await request(a).post(`/sessions/${id}/choice`).send({ choiceId: 'sneak' });
    expect(res.status).toBe(200);
    expect(res.body.save.currentNodeId).toBe('n3');
  });

  it('POST /sessions/:id/choice (fight) without skillPriority returns 400', async () => {
    const a = app();
    const created = await request(a).post('/sessions').send({ backgroundId: 'fighter' });
    const id = created.body.sessionId;
    const res = await request(a).post(`/sessions/${id}/choice`).send({ choiceId: 'fight' });
    expect(res.status).toBe(400);
  });

  it('POST /sessions/:id/equip recomputes effective stats', async () => {
    const a = app();
    const created = await request(a).post('/sessions').send({ backgroundId: 'rogue' });
    const id = created.body.sessionId;
    const res = await request(a).post(`/sessions/${id}/equip`).send({ slot: 'weapon', itemId: null });
    expect(res.status).toBe(200);
    expect(res.body.effectiveStats.str).toBe(7);
  });
});

describe('Admin REST + AI route e2e', () => {
  function genBundle() {
    const b = structuredClone(SAMPLE_BUNDLE);
    b.route.id = 'ai-route-1';
    b.route.title = 'AI Generated';
    b.route.status = 'draft';
    return b;
  }

  it('generate → publish → play a generated route end-to-end', async () => {
    const a = app(createFakeProvider([genBundle()]));

    const gen = await request(a).post('/admin/routes/generate').send({ contextText: 'ctx', title: 'AI Generated' });
    expect(gen.status).toBe(200);
    expect(gen.body.routeId).toBe('ai-route-1');

    const list = await request(a).get('/admin/routes');
    expect(list.body.map((r: { id: string }) => r.id)).toContain('ai-route-1');

    const pub = await request(a).post('/admin/routes/ai-route-1/publish');
    expect(pub.status).toBe(204);

    const play = await request(a).post('/sessions').send({ backgroundId: 'rogue', routeId: 'ai-route-1' });
    expect(play.status).toBe(200);
    expect(play.body.save.routeId).toBe('ai-route-1');
    expect(play.body.node.id).toBe('n1');
  });

  it('returns 422 with errors when generation never validates', async () => {
    const a = app(createFakeProvider([{}, {}, {}]));
    const res = await request(a).post('/admin/routes/generate').send({ contextText: 'ctx', title: 'X' });
    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.attempts).toBe(3);
  });

  it('returns 503 when the provider is unavailable', async () => {
    const unavailable: AIProvider = { available: false, async generateStructured() { throw new Error('x'); } };
    const a = app(unavailable);
    const res = await request(a).post('/admin/routes/generate').send({ contextText: 'ctx', title: 'X' });
    expect(res.status).toBe(503);
  });

  it('publish of an unknown route returns 404', async () => {
    const res = await request(app()).post('/admin/routes/ghost/publish');
    expect(res.status).toBe(404);
  });
});
