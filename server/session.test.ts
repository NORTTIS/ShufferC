import { createGameSession, GameError } from './session';
import { createMemoryStore } from './store/memoryStore';

function newSession() {
  return createGameSession(createMemoryStore());
}

describe('GameSession.newGame', () => {
  it('builds a save from the chosen background and returns the start node', async () => {
    const s = newSession();
    const res = await s.newGame('rogue');
    expect(typeof res.sessionId).toBe('string');
    expect(res.save.character.background).toBe('rogue');
    expect(res.save.character.baseStats.dex).toBe(10); // rogue preset
    expect(res.save.currentNodeId).toBe('n1');
    expect(res.node.id).toBe('n1');
    expect(res.effectiveStats.str).toBe(9); // 7 base + 2 dagger
  });

  it('throws GameError(400) on an unknown background', async () => {
    const s = newSession();
    await expect(s.newGame('wizardlord')).rejects.toMatchObject({ status: 400 });
  });
});

describe('GameSession.getView', () => {
  it('returns the current node + effective stats', async () => {
    const s = newSession();
    const { sessionId } = await s.newGame('fighter');
    const view = await s.getView(sessionId);
    expect(view.node.id).toBe('n1');
    expect(view.effectiveStats.con).toBe(11); // fighter con 9 + ring 2
  });

  it('throws GameError(404) for an unknown session', async () => {
    const s = newSession();
    await expect(s.getView('missing')).rejects.toMatchObject({ status: 404 });
  });
});

describe('GameSession.equip', () => {
  it('equipping an item raises effective stats; unequipping restores them', async () => {
    const s = newSession();
    const { sessionId } = await s.newGame('rogue'); // dagger equipped, +2 str
    const before = await s.getView(sessionId);
    expect(before.effectiveStats.str).toBe(9);

    const off = await s.equip(sessionId, 'weapon', null);
    expect(off.effectiveStats.str).toBe(7); // dagger removed

    const on = await s.equip(sessionId, 'weapon', 'dagger');
    expect(on.effectiveStats.str).toBe(9); // dagger back
  });

  it('throws GameError(400) when equipping an item not in inventory', async () => {
    const s = newSession();
    const { sessionId } = await s.newGame('rogue');
    await expect(s.equip(sessionId, 'ring', 'ringOfRegen')).rejects.toMatchObject({ status: 400 });
  });

  it('throws GameError(400) when item slot does not match the target slot', async () => {
    const s = newSession();
    const { sessionId } = await s.newGame('rogue');
    await expect(s.equip(sessionId, 'ring', 'dagger')).rejects.toMatchObject({ status: 400 });
  });

  it('lists all backgrounds', () => {
    const s = newSession();
    expect(s.listBackgrounds().map((b) => b.id).sort()).toEqual(['fighter', 'mage', 'rogue']);
  });
});
