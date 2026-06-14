import { validateRouteBundle } from './validation';
import { SAMPLE_BUNDLE, ITEM_DB, SKILL_DB, ENEMY_DB, ATTRIBUTE_DB } from './fixtures';
import { RouteBundle, Registries } from './types';

const reg: Registries = { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB, attrDb: ATTRIBUTE_DB };
const clone = (): RouteBundle => structuredClone(SAMPLE_BUNDLE);

describe('validateRouteBundle', () => {
  it('returns [] for the valid sample bundle', () => {
    expect(validateRouteBundle(clone(), reg)).toEqual([]);
  });

  it('EMPTY_ROUTE when there are no nodes', () => {
    const b = clone();
    b.nodes = {};
    b.route.acts[0].nodeIds = [];
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('EMPTY_ROUTE');
  });

  it('DANGLING_NODE_REF when a choice points to a missing node', () => {
    const b = clone();
    b.nodes['n1'].choices[0].nextNodeId = 'ghost';
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('DANGLING_NODE_REF');
  });

  it('UNKNOWN_ENEMY when combat references an enemy not in the registry', () => {
    const b = clone();
    b.nodes['n1'].combat = { enemyIds: ['dragon'] };
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('UNKNOWN_ENEMY');
  });

  it('UNKNOWN_ITEM_REF when an outcome grants an unknown item', () => {
    const b = clone();
    b.nodes['n1'].choices[1].outcome = { addItems: ['excalibur'] };
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('UNKNOWN_ITEM_REF');
  });

  it('BAD_SHAPE when a skillCheck uses a non-stat', () => {
    const b = clone();
    // deliberately invalid stat — cast through unknown to bypass the compile-time type
    b.nodes['n1'].choices[1].skillCheck = { stat: 'luck' as unknown as 'dex', dc: 8 };
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('BAD_SHAPE');
  });

  it('UNREACHABLE_NODE when a node cannot be reached from the start', () => {
    const b = clone();
    b.nodes['island'] = { id: 'island', source: 'pregen', prose: 'Marooned.', choices: [] };
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('UNREACHABLE_NODE');
  });

  it('BAD_ENDING_CONDITION when the condition is not the supported form', () => {
    const b = clone();
    b.route.endings[0].condition = 'player.wins';
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('BAD_ENDING_CONDITION');
  });

  it('accepts a quoted node id in the ending condition (AI-generated routes often quote it)', () => {
    const b = clone();
    // n3 is a reachable terminal node in the sample; quote its id like the model does
    b.route.endings = [{ id: 'q', title: 'q', condition: "currentNodeId === 'n3'" }];
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).not.toContain('BAD_ENDING_CONDITION');
    expect(codes).not.toContain('NO_REACHABLE_ENDING');
  });

  it('NO_REACHABLE_ENDING when the only ending targets a non-terminal node', () => {
    const b = clone();
    // n1 has choices (non-terminal); point the ending at it
    b.route.endings = [{ id: 'x', title: 'x', condition: 'currentNodeId === n1' }];
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('NO_REACHABLE_ENDING');
  });

  it('NO_REACHABLE_ENDING when there are no endings at all', () => {
    const b = clone();
    b.route.endings = [];
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('NO_REACHABLE_ENDING');
  });

  it('BAD_SHAPE when a combat node has no enemies', () => {
    const b = clone();
    b.nodes['n1'].combat = { enemyIds: [] };
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('BAD_SHAPE');
  });

  it('accepts a skillCheck on a registered custom attribute', () => {
    const b = clone();
    const regWithLuck: Registries = { ...reg, attrDb: { ...ATTRIBUTE_DB, luck: { id: 'luck', name: 'Luck', abbrev: 'LCK', roles: ['core' as const], builtin: false } } };
    b.nodes['n1'].choices[1].skillCheck = { stat: 'luck', dc: 8 };
    expect(validateRouteBundle(b, regWithLuck)).toEqual([]);
  });

  it('BAD_SHAPE when statDelta targets an unknown attribute', () => {
    const b = clone();
    b.nodes['n1'].choices[1].outcome = { statDelta: { nope: 1 } as Record<string, number> };
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('BAD_SHAPE');
  });
});
