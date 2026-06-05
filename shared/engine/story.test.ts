import { resolveChoice } from './story';
import { SaveState, StoryNode, Stats } from '../types';
import { mulberry32 } from './dice';

const baseStats: Stats = { str: 10, dex: 10, int: 10, wis: 10, cha: 10, con: 10 };

function save(): SaveState {
  return {
    version: 1, routeId: 'r1',
    character: { background: 'rogue', baseStats: { ...baseStats }, inventory: ['torch'], equipped: {}, skillPriority: [] },
    reputation: { hero: 0, villain: 0, factions: {} },
    flags: {}, choiceLog: [], currentNodeId: 'n1', seed: 42,
  };
}

const node: StoryNode = {
  id: 'n1', source: 'pregen', prose: 'A locked door blocks the way.',
  choices: [
    {
      id: 'persuade', text: 'Persuade the guard',
      skillCheck: { stat: 'cha', dc: 8 },
      outcome: { reputationDelta: { hero: 1, factions: { guards: 2 } }, setFlags: { doorOpen: true } },
      nextNodeId: 'n2',
    },
    {
      id: 'steal', text: 'Steal the key',
      outcome: { statDelta: { dex: 1 }, addItems: ['key'], removeItems: ['torch'], reputationDelta: { villain: 1 } },
      nextNodeId: 'n3',
    },
  ],
};

describe('resolveChoice', () => {
  it('does not mutate the input save', () => {
    const s = save();
    resolveChoice(s, node, 'steal');
    expect(s.character.inventory).toEqual(['torch']);
    expect(s.choiceLog).toHaveLength(0);
  });

  it('applies outcome: stat/inventory/reputation/flags and advances node', () => {
    const { save: next } = resolveChoice(save(), node, 'steal');
    expect(next.character.baseStats.dex).toBe(11);
    expect(next.character.inventory).toEqual(['key']);
    expect(next.reputation.villain).toBe(1);
    expect(next.currentNodeId).toBe('n3');
    expect(next.choiceLog).toEqual([{ nodeId: 'n1', choiceId: 'steal' }]);
  });

  it('applies faction + hero reputation and flags', () => {
    const { save: next } = resolveChoice(save(), node, 'persuade', mulberry32(1));
    expect(next.reputation.hero).toBe(1);
    expect(next.reputation.factions.guards).toBe(2);
    expect(next.flags.doorOpen).toBe(true);
  });

  it('runs a skill check using the d20 multiplier when present', () => {
    const res = resolveChoice(save(), node, 'persuade', mulberry32(1));
    expect(typeof res.roll).toBe('number');
    expect(typeof res.checkPassed).toBe('boolean');
  });

  it('throws on an unknown choice id', () => {
    expect(() => resolveChoice(save(), node, 'nope')).toThrow();
  });
});
