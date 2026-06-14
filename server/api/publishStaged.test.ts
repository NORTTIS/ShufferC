import { flushStagedContent } from './publishStaged';
import { createMemoryContentStores } from '../store/contentStores';
import { emptyContentSet } from '../ai/contentSet';
import { GameError } from '../session';

describe('flushStagedContent', () => {
  it('writes staged entities into the content stores', async () => {
    const stores = createMemoryContentStores();
    const staged = emptyContentSet();
    staged.effects['frost'] = { id: 'frost', name: 'Frost', archetype: 'dot', kind: 'dot', magnitude: 2, duration: 2, builtin: false };
    staged.enemies['wraith'] = { id: 'wraith', name: 'Wraith', stats: { str: 5 }, hp: 8, skillPriority: [] };
    await flushStagedContent(stores, staged);
    expect(await stores.effects.get('frost')).not.toBeNull();
    expect(await stores.enemies.get('wraith')).not.toBeNull();
  });

  it('throws GameError(409) when a staged id collides with an existing entity', async () => {
    const stores = createMemoryContentStores();
    const existing = await stores.enemies.list();
    const staged = emptyContentSet();
    staged.enemies[existing[0].id] = { ...existing[0] };
    await expect(flushStagedContent(stores, staged)).rejects.toMatchObject({ status: 409 });
  });

  it('is a no-op for an empty staging set', async () => {
    const stores = createMemoryContentStores();
    await expect(flushStagedContent(stores, emptyContentSet())).resolves.toBeUndefined();
  });
});
