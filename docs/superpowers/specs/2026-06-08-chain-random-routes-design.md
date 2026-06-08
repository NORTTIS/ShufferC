# Chain Random Routes — Design

**Date:** 2026-06-08
**Branch:** feature/c1-framework-gen
**Status:** Approved (pending spec review)

## Goal

After the player picks a background, the game should start a **random published
route** instead of the hardcoded `SAMPLE_ROUTE`. When a route reaches an ending,
the player presses **Continue** to move into **another random published route**,
carrying their character over. Each route is played at most once. When no
unplayed published routes remain, the game shows a dedicated **finale (game-over)
screen** summarising the run.

## Requirements (resolved)

| Question | Decision |
|----------|----------|
| What gets randomized | The route (a random *published* route from `RouteStore`) |
| Character across routes | **Continuous** — keep stats, inventory, equipped, reputation, flags, choiceLog, seed |
| Repeats | Each route played **once**; tracked per save; pool shrinks until empty |
| Transition trigger | Player sees the route's ending, then presses **Continue** |
| End-of-game screen | **Dedicated finale screen** with run summary |

Non-goals: randomizing the combat `seed` (stays `START_SEED = 7` per the existing
note in `session.ts:17`); changing route generation/admin flow; persisting saves
across process restarts (store remains in-memory).

## Data model

`shared/types.ts` — `SaveState` gains one **optional** field:

```ts
playedRouteIds?: string[];   // route ids already consumed; never re-picked
```

Optional (not required) so the several test fixtures that build `SaveState`
literals keep compiling. `newGame` always sets it; all read paths default with
`?? []`. `SAVE_VERSION` is **not** bumped — saves are in-memory only.

## Server (`server/session.ts`)

### Injectable RNG
`SessionDeps` gains `random?: () => number` (default `Math.random`) so tests can
pick deterministically. `DEFAULT_DEPS.random = Math.random`.

### `pickRoute(played: string[]): Promise<string | null>`
1. `await deps.routes.list()`
2. pool = summaries with `status === 'published'` and `id ∉ played`
3. pool empty → `null`; else → `pool[Math.floor(deps.random() * pool.length)].id`

### `newGame(backgroundId, routeId?)`
- `routeId` provided → unchanged behavior (used by admin/tests/replay), keep the
  existing `status !== 'published'` → 409 check.
- `routeId` omitted → `routeId = await pickRoute([])`; if `null` →
  `throw new GameError('No published routes available', 409)`.
- Save initialised as today, plus `playedRouteIds: [routeId]`.

### `continueToNextRoute(id): Promise<SessionView>` (new)
1. `load(id)`
2. `next = await pickRoute(save.playedRouteIds)`
3. `next === null` → `throw new GameError('No more routes', 409)` (UI gates this).
4. Otherwise mutate save (continuous carry-over): keep `character`, `reputation`,
   `flags`, `choiceLog`, `seed`; set `routeId = next`,
   `currentNodeId = newBundle.route.acts[0].nodeIds[0]`, push `next` onto
   `playedRouteIds`. `store.put` → return `view(save, newBundle)` (+ `hasNextRoute`).

### `hasNextRoute` flag
`SessionView` gains optional `hasNextRoute?: boolean`. Whenever a returned view
carries an `ending`, set `hasNextRoute = (await pickRoute(save.playedRouteIds)) !== null`.
Computed in the async methods (`newGame`, `getView`, `applyChoice`,
`continueToNextRoute`) after `view()` — `view()` stays sync. Defeat endings leave
the flag off (they are terminal regardless).

Interface `GameSession` gains `continueToNextRoute(id: string): Promise<SessionView>`.

## API (`server/api.ts`)

New route, same pattern as the others:

```ts
app.post('/sessions/:id/continue', wrap((req) =>
  session.continueToNextRoute(req.params.id as string),
));
```

## Client

### `client/src/services/api.ts`
- `SessionView` (client type) gains `hasNextRoute?: boolean`.
- Add `continueRoute: (id) => call<NewGameView>('/sessions/${id}/continue', { method: 'POST' })`.

### `client/src/hooks/useGameSession.ts`
- Add `continueRoute` callback: posts continue, returns
  `{ view: res, lastChoice: null, screen: 'story' }`.
- `screenAfter` and the `Screen` union are unchanged — endings still route to
  `'ending'`; the ending screen itself decides Continue vs finale via
  `hasNextRoute` (no separate screen state needed).

### `App.tsx`
- Ending screen: render **Continue** button when
  `lastChoice?.ending !== 'defeat' && view.hasNextRoute` → calls `continueRoute(sessionId)`.
- When `ending && ending !== 'defeat' && !view.hasNextRoute` → render the
  **finale screen**: title (e.g. "Your journey ends"), routes completed
  (`view.save.playedRouteIds.length`), final stats from `view.effectiveStats`
  (STR/DEX/INT/CON), reputation hero/villain from `view.save.reputation`.
- Defeat ending unchanged ("You have fallen.", terminal, no Continue).

## Error handling

- `newGame` with zero published routes → 409 `No published routes available`.
- `continueToNextRoute` with exhausted pool → 409 `No more routes` (defensive; UI
  shows finale instead of the button).

## Testing

`server/session.test.ts`:
- newGame without routeId picks a published route via stubbed `random`; draft
  routes excluded; `playedRouteIds === [picked]`.
- newGame with zero published routes → 409.
- newGame with explicit routeId bypasses random (existing behavior preserved).
- continueToNextRoute: picks an unplayed published route; carries character /
  reputation / inventory / flags / choiceLog / seed unchanged; sets new
  `currentNodeId` to the new route's start; appends to `playedRouteIds`.
- continueToNextRoute never re-picks a played route.
- continueToNextRoute with exhausted pool → 409.
- `hasNextRoute` is `true` when an unplayed published route remains at an ending,
  `false` when none remain.

`server/api.test.ts`:
- `POST /sessions/:id/continue` maps to `continueToNextRoute` and returns the view.

Determinism: inject `random` in tests; existing single-route fixtures keep passing
because a one-route pool always yields that route.

## Files touched

- `shared/types.ts` — `SaveState.playedRouteIds`
- `server/session.ts` — RNG dep, `pickRoute`, `newGame`, `continueToNextRoute`, `hasNextRoute`
- `server/api.ts` — `/sessions/:id/continue`
- `client/src/services/api.ts` — `continueRoute`, `hasNextRoute` type
- `client/src/hooks/useGameSession.ts` — `continueRoute`, `'finale'` screen
- `client/App.tsx` — Continue button + finale screen
- `server/session.test.ts`, `server/api.test.ts` — coverage
