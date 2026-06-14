import { generateFramework } from './frameworkGen';
import { createFakeToolProvider, ToolCall } from './provider';
import { SAMPLE_BUNDLE, ATTRIBUTE_DB, EFFECT_DB, ITEM_DB, SKILL_DB, ENEMY_DB } from '../../shared/fixtures';
import { ContentSet, RouteBundle } from '../../shared/types';

const content: ContentSet = {
  attributes: ATTRIBUTE_DB, effects: EFFECT_DB, items: ITEM_DB, skills: SKILL_DB, enemies: ENEMY_DB,
};
const params = { contextText: 'ctx', title: 'T' };

// submit_route receives nodes as an ARRAY (the model cannot emit a keyed record).
const submitArgs = (b: RouteBundle) => ({ route: structuredClone(b.route), nodes: Object.values(structuredClone(b.nodes)) });
const submit = (b: RouteBundle): ToolCall => ({ name: 'submit_route', args: submitArgs(b) });

describe('generateFramework (tool loop)', () => {
  it('submits a route that references only existing content', async () => {
    const provider = createFakeToolProvider([[submit(SAMPLE_BUNDLE)]]);
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bundle.route.status).toBe('draft');
      expect(res.bundle.route.sourceNovelId).toBe('adhoc');
      expect(res.toolCalls).toBe(1);
    }
  });

  it('creates a new enemy then references it in the submitted route', async () => {
    const b = structuredClone(SAMPLE_BUNDLE);
    b.nodes['n1'].combat = { enemyIds: ['ice_wraith'] };
    const provider = createFakeToolProvider([[
      { name: 'create_enemy', args: { id: 'ice_wraith', name: 'Ice Wraith', stats: { str: 6 }, hp: 12, skillPriority: [] } },
      submit(b),
    ]]);
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bundle.stagedContent?.enemies['ice_wraith']?.name).toBe('Ice Wraith');
      expect(res.toolCalls).toBe(2);
    }
  });

  it('returns a tool error for an invalid create, then succeeds after correction', async () => {
    const provider = createFakeToolProvider([[
      { name: 'create_effect', args: { id: 'frost', name: 'Frost', archetype: 'BOGUS', kind: 'dot' } },
      { name: 'create_effect', args: { id: 'frost', name: 'Frost', archetype: 'dot', kind: 'dot', magnitude: 2, duration: 2 } },
      submit(SAMPLE_BUNDLE),
    ]]);
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bundle.stagedContent?.effects['frost']).toBeDefined();
  });

  it('rejects creating an id that already exists globally', async () => {
    const provider = createFakeToolProvider([[
      { name: 'create_attribute', args: { id: 'str', name: 'Strength', abbrev: 'STR', roles: ['core'] } },
    ]]);
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(false);
  });

  it('fails when the model never submits a route', async () => {
    const provider = createFakeToolProvider([[
      { name: 'create_enemy', args: { id: 'wraith', name: 'Wraith', stats: { str: 5 }, hp: 8, skillPriority: [] } },
    ]]);
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.length).toBeGreaterThan(0);
  });

  it('rejects a submitted route whose combat references an unknown enemy', async () => {
    const b = structuredClone(SAMPLE_BUNDLE);
    b.nodes['n1'].combat = { enemyIds: ['does_not_exist'] };
    const provider = createFakeToolProvider([[submit(b)]]);
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(false);
  });

  it('treats moderation-blocked prose as a submit failure', async () => {
    const b = structuredClone(SAMPLE_BUNDLE);
    b.nodes['n1'].prose = 'There is gore everywhere.';
    const provider = createFakeToolProvider([[submit(b)]]);
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.message.includes('moderation'))).toBe(true);
  });

  it('stops the tool loop after a successful submit_route', async () => {
    const provider = createFakeToolProvider([[
      submit(SAMPLE_BUNDLE),
      { name: 'create_enemy', args: { id: 'post_submit', name: 'Post', stats: { str: 1 }, hp: 1, skillPriority: [] } },
    ]]);
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.toolCalls).toBe(1);                                   // create_enemy never ran
      expect(res.bundle.stagedContent?.enemies['post_submit']).toBeUndefined();
    }
  });

  it('honors maxToolCalls mid-batch (hard limit)', async () => {
    const mk = (id: string): ToolCall => ({ name: 'create_enemy', args: { id, name: id, stats: { str: 1 }, hp: 1, skillPriority: [] } });
    const provider = createFakeToolProvider([[mk('a'), mk('b'), mk('c')]]); // one turn, three calls
    const res = await generateFramework(provider, params, content, { maxToolCalls: 2 });
    expect(res.toolCalls).toBe(2); // stops after 2, never runs the 3rd
  });
});
