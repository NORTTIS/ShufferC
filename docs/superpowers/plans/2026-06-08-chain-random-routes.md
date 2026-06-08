# Chain Random Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the player picks a background, start a random *published* route; on each route ending let the player **Continue** into another random published route (character carried over), each route played once, ending in a finale screen when none remain.

**Architecture:** All route selection lives server-side in `server/session.ts` behind an injectable `random` dependency. A new `continueToNextRoute` method and `POST /sessions/:id/continue` endpoint advance to the next route. The save tracks consumed routes in `playedRouteIds`. The client gains a `continueRoute` API call and an ending screen that branches between a **Continue** button and a **finale** summary based on a `hasNextRoute` flag returned by the server.

**Tech Stack:** TypeScript, Node, Express, Jest + ts-jest (server/shared), React Native / Expo (client). Test runner: `npx jest`.

---

## File Structure

- `shared/types.ts` — add optional `playedRouteIds` to `SaveState`, add `hasNextRoute` consideration (server `SessionView` is local, not here).
- `server/session.ts` — injectable `random` dep, `pickRoute` helper, random selection in `newGame`, new `continueToNextRoute`, `hasNextRoute` on ending views.
- `server/api.ts` — `POST /sessions/:id/continue` route.
- `client/src/services/api.ts` — `continueRoute`, `hasNextRoute?` on `SessionView`.
- `client/src/hooks/useGameSession.ts` — `continueRoute` callback.
- `client/App.tsx` — Continue button + finale screen in the ending branch.
- `server/session.test.ts`, `server/api.test.ts` — coverage.

---

## Task 1: Add `playedRouteIds` to the save model

**Files:**
- Modify: `shared/types.ts:128-137` (`SaveState`)

- [ ] **Step 1: Add the optional field**

In `shared/types.ts`, inside the `SaveState` interface, add `playedRouteIds` after `currentNodeId`:

```ts
export interface SaveState {
  version: number;
  routeId: string;
  character: CharacterState;
  reputation: Reputation;
  flags: Record<string, boolean>;
  choiceLog: { nodeId: string; choiceId: string }[];
  currentNodeId: string;
  seed: number;
  playedRouteIds?: string[];   // route ids already consumed; never re-picked
}
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors (field is optional, so existing `SaveState` literals still compile).

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat: add playedRouteIds to SaveState"
```

---

## Task 2: Random route selection in `newGame`

Add an injectable RNG and a `pickRoute` helper, then make `newGame` pick a random
published route when no `routeId` is given. Explicit `routeId` keeps its current
behavior.

**Files:**
- Modify: `server/session.ts` (`SessionDeps`, `DEFAULT_DEPS`, factory body, `newGame`)
- Test: `server/session.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `server/session.test.ts` (the `depsWith` helper already exists in the
`route selection` describe block — add these inside that same block):

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest server/session.test.ts -t "random"`
Expected: FAIL — `newGame` currently defaults to `SAMPLE_ROUTE.id` and `playedRouteIds` is undefined.

- [ ] **Step 3: Add the `random` dependency**

In `server/session.ts`, extend `SessionDeps` and `DEFAULT_DEPS`:

```ts
export interface SessionDeps {
  backgrounds: Record<string, Background>;
  itemDb: Record<string, Item>;
  skillDb: Record<string, Skill>;
  enemyDb: Record<string, Enemy>;
  routes: RouteStore;
  random?: () => number;
}

const DEFAULT_DEPS: SessionDeps = {
  backgrounds: BACKGROUNDS,
  itemDb: ITEM_DB,
  skillDb: SKILL_DB,
  enemyDb: ENEMY_DB,
  routes: createMemoryRouteStore([SAMPLE_BUNDLE]),
  random: Math.random,
};
```

- [ ] **Step 4: Add the `pickRoute` helper**

Inside `createGameSession`, alongside the other inner functions (e.g. just after
`loadBundle`), add a resolved RNG and the picker:

```ts
const random = deps.random ?? Math.random;

// Pick a random published route id not already consumed; null if none remain.
async function pickRoute(played: string[]): Promise<string | null> {
  const pool = (await deps.routes.list())
    .filter((r) => r.status === 'published' && !played.includes(r.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(random() * pool.length)].id;
}
```

- [ ] **Step 5: Use it in `newGame`**

Replace the `newGame` signature default and the start of its body. Change the
signature from `routeId: string = SAMPLE_ROUTE.id` to an optional `routeId?: string`,
and resolve a random route when it is absent:

```ts
async newGame(backgroundId: string, routeId?: string) {
  const bg = deps.backgrounds[backgroundId];
  if (!bg) throw new GameError(`Unknown background ${backgroundId}`, 400);

  let resolvedRouteId = routeId;
  if (!resolvedRouteId) {
    const picked = await pickRoute([]);
    if (!picked) throw new GameError('No published routes available', 409);
    resolvedRouteId = picked;
  }

  const bundle = await loadBundle(resolvedRouteId);
  if (bundle.route.status !== 'published') {
    throw new GameError(`Route ${resolvedRouteId} is not published`, 409);
  }
  const startNodeId = bundle.route.acts[0].nodeIds[0];
  const save: SaveState = {
    version: SAVE_VERSION,
    routeId: bundle.route.id,
    character: {
      background: bg.id,
      baseStats: { ...bg.baseStats },
      inventory: [...bg.inventory],
      equipped: { ...bg.equipped },
      skillPriority: [...bg.skillPriority],
    },
    reputation: { hero: 0, villain: 0, factions: {} },
    flags: {},
    choiceLog: [],
    currentNodeId: startNodeId,
    seed: START_SEED,
    playedRouteIds: [bundle.route.id],
  };
  const sessionId = await store.create(save);
  return { sessionId, ...view(save, bundle) };
},
```

Note: the `GameSession` interface already declares `newGame(backgroundId: string, routeId?: string)` (`server/session.ts:58`), so no interface change is needed.

- [ ] **Step 6: Run the new tests and the full session suite**

Run: `npx jest server/session.test.ts`
Expected: PASS — including the pre-existing tests (single-route default pool still yields `SAMPLE_ROUTE`).

- [ ] **Step 7: Commit**

```bash
git add server/session.ts server/session.test.ts
git commit -m "feat: pick a random published route in newGame"
```

---

## Task 3: `continueToNextRoute` — advance to the next route

**Files:**
- Modify: `server/session.ts` (`GameSession` interface + factory return object)
- Test: `server/session.test.ts`

- [ ] **Step 1: Write the failing tests**

Append a new describe block to `server/session.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest server/session.test.ts -t "continueToNextRoute"`
Expected: FAIL — `continueToNextRoute` is not a function.

- [ ] **Step 3: Declare the method on the interface**

In `server/session.ts`, add to the `GameSession` interface (after `getView`):

```ts
continueToNextRoute(id: string): Promise<SessionView>;
```

- [ ] **Step 4: Implement the method**

Add to the object returned by `createGameSession`, after `getView`:

```ts
async continueToNextRoute(id: string): Promise<SessionView> {
  const save = await load(id);
  const played = save.playedRouteIds ?? [save.routeId];
  const nextId = await pickRoute(played);
  if (!nextId) throw new GameError('No more routes', 409);

  const bundle = await loadBundle(nextId);
  save.routeId = nextId;
  save.currentNodeId = bundle.route.acts[0].nodeIds[0];
  save.playedRouteIds = [...played, nextId];
  // character, reputation, flags, choiceLog, seed are intentionally preserved
  await store.put(id, save);
  return view(save, bundle);
},
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest server/session.test.ts -t "continueToNextRoute"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/session.ts server/session.test.ts
git commit -m "feat: add continueToNextRoute to chain into the next route"
```

---

## Task 4: `hasNextRoute` flag on ending views

So the client knows whether to show **Continue** or the **finale** screen.

**Files:**
- Modify: `server/session.ts` (`SessionView`, `view`-returning paths)
- Test: `server/session.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `server/session.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest server/session.test.ts -t "hasNextRoute"`
Expected: FAIL — `hasNextRoute` is `undefined` on the result.

- [ ] **Step 3: Add the field to `SessionView`**

In `server/session.ts`, extend the `SessionView` interface:

```ts
export interface SessionView {
  save: SaveState;
  node: StoryNode;
  effectiveStats: Stats;
  ending?: string;
  hasNextRoute?: boolean;
}
```

- [ ] **Step 4: Add a helper that annotates ending views**

Inside `createGameSession`, after `pickRoute`, add:

```ts
// Annotate a view that ended (non-defeat) with whether a further route remains.
async function withNextRoute<T extends SessionView>(v: T): Promise<T> {
  if (v.ending && v.ending !== 'defeat') {
    const played = v.save.playedRouteIds ?? [v.save.routeId];
    v.hasNextRoute = (await pickRoute(played)) !== null;
  }
  return v;
}
```

- [ ] **Step 5: Apply the helper on the `view`-returning paths**

Update the return statements that can carry an ending. In `applyChoice`, wrap the
three non-defeat returns; in `getView` wrap its return. (`newGame`'s start node
never ends, and the defeat path is intentionally left unannotated.)

`getView`:

```ts
async getView(id: string) {
  const save = await load(id);
  const bundle = await loadBundle(save.routeId);
  return withNextRoute(view(save, bundle));
},
```

`applyChoice` — skill-check path:

```ts
if (choice.skillCheck) {
  const res = resolveChoice(save, node, choiceId, mulberry32(save.seed));
  await store.put(id, res.save);
  return withNextRoute({ ...view(res.save, bundle), checkPassed: res.checkPassed, roll: res.roll });
}
```

`applyChoice` — combat win path:

```ts
if (combat.winner === 'player') {
  const res = resolveChoice(save, node, choiceId);
  res.save.character.skillPriority = [...skillPriority];
  await store.put(id, res.save);
  return withNextRoute({ ...view(res.save, bundle), combat });
}
```

`applyChoice` — plain advance path:

```ts
const res = resolveChoice(save, node, choiceId);
await store.put(id, res.save);
return withNextRoute(view(res.save, bundle));
```

Leave the defeat return (`return { ...view(save, bundle), combat, ending: 'defeat' };`) unchanged.

- [ ] **Step 6: Run the session suite**

Run: `npx jest server/session.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 7: Commit**

```bash
git add server/session.ts server/session.test.ts
git commit -m "feat: report hasNextRoute on ending views"
```

---

## Task 5: `POST /sessions/:id/continue` endpoint

**Files:**
- Modify: `server/api.ts` (after the `/sessions/:id/choice` route, ~line 76)
- Test: `server/api.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `server/api.test.ts` inside the `describe('REST API', ...)` block:

```ts
it('POST /sessions/:id/continue returns 409 when no further route remains', async () => {
  const a = app(); // default deps: a single published route, consumed by newGame
  const created = await request(a).post('/sessions').send({ backgroundId: 'rogue' });
  const id = created.body.sessionId as string;
  const res = await request(a).post(`/sessions/${id}/continue`).send();
  expect(res.status).toBe(409);
  expect(res.body.error).toMatch(/no more routes/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest server/api.test.ts -t "continue"`
Expected: FAIL with 404 (route not defined yet).

- [ ] **Step 3: Add the route**

In `server/api.ts`, after the `/sessions/:id/choice` handler:

```ts
app.post('/sessions/:id/continue', wrap((req) =>
  session.continueToNextRoute(req.params.id as string),
));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest server/api.test.ts -t "continue"`
Expected: PASS (409 mapped by the central error handler).

- [ ] **Step 5: Commit**

```bash
git add server/api.ts server/api.test.ts
git commit -m "feat: add POST /sessions/:id/continue endpoint"
```

---

## Task 6: Client API — `continueRoute` + `hasNextRoute` type

**Files:**
- Modify: `client/src/services/api.ts`

- [ ] **Step 1: Add `hasNextRoute` to the client `SessionView`**

```ts
export interface SessionView {
  save: SaveState;
  node: StoryNode;
  effectiveStats: Stats;
  ending?: string;
  hasNextRoute?: boolean;
}
```

- [ ] **Step 2: Add the `continueRoute` call**

In the `gameApi` object, after `newGame`:

```ts
continueRoute: (id: string) =>
  call<NewGameView>(`/sessions/${id}/continue`, { method: 'POST' }),
```

- [ ] **Step 3: Verify the client type-checks**

Run: `npx tsc --noEmit -p client/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/services/api.ts
git commit -m "feat: add continueRoute client API call"
```

---

## Task 7: Client hook — `continueRoute` callback

**Files:**
- Modify: `client/src/hooks/useGameSession.ts`

- [ ] **Step 1: Add the callback**

In `useGameSession`, after the `start` callback, add:

```ts
const continueRoute = useCallback(() => run(async () => {
  const id = state.sessionId!;
  const res = await gameApi.continueRoute(id);
  return { view: res, lastChoice: null, screen: 'story' as Screen };
}), [run, state.sessionId]);
```

- [ ] **Step 2: Export it**

Update the hook's return statement:

```ts
return { state, start, choose, enterCombat, fight, equip, goTo, continueRoute };
```

- [ ] **Step 3: Verify the client type-checks**

Run: `npx tsc --noEmit -p client/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useGameSession.ts
git commit -m "feat: add continueRoute to useGameSession"
```

---

## Task 8: Client UI — Continue button + finale screen

**Files:**
- Modify: `client/App.tsx`

- [ ] **Step 1: Pull `continueRoute` from the hook**

Change the destructure on line 11:

```ts
const { state, start, choose, enterCombat, fight, equip, goTo, continueRoute } = useGameSession();
```

- [ ] **Step 2: Replace the ending branch**

Replace the existing `state.screen === 'ending'` block (lines 41-49) with a branch
that distinguishes defeat, "more routes remain" (Continue), and "run complete"
(finale):

```tsx
{state.screen === 'ending' && state.view && (() => {
  const isDefeat = state.lastChoice?.ending === 'defeat';
  const canContinue = !isDefeat && state.view.hasNextRoute;
  if (canContinue) {
    return (
      <View style={styles.ending}>
        <Text style={styles.endTitle}>The End</Text>
        <Text style={styles.endProse}>{state.view.node.prose}</Text>
        {state.view.ending && <Text style={styles.endTag}>Ending: {state.view.ending}</Text>}
        <Pressable
          style={styles.continueBtn}
          disabled={state.busy}
          onPress={() => continueRoute()}
        >
          <Text style={styles.continueText}>Continue</Text>
        </Pressable>
      </View>
    );
  }
  if (isDefeat) {
    return (
      <View style={styles.ending}>
        <Text style={styles.endTitle}>You have fallen.</Text>
        <Text style={styles.endProse}>{state.view.node.prose}</Text>
      </View>
    );
  }
  // Finale: no further published routes remain.
  const stats = state.view.effectiveStats;
  const rep = state.view.save.reputation;
  const routesPlayed = state.view.save.playedRouteIds?.length ?? 1;
  return (
    <View style={styles.ending}>
      <Text style={styles.endTitle}>Your journey ends</Text>
      <Text style={styles.endProse}>{state.view.node.prose}</Text>
      <Text style={styles.endTag}>Routes completed: {routesPlayed}</Text>
      <Text style={styles.endTag}>
        STR {stats.str} · DEX {stats.dex} · INT {stats.int} · CON {stats.con}
      </Text>
      <Text style={styles.endTag}>Reputation — hero {rep.hero} · villain {rep.villain}</Text>
    </View>
  );
})()}
```

- [ ] **Step 3: Add the button styles**

Add to the `StyleSheet.create({ ... })` object:

```ts
continueBtn: { marginTop: 16, backgroundColor: '#2a2a2a', borderRadius: 8, padding: 14, alignItems: 'center' },
continueText: { color: '#fff', fontSize: 16, fontWeight: '600' },
```

- [ ] **Step 4: Verify the client type-checks**

Run: `npx tsc --noEmit -p client/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add client/App.tsx
git commit -m "feat: continue button and finale screen on the ending screen"
```

---

## Task 9: Full regression run

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npx jest`
Expected: all suites PASS (shared, server, client/src).

- [ ] **Step 2: Type-check both projects**

Run: `npx tsc --noEmit && npx tsc --noEmit -p client/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Final commit (if anything outstanding)**

```bash
git add -A
git commit -m "chore: chain random routes — regression pass" || echo "nothing to commit"
```

---

## Self-Review notes

- **Spec coverage:** random start route (Task 2), continuous carry-over + once-only + chaining (Task 3), `hasNextRoute` for UI gating (Task 4), endpoint (Task 5), client wiring (Tasks 6-7), Continue button + finale summary + terminal defeat (Task 8). 409 on empty pools covered in Tasks 2, 3, 5.
- **Type consistency:** `continueToNextRoute(id): Promise<SessionView>`, `pickRoute(played: string[]): Promise<string|null>`, `withNextRoute<T extends SessionView>(v): Promise<T>`, `hasNextRoute?: boolean`, `playedRouteIds?: string[]`, `continueRoute(id)` — names identical across server, client, and tests.
- **Determinism:** `random` injected as `() => 0` in tests; production defaults to `Math.random`. Existing single-route fixtures still resolve to `SAMPLE_ROUTE`.
