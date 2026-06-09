import { buildPlayerActor, buildEnemyActor } from './character';
import { runCombat } from './combat';
import { resolveChoice } from './story';
import { serialize, deserialize } from './save';
import { mulberry32 } from './dice';
import { SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_CHARACTER, SAMPLE_NODES, SAMPLE_ROUTE } from '../fixtures';
import { SaveState } from '../types';
import { SAVE_VERSION } from '../constants';

describe('engine integration (hardcoded route)', () => {
  it('runs a combat from fixtures and produces a winner + non-empty log', () => {
    const player = buildPlayerActor(SAMPLE_CHARACTER, ITEM_DB, SKILL_DB);
    const goblin = buildEnemyActor(ENEMY_DB.goblin, SKILL_DB);
    const result = runCombat({ player, enemies: [goblin], seed: 11 });
    expect(['player', 'enemies', 'draw']).toContain(result.winner);
    expect(result.log.length).toBeGreaterThan(0);
  });

  it('walks the demo route via choices and reaches the final node', () => {
    let state: SaveState = {
      version: SAVE_VERSION, routeId: SAMPLE_ROUTE.id,
      character: { ...SAMPLE_CHARACTER, baseStats: { ...SAMPLE_CHARACTER.baseStats } },
      reputation: { hero: 0, villain: 0, factions: {} },
      flags: {}, choiceLog: [], currentNodeId: 'n1', seed: 7,
      gold: 0, xp: 0, level: 1, consumables: {}, vitals: { currentHp: 40, pendingBuffs: [] },
    };
    const rng = mulberry32(state.seed);
    state = resolveChoice(state, SAMPLE_NODES['n1'], 'sneak', rng).save;
    expect(state.currentNodeId).toBe('n3');
    expect(state.choiceLog).toHaveLength(1);

    // save round-trips after progression
    expect(deserialize(serialize(state))).toEqual(state);
  });
});
