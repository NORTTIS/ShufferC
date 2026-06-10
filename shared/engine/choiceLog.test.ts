import { resolveChoice } from './story';
import { mulberry32 } from './dice';
import { SAMPLE_NODES, SAMPLE_CHARACTER, SAMPLE_ROUTE } from '../fixtures';
import { SAVE_VERSION } from '../constants';
import { SaveState } from '../types';

function freshSave(): SaveState {
  return {
    version: SAVE_VERSION,
    routeId: 'demo-route',
    character: structuredClone(SAMPLE_CHARACTER),
    reputation: { hero: 0, villain: 0, factions: {} },
    flags: {},
    choiceLog: [],
    currentNodeId: 'n1',
    seed: 7,
    gold: 0,
    xp: 0,
    level: 1,
    consumables: {},
    vitals: { currentHp: 40, pendingBuffs: [] },
  };
}

describe('choiceLog annotations', () => {
  it('records routeId, roll and checkPassed on skill-check choices', () => {
    const res = resolveChoice(freshSave(), SAMPLE_NODES.n1, 'sneak', mulberry32(7));
    const entry = res.save.choiceLog[0];
    expect(entry.nodeId).toBe('n1');
    expect(entry.choiceId).toBe('sneak');
    expect(entry.routeId).toBe('demo-route');
    expect(entry.roll).toBe(res.roll);
    expect(entry.roll).toBeGreaterThanOrEqual(1);
    expect(entry.roll).toBeLessThanOrEqual(20);
    expect(entry.checkPassed).toBe(res.checkPassed);
  });

  it('records only routeId for plain choices (no roll fields)', () => {
    const res = resolveChoice(freshSave(), SAMPLE_NODES.n2, 'end');
    expect(res.save.choiceLog[0]).toEqual({ nodeId: 'n2', choiceId: 'end', routeId: 'demo-route' });
  });
});
