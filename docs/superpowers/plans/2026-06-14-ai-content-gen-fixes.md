# AI Content-Generation Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five logic / token-overload defects in the AI route-generation pipeline so generated content is internally consistent, custom attributes actually work end-to-end, and the Gemini tool loop stops promptly and respects its call budget.

**Architecture:** Five independent fixes. (1) Make custom attributes first-class across schema → validator → engine (the data-driven path is half-wired today). (2) Reject dead-on-arrival / empty combat. (3) Validate enemy `reward` instead of passing it through raw. (4) Stop the tool loop the instant `submit_route` succeeds, via a `StopToolLoop` sentinel both providers catch. (5) Make `maxToolCalls` a hard limit enforced mid-batch in the real Gemini provider (the fake already does this).

**Tech Stack:** TypeScript, Jest, Zod, `@google/generative-ai`. Pure logic in `shared/`, provider/orchestration in `server/ai/`.

---

## File Structure

| File | Responsibility | Tasks |
|------|----------------|-------|
| `server/api/contentValidation.ts` | Entity arg validators (`validateEnemy`, helpers) | 1, 2 |
| `server/api/contentValidation.test.ts` | Validator unit tests | 1, 2 |
| `shared/types.ts` | `Registries` gains `attrDb` | 3 |
| `shared/validation.ts` | Route-bundle semantic checks (skillCheck/statDelta/empty-combat) | 1, 3 |
| `shared/validation.test.ts` | Route-bundle tests | 1, 3 |
| `shared/engine/story.ts` | Applies `statDelta` / reads skillCheck stat | 3 |
| `shared/engine/story.test.ts` | Story-resolution tests | 3 |
| `server/ai/schema.ts` | Zod arg/response schemas fed to Gemini | 3 |
| `server/ai/contentSet.ts` | `toRegistries` mapping | 3 |
| `server/ai/contentSet.test.ts` | mapping test | 3 |
| `server/ai/provider.ts` | `AIProvider` contract + `StopToolLoop` + fake providers | 4, 5 |
| `server/ai/gemini.ts` | Real provider tool loop | 4, 5 |
| `server/ai/frameworkGen.ts` | Tool-loop orchestration + `submit_route` handler | 4 |
| `server/ai/frameworkGen.test.ts` | Orchestration tests (via fake provider) | 4, 5 |
| `docs/gemini-tool-loop.md` | Manual-verify notes for the real provider | 4, 5 |

**Run the whole suite** (used by every "run tests" step below): `npm test`. Single file: `npx jest <path>`.

---

## Task 1: Reject dead-on-arrival enemies and empty combat

**Why:** `validateEnemy` does `hp: nonNegInt(body.hp) ?? 1`; `nonNegInt(0)` returns `0` and `0 ?? 1 === 0`, so `hp:0` is accepted. In `runCombat` (`shared/engine/combat.ts:40,90`) `enemiesAlive()` is then false at round 0 → instant `winner:'player'`. A `combat.enemyIds: []` node (Zod allows empty arrays) auto-resolves the same way. Both are silent free-win nodes.

**Files:**
- Modify: `server/api/contentValidation.ts` (add `posInt`, use it for enemy `hp`)
- Modify: `shared/validation.ts:39-45` (empty-`enemyIds` check)
- Test: `server/api/contentValidation.test.ts`, `shared/validation.test.ts`

- [ ] **Step 1: Write the failing validator test**

In `server/api/contentValidation.test.ts`, inside the `validateEnemy` describe block (create the block if absent — import `validateEnemy` and build a minimal `ctx`):

```ts
it('rejects hp:0 (dead on arrival)', () => {
  expect(() => validateEnemy({ id: 'e', name: 'E', stats: {}, hp: 0, skillPriority: [] }, ctx))
    .toThrow(/hp/);
});
```

If the file lacks a shared `ctx`, add near the top of the describe:
```ts
const ctx = { attributes: ATTRIBUTE_DB, effects: EFFECT_DB, items: ITEM_DB, skills: SKILL_DB };
```
(import `ATTRIBUTE_DB, EFFECT_DB, ITEM_DB, SKILL_DB` from `../../shared/fixtures`).

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest server/api/contentValidation.test.ts -t "dead on arrival"`
Expected: FAIL — no error thrown (`hp:0` currently accepted).

- [ ] **Step 3: Add `posInt` and use it for `hp`**

In `server/api/contentValidation.ts`, add after `nonNegInt` (around line 29):
```ts
export function posInt(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new GameError(`${field} must be an integer ≥ 1`, 400);
  return v;
}
```
In `validateEnemy`, change the `hp` field (line 98) from:
```ts
hp: nonNegInt(body.hp) ?? 1,
```
to:
```ts
hp: posInt(body.hp, 'hp'),
```

- [ ] **Step 4: Write the failing empty-combat test**

In `shared/validation.test.ts`:
```ts
it('BAD_SHAPE when a combat node has no enemies', () => {
  const b = clone();
  b.nodes['n1'].combat = { enemyIds: [] };
  const codes = validateRouteBundle(b, reg).map((e) => e.code);
  expect(codes).toContain('BAD_SHAPE');
});
```

- [ ] **Step 5: Run it to confirm it fails**

Run: `npx jest shared/validation.test.ts -t "no enemies"`
Expected: FAIL — no `BAD_SHAPE` (empty `enemyIds` currently passes the loop).

- [ ] **Step 6: Add the empty-combat guard**

In `shared/validation.ts`, inside the `if (node.combat) {` block (line 39), before the `for (const eid ...)` loop:
```ts
if (node.combat.enemyIds.length === 0) {
  errors.push({ path: `nodes.${nid}.combat`, code: 'BAD_SHAPE', message: 'combat node has no enemies' });
}
```

- [ ] **Step 7: Run both test files**

Run: `npx jest server/api/contentValidation.test.ts shared/validation.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/api/contentValidation.ts server/api/contentValidation.test.ts shared/validation.ts shared/validation.test.ts
git commit -m "fix(content): reject hp:0 enemies and empty-combat nodes"
```

---

## Task 2: Validate enemy `reward` instead of raw passthrough

**Why:** `validateEnemy` only checks `reward.drops.itemId`, then stores `reward: body.reward` raw. So `gold:[10,1]` (min>max), negative `xp` (subtracts player XP in `rollRewards` `shared/engine/rewards.ts:27`), and `chance` outside `[0,1]` (`rewards.ts:29`) all reach the engine.

**Files:**
- Modify: `server/api/contentValidation.ts` (`validateEnemy` reward handling + new `validateReward` helper)
- Test: `server/api/contentValidation.test.ts`

- [ ] **Step 1: Write the failing tests**

In `server/api/contentValidation.test.ts` `validateEnemy` block:
```ts
const enemy = (reward: unknown) => ({ id: 'e', name: 'E', stats: {}, hp: 5, skillPriority: [], reward });

it('rejects reward.gold with min > max', () => {
  expect(() => validateEnemy(enemy({ gold: [10, 1] }), ctx)).toThrow(/gold/);
});
it('rejects negative reward.xp', () => {
  expect(() => validateEnemy(enemy({ xp: -5 }), ctx)).toThrow(/xp/);
});
it('rejects a drop chance outside [0,1]', () => {
  expect(() => validateEnemy(enemy({ drops: [{ itemId: 'healPotion', chance: 5 }] }), ctx)).toThrow(/chance/);
});
it('accepts a well-formed reward', () => {
  const e = validateEnemy(enemy({ gold: [3, 8], xp: 10, drops: [{ itemId: 'healPotion', chance: 0.5 }] }), ctx);
  expect(e.reward).toEqual({ gold: [3, 8], xp: 10, drops: [{ itemId: 'healPotion', chance: 0.5 }] });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx jest server/api/contentValidation.test.ts -t "reward"`
Expected: FAIL — the three reject tests throw nothing; the "accepts" test may pass by luck.

- [ ] **Step 3: Add `validateReward` and wire it in**

In `server/api/contentValidation.ts`, add above `validateEnemy`:
```ts
function validateReward(raw: unknown, ctx: ValidationCtx): Enemy['reward'] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const r = obj(raw, 'reward');
  const reward: NonNullable<Enemy['reward']> = {};
  if (r.gold !== undefined) {
    const g = arr(r.gold, 'reward.gold');
    const min = nonNegInt(g[0], 'reward.gold[0]');
    const max = nonNegInt(g[1], 'reward.gold[1]');
    if (g.length !== 2 || min === undefined || max === undefined) throw new GameError('reward.gold must be [min, max]', 400);
    if (min > max) throw new GameError('reward.gold min must be ≤ max', 400);
    reward.gold = [min, max];
  }
  if (r.xp !== undefined) reward.xp = nonNegInt(r.xp, 'reward.xp');
  if (r.drops !== undefined) {
    reward.drops = arr(r.drops, 'reward.drops').map((d: any) => {
      if (!ctx.items[d?.itemId]) throw new GameError(`Unknown item ${d?.itemId}`, 400);
      if (typeof d?.chance !== 'number' || d.chance < 0 || d.chance > 1) throw new GameError('drop chance must be in [0,1]', 400);
      return { itemId: d.itemId, chance: d.chance };
    });
  }
  if (r.reputationDelta !== undefined) reward.reputationDelta = r.reputationDelta as NonNullable<Enemy['reward']>['reputationDelta'];
  return reward;
}
```

In `validateEnemy`, **delete** the old drops loop (line 97):
```ts
for (const d of arr(body?.reward?.drops, 'reward.drops')) if (!ctx.items[d?.itemId]) throw new GameError(`Unknown item ${d?.itemId}`, 400);
```
and change the returned `reward` field (line 99) from `reward: body.reward` to:
```ts
reward: validateReward(body.reward, ctx),
```

- [ ] **Step 4: Run to confirm pass**

Run: `npx jest server/api/contentValidation.test.ts -t "reward"`
Expected: PASS (all four).

- [ ] **Step 5: Commit**

```bash
git add server/api/contentValidation.ts server/api/contentValidation.test.ts
git commit -m "fix(content): validate enemy reward (gold range, xp, drop chance)"
```

---

## Task 3: Make custom attributes work end-to-end

**Why:** Attributes are data-driven (`create_attribute` exists), but the route layer rejects them: `validation.ts:47` checks `skillCheck.stat` against the hardcoded `STAT_KEYS`, `schema.ts` types `skillCheck.stat`/`statDelta` with the 6-stat enum, and `story.ts:36` applies `statDelta` by iterating `STAT_KEYS`. Result: a route using a custom attribute is rejected — or, if it slipped through, its `statDelta` would silently not apply. This task makes the whole path key off the attribute registry.

**Files:**
- Modify: `shared/types.ts` (`Registries` + `attrDb`)
- Modify: `server/ai/contentSet.ts` (`toRegistries`)
- Modify: `server/ai/contentSet.test.ts`
- Modify: `shared/validation.ts` (skillCheck + statDelta checks, drop `STAT_KEYS` import)
- Modify: `shared/validation.test.ts` (reg gains `attrDb`, new accept test)
- Modify: `server/ai/schema.ts` (`z.string()` for stat keys)
- Modify: `shared/engine/story.ts` (iterate provided statDelta keys, guard skillCheck stat)
- Modify: `shared/engine/story.test.ts`

- [ ] **Step 1: Extend `Registries` with `attrDb`**

In `shared/types.ts`, in `interface Registries` (line 232):
```ts
export interface Registries {
  itemDb: Record<string, Item>;
  skillDb: Record<string, Skill>;
  enemyDb: Record<string, Enemy>;
  attrDb: Record<string, AttributeDef>;
}
```
(`AttributeDef` is already declared in this file.)

- [ ] **Step 2: Map it in `toRegistries` (write failing test first)**

In `server/ai/contentSet.test.ts`, extend the `toRegistries` test (line 28):
```ts
it('toRegistries maps to itemDb/skillDb/enemyDb/attrDb', () => {
  const r = toRegistries(base());
  expect(r.itemDb).toBe(base().items === r.itemDb ? r.itemDb : r.itemDb); // existing assertions stay
  expect(Object.keys(r.attrDb)).toEqual(Object.keys(base().attributes));
});
```
(Keep the file's existing assertions; only add the `attrDb` expectation. Adjust to match the existing test's `base()` helper.)

Run: `npx jest server/ai/contentSet.test.ts -t toRegistries` → FAIL (`attrDb` undefined).

Then in `server/ai/contentSet.ts:25`:
```ts
export function toRegistries(s: ContentSet): Registries {
  return { itemDb: s.items, skillDb: s.skills, enemyDb: s.enemies, attrDb: s.attributes };
}
```
Run again → PASS.

- [ ] **Step 3: Write failing route-validation tests (custom attr accepted, unknown rejected)**

In `shared/validation.test.ts`, update the `reg` constant (line 5) and imports (line 2):
```ts
import { SAMPLE_BUNDLE, ITEM_DB, SKILL_DB, ENEMY_DB, ATTRIBUTE_DB } from './fixtures';
...
const reg: Registries = { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB, attrDb: ATTRIBUTE_DB };
```
Add:
```ts
it('accepts a skillCheck on a registered custom attribute', () => {
  const b = clone();
  const regWithLuck = { ...reg, attrDb: { ...ATTRIBUTE_DB, luck: { id: 'luck', name: 'Luck', abbrev: 'LCK', roles: ['core'], builtin: false } } };
  b.nodes['n1'].choices[1].skillCheck = { stat: 'luck', dc: 8 };
  expect(validateRouteBundle(b, regWithLuck as typeof reg)).toEqual([]);
});
it('BAD_SHAPE when statDelta targets an unknown attribute', () => {
  const b = clone();
  b.nodes['n1'].choices[1].outcome = { statDelta: { nope: 1 } as Record<string, number> };
  const codes = validateRouteBundle(b, reg).map((e) => e.code);
  expect(codes).toContain('BAD_SHAPE');
});
```
The existing `'BAD_SHAPE when a skillCheck uses a non-stat'` test (line 42) stays valid: `'luck'` is not in `ATTRIBUTE_DB`, so it still reports `BAD_SHAPE`.

Run: `npx jest shared/validation.test.ts -t "custom attribute"` → FAIL (skillCheck check uses `STAT_KEYS`, statDelta unchecked).

- [ ] **Step 4: Switch validation to the attribute registry**

In `shared/validation.ts`:

Remove the now-unused import on line 2:
```ts
import { STAT_KEYS } from './constants';
```

Change line 47:
```ts
if (c.skillCheck && !reg.attrDb[c.skillCheck.stat]) {
  errors.push({ path: `nodes.${nid}.choices.${c.id}`, code: 'BAD_SHAPE', message: `bad stat ${c.skillCheck.stat}` });
}
```

In the same `c.outcome` block (after the `removeItems` loop, before the closing brace at line 58), add a statDelta key check:
```ts
for (const k of Object.keys(o.statDelta ?? {})) {
  if (!reg.attrDb[k]) errors.push({ path: `nodes.${nid}.choices.${c.id}.outcome.statDelta`, code: 'BAD_SHAPE', message: `unknown attribute ${k}` });
}
```

Run: `npx jest shared/validation.test.ts` → PASS.

- [ ] **Step 5: Loosen the Zod schemas to accept any attribute id**

In `server/ai/schema.ts`:

`OutcomeSchema.statDelta` (line 8):
```ts
statDelta: z.record(z.string(), z.number()).optional(),
```
`ChoiceSchema.skillCheck` (line 24):
```ts
skillCheck: z.object({ stat: z.string(), dc: z.number() }).optional(),
```
`StatKeySchema` (line 4) is now unused — delete its declaration. (It is a private const, not exported; confirm no other reference remains in this file.)

Run: `npx jest server/ai/schema.test.ts server/ai/gemini.test.ts` → PASS. If a `gemini.test.ts` case was asserting the `statDelta` enum-keyed-record sanitization specifically, update it: an open `z.record(z.string(), number)` produces `{type:'object', additionalProperties:{type:'number'}}`, which `sanitizeForGemini` reduces to `{type:'object'}` — adjust the expectation to that shape (the `required`-reconciliation branch in `sanitizeForGemini` stays; leave it in place).

- [ ] **Step 6: Apply statDelta over provided keys + guard skillCheck stat (write failing test first)**

In `shared/engine/story.test.ts`, add:
```ts
it('applies statDelta to a custom attribute key', () => {
  const save = makeSave(); // use the file's existing save helper
  save.character.baseStats.luck = 2;
  const node: StoryNode = {
    id: 'x', source: 'pregen', prose: '',
    choices: [{ id: 'c', text: 'go', outcome: { statDelta: { luck: 3 } as Record<string, number> } }],
  };
  const res = resolveChoice(save, node, 'c');
  expect(res.save.character.baseStats.luck).toBe(5);
});
```
Run: `npx jest shared/engine/story.test.ts -t "custom attribute"` → FAIL (`luck` not in `STAT_KEYS`, delta skipped).

In `shared/engine/story.ts`:

Replace the statDelta block (lines 35-40):
```ts
if (outcome.statDelta) {
  for (const [k, d] of Object.entries(outcome.statDelta)) {
    if (typeof d === 'number') next.character.baseStats[k] = (next.character.baseStats[k] ?? 0) + d;
  }
}
```

Guard the skillCheck stat read (line 28):
```ts
const statValue = next.character.baseStats[choice.skillCheck.stat] ?? 0;
```

Remove the now-unused `STAT_KEYS` import (line 3).

Run: `npx jest shared/engine/story.test.ts` → PASS.

- [ ] **Step 7: Full suite (catch any other `Registries` constructor sites)**

Run: `npm test`
Expected: PASS. If TypeScript flags any other object literal building a `Registries` without `attrDb` (e.g. in `server/session.ts`'s `loadRegistries`, fixtures, or other tests), add `attrDb` sourced from the attribute store/`ATTRIBUTE_DB` there. Fix each compile error before moving on.

- [ ] **Step 8: Update the author prompt note (optional but DRY)**

In `server/ai/prompt.ts:37`, the choice description already lists `skillCheck { stat, dc }` and `statDelta`. No change required — the model already learns valid attribute ids from the "Existing content … attributes:" line in `buildToolPrompt`. Skip if unchanged.

- [ ] **Step 9: Commit**

```bash
git add shared/types.ts server/ai/contentSet.ts server/ai/contentSet.test.ts shared/validation.ts shared/validation.test.ts server/ai/schema.ts shared/engine/story.ts shared/engine/story.test.ts
git commit -m "feat(content): make custom attributes first-class in skillCheck/statDelta"
```

---

## Task 4: `submit_route` ends the tool loop immediately

**Why:** `gemini.ts` `generateWithTools` only stops when the model voluntarily emits no calls or `count >= max`. After a valid `submit_route`, `frameworkGen` has the bundle (`frameworkGen.ts:72`) but the provider keeps prompting — burning tokens and re-running `validateRouteBundle` + `moderate` on every extra `submit_route`. Fix: a `StopToolLoop` sentinel thrown by the handler that both providers catch and treat as clean completion. This matches the original design ("submit_route is the only success exit … end loop").

**Files:**
- Modify: `server/ai/provider.ts` (`StopToolLoop` class; fake provider catches it)
- Modify: `server/ai/gemini.ts` (catch it in the loop)
- Modify: `server/ai/frameworkGen.ts` (throw it on successful submit; rethrow it from the catch)
- Modify: `server/ai/frameworkGen.test.ts`

- [ ] **Step 1: Add the sentinel and make the fake provider honor it**

In `server/ai/provider.ts`, add near the top (after the type exports, before `AIProvider`):
```ts
/** Thrown by a ToolHandler to cleanly end the tool loop (e.g. after a successful submit_route). Providers MUST catch it and resolve normally. */
export class StopToolLoop extends Error {
  constructor() { super('tool loop stopped'); this.name = 'StopToolLoop'; }
}
```
In `createFakeToolProvider`'s inner loop (line 58-59), wrap the handler call:
```ts
try {
  await handler(call);
} catch (e) {
  if (e instanceof StopToolLoop) return;
  throw e;
}
```

- [ ] **Step 2: Write the failing orchestration test**

Replace the existing test at `frameworkGen.test.ts:87` (`'captured bundle is not corrupted by tool calls after submit_route'`) with one that asserts the loop stops:
```ts
it('stops the tool loop after a successful submit_route', async () => {
  const provider = createFakeToolProvider([[
    submit(SAMPLE_BUNDLE),
    { name: 'create_enemy', args: { id: 'post_submit', name: 'Post', stats: { str: 1 }, hp: 1, skillPriority: [] } },
  ]]);
  const res = await generateFramework(provider, params, content);
  expect(res.ok).toBe(true);
  if (res.ok) {
    expect(res.toolCalls).toBe(1);                                   // create_enemy never ran
    expect(res.bundle.stagedContent?.enemies['post_submit']).toBeUndefined();
  }
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `npx jest server/ai/frameworkGen.test.ts -t "stops the tool loop"`
Expected: FAIL — `toolCalls` is `2` (post-submit create still runs today).

- [ ] **Step 4: Throw `StopToolLoop` on a successful submit**

In `server/ai/frameworkGen.ts`:

Add to the provider import (line ~13 area — it currently imports from `./provider` indirectly; add an explicit import):
```ts
import { StopToolLoop } from './provider';
```
(`ToolCall` is already imported from `./provider` on line 1 — extend that import instead: `import { AIProvider, ToolCall, StopToolLoop } from './provider';`.)

In the `submit_route` success branch, replace `return { ok: true };` (line 73) with:
```ts
finalBundle = { ...bundle, stagedContent: structuredClone(staged) };
throw new StopToolLoop();
```
(Delete the now-duplicated `finalBundle = ...` line 72 — keep a single assignment immediately before the throw.)

In the `catch (e)` block (line 81), rethrow the sentinel first:
```ts
} catch (e) {
  if (e instanceof StopToolLoop) throw e;
  const errors = asErrors(e instanceof GameError ? e.message : String(e));
  lastErrors = errors;
  return { ok: false, errors };
}
```

- [ ] **Step 5: Catch the sentinel in the real Gemini provider**

In `server/ai/gemini.ts`, add to the import on line 2:
```ts
import { AIProvider, GenerateOptions, ToolDef, ToolHandler, StopToolLoop } from './provider';
```
In `generateWithTools`'s inner `for (const call of calls)` loop (line 105-109), wrap the handler call:
```ts
for (const call of calls) {
  count++;
  let out: unknown;
  try {
    out = await handler({ name: call.name, args: call.args });
  } catch (e) {
    if (e instanceof StopToolLoop) return;
    throw e;
  }
  responses.push({ functionResponse: { name: call.name, response: { result: out } } });
}
```

- [ ] **Step 6: Run orchestration tests**

Run: `npx jest server/ai/frameworkGen.test.ts`
Expected: PASS. Other tests in the file (`create_enemy then submit`, `invalid create then submit`, etc.) place `submit_route` last, so stopping after submit does not truncate any expected behavior; `toolCalls` counts stay as asserted.

- [ ] **Step 7: Commit**

```bash
git add server/ai/provider.ts server/ai/gemini.ts server/ai/frameworkGen.ts server/ai/frameworkGen.test.ts
git commit -m "fix(ai): stop the tool loop the moment submit_route succeeds"
```

---

## Task 5: `maxToolCalls` is a hard limit (enforced mid-batch)

**Why:** `gemini.ts:103` checks `count >= max` only *before* a batch ("never mid-batch"). A single model turn emitting many `functionCall`s runs *all* of them — `count` can overshoot `max` arbitrarily in one turn, spiking tokens (N validations + N `functionResponse`s in one giant message). `createFakeToolProvider` already checks inside its loop; this task makes Gemini match and locks the behavior with a fake-provider test.

**Files:**
- Modify: `server/ai/gemini.ts` (move limit check inside the per-call loop)
- Test: `server/ai/frameworkGen.test.ts` (fake-provider, single oversized turn)
- Modify: `docs/gemini-tool-loop.md` (manual-verify note)

- [ ] **Step 1: Write the failing/locking test (fake provider)**

In `server/ai/frameworkGen.test.ts`:
```ts
it('honors maxToolCalls mid-batch (hard limit)', async () => {
  const mk = (id: string): ToolCall => ({ name: 'create_enemy', args: { id, name: id, stats: { str: 1 }, hp: 1, skillPriority: [] } });
  const provider = createFakeToolProvider([[mk('a'), mk('b'), mk('c')]]); // one turn, three calls
  const res = await generateFramework(provider, params, content, { maxToolCalls: 2 });
  expect(res.toolCalls).toBe(2); // stops after 2, never runs the 3rd
});
```

- [ ] **Step 2: Run it**

Run: `npx jest server/ai/frameworkGen.test.ts -t "hard limit"`
Expected: PASS already — `createFakeToolProvider` checks `count >= max` inside its loop. This test *locks* the contract that Gemini must also obey. (If it unexpectedly fails, fix `createFakeToolProvider` first.)

- [ ] **Step 3: Make Gemini enforce the limit mid-batch**

In `server/ai/gemini.ts` `generateWithTools`, change the per-call loop (now from Task 4) so the limit is checked *before* each call, and remove reliance on the pre-batch-only check. The loop body becomes:
```ts
const responses: unknown[] = [];
for (const call of calls) {
  if (count >= max) break;   // hard limit: never exceed max within a batch
  count++;
  let out: unknown;
  try {
    out = await handler({ name: call.name, args: call.args });
  } catch (e) {
    if (e instanceof StopToolLoop) return;
    throw e;
  }
  responses.push({ functionResponse: { name: call.name, response: { result: out } } });
}
if (count >= max) return;     // budget exhausted — stop after sending nothing further
result = await chat.sendMessage(responses as never);
```
Keep the existing pre-batch `if (count >= max) return;` (line 103) as a fast exit; it is now redundant but harmless. Update the line-99 comment to: `// Loop: model emits functionCall(s) → run handler (honoring maxToolCalls per call) → send functionResponse(s) → repeat.`

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Update manual-verify notes**

In `docs/gemini-tool-loop.md`, add a short section noting: (a) `submit_route` success now throws `StopToolLoop`, ending the loop on the first valid submit; (b) `maxToolCalls` is enforced per call, so a single oversized batch is truncated at the limit. Note these are verified by `frameworkGen.test.ts` via the fake provider; the real Gemini path is smoke-tested manually (no Jest coverage, by design).

- [ ] **Step 6: Commit**

```bash
git add server/ai/gemini.ts server/ai/frameworkGen.test.ts docs/gemini-tool-loop.md
git commit -m "fix(ai): enforce maxToolCalls per call so a batch can't overshoot"
```

---

## Self-Review

**Spec coverage:**
- #1 hp:0 / empty combat → Task 1 ✅
- #3 enemy reward validation → Task 2 ✅
- #1 custom attribute end-to-end (schema + validator + engine) → Task 3 ✅
- #4 submit_route stops loop → Task 4 ✅
- #5 hard maxToolCalls → Task 5 ✅

**Type consistency:** `Registries.attrDb` (Task 3 Step 1) is consumed as `reg.attrDb[...]` (Task 3 Step 4) and produced by `toRegistries` (Step 2); `StopToolLoop` is declared once in `provider.ts` (Task 4 Step 1) and imported by `frameworkGen.ts` (Task 4 Step 4) and `gemini.ts` (Task 4 Step 5); `posInt` declared in `contentValidation.ts` (Task 1 Step 3) and used for `hp` there.

**Ordering note:** Task 5 Step 3 edits the same `for (const call of calls)` loop that Task 4 Step 5 introduces — do Task 4 before Task 5. Tasks 1–3 are independent of 4–5.

**No admin endpoint touched:** these are validator/engine/provider fixes; the CLAUDE.md "admin endpoint ↔ admin console form" rule does not apply (no `/admin/*` route added or changed).
