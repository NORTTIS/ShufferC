import request from 'supertest';
import { createApp } from './api';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';

function app() {
  return createApp(createGameSession(createMemoryStore()));
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
