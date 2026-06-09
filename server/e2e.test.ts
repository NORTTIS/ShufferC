import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';
import { serialize, deserialize } from '../shared/engine/save';

describe('server e2e (hardcoded route)', () => {
  it('rogue sneaks past and reaches the keep', async () => {
    const s = createGameSession(createMemoryStore());
    const { sessionId } = await s.newGame('rogue');
    const res = await s.applyChoice(sessionId, 'sneak');
    expect(res.save.currentNodeId).toBe('n3');
    expect(res.node.choices).toHaveLength(0); // terminal node
    expect(res.ending).toBe('reach-keep');

    // save round-trips after progression
    expect(deserialize(serialize(res.save))).toEqual(res.save);
  });

  it('fighter fights through the gate and reaches the cleared node', async () => {
    const s = createGameSession(createMemoryStore());
    const { sessionId } = await s.newGame('fighter');
    const res = await s.applyChoice(sessionId, 'fight', ['slash']);
    expect(res.combat!.winner).toBe('player');
    expect(res.save.currentNodeId).toBe('n2');

    // continue from n2 to n3 via its single choice
    const next = await s.applyChoice(sessionId, 'end');
    expect(next.save.currentNodeId).toBe('n3');
  });
});

describe('combat rewards', () => {
  it('grants gold/xp on a winning fight and carries HP forward', async () => {
    const s = createGameSession(createMemoryStore());
    const { sessionId, save } = await s.newGame('fighter');
    expect(save.gold).toBe(0);
    const startHp = save.vitals.currentHp;
    expect(startHp).toBeGreaterThan(0);
    const res = await s.applyChoice(sessionId, 'fight', ['slash']);
    expect(res.combat!.winner).toBe('player');
    expect(res.save.gold).toBeGreaterThan(0);
    expect(res.save.xp).toBe(25);
    expect(res.reward).toBeDefined();
    expect(res.save.vitals.currentHp).toBeLessThanOrEqual(startHp);
  });
});
