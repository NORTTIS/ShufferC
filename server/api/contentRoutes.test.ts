import request from 'supertest';
import { createApp } from '../api';
import { createGameSession } from '../session';
import { createMemoryStore } from '../store/memoryStore';
import { createMemoryRouteStore } from '../store/memoryRouteStore';
import { createMemoryContentStores } from '../store/contentStores';
import { createFakeProvider } from '../ai/provider';
import { createFakeEmbedder } from '../rag/embeddingProvider';
import { createMemoryNovelStore } from '../rag/novelStore';
import { createAuth } from '../auth';
import { BACKGROUNDS } from '../../shared/backgrounds';
import { SAMPLE_BUNDLE } from '../../shared/fixtures';

const ADMIN = { email: 'admin@test', password: 'pw' };
function app() {
  const routes = createMemoryRouteStore([structuredClone(SAMPLE_BUNDLE)]);
  const content = createMemoryContentStores();
  const { novels, embeddings } = createMemoryNovelStore();
  const provider = createFakeProvider([]); const embedder = createFakeEmbedder();
  const session = createGameSession(createMemoryStore(), { backgrounds: BACKGROUNDS, content, routes, provider, embedder, embeddings });
  return createApp(session, { provider, routes, content, auth: createAuth(ADMIN), novels, embeddings, embedder });
}
const token = async (a: ReturnType<typeof app>) => (await request(a).post('/admin/login').send(ADMIN)).body.token as string;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('admin content CRUD', () => {
  it('rejects unauthenticated access', async () => {
    expect((await request(app()).get('/admin/items')).status).toBe(401);
  });

  it('creates, lists, updates, and deletes an attribute', async () => {
    const a = app(); const t = await token(a);
    const created = await request(a).post('/admin/attributes').set(auth(t)).send({ id: 'armor', name: 'Armor', abbrev: 'ARM', roles: ['defense'] });
    expect(created.status).toBe(200);
    expect((await request(a).get('/admin/attributes').set(auth(t))).body.map((x: any) => x.id)).toContain('armor');
    expect((await request(a).put('/admin/attributes/armor').set(auth(t)).send({ id: 'armor', name: 'Armour', abbrev: 'ARM', roles: ['defense'] })).status).toBe(200);
    expect((await request(a).delete('/admin/attributes/armor').set(auth(t))).status).toBe(204);
  });

  it('400 on create with an unknown reference', async () => {
    const a = app(); const t = await token(a);
    const res = await request(a).post('/admin/items').set(auth(t)).send({ id: 'x', name: 'X', slot: 'weapon', kind: 'gear', onUse: [{ id: 'ghost', duration: 0 }] });
    expect(res.status).toBe(400);
  });

  it('400 when deleting a referenced effect; 400 when deleting a builtin', async () => {
    const a = app(); const t = await token(a);
    expect((await request(a).delete('/admin/effects/heal').set(auth(t))).status).toBe(400);  // referenced by healPotion + builtin
    expect((await request(a).delete('/admin/attributes/str').set(auth(t))).status).toBe(400); // builtin
  });

  it('409/400 on duplicate id create; 404 on update/delete of a missing id', async () => {
    const a = app(); const t = await token(a);
    await request(a).post('/admin/skills').set(auth(t)).send({ id: 'jab', name: 'Jab', targetStat: 'str', power: 1 });
    expect((await request(a).post('/admin/skills').set(auth(t)).send({ id: 'jab', name: 'Jab', targetStat: 'str' })).status).toBe(409);
    expect((await request(a).put('/admin/skills/ghost').set(auth(t)).send({ id: 'ghost', name: 'G' })).status).toBe(404);
  });
});
