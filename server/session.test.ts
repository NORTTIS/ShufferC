import { createGameSession, GameError } from './session';
import { createMemoryStore } from './store/memoryStore';
import { createMemoryRouteStore } from './store/memoryRouteStore';
import { BACKGROUNDS } from '../shared/backgrounds';
import { SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_BUNDLE, SAMPLE_ROUTE } from '../shared/fixtures';
import { RouteBundle } from '../shared/types';

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

});

describe('GameSession.listBackgrounds', () => {
  it('lists all backgrounds', () => {
    const s = newSession();
    expect(s.listBackgrounds().map((b) => b.id).sort()).toEqual(['fighter', 'mage', 'rogue']);
  });
});

describe('GameSession.applyChoice', () => {
  it('sneak path: runs the skill check, applies outcome, advances to n3', async () => {
    const s = newSession();
    const { sessionId } = await s.newGame('rogue');
    const res = await s.applyChoice(sessionId, 'sneak');
    expect(typeof res.roll).toBe('number');
    expect(typeof res.checkPassed).toBe('boolean');
    expect(res.save.reputation.hero).toBe(1); // sneak outcome
    expect(res.save.currentNodeId).toBe('n3');
    expect(res.node.id).toBe('n3');
    expect(res.ending).toBe('reach-keep'); // n3 satisfies the route ending
  });

  it('fight path: a strong fighter beats the goblin and advances to n2', async () => {
    const s = newSession();
    const { sessionId } = await s.newGame('fighter');
    const res = await s.applyChoice(sessionId, 'fight', ['slash']);
    expect(res.combat).toBeDefined();
    expect(res.combat!.winner).toBe('player');
    expect(res.combat!.log.length).toBeGreaterThan(0);
    expect(res.save.currentNodeId).toBe('n2');
  });

  it('fight path requires skillPriority (else 400)', async () => {
    const s = newSession();
    const { sessionId } = await s.newGame('fighter');
    await expect(s.applyChoice(sessionId, 'fight')).rejects.toMatchObject({ status: 400 });
  });

  it('fight is deterministic: same seed yields the same combat log', async () => {
    const a = newSession();
    const b = newSession();
    const ida = (await a.newGame('fighter')).sessionId;
    const idb = (await b.newGame('fighter')).sessionId;
    const ra = await a.applyChoice(ida, 'fight', ['slash']);
    const rb = await b.applyChoice(idb, 'fight', ['slash']);
    expect(ra.combat!.log).toEqual(rb.combat!.log);
    expect(ra.combat!.winner).toBe(rb.combat!.winner);
  });

  it('throws GameError(400) on an unknown choice id', async () => {
    const s = newSession();
    const { sessionId } = await s.newGame('rogue');
    await expect(s.applyChoice(sessionId, 'nope')).rejects.toMatchObject({ status: 400 });
  });
});

describe('GameSession.applyChoice — quoted ending condition', () => {
  it('matches an ending whose condition quotes the node id', async () => {
    const bundle = structuredClone(SAMPLE_BUNDLE);
    bundle.route.endings = [{ id: 'reach-keep', title: 'Reached the Keep', condition: "currentNodeId === 'n3'" }];
    const deps = {
      backgrounds: BACKGROUNDS, itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB,
      routes: createMemoryRouteStore([bundle]),
    };
    const s = createGameSession(createMemoryStore(), deps);
    const { sessionId } = await s.newGame('rogue');
    const res = await s.applyChoice(sessionId, 'sneak');
    expect(res.save.currentNodeId).toBe('n3');
    expect(res.ending).toBe('reach-keep');
  });
});

describe('GameSession.applyChoice — defeat path', () => {
  it('losing the fight returns ending "defeat" and does not advance the node', async () => {
    const deps = {
      backgrounds: BACKGROUNDS,
      itemDb: ITEM_DB,
      skillDb: SKILL_DB,
      enemyDb: {
        ...ENEMY_DB,
        goblin: { ...ENEMY_DB.goblin, stats: { ...ENEMY_DB.goblin.stats, str: 99 }, hp: 9999 },
      },
      routes: createMemoryRouteStore([SAMPLE_BUNDLE]),
    };
    const s = createGameSession(createMemoryStore(), deps);
    const { sessionId } = await s.newGame('rogue');
    const res = await s.applyChoice(sessionId, 'fight', ['slash']);
    expect(res.combat!.winner).toBe('enemies');
    expect(res.ending).toBe('defeat');
    expect(res.save.currentNodeId).toBe('n1'); // did NOT advance past the gate
    // progress not persisted: a fresh view still sits at n1
    const again = await s.getView(sessionId);
    expect(again.save.currentNodeId).toBe('n1');
  });
});

describe('GameSession.newGame — route selection', () => {
  function depsWith(...bundles: RouteBundle[]) {
    return {
      backgrounds: BACKGROUNDS,
      itemDb: ITEM_DB,
      skillDb: SKILL_DB,
      enemyDb: ENEMY_DB,
      routes: createMemoryRouteStore(bundles),
    };
  }

  it('starts a game on a second published route by id', async () => {
    const second = structuredClone(SAMPLE_BUNDLE);
    second.route.id = 'route-2';
    second.route.title = 'Second Route';
    const s = createGameSession(createMemoryStore(), depsWith(SAMPLE_BUNDLE, second));
    const res = await s.newGame('rogue', 'route-2');
    expect(res.save.routeId).toBe('route-2');
    expect(res.node.id).toBe('n1');
  });

  it('rejects newGame on a draft (unpublished) route with 409', async () => {
    const draft = structuredClone(SAMPLE_BUNDLE);
    draft.route.id = 'draft-route';
    draft.route.status = 'draft';
    const s = createGameSession(createMemoryStore(), depsWith(draft));
    await expect(s.newGame('rogue', 'draft-route')).rejects.toMatchObject({ status: 409 });
  });

  it('throws 404 when newGame targets a missing route', async () => {
    const s = createGameSession(createMemoryStore(), depsWith(SAMPLE_BUNDLE));
    await expect(s.newGame('rogue', 'ghost-route')).rejects.toMatchObject({ status: 404 });
  });

  it('picks a random published route when no routeId is given', async () => {
    const second = structuredClone(SAMPLE_BUNDLE);
    second.route.id = 'route-2';
    const deps = { ...depsWith(SAMPLE_BUNDLE, second), random: () => 0 };
    const s = createGameSession(createMemoryStore(), deps);
    const res = await s.newGame('rogue'); // no routeId
    expect(res.save.routeId).toBe(SAMPLE_ROUTE.id); // index 0 of the published pool
    expect(res.save.playedRouteIds).toEqual([SAMPLE_ROUTE.id]);
  });

  it('excludes draft routes from the random pool', async () => {
    const draft = structuredClone(SAMPLE_BUNDLE);
    draft.route.id = 'draft-route';
    draft.route.status = 'draft';
    const published = structuredClone(SAMPLE_BUNDLE);
    published.route.id = 'pub-route';
    // list order: [draft, published]; random()=0 must skip draft and pick pub-route
    const deps = { ...depsWith(draft, published), random: () => 0 };
    const s = createGameSession(createMemoryStore(), deps);
    const res = await s.newGame('rogue');
    expect(res.save.routeId).toBe('pub-route');
  });

  it('throws 409 when no published route exists and no routeId is given', async () => {
    const draft = structuredClone(SAMPLE_BUNDLE);
    draft.route.id = 'draft-route';
    draft.route.status = 'draft';
    const s = createGameSession(createMemoryStore(), depsWith(draft));
    await expect(s.newGame('rogue')).rejects.toMatchObject({ status: 409 });
  });
});

describe('GameSession.continueToNextRoute', () => {
  function depsWith(...bundles: RouteBundle[]) {
    return {
      backgrounds: BACKGROUNDS,
      itemDb: ITEM_DB,
      skillDb: SKILL_DB,
      enemyDb: ENEMY_DB,
      routes: createMemoryRouteStore(bundles),
      random: () => 0,
    };
  }

  it('carries the character into the next published route and resets the node', async () => {
    const second = structuredClone(SAMPLE_BUNDLE);
    second.route.id = 'route-2';
    const s = createGameSession(createMemoryStore(), depsWith(SAMPLE_BUNDLE, second));
    const { sessionId } = await s.newGame('rogue'); // picks SAMPLE_ROUTE (index 0)
    await s.applyChoice(sessionId, 'sneak'); // hero rep -> 1, reaches an ending

    const res = await s.continueToNextRoute(sessionId);
    expect(res.save.routeId).toBe('route-2');               // the remaining route
    expect(res.save.currentNodeId).toBe('n1');              // new route start
    expect(res.node.id).toBe('n1');
    expect(res.save.reputation.hero).toBe(1);               // character carried over
    expect(res.save.seed).toBe(7);                          // seed unchanged
    expect(res.save.playedRouteIds).toEqual([SAMPLE_ROUTE.id, 'route-2']);
  });

  it('never re-picks an already played route', async () => {
    const second = structuredClone(SAMPLE_BUNDLE);
    second.route.id = 'route-2';
    const s = createGameSession(createMemoryStore(), depsWith(SAMPLE_BUNDLE, second));
    const { sessionId } = await s.newGame('rogue');
    const next = await s.continueToNextRoute(sessionId);
    expect(next.save.routeId).toBe('route-2');
    // pool now exhausted
    await expect(s.continueToNextRoute(sessionId)).rejects.toMatchObject({ status: 409 });
  });

  it('throws 409 when no further published route remains', async () => {
    const s = createGameSession(createMemoryStore(), depsWith(SAMPLE_BUNDLE));
    const { sessionId } = await s.newGame('rogue'); // only route -> already played
    await expect(s.continueToNextRoute(sessionId)).rejects.toMatchObject({ status: 409 });
  });
});

describe('GameSession.applyChoice — hasNextRoute', () => {
  it('sets hasNextRoute=true at an ending when another published route remains', async () => {
    const second = structuredClone(SAMPLE_BUNDLE);
    second.route.id = 'route-2';
    const deps = {
      backgrounds: BACKGROUNDS, itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB,
      routes: createMemoryRouteStore([SAMPLE_BUNDLE, second]), random: () => 0,
    };
    const s = createGameSession(createMemoryStore(), deps);
    const { sessionId } = await s.newGame('rogue'); // plays SAMPLE_ROUTE
    const res = await s.applyChoice(sessionId, 'sneak'); // reaches 'reach-keep' ending
    expect(res.ending).toBe('reach-keep');
    expect(res.hasNextRoute).toBe(true);
  });

  it('sets hasNextRoute=false at an ending when no other published route remains', async () => {
    const s = newSession(); // default deps: only SAMPLE_BUNDLE
    const { sessionId } = await s.newGame('rogue');
    const res = await s.applyChoice(sessionId, 'sneak');
    expect(res.ending).toBe('reach-keep');
    expect(res.hasNextRoute).toBe(false);
  });

  it('treats a choiceless node with no matching ending as terminal and still reports hasNextRoute', async () => {
    const deadEnd = structuredClone(SAMPLE_BUNDLE);
    deadEnd.route.id = 'dead-end';
    deadEnd.nodes.n1.choices = []; // terminal node; n1 matches no ending condition
    const second = structuredClone(SAMPLE_BUNDLE);
    second.route.id = 'route-2';
    const deps = {
      backgrounds: BACKGROUNDS, itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB,
      routes: createMemoryRouteStore([deadEnd, second]), random: () => 0,
    };
    const s = createGameSession(createMemoryStore(), deps);
    const { sessionId } = await s.newGame('rogue', 'dead-end'); // starts at n1 (no choices, no ending)
    const view = await s.getView(sessionId);
    expect(view.ending).toBeUndefined();
    expect(view.node.choices.length).toBe(0);
    expect(view.hasNextRoute).toBe(true); // route-2 is still unplayed
  });
});
