import { createMemoryContentStores } from './contentStores';

describe('memory content stores', () => {
  it('seeds all five stores from fixtures', async () => {
    const c = createMemoryContentStores();
    expect((await c.attributes.get('con'))?.roles).toContain('maxHp');
    expect((await c.effects.get('poison'))?.archetype).toBe('dot');
    expect((await c.items.get('dagger'))?.slot).toBe('weapon');
    expect((await c.skills.get('slash'))?.name).toBe('Slash');
    expect((await c.enemies.get('goblin'))?.hp).toBe(18);
  });
});
