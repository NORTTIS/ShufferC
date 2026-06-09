import { buildFrameworkPrompt, buildEventPrompt } from './prompt';
import { ITEM_DB, SKILL_DB, ENEMY_DB } from '../../shared/fixtures';
import { Registries, StoryNode, GameRoute } from '../../shared/types';

const reg: Registries = { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB };

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
