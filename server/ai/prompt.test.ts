import { buildFrameworkPrompt, buildEventPrompt, buildToolPrompt } from './prompt';
import { ITEM_DB, SKILL_DB, ENEMY_DB, ATTRIBUTE_DB } from '../../shared/fixtures';
import { Registries, StoryNode, GameRoute, ContentSet } from '../../shared/types';

const reg: Registries = { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB, attrDb: ATTRIBUTE_DB };

describe('buildFrameworkPrompt', () => {
  it('embeds the title, registry ids, context, and the pregen instruction', () => {
    const p = buildFrameworkPrompt(
      { contextText: 'A knight guards a bridge.', title: 'The Bridge', nodeCount: 3 },
      reg,
    );
    expect(p).toContain('The Bridge');
    expect(p).toContain('goblin');   // enemy id from registry
    expect(p).toContain('dagger');   // item id from registry
    expect(p).toContain('A knight guards a bridge.');
    expect(p).toContain('pregen');
  });

  it('appends prior errors on retry so the model can self-correct', () => {
    const p = buildFrameworkPrompt(
      { contextText: 'ctx', title: 'T' },
      reg,
      [{ path: 'nodes.n1.combat', code: 'UNKNOWN_ENEMY', message: 'unknown enemy dragon' }],
    );
    expect(p).toContain('UNKNOWN_ENEMY');
    expect(p).toContain('unknown enemy dragon');
  });
});

const stub: StoryNode = {
  id: 's1', source: 'live', prose: 'A plain doorway.',
  choices: [{ id: 'a', text: 'Enter', nextNodeId: 's2' }, { id: 'b', text: 'Leave', nextNodeId: 's3' }],
};
const route: GameRoute = {
  id: 'r', title: 'Test', sourceNovelId: 'novel-1', acts: [], itemPool: [], enemyPool: [],
  endings: [], status: 'published',
};

describe('buildEventPrompt', () => {
  it('embeds the stub prose, RAG context, path summary, and the exact choice count', () => {
    const p = buildEventPrompt(stub, route, 'NOVEL CONTEXT HERE', 'Reputation hero=3');
    expect(p).toContain('A plain doorway.');
    expect(p).toContain('NOVEL CONTEXT HERE');
    expect(p).toContain('Reputation hero=3');
    expect(p).toContain('exactly 2');
  });
  it('appends prior errors on retry', () => {
    const p = buildEventPrompt(stub, route, '', '', [{ path: 'choiceTexts', code: 'BAD_SHAPE', message: 'wrong count' }]);
    expect(p).toContain('wrong count');
  });
});

const content: ContentSet = {
  attributes: { str: { id: 'str', name: 'Strength', abbrev: 'STR', roles: ['core'], builtin: true } },
  effects: {}, items: {}, skills: {},
  enemies: { goblin: { id: 'goblin', name: 'Goblin', stats: { str: 3 }, hp: 5, skillPriority: [] } },
};

describe('buildToolPrompt', () => {
  it('names the tools, the reuse rule, and lists existing content ids', () => {
    const p = buildToolPrompt({ contextText: 'a dark forest', title: 'Quest', nodeCount: 3 }, content);
    expect(p).toContain('submit_route');
    expect(p).toContain('create_enemy');
    expect(p).toMatch(/prefer reusing/i);
    expect(p).toContain('goblin');           // existing enemy id surfaced
    expect(p).toContain('a dark forest');    // source material included
    expect(p).toContain('3 story nodes');
  });
});
