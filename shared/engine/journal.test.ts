import { buildJournal } from './journal';
import { SAMPLE_BUNDLE } from '../fixtures';
import { SAVE_VERSION } from '../constants';
import { SaveState } from '../types';

function save(log: SaveState['choiceLog'], liveNodes?: SaveState['liveNodes']): SaveState {
  return {
    version: SAVE_VERSION, routeId: 'demo-route',
    character: { background: 'rogue', baseStats: {}, inventory: [], equipped: {}, skillPriority: [] },
    reputation: { hero: 0, villain: 0, factions: {} },
    flags: {}, choiceLog: log, currentNodeId: 'n3', seed: 1,
    gold: 0, xp: 0, level: 1, consumables: {}, vitals: { currentHp: 10, pendingBuffs: [] },
    liveNodes,
  };
}

describe('buildJournal', () => {
  it('maps choiceLog entries to prose + chosen text with annotations', () => {
    const j = buildJournal(SAMPLE_BUNDLE, save([
      { nodeId: 'n1', choiceId: 'sneak', routeId: 'demo-route', roll: 17, checkPassed: true },
    ]));
    expect(j).toEqual([{
      prose: 'You reach a guarded gate.',
      chosenText: 'Sneak past',
      roll: 17,
      checkPassed: true,
      reward: undefined,
    }]);
  });

  it('applies live-node overlays to prose and chosen text', () => {
    const j = buildJournal(SAMPLE_BUNDLE, save(
      [{ nodeId: 'n1', choiceId: 'sneak', routeId: 'demo-route' }],
      { n1: { prose: 'Mist coils around the gate.', choiceTexts: ['Cut them down', 'Slip past unseen'] } },
    ));
    expect(j[0].prose).toBe('Mist coils around the gate.');
    expect(j[0].chosenText).toBe('Slip past unseen'); // 'sneak' is choice index 1
  });

  it('skips entries whose node or choice no longer exists', () => {
    const j = buildJournal(SAMPLE_BUNDLE, save([
      { nodeId: 'ghost', choiceId: 'x', routeId: 'demo-route' },
      { nodeId: 'n1', choiceId: 'deleted-choice', routeId: 'demo-route' },
      { nodeId: 'n2', choiceId: 'end', routeId: 'demo-route' },
    ]));
    expect(j).toHaveLength(1);
    expect(j[0].chosenText).toBe('Continue');
  });

  it('skips entries from other routes but keeps legacy entries without routeId', () => {
    const j = buildJournal(SAMPLE_BUNDLE, save([
      { nodeId: 'n1', choiceId: 'fight', routeId: 'older-route' }, // other route → skip
      { nodeId: 'n1', choiceId: 'fight' },                          // legacy, node exists → keep
    ]));
    expect(j).toHaveLength(1);
    expect(j[0].chosenText).toBe('Fight the goblin');
  });

  it('passes the reward annotation through', () => {
    const reward = { gold: 9, xp: 4, itemIds: ['torch'] };
    const j = buildJournal(SAMPLE_BUNDLE, save([
      { nodeId: 'n1', choiceId: 'fight', routeId: 'demo-route', reward },
    ]));
    expect(j[0].reward).toEqual(reward);
  });
});
