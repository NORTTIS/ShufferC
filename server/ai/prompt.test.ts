import { buildFrameworkPrompt } from './prompt';
import { ITEM_DB, SKILL_DB, ENEMY_DB } from '../../shared/fixtures';
import { Registries } from '../../shared/types';

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
