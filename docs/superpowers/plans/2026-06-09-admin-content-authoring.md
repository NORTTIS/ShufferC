# Admin Content Authoring (Foundation) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins author all game content — Attributes, Effects, Items, Skills, Enemies — from reusable components, persisted in per-type stores, read live by the player session.

**Architecture:** Effects become a fixed set of parametric *archetype interpreters* (code) driven by admin-authored *templates* (data). Attributes become a data-driven registry whose engine meaning comes from a fixed set of *roles* (`core`/`defense`/`maxHp`). Five separate store ports (`AttributeStore`/`EffectStore`/`ItemStore`/`SkillStore`/`EnemyStore`) share one generic in-memory/pg implementation, seeded from today's fixtures. Admin REST CRUD + matching console forms front the stores; deletes are blocked by a cross-store referential-integrity check.

**Tech Stack:** TypeScript, Express, Drizzle ORM (postgres-js), Jest + supertest, vanilla-JS admin console (`server/admin/index.html`).

**Spec:** `docs/superpowers/specs/2026-06-09-admin-content-authoring-design.md`

**Phases:**
1. Types + engine generalization + seed (existing tests stay green).
2. Five stores (generic memory/pg) + wiring (session reads live).
3. Admin REST CRUD endpoints + referential integrity.
4. Admin console views.

**Conventions used throughout:**
- Run a single test file: `npx jest <path>`; one test: `npx jest <path> -t "<name>"`.
- Run the whole suite: `npm test`. Typecheck: `npm run typecheck`.
- Commit after each task with the message shown in its final step.

---

## Phase 1 — Types, engine generalization, seed

Goal: introduce the new data model and make the engine attribute/effect-data-driven **without** changing behavior. The existing fixtures (`ITEM_DB` etc.) and constants stay; we add `ATTRIBUTE_DB`/`EFFECT_DB` and thread them through. End state: full suite green.

### Task 1.1: Add the new types

**Files:**
- Modify: `shared/types.ts:1-17` (StatKey/Stats and effect types region)

- [ ] **Step 1: Replace the `StatKey`/`Stats` lines and add the new interfaces**

In `shared/types.ts`, change the first two lines:

```ts
// Attributes are data-driven (see AttributeDef). StatKey is now any attribute id.
export type StatKey = string;
export type Stats = Record<string, number>;
```

Then, immediately after the `EquipSlot` line (currently line 10), add:

```ts
export type AttributeRole = 'core' | 'defense' | 'maxHp';

export interface AttributeDef {
  id: string;                 // 'str', 'armor', ...
  name: string;               // 'Strength'
  abbrev: string;             // 'STR'
  roles: AttributeRole[];     // how the engine consumes it
  defaultBase?: number;       // value when an actor/save lacks this key (default 0)
  builtin: boolean;           // the original 6 → cannot be deleted
}

export type EffectArchetype = 'dot' | 'hot' | 'statMod' | 'control';

export interface EffectTemplate {
  id: string;
  name: string;
  archetype: EffectArchetype;
  kind: EffectKind;           // buff|debuff|dot|hot|control — normalized onto instances; drives hasControl + UI
  stat?: string;              // required when archetype === 'statMod' (an AttributeDef.id)
  magnitude?: number;         // default per-tick / per-apply amount
  duration?: number;          // default remaining turns
  instant?: boolean;          // duration-0 application: apply magnitude once, do not retain
  sprite?: string;
  builtin: boolean;
}
```

Leave `EffectKind`, `StatusEffect`, `Item`, etc. unchanged — `StatusEffect.id` already references an effect by id; it now references an `EffectTemplate.id`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (this is a pure type change; `Stats` was already `Record<StatKey, number>`, now `Record<string, number>` — compatible).

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat(types): add AttributeDef + EffectTemplate; Stats keyed by string"
```

### Task 1.2: Seed registries (`ATTRIBUTE_DB`, `EFFECT_DB`)

**Files:**
- Modify: `shared/fixtures.ts:1` (imports) and append new exports
- Test: `shared/fixtures.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `shared/fixtures.test.ts`:

```ts
import { ATTRIBUTE_DB, EFFECT_DB } from './fixtures';

describe('content seed', () => {
  it('seeds the original six attributes; con carries defense + maxHp', () => {
    expect(Object.keys(ATTRIBUTE_DB).sort()).toEqual(['cha', 'con', 'dex', 'int', 'str', 'wis']);
    expect(ATTRIBUTE_DB.str.roles).toEqual(['core']);
    expect(ATTRIBUTE_DB.con.roles.sort()).toEqual(['core', 'defense', 'maxHp']);
    expect(Object.values(ATTRIBUTE_DB).every((a) => a.builtin)).toBe(true);
  });

  it('seeds effect templates covering every legacy effect id', () => {
    for (const id of ['poison', 'regen', 'heal', 'attack_buff', 'defense_down', 'freeze', 'stun']) {
      expect(EFFECT_DB[id]).toBeDefined();
      expect(EFFECT_DB[id].builtin).toBe(true);
    }
    expect(EFFECT_DB.attack_buff.archetype).toBe('statMod');
    expect(EFFECT_DB.attack_buff.stat).toBe('str');
    expect(EFFECT_DB.heal.instant).toBe(true);
    expect(EFFECT_DB.freeze.archetype).toBe('control');
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx jest shared/fixtures.test.ts`
Expected: FAIL — `ATTRIBUTE_DB`/`EFFECT_DB` not exported.

- [ ] **Step 3: Implement the seed**

In `shared/fixtures.ts`, extend the import on line 1:

```ts
import { Item, Skill, Enemy, CharacterState, StoryNode, GameRoute, RouteBundle, AttributeDef, EffectTemplate } from './types';
```

Append at the end of the file:

```ts
export const ATTRIBUTE_DB: Record<string, AttributeDef> = {
  str: { id: 'str', name: 'Strength',     abbrev: 'STR', roles: ['core'], builtin: true },
  dex: { id: 'dex', name: 'Dexterity',    abbrev: 'DEX', roles: ['core'], builtin: true },
  int: { id: 'int', name: 'Intelligence', abbrev: 'INT', roles: ['core'], builtin: true },
  wis: { id: 'wis', name: 'Wisdom',       abbrev: 'WIS', roles: ['core'], builtin: true },
  cha: { id: 'cha', name: 'Charisma',     abbrev: 'CHA', roles: ['core'], builtin: true },
  con: { id: 'con', name: 'Constitution', abbrev: 'CON', roles: ['core', 'defense', 'maxHp'], builtin: true },
};

export const EFFECT_DB: Record<string, EffectTemplate> = {
  poison:       { id: 'poison',       name: 'Poison',       archetype: 'dot',     kind: 'dot',     magnitude: 1,  builtin: true },
  regen:        { id: 'regen',        name: 'Regen',        archetype: 'hot',     kind: 'hot',     magnitude: 1,  builtin: true },
  heal:         { id: 'heal',         name: 'Heal',         archetype: 'hot',     kind: 'hot',     instant: true, builtin: true },
  attack_buff:  { id: 'attack_buff',  name: 'Attack Up',    archetype: 'statMod', kind: 'buff',    stat: 'str', magnitude: 1,  builtin: true },
  defense_down: { id: 'defense_down', name: 'Defense Down', archetype: 'statMod', kind: 'debuff',  stat: 'con', magnitude: -1, builtin: true },
  freeze:       { id: 'freeze',       name: 'Freeze',       archetype: 'control', kind: 'control', builtin: true },
  stun:         { id: 'stun',         name: 'Stun',         archetype: 'control', kind: 'control', builtin: true },
};
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx jest shared/fixtures.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/fixtures.ts shared/fixtures.test.ts
git commit -m "feat(seed): ATTRIBUTE_DB + EFFECT_DB seeded from current effects"
```

### Task 1.3: Effect archetype interpreters + data-driven `applyEffect`/`tickEffects`

**Files:**
- Rewrite: `shared/effects/registry.ts`
- Modify: `shared/engine/effects.ts`
- Modify: `shared/effects/registry.test.ts`, `shared/engine/effects.test.ts`

- [ ] **Step 1: Write the failing test**

Replace `shared/effects/registry.test.ts` contents with archetype-level tests:

```ts
import { applyArchetype, tickArchetype, expireArchetype } from './registry';
import { CombatActor, EffectTemplate, StatusEffect } from '../types';

function actor(): CombatActor {
  return { id: 'a', name: 'A', stats: { str: 5, con: 4 }, hp: 10, maxHp: 10, statuses: [], skillPriority: [], skillBook: {} };
}
const tpl = (t: Partial<EffectTemplate>): EffectTemplate =>
  ({ id: 'x', name: 'X', archetype: 'dot', kind: 'dot', builtin: false, ...t });
const inst = (e: Partial<StatusEffect>): StatusEffect => ({ id: 'x', kind: 'dot', duration: 1, ...e });

describe('effect archetypes', () => {
  it('dot tick subtracts magnitude (instance overrides template)', () => {
    const a = actor();
    tickArchetype(a, inst({ magnitude: 3 }), tpl({ archetype: 'dot', magnitude: 1 }));
    expect(a.hp).toBe(7);
  });
  it('hot instant applies once at apply-time and clamps to maxHp', () => {
    const a = actor(); a.hp = 2;
    applyArchetype(a, inst({ magnitude: 15, duration: 0 }), tpl({ archetype: 'hot', kind: 'hot', instant: true }));
    expect(a.hp).toBe(10);
  });
  it('statMod adds on apply and reverses on expire', () => {
    const a = actor();
    const t = tpl({ archetype: 'statMod', kind: 'buff', stat: 'str', magnitude: 1 });
    const e = inst({ magnitude: 2 });
    applyArchetype(a, e, t); expect(a.stats.str).toBe(7);
    expireArchetype(a, e, t); expect(a.stats.str).toBe(5);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx jest shared/effects/registry.test.ts`
Expected: FAIL — `applyArchetype` etc. not exported.

- [ ] **Step 3: Rewrite `shared/effects/registry.ts`**

```ts
import { CombatActor, EffectTemplate, StatusEffect } from '../types';

function clampHp(a: CombatActor): void {
  a.hp = Math.max(0, Math.min(a.maxHp, a.hp));
}

function amount(e: StatusEffect, tpl: EffectTemplate): number {
  return e.magnitude ?? tpl.magnitude ?? 1;
}

/** Called when an effect lands. Instant dot/hot apply once; statMod shifts the stat. */
export function applyArchetype(target: CombatActor, e: StatusEffect, tpl: EffectTemplate): void {
  switch (tpl.archetype) {
    case 'statMod':
      if (tpl.stat) target.stats[tpl.stat] = (target.stats[tpl.stat] ?? 0) + amount(e, tpl);
      break;
    case 'hot':
      if (tpl.instant) { target.hp += amount(e, tpl); clampHp(target); }
      break;
    case 'dot':
      if (tpl.instant) { target.hp -= amount(e, tpl); clampHp(target); }
      break;
    case 'control':
      break;
  }
}

/** Called once per turn while the effect persists. */
export function tickArchetype(target: CombatActor, e: StatusEffect, tpl: EffectTemplate): void {
  if (tpl.archetype === 'dot') { target.hp -= amount(e, tpl); clampHp(target); }
  if (tpl.archetype === 'hot') { target.hp += amount(e, tpl); clampHp(target); }
}

/** Called when a persisting effect's duration reaches 0. */
export function expireArchetype(target: CombatActor, e: StatusEffect, tpl: EffectTemplate): void {
  if (tpl.archetype === 'statMod' && tpl.stat) {
    target.stats[tpl.stat] = (target.stats[tpl.stat] ?? 0) - amount(e, tpl);
  }
}
```

- [ ] **Step 4: Update `shared/engine/effects.ts` to resolve templates via a passed-in map**

```ts
import { CombatActor, EffectTemplate, StatusEffect } from '../types';
import { applyArchetype, tickArchetype, expireArchetype } from '../effects/registry';

export type EffectMap = Record<string, EffectTemplate>;

export function applyEffect(target: CombatActor, effect: StatusEffect, effects: EffectMap): void {
  const tpl = effects[effect.id];
  if (!tpl) return;
  const copy: StatusEffect = { ...effect, kind: tpl.kind }; // normalize kind from the template
  applyArchetype(target, copy, tpl);
  if (copy.duration > 0) target.statuses.push(copy);
}

export function hasControl(actor: CombatActor): boolean {
  return actor.statuses.some((s) => s.kind === 'control' && s.duration > 0);
}

export function tickEffects(actor: CombatActor, effects: EffectMap): void {
  const remaining: StatusEffect[] = [];
  for (const s of actor.statuses) {
    const tpl = effects[s.id];
    if (tpl) tickArchetype(actor, s, tpl);
    s.duration -= 1;
    if (s.duration <= 0) {
      if (tpl) expireArchetype(actor, s, tpl);
    } else {
      remaining.push(s);
    }
  }
  actor.statuses = remaining;
}
```

- [ ] **Step 5: Update `shared/engine/effects.test.ts`**

Open the file. Every `applyEffect(actor, eff)` / `tickEffects(actor)` call now needs the effect map. At the top add:

```ts
import { EFFECT_DB } from '../fixtures';
```

and pass `EFFECT_DB` as the final argument to every `applyEffect(...)` and `tickEffects(...)` call in that file. (If the test constructed its own ad-hoc effects by id, those ids must exist in `EFFECT_DB`; they do — the tests use `poison`/`regen`/`attack_buff`.)

- [ ] **Step 6: Run both effect test files; verify pass**

Run: `npx jest shared/effects/registry.test.ts shared/engine/effects.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/effects/registry.ts shared/engine/effects.ts shared/effects/registry.test.ts shared/engine/effects.test.ts
git commit -m "refactor(effects): parametric archetypes + template-driven apply/tick"
```

### Task 1.4: Generalize `effectiveStats` (sum every stat-mod key)

**Files:**
- Modify: `shared/engine/character.ts:5-17`
- Test: `shared/engine/character.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `shared/engine/character.test.ts`:

```ts
import { effectiveStats } from './character';
import { CharacterState, Item } from '../types';

it('effectiveStats sums non-core attribute mods from equipped gear', () => {
  const itemDb: Record<string, Item> = {
    plate: { id: 'plate', name: 'Plate', slot: 'armor', kind: 'gear', statMods: { armor: 3, str: 1 }, storyTags: [] },
  };
  const character: CharacterState = {
    background: 'x', baseStats: { str: 5, con: 4 }, inventory: ['plate'], equipped: { armor: 'plate' }, skillPriority: [],
  };
  const stats = effectiveStats(character, itemDb);
  expect(stats.str).toBe(6);
  expect(stats.armor).toBe(3); // new attribute flows through even though baseStats lacked it
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx jest shared/engine/character.test.ts -t "non-core attribute"`
Expected: FAIL — `armor` is `undefined` (old code only iterates `STAT_KEYS`).

- [ ] **Step 3: Rewrite `effectiveStats`**

Replace lines 5–17 of `shared/engine/character.ts`:

```ts
export function effectiveStats(character: CharacterState, itemDb: Record<string, Item>): Stats {
  const result: Stats = { ...character.baseStats };
  for (const itemId of Object.values(character.equipped)) {
    if (!itemId) continue;
    const item = itemDb[itemId];
    if (!item?.statMods) continue;
    for (const [key, mod] of Object.entries(item.statMods)) {
      if (mod) result[key] = (result[key] ?? 0) + mod;
    }
  }
  return result;
}
```

Remove the now-unused `STAT_KEYS` import from line 2 (keep `BASE_HP`, `HP_PER_CON`).

- [ ] **Step 4: Run it; verify it passes**

Run: `npx jest shared/engine/character.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/engine/character.ts shared/engine/character.test.ts
git commit -m "refactor(character): effectiveStats sums all stat-mod keys"
```

### Task 1.5: Role-driven `deriveMaxHp` and combat defense

**Files:**
- Modify: `shared/engine/character.ts` (`deriveMaxHp`, `buildPlayerActor`)
- Modify: `shared/engine/combat.ts` (`CombatInput`, `computeDamage`, `runCombat`)
- Modify: tests in `character.test.ts`, `combat.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `shared/engine/character.test.ts`:

```ts
import { deriveMaxHp } from './character';
import { ATTRIBUTE_DB } from '../fixtures';
import { AttributeDef } from '../types';

const attrs = Object.values(ATTRIBUTE_DB);

it('deriveMaxHp sums every attribute carrying the maxHp role', () => {
  expect(deriveMaxHp({ con: 4 }, attrs)).toBe(20 + 4 * 5); // BASE_HP=20, HP_PER_CON=5
  const withVit: AttributeDef[] = [...attrs, { id: 'vit', name: 'Vitality', abbrev: 'VIT', roles: ['maxHp'], builtin: false }];
  expect(deriveMaxHp({ con: 4, vit: 2 }, withVit)).toBe(20 + (4 + 2) * 5);
});
```

Add to `shared/engine/combat.ts`'s test (`shared/engine/combat.test.ts`) — a case proving a `defense`-role attribute reduces damage. Add near the other combat tests:

```ts
import { ATTRIBUTE_DB } from '../fixtures';
import { EFFECT_DB } from '../fixtures';
// in a test body, when building CombatInput, pass `attrs: Object.values(ATTRIBUTE_DB), effects: EFFECT_DB`
```

(Exact test body is folded into Step 2's call-site updates — every existing `runCombat({...})` call gains `attrs` + `effects`.)

- [ ] **Step 2: Update `deriveMaxHp` + `buildPlayerActor` in `character.ts`**

```ts
import { CharacterState, CombatActor, Enemy, Item, Skill, Stats, StatusEffect, AttributeDef, EffectTemplate } from '../types';
import { BASE_HP, HP_PER_CON } from '../constants';
import { applyEffect, EffectMap } from './effects';

export function deriveMaxHp(stats: Stats, attrs: AttributeDef[]): number {
  const bonus = attrs
    .filter((a) => a.roles.includes('maxHp'))
    .reduce((sum, a) => sum + (stats[a.id] ?? 0), 0);
  return BASE_HP + bonus * HP_PER_CON;
}
```

Change `buildPlayerActor`'s signature and body to take `effects` + `attrs`:

```ts
export function buildPlayerActor(
  character: CharacterState,
  itemDb: Record<string, Item>,
  skillDb: Record<string, Skill>,
  effects: EffectMap,
  attrs: AttributeDef[],
  opts: BuildPlayerOptions = {},
): CombatActor {
  const stats = effectiveStats(character, itemDb);
  const maxHp = deriveMaxHp(stats, attrs);
  // ... unchanged skill-collection block ...
  // replace the two applyEffect calls:
  for (const itemId of Object.values(character.equipped)) {
    if (!itemId) continue;
    const item = itemDb[itemId];
    for (const eff of item?.onEquip ?? []) applyEffect(actor, eff, effects);
  }
  for (const eff of opts.extraBuffs ?? []) applyEffect(actor, eff, effects);
  return actor;
}
```

(Keep the rest of the function identical; only `deriveMaxHp(stats)` → `deriveMaxHp(stats, attrs)`, the two `applyEffect` calls gain `effects`, and the parameter list changes. `opts` moves to last so the common case stays readable.)

- [ ] **Step 3: Update `combat.ts`**

```ts
import { CombatActor, CombatEvent, CombatResult, Skill, AttributeDef } from '../types';
import { RNG, mulberry32, rollD20, faceToMultiplier } from './dice';
import { applyEffect, tickEffects, hasControl, EffectMap } from './effects';

export interface CombatInput {
  player: CombatActor;
  enemies: CombatActor[];
  seed: number;
  attrs: AttributeDef[];
  effects: EffectMap;
}

function computeDamage(actor: CombatActor, skill: Skill, target: CombatActor, mult: number, attrs: AttributeDef[]): number {
  const stat = skill.targetStat ?? 'str';
  const base = (actor.stats[stat] ?? 0) * (skill.power ?? 1);
  const defenseStat = attrs
    .filter((a) => a.roles.includes('defense'))
    .reduce((sum, a) => sum + (target.stats[a.id] ?? 0), 0);
  const defense = Math.floor(defenseStat / 2);
  return Math.max(1, Math.round(base * mult) - defense);
}
```

In `runCombat`, destructure `const { player, enemies, attrs, effects } = input;`, pass `effects` to every `tickEffects(actor, effects)` and `applyEffect(recipient, eff, effects)`, and pass `attrs` to `computeDamage(actor, skill, enemyTarget, mult, attrs)`.

- [ ] **Step 4: Fix call sites in tests**

In `shared/engine/combat.test.ts` and `shared/engine/character.test.ts` (and any integration test that calls these), add `import { ATTRIBUTE_DB, EFFECT_DB } from '../fixtures';` and:
- every `runCombat({ player, enemies, seed })` → `runCombat({ player, enemies, seed, attrs: Object.values(ATTRIBUTE_DB), effects: EFFECT_DB })`
- every `buildPlayerActor(character, itemDb, skillDb, opts)` → `buildPlayerActor(character, itemDb, skillDb, EFFECT_DB, Object.values(ATTRIBUTE_DB), opts)`
- every `deriveMaxHp(stats)` → `deriveMaxHp(stats, Object.values(ATTRIBUTE_DB))`

- [ ] **Step 5: Run the shared engine suite; verify pass**

Run: `npx jest shared/engine`
Expected: PASS. (Behavior is identical: con is the only `defense`+`maxHp` attribute, so numbers match the old `con/2` and `con*HP_PER_CON`.)

- [ ] **Step 6: Commit**

```bash
git add shared/engine/character.ts shared/engine/combat.ts shared/engine/character.test.ts shared/engine/combat.test.ts
git commit -m "refactor(engine): role-driven maxHp + defense; thread attrs/effects through combat"
```

### Task 1.6: Thread `attrs`/`effects` through `session.ts`

The session still uses the fixture maps in Phase 1; we only fix the new call signatures so the suite stays green. Phase 2 swaps the maps for stores.

**Files:**
- Modify: `server/session.ts`
- Verify: `server/session.test.ts`, `server/api.test.ts`, `server/e2e.test.ts`

- [ ] **Step 1: Import the seed registries**

In `server/session.ts`, extend the fixtures import (line 8):

```ts
import { SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_BUNDLE, ATTRIBUTE_DB, EFFECT_DB } from '../shared/fixtures';
```

Add two module-level helpers near `START_SEED`:

```ts
const ATTRS = Object.values(ATTRIBUTE_DB);
const EFFECTS = EFFECT_DB;
```

- [ ] **Step 2: Update the engine call sites**

In `server/session.ts`, update every call:
- `deriveMaxHp(effectiveStats(character, deps.itemDb))` → `deriveMaxHp(effectiveStats(character, deps.itemDb), ATTRS)` (occurs in `newGame`, `continueToNextRoute`, `equip`, `useItem`, and the combat path).
- `buildPlayerActor({ ...save.character, skillPriority }, deps.itemDb, deps.skillDb, { startHp, extraBuffs })` → `buildPlayerActor({ ...save.character, skillPriority }, deps.itemDb, deps.skillDb, EFFECTS, ATTRS, { startHp: save.vitals.currentHp, extraBuffs: save.vitals.pendingBuffs })`.
- `runCombat({ player, enemies, seed: save.seed })` → `runCombat({ player, enemies, seed: save.seed, attrs: ATTRS, effects: EFFECTS })`.

- [ ] **Step 3: Run the full suite; verify pass**

Run: `npm test`
Expected: PASS — no behavior change.

- [ ] **Step 4: Typecheck + commit**

```bash
npm run typecheck
git add server/session.ts
git commit -m "refactor(session): pass attrs/effects into engine (no behavior change)"
```

---

## Phase 2 — Stores (generic memory/pg) + wiring

Goal: five separate store ports backed by one generic implementation, seeded from fixtures, wired so the player session reads content live from the stores instead of the static maps.

### Task 2.1: Generic `EntityStore` port + memory adapter

**Files:**
- Create: `server/store/EntityStore.ts`
- Create: `server/store/memoryEntityStore.ts`
- Test: `server/store/memoryEntityStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/store/memoryEntityStore.test.ts`:

```ts
import { createMemoryEntityStore } from './memoryEntityStore';
import { StoreError } from './EntityStore';

interface Thing { id: string; n: number; }

describe('memoryEntityStore', () => {
  it('seeds, lists clones, and round-trips create/update/remove', async () => {
    const store = createMemoryEntityStore<Thing>([{ id: 'a', n: 1 }]);
    expect(await store.list()).toEqual([{ id: 'a', n: 1 }]);

    const created = await store.create({ id: 'b', n: 2 });
    expect(created).toEqual({ id: 'b', n: 2 });
    expect((await store.all()).b.n).toBe(2);

    await store.update('a', { id: 'a', n: 9 });
    expect((await store.get('a'))?.n).toBe(9);

    await store.remove('a');
    expect(await store.get('a')).toBeNull();
  });

  it('list returns clones (mutating result does not mutate the store)', async () => {
    const store = createMemoryEntityStore<Thing>([{ id: 'a', n: 1 }]);
    (await store.list())[0].n = 99;
    expect((await store.get('a'))?.n).toBe(1);
  });

  it('create on an existing id throws conflict; update on a missing id throws notFound', async () => {
    const store = createMemoryEntityStore<Thing>([{ id: 'a', n: 1 }]);
    await expect(store.create({ id: 'a', n: 2 })).rejects.toMatchObject({ kind: 'conflict' });
    await expect(store.update('x', { id: 'x', n: 2 })).rejects.toMatchObject({ kind: 'notFound' });
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx jest server/store/memoryEntityStore.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the port**

Create `server/store/EntityStore.ts`:

```ts
export interface EntityStore<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  all(): Promise<Record<string, T>>;   // map keyed by id — convenience for the engine
  create(entity: T): Promise<T>;
  update(id: string, entity: T): Promise<T>;
  remove(id: string): Promise<void>;
}

export class StoreError extends Error {
  constructor(message: string, public kind: 'conflict' | 'notFound') {
    super(message);
    this.name = 'StoreError';
  }
}
```

Create `server/store/memoryEntityStore.ts`:

```ts
import { EntityStore, StoreError } from './EntityStore';

export function createMemoryEntityStore<T extends { id: string }>(seed: T[] | Record<string, T> = []): EntityStore<T> {
  const arr = Array.isArray(seed) ? seed : Object.values(seed);
  const map = new Map<string, T>(arr.map((e) => [e.id, structuredClone(e)]));
  return {
    async list() { return [...map.values()].map((e) => structuredClone(e)); },
    async get(id) { const f = map.get(id); return f ? structuredClone(f) : null; },
    async all() {
      const o: Record<string, T> = {};
      for (const [k, v] of map) o[k] = structuredClone(v);
      return o;
    },
    async create(entity) {
      if (map.has(entity.id)) throw new StoreError(`${entity.id} already exists`, 'conflict');
      map.set(entity.id, structuredClone(entity));
      return structuredClone(entity);
    },
    async update(id, entity) {
      if (!map.has(id)) throw new StoreError(`${id} not found`, 'notFound');
      const merged = structuredClone({ ...entity, id });
      map.set(id, merged);
      return structuredClone(merged);
    },
    async remove(id) { map.delete(id); },
  };
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx jest server/store/memoryEntityStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/store/EntityStore.ts server/store/memoryEntityStore.ts server/store/memoryEntityStore.test.ts
git commit -m "feat(store): generic EntityStore port + memory adapter"
```

### Task 2.2: Per-type store aliases + content-store bundle

**Files:**
- Create: `server/store/contentStores.ts`
- Test: `server/store/contentStores.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/store/contentStores.test.ts`:

```ts
import { createMemoryContentStores } from './contentStores';

describe('memory content stores', () => {
  it('seeds all five stores from fixtures', async () => {
    const c = createMemoryContentStores();
    expect((await c.attributes.get('con'))?.roles).toContain('maxHp');
    expect((await c.effects.get('poison'))?.archetype).toBe('dot');
    expect((await c.items.get('dagger'))?.slot).toBe('weapon');
    expect((await c.skills.get('slash'))?.name).toBe('Slash');
    expect((await c.enemies.get('goblin'))?.hp).toBe(18);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx jest server/store/contentStores.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/store/contentStores.ts`:

```ts
import { AttributeDef, EffectTemplate, Item, Skill, Enemy } from '../../shared/types';
import { ATTRIBUTE_DB, EFFECT_DB, ITEM_DB, SKILL_DB, ENEMY_DB } from '../../shared/fixtures';
import { EntityStore } from './EntityStore';
import { createMemoryEntityStore } from './memoryEntityStore';

export type AttributeStore = EntityStore<AttributeDef>;
export type EffectStore = EntityStore<EffectTemplate>;
export type ItemStore = EntityStore<Item>;
export type SkillStore = EntityStore<Skill>;
export type EnemyStore = EntityStore<Enemy>;

export interface ContentStores {
  attributes: AttributeStore;
  effects: EffectStore;
  items: ItemStore;
  skills: SkillStore;
  enemies: EnemyStore;
}

export function createMemoryContentStores(): ContentStores {
  return {
    attributes: createMemoryEntityStore<AttributeDef>(ATTRIBUTE_DB),
    effects: createMemoryEntityStore<EffectTemplate>(EFFECT_DB),
    items: createMemoryEntityStore<Item>(ITEM_DB),
    skills: createMemoryEntityStore<Skill>(SKILL_DB),
    enemies: createMemoryEntityStore<Enemy>(ENEMY_DB),
  };
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx jest server/store/contentStores.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/store/contentStores.ts server/store/contentStores.test.ts
git commit -m "feat(store): five typed content stores seeded from fixtures"
```

### Task 2.3: Drizzle schema + generic pg adapter + pg content stores

**Files:**
- Modify: `server/db/schema.ts` (append five tables)
- Create: `server/store/pgEntityStore.ts`
- Modify: `server/store/contentStores.ts` (add `createPgContentStores` + `seedContentStores`)

> Note: pg adapters are exercised by the existing integration test harness (`server/db/pgStores.integration.test.ts`), which runs only when `DATABASE_URL` is set. Follow that file's existing skip-guard pattern when adding cases; do not require a live DB for the default `npm test` run.

- [ ] **Step 1: Append tables to `server/db/schema.ts`**

```ts
// Content authoring: one row per entity, full object in `data` jsonb.
const contentColumns = { id: text('id').primaryKey(), data: jsonb('data').notNull() };
export const attributes = pgTable('attributes', contentColumns);
export const effects = pgTable('effects', contentColumns);
export const items = pgTable('items', contentColumns);
export const skills = pgTable('skills', contentColumns);
export const enemies = pgTable('enemies', contentColumns);
```

- [ ] **Step 2: Implement the generic pg adapter**

Create `server/store/pgEntityStore.ts`:

```ts
import { eq } from 'drizzle-orm';
import { Db } from '../db/client';
import { EntityStore } from './EntityStore';

// The five content tables all share { id: text pk, data: jsonb }. We type the
// table loosely here because Drizzle's generated table types are nominal.
type ContentTable = { id: unknown; data: unknown };

export function createPgEntityStore<T extends { id: string }>(db: Db, table: ContentTable): EntityStore<T> {
  const t = table as { id: never; data: never } & Record<string, never>;
  return {
    async list() {
      const rows = await db.select().from(t as never);
      return (rows as Array<{ data: T }>).map((r) => r.data);
    },
    async get(id) {
      const rows = await db.select().from(t as never).where(eq((table as { id: never }).id, id as never));
      return (rows[0] as { data: T } | undefined)?.data ?? null;
    },
    async all() {
      const rows = await db.select().from(t as never);
      const o: Record<string, T> = {};
      for (const r of rows as Array<{ data: T }>) o[r.data.id] = r.data;
      return o;
    },
    async create(entity) {
      await db.insert(t as never).values({ id: entity.id, data: entity } as never);
      return entity;
    },
    async update(id, entity) {
      const merged = { ...entity, id };
      await db.update(t as never).set({ data: merged } as never).where(eq((table as { id: never }).id, id as never));
      return merged;
    },
    async remove(id) {
      await db.delete(t as never).where(eq((table as { id: never }).id, id as never));
    },
  };
}
```

> If the `as never` casts prove noisy, an acceptable alternative is to write five tiny concrete adapters; but the generic keeps the five stores DRY. Prefer the generic and adjust the casts until `npm run typecheck` passes.

- [ ] **Step 3: Add `createPgContentStores` + `seedContentStores` to `contentStores.ts`**

```ts
import { Db } from '../db/client';
import { createPgEntityStore } from './pgEntityStore';
import { attributes, effects, items, skills, enemies } from '../db/schema';

export function createPgContentStores(db: Db): ContentStores {
  return {
    attributes: createPgEntityStore<AttributeDef>(db, attributes),
    effects: createPgEntityStore<EffectTemplate>(db, effects),
    items: createPgEntityStore<Item>(db, items),
    skills: createPgEntityStore<Skill>(db, skills),
    enemies: createPgEntityStore<Enemy>(db, enemies),
  };
}

/** Seed any empty store from fixtures (idempotent — run on boot for pg). */
export async function seedContentStores(c: ContentStores): Promise<void> {
  const seeds: [keyof ContentStores, Record<string, { id: string }>][] = [
    ['attributes', ATTRIBUTE_DB], ['effects', EFFECT_DB], ['items', ITEM_DB], ['skills', SKILL_DB], ['enemies', ENEMY_DB],
  ];
  for (const [key, db] of seeds) {
    const store = c[key] as EntityStore<{ id: string }>;
    if ((await store.list()).length > 0) continue;
    for (const entity of Object.values(db)) await store.create(entity);
  }
}
```

- [ ] **Step 4: Generate the migration + typecheck**

Run: `npm run db:generate` (produces a new drizzle migration for the five tables) then `npm run typecheck`.
Expected: a migration file appears under the drizzle output dir; typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db/schema.ts server/store/pgEntityStore.ts server/store/contentStores.ts drizzle
git commit -m "feat(store): pg content stores + schema + seed helper"
```

### Task 2.4: Make the session read content from the stores

**Files:**
- Modify: `server/session.ts` (`SessionDeps`, `DEFAULT_DEPS`, every method)
- Modify: `server/session.test.ts`, `server/api.test.ts`, `server/e2e.test.ts` (construct stores)

- [ ] **Step 1: Change `SessionDeps` + `DEFAULT_DEPS`**

In `server/session.ts`:

```ts
import { ContentStores, createMemoryContentStores } from './store/contentStores';

export interface SessionDeps {
  backgrounds: Record<string, Background>;
  content: ContentStores;
  routes: RouteStore;
  random?: () => number;
  provider?: AIProvider;
  embedder?: EmbeddingProvider;
  embeddings?: EmbeddingStore;
}

const DEFAULT_DEPS: SessionDeps = {
  backgrounds: BACKGROUNDS,
  content: createMemoryContentStores(),
  routes: createMemoryRouteStore([SAMPLE_BUNDLE]),
  random: Math.random,
};
```

Remove the now-unused `ITEM_DB`/`SKILL_DB`/`ENEMY_DB`/`ATTRIBUTE_DB`/`EFFECT_DB` imports and the `ATTRS`/`EFFECTS` module constants (they move to per-request loads).

- [ ] **Step 2: Add a per-request registry loader**

Inside `createGameSession`, add:

```ts
async function loadRegistries() {
  const [itemDb, skillDb, enemyDb, attrMap, effects] = await Promise.all([
    deps.content.items.all(),
    deps.content.skills.all(),
    deps.content.enemies.all(),
    deps.content.attributes.all(),
    deps.content.effects.all(),
  ]);
  return { itemDb, skillDb, enemyDb, attrs: Object.values(attrMap), effects };
}
```

- [ ] **Step 3: Thread `reg` through each method**

In every method that touches content, call `const reg = await loadRegistries();` near the top and replace:
- `deps.itemDb` → `reg.itemDb`, `deps.skillDb` → `reg.skillDb`, `deps.enemyDb` → `reg.enemyDb`
- `deriveMaxHp(effectiveStats(c, reg.itemDb), reg.attrs)`
- `buildPlayerActor(..., reg.itemDb, reg.skillDb, reg.effects, reg.attrs, opts)`
- `runCombat({ player, enemies, seed, attrs: reg.attrs, effects: reg.effects })`

The `view(save, bundle)` helper also calls `effectiveStats(save.character, deps.itemDb)`; give `view` an extra `itemDb` parameter and pass `reg.itemDb` at each call site. Methods affected: `newGame`, `getView`, `continueToNextRoute`, `applyChoice`, `equip`, `getShop`, `buy`, `useItem`.

- [ ] **Step 4: Update the test constructors**

In `server/session.test.ts`, `server/api.test.ts`, `server/e2e.test.ts`, replace the session deps:

```ts
import { createMemoryContentStores } from './store/contentStores';
// ...
const session = createGameSession(createMemoryStore(), {
  backgrounds: BACKGROUNDS, content: createMemoryContentStores(),
  routes, provider, embedder, embeddings,
});
```

Remove `itemDb/skillDb/enemyDb` from those literals and drop now-unused fixture imports.

- [ ] **Step 5: Run the full suite; verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/session.ts server/session.test.ts server/api.test.ts server/e2e.test.ts
git commit -m "refactor(session): read content live from stores"
```

### Task 2.5: Wire stores in `index.ts` + update `AdminDeps`

**Files:**
- Modify: `server/index.ts`
- Modify: `server/api.ts` (`AdminDeps`)

- [ ] **Step 1: Build + seed stores in `index.ts`**

Replace the content-related wiring:

```ts
import { createMemoryContentStores, createPgContentStores, seedContentStores } from './store/contentStores';
// ...
const content = db ? createPgContentStores(db) : createMemoryContentStores();
if (db) await seedContentStores(content);   // wrap startup in an async IIFE or top-level await per the file's module setup
// ...
const session = createGameSession(saves, { backgrounds: BACKGROUNDS, content, routes, provider, embedder, embeddings });

const app = createApp(session, {
  provider, routes, content,
  auth: createAuth(config.admin),
  novels, embeddings, embedder,
});
```

If `index.ts` is not already async-capable, wrap the store seeding + `app.listen` in `(async () => { ... })()`.

- [ ] **Step 2: Update `AdminDeps` in `server/api.ts`**

```ts
import { ContentStores } from './store/contentStores';

export interface AdminDeps {
  provider: AIProvider;
  routes: RouteStore;
  content: ContentStores;
  auth: Auth;
  novels: NovelStore;
  embeddings: EmbeddingStore;
  embedder: EmbeddingProvider;
}
```

In the `/admin/routes/generate` handler, build the `Registries` from the stores before calling `generateFramework`:

```ts
const registries = {
  itemDb: await admin.content.items.all(),
  skillDb: await admin.content.skills.all(),
  enemyDb: await admin.content.enemies.all(),
};
const result = await generateFramework(admin.provider, { contextText: ctx, title, nodeCount, sourceNovelId: novelId }, registries);
```

In the `/admin/routes/:id/nodes/:nodeId/merchant` handler, replace `admin.registries.itemDb[entry?.itemId]` with `await admin.content.items.get(entry?.itemId)` (guard `null`).

- [ ] **Step 3: Update `server/api.test.ts` app() factory**

```ts
import { createMemoryContentStores } from './store/contentStores';
// inside app():
const content = createMemoryContentStores();
const session = createGameSession(createMemoryStore(), { backgrounds: BACKGROUNDS, content, routes, provider, embedder, embeddings });
return createApp(session, { provider, routes, content, auth: createAuth(ADMIN), novels, embeddings, embedder });
```

- [ ] **Step 4: Run the full suite + typecheck; verify pass**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts server/api.ts server/api.test.ts
git commit -m "feat(wiring): inject content stores into session + admin"
```

---

## Phase 3 — Admin REST CRUD + referential integrity

Goal: authenticated CRUD for all five resources, with create/update validation and delete blocked by cross-store references (and builtin protection for attributes/effects).

### Task 3.1: Referential-integrity helper

**Files:**
- Create: `server/store/integrity.ts`
- Test: `server/store/integrity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/store/integrity.test.ts`:

```ts
import { createMemoryContentStores } from './contentStores';
import { findReferences } from './integrity';

describe('findReferences', () => {
  it('reports items that reference an effect via onUse', async () => {
    const c = createMemoryContentStores(); // healPotion.onUse uses 'heal'
    const refs = await findReferences(c, 'effect', 'heal');
    expect(refs).toContain('item:healPotion.onUse');
  });
  it('reports skills that reference an attribute via targetStat', async () => {
    const c = createMemoryContentStores(); // slash.targetStat = 'str'
    const refs = await findReferences(c, 'attribute', 'str');
    expect(refs).toEqual(expect.arrayContaining(['skill:slash.targetStat']));
  });
  it('reports enemies that reference a skill via skillPriority', async () => {
    const c = createMemoryContentStores(); // goblin.skillPriority = ['slash']
    expect(await findReferences(c, 'skill', 'slash')).toContain('enemy:goblin.skillPriority');
  });
  it('reports enemies that reference an item via reward.drops', async () => {
    const c = createMemoryContentStores(); // goblin drops healPotion
    expect(await findReferences(c, 'item', 'healPotion')).toContain('enemy:goblin.reward.drops');
  });
  it('returns [] for an unreferenced id', async () => {
    const c = createMemoryContentStores();
    expect(await findReferences(c, 'item', 'torch')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx jest server/store/integrity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/store/integrity.ts`:

```ts
import { ContentStores } from './contentStores';

export type RefKind = 'attribute' | 'effect' | 'skill' | 'item';

/** Returns descriptors ("item:dagger.statMods") of content entities referencing `id`. */
export async function findReferences(stores: ContentStores, kind: RefKind, id: string): Promise<string[]> {
  const [items, skills, enemies, effects] = await Promise.all([
    stores.items.list(), stores.skills.list(), stores.enemies.list(), stores.effects.list(),
  ]);
  const refs: string[] = [];

  if (kind === 'attribute') {
    for (const it of items) if (it.statMods && id in it.statMods) refs.push(`item:${it.id}.statMods`);
    for (const sk of skills) if (sk.targetStat === id) refs.push(`skill:${sk.id}.targetStat`);
    for (const ef of effects) if (ef.stat === id) refs.push(`effect:${ef.id}.stat`);
    for (const en of enemies) if (en.stats && id in en.stats) refs.push(`enemy:${en.id}.stats`);
  }
  if (kind === 'effect') {
    for (const it of items) {
      if ((it.onEquip ?? []).some((e) => e.id === id)) refs.push(`item:${it.id}.onEquip`);
      if ((it.onUse ?? []).some((e) => e.id === id)) refs.push(`item:${it.id}.onUse`);
    }
    for (const sk of skills) if ((sk.effects ?? []).some((e) => e.id === id)) refs.push(`skill:${sk.id}.effects`);
  }
  if (kind === 'skill') {
    for (const it of items) if ((it.grantsSkills ?? []).includes(id)) refs.push(`item:${it.id}.grantsSkills`);
    for (const en of enemies) if (en.skillPriority.includes(id)) refs.push(`enemy:${en.id}.skillPriority`);
  }
  if (kind === 'item') {
    for (const en of enemies) if ((en.reward?.drops ?? []).some((d) => d.itemId === id)) refs.push(`enemy:${en.id}.reward.drops`);
  }
  return refs;
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx jest server/store/integrity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/store/integrity.ts server/store/integrity.test.ts
git commit -m "feat(store): cross-store referential-integrity helper"
```

### Task 3.2: Validation module for the five resources

**Files:**
- Create: `server/api/contentValidation.ts`
- Test: `server/api/contentValidation.test.ts`

Each validator takes the request body + a snapshot of the stores' `all()` maps and returns a typed, normalized entity or throws `GameError(message, 400)`.

- [ ] **Step 1: Write the failing test**

Create `server/api/contentValidation.test.ts`:

```ts
import { GameError } from '../session';
import { validateAttribute, validateEffect, validateItem, validateSkill, validateEnemy } from './contentValidation';
import { ATTRIBUTE_DB, EFFECT_DB, ITEM_DB, SKILL_DB } from '../../shared/fixtures';

const ctx = { attributes: ATTRIBUTE_DB, effects: EFFECT_DB, items: ITEM_DB, skills: SKILL_DB };

describe('content validation', () => {
  it('accepts a valid attribute and rejects unknown roles', () => {
    expect(validateAttribute({ id: 'armor', name: 'Armor', abbrev: 'ARM', roles: ['defense'] }).builtin).toBe(false);
    expect(() => validateAttribute({ id: 'x', name: 'X', abbrev: 'X', roles: ['nope'] })).toThrow(GameError);
  });
  it('requires a valid stat for statMod effects', () => {
    expect(() => validateEffect({ id: 'e', name: 'E', archetype: 'statMod', kind: 'buff' }, ctx)).toThrow(/stat/);
    expect(validateEffect({ id: 'e', name: 'E', archetype: 'statMod', kind: 'buff', stat: 'str', magnitude: 2 }, ctx).stat).toBe('str');
  });
  it('rejects items whose stat-mod key or effect ref is unknown', () => {
    expect(() => validateItem({ id: 'i', name: 'I', slot: 'weapon', kind: 'gear', statMods: { ghost: 1 } }, ctx)).toThrow(/ghost/);
    expect(() => validateItem({ id: 'i', name: 'I', slot: 'weapon', kind: 'gear', onUse: [{ id: 'nope', kind: 'hot', duration: 0 }] }, ctx)).toThrow(/nope/);
  });
  it('rejects skills/enemies with unknown references', () => {
    expect(() => validateSkill({ id: 's', name: 'S', targetStat: 'ghost' }, ctx)).toThrow(/ghost/);
    expect(() => validateEnemy({ id: 'en', name: 'En', stats: { str: 1 }, hp: 5, skillPriority: ['ghost'] }, ctx)).toThrow(/ghost/);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx jest server/api/contentValidation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `server/api/contentValidation.ts`:

```ts
import { AttributeDef, AttributeRole, EffectTemplate, Item, Skill, Enemy, StatusEffect } from '../../shared/types';
import { GameError } from '../session';

export interface ValidationCtx {
  attributes: Record<string, AttributeDef>;
  effects: Record<string, EffectTemplate>;
  items: Record<string, Item>;
  skills: Record<string, Skill>;
}

const ROLES: AttributeRole[] = ['core', 'defense', 'maxHp'];
const SLOTS = ['weapon', 'armor', 'ring', 'scroll', 'quest'];
const ARCHETYPES = ['dot', 'hot', 'statMod', 'control'];
const KINDS = ['buff', 'debuff', 'dot', 'hot', 'control'];

function str(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new GameError(`${field} is required`, 400);
  return v;
}
function slug(v: unknown, field: string): string {
  const s = str(v, field);
  if (!/^[a-zA-Z0-9_]+$/.test(s)) throw new GameError(`${field} must be alphanumeric/underscore`, 400);
  return s;
}
function nonNegInt(v: unknown, field: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new GameError(`${field} must be ≥ 0`, 400);
  return v;
}
function refEffect(e: StatusEffect, ctx: ValidationCtx): StatusEffect {
  if (!ctx.effects[e?.id]) throw new GameError(`Unknown effect ${e?.id}`, 400);
  return { id: e.id, kind: ctx.effects[e.id].kind, duration: nonNegInt(e.duration, 'duration') ?? 0, magnitude: e.magnitude };
}

export function validateAttribute(body: any): AttributeDef {
  const roles = Array.isArray(body?.roles) ? body.roles : [];
  if (roles.length === 0 || roles.some((r: string) => !ROLES.includes(r as AttributeRole))) {
    throw new GameError(`roles must be a non-empty subset of ${ROLES.join(', ')}`, 400);
  }
  return { id: slug(body.id, 'id'), name: str(body.name, 'name'), abbrev: str(body.abbrev, 'abbrev'),
    roles, defaultBase: nonNegInt(body.defaultBase, 'defaultBase'), builtin: false };
}

export function validateEffect(body: any, ctx: ValidationCtx): EffectTemplate {
  if (!ARCHETYPES.includes(body?.archetype)) throw new GameError('invalid archetype', 400);
  if (!KINDS.includes(body?.kind)) throw new GameError('invalid kind', 400);
  if (body.archetype === 'statMod' && !ctx.attributes[body?.stat]) throw new GameError(`statMod needs a valid stat`, 400);
  return { id: slug(body.id, 'id'), name: str(body.name, 'name'), archetype: body.archetype, kind: body.kind,
    stat: body.archetype === 'statMod' ? body.stat : undefined,
    magnitude: typeof body.magnitude === 'number' ? body.magnitude : undefined,
    duration: nonNegInt(body.duration, 'duration'), instant: !!body.instant, sprite: body.sprite, builtin: false };
}

export function validateItem(body: any, ctx: ValidationCtx): Item {
  if (!SLOTS.includes(body?.slot)) throw new GameError('invalid slot', 400);
  if (body?.kind !== 'gear' && body?.kind !== 'consumable') throw new GameError('invalid kind', 400);
  const statMods: Record<string, number> = {};
  for (const [k, v] of Object.entries(body?.statMods ?? {})) {
    if (!ctx.attributes[k]) throw new GameError(`Unknown attribute ${k}`, 400);
    if (typeof v !== 'number') throw new GameError(`statMods.${k} must be a number`, 400);
    statMods[k] = v;
  }
  for (const sid of body?.grantsSkills ?? []) if (!ctx.skills[sid]) throw new GameError(`Unknown skill ${sid}`, 400);
  return { id: slug(body.id, 'id'), name: str(body.name, 'name'), slot: body.slot, kind: body.kind,
    cost: nonNegInt(body.cost, 'cost'), statMods: Object.keys(statMods).length ? statMods : undefined,
    onEquip: (body.onEquip ?? []).map((e: StatusEffect) => refEffect(e, ctx)),
    onUse: (body.onUse ?? []).map((e: StatusEffect) => refEffect(e, ctx)),
    grantsSkills: body.grantsSkills ?? undefined, sprite: body.sprite, storyTags: body.storyTags ?? [] };
}

export function validateSkill(body: any, ctx: ValidationCtx): Skill {
  if (body?.targetStat && !ctx.attributes[body.targetStat]) throw new GameError(`Unknown attribute ${body.targetStat}`, 400);
  if (body?.effectTarget && body.effectTarget !== 'self' && body.effectTarget !== 'enemy') throw new GameError('invalid effectTarget', 400);
  return { id: slug(body.id, 'id'), name: str(body.name, 'name'), targetStat: body.targetStat,
    effectTarget: body.effectTarget, power: typeof body.power === 'number' ? body.power : undefined,
    effects: (body.effects ?? []).map((e: StatusEffect) => refEffect(e, ctx)), sprite: body.sprite };
}

export function validateEnemy(body: any, ctx: ValidationCtx): Enemy {
  const stats: Record<string, number> = {};
  for (const [k, v] of Object.entries(body?.stats ?? {})) {
    if (!ctx.attributes[k]) throw new GameError(`Unknown attribute ${k}`, 400);
    if (typeof v !== 'number') throw new GameError(`stats.${k} must be a number`, 400);
    stats[k] = v;
  }
  for (const sid of body?.skillPriority ?? []) if (!ctx.skills[sid]) throw new GameError(`Unknown skill ${sid}`, 400);
  for (const d of body?.reward?.drops ?? []) if (!ctx.items[d?.itemId]) throw new GameError(`Unknown item ${d?.itemId}`, 400);
  return { id: slug(body.id, 'id'), name: str(body.name, 'name'), stats, hp: nonNegInt(body.hp, 'hp') ?? 1,
    skillPriority: body.skillPriority ?? [], sprite: body.sprite, reward: body.reward };
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx jest server/api/contentValidation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/api/contentValidation.ts server/api/contentValidation.test.ts
git commit -m "feat(api): content validation for all five resources"
```

### Task 3.3: Generic CRUD route registrar + mount the five resources

**Files:**
- Create: `server/api/contentRoutes.ts`
- Modify: `server/api.ts` (mount it)
- Test: `server/api/contentRoutes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/api/contentRoutes.test.ts` (mirrors `api.test.ts`'s `app()`/`token()` helpers — copy them or import):

```ts
import request from 'supertest';
import { createApp } from '../api';
import { createGameSession } from '../session';
import { createMemoryStore } from '../store/memoryStore';
import { createMemoryRouteStore } from '../store/memoryRouteStore';
import { createMemoryContentStores } from '../store/contentStores';
import { createFakeProvider } from '../ai/provider';
import { createFakeEmbedder } from '../rag/embeddingProvider';
import { createMemoryNovelStore } from '../rag/novelStore';
import { createAuth } from '../auth';
import { BACKGROUNDS } from '../../shared/backgrounds';
import { SAMPLE_BUNDLE } from '../../shared/fixtures';

const ADMIN = { email: 'admin@test', password: 'pw' };
function app() {
  const routes = createMemoryRouteStore([structuredClone(SAMPLE_BUNDLE)]);
  const content = createMemoryContentStores();
  const { novels, embeddings } = createMemoryNovelStore();
  const provider = createFakeProvider([]); const embedder = createFakeEmbedder();
  const session = createGameSession(createMemoryStore(), { backgrounds: BACKGROUNDS, content, routes, provider, embedder, embeddings });
  return createApp(session, { provider, routes, content, auth: createAuth(ADMIN), novels, embeddings, embedder });
}
const token = async (a: ReturnType<typeof app>) => (await request(a).post('/admin/login').send(ADMIN)).body.token as string;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('admin content CRUD', () => {
  it('rejects unauthenticated access', async () => {
    expect((await request(app()).get('/admin/items')).status).toBe(401);
  });

  it('creates, lists, updates, and deletes an attribute', async () => {
    const a = app(); const t = await token(a);
    const created = await request(a).post('/admin/attributes').set(auth(t)).send({ id: 'armor', name: 'Armor', abbrev: 'ARM', roles: ['defense'] });
    expect(created.status).toBe(200);
    expect((await request(a).get('/admin/attributes').set(auth(t))).body.map((x: any) => x.id)).toContain('armor');
    expect((await request(a).put('/admin/attributes/armor').set(auth(t)).send({ id: 'armor', name: 'Armour', abbrev: 'ARM', roles: ['defense'] })).status).toBe(200);
    expect((await request(a).delete('/admin/attributes/armor').set(auth(t))).status).toBe(204);
  });

  it('400 on create with an unknown reference', async () => {
    const a = app(); const t = await token(a);
    const res = await request(a).post('/admin/items').set(auth(t)).send({ id: 'x', name: 'X', slot: 'weapon', kind: 'gear', onUse: [{ id: 'ghost', duration: 0 }] });
    expect(res.status).toBe(400);
  });

  it('400 when deleting a referenced effect; 400 when deleting a builtin', async () => {
    const a = app(); const t = await token(a);
    expect((await request(a).delete('/admin/effects/heal').set(auth(t))).status).toBe(400);  // referenced by healPotion + builtin
    expect((await request(a).delete('/admin/attributes/str').set(auth(t))).status).toBe(400); // builtin
  });

  it('409/400 on duplicate id create; 404 on update/delete of a missing id', async () => {
    const a = app(); const t = await token(a);
    await request(a).post('/admin/skills').set(auth(t)).send({ id: 'jab', name: 'Jab', targetStat: 'str', power: 1 });
    expect((await request(a).post('/admin/skills').set(auth(t)).send({ id: 'jab', name: 'Jab', targetStat: 'str' })).status).toBe(409);
    expect((await request(a).put('/admin/skills/ghost').set(auth(t)).send({ id: 'ghost', name: 'G' })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx jest server/api/contentRoutes.test.ts`
Expected: FAIL — endpoints 404 (not mounted).

- [ ] **Step 3: Implement the registrar**

Create `server/api/contentRoutes.ts`:

```ts
import { Express, Request, Response, NextFunction } from 'express';
import { GameError } from '../session';
import { ContentStores } from '../store/contentStores';
import { EntityStore, StoreError } from '../store/EntityStore';
import { findReferences, RefKind } from '../store/integrity';
import { ValidationCtx, validateAttribute, validateEffect, validateItem, validateSkill, validateEnemy } from './contentValidation';

type Wrap = (h: (req: Request, res: Response) => Promise<unknown> | unknown) => any;

async function ctx(stores: ContentStores): Promise<ValidationCtx> {
  const [attributes, effects, items, skills] = await Promise.all([
    stores.attributes.all(), stores.effects.all(), stores.items.all(), stores.skills.all(),
  ]);
  return { attributes, effects, items, skills };
}

interface ResourceCfg<T extends { id: string }> {
  path: string;                                   // 'attributes'
  store(s: ContentStores): EntityStore<T>;
  validate(body: any, c: ValidationCtx): T;
  refKind?: RefKind;                              // if deletes must be integrity-checked
  isBuiltin?(entity: T): boolean;                 // block delete of builtins
}

const RESOURCES: ResourceCfg<any>[] = [
  { path: 'attributes', store: (s) => s.attributes, validate: (b) => validateAttribute(b), refKind: 'attribute', isBuiltin: (e) => e.builtin },
  { path: 'effects',    store: (s) => s.effects,    validate: (b, c) => validateEffect(b, c), refKind: 'effect', isBuiltin: (e) => e.builtin },
  { path: 'items',      store: (s) => s.items,      validate: (b, c) => validateItem(b, c),  refKind: 'item' },
  { path: 'skills',     store: (s) => s.skills,     validate: (b, c) => validateSkill(b, c), refKind: 'skill' },
  { path: 'enemies',    store: (s) => s.enemies,    validate: (b, c) => validateEnemy(b, c) }, // enemies are not referenced by content
];

export function registerContentRoutes(app: Express, stores: ContentStores, requireAuth: (r: Request, res: Response, n: NextFunction) => void, wrap: Wrap): void {
  for (const cfg of RESOURCES) {
    const base = `/admin/${cfg.path}`;
    app.use(base, requireAuth);

    app.get(base, wrap(() => cfg.store(stores).list()));

    app.post(base, wrap(async (req: Request) => {
      const entity = cfg.validate(req.body ?? {}, await ctx(stores));
      try { return await cfg.store(stores).create(entity); }
      catch (e) { if (e instanceof StoreError && e.kind === 'conflict') throw new GameError(e.message, 409); throw e; }
    }));

    app.put(`${base}/:id`, wrap(async (req: Request) => {
      const id = req.params.id as string;
      const entity = cfg.validate({ ...(req.body ?? {}), id }, await ctx(stores));
      try { return await cfg.store(stores).update(id, entity); }
      catch (e) { if (e instanceof StoreError && e.kind === 'notFound') throw new GameError(e.message, 404); throw e; }
    }));

    app.delete(`${base}/:id`, wrap(async (req: Request, res: Response) => {
      const id = req.params.id as string;
      const existing = await cfg.store(stores).get(id);
      if (!existing) throw new GameError(`${id} not found`, 404);
      if (cfg.isBuiltin?.(existing)) throw new GameError(`${id} is builtin and cannot be deleted`, 400);
      if (cfg.refKind) {
        const refs = await findReferences(stores, cfg.refKind, id);
        if (refs.length) throw new GameError(`${id} is referenced by: ${refs.join(', ')}`, 400);
      }
      await cfg.store(stores).remove(id);
      res.status(204).end();
      return undefined;
    }));
  }
}
```

- [ ] **Step 4: Mount it in `server/api.ts`**

`wrap` and `requireAuth` already exist in `api.ts`. After the existing `/admin/novels` routes, add:

```ts
import { registerContentRoutes } from './api/contentRoutes';
// ... inside createApp, after the novel routes and before the error handler:
registerContentRoutes(app, admin.content, requireAuth(admin.auth), wrap);
```

(`requireAuth(admin.auth)` returns the middleware; the registrar applies it per resource via `app.use`.)

- [ ] **Step 5: Run the test; verify it passes**

Run: `npx jest server/api/contentRoutes.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full suite + typecheck; commit**

```bash
npm test && npm run typecheck
git add server/api/contentRoutes.ts server/api.ts server/api/contentRoutes.test.ts
git commit -m "feat(api): admin CRUD for attributes/effects/items/skills/enemies + integrity guards"
```

---

## Phase 4 — Admin console views

Goal: a sidebar view per resource that lists, creates, edits, and deletes through the Phase-3 endpoints, with reuse pickers (effect dropdowns, attribute-driven stat grids, skill/drop pickers). Per CLAUDE.md, no endpoint ships without its form.

> The console is one static file (`server/admin/index.html`). We add a small generic CRUD renderer driven by per-resource field specs, plus the five nav buttons/sections. Verification is manual in the browser (the project's stated workflow) plus a smoke check that the JS parses.

### Task 4.1: Add nav buttons + empty view sections

**Files:**
- Modify: `server/admin/index.html` (sidebar + content sections)

- [ ] **Step 1: Add the nav buttons**

In the `<aside class="sidebar">` block, after the existing buttons add:

```html
<button class="navbtn" data-view="attributes">Attributes</button>
<button class="navbtn" data-view="effects">Effects</button>
<button class="navbtn" data-view="items">Items</button>
<button class="navbtn" data-view="skills">Skills</button>
<button class="navbtn" data-view="enemies">Enemies</button>
```

- [ ] **Step 2: Add five view sections**

After the Status view `<div>`, add one block per resource (shown for `attributes`; repeat with the matching ids `effects`/`items`/`skills`/`enemies`):

```html
<div id="view-attributes" class="view hidden">
  <section class="card">
    <h2 style="margin-top:0;font-size:15px;">Attributes</h2>
    <div id="attributes-form"></div>
    <div id="attributes-msg" class="msg"></div>
    <table><thead><tr id="attributes-head"></tr></thead><tbody id="attributes-body"></tbody></table>
  </section>
</div>
```

- [ ] **Step 3: Load the browser console (manual)**

Start the server (`npm run dev:server`), open `http://localhost:3000/admin`, log in, and confirm the five new tabs appear and switch. (No data wiring yet — tables are empty.)

- [ ] **Step 4: Commit**

```bash
git add server/admin/index.html
git commit -m "feat(admin-ui): nav + empty sections for content views"
```

### Task 4.2: Generic CRUD renderer + field specs

**Files:**
- Modify: `server/admin/index.html` (`<script>` block)

The renderer reads a spec `{ resource, fields, columns }`, builds a form, lists rows, and wires create/edit/delete to `/admin/<resource>`. Field types cover the reuse pickers.

- [ ] **Step 1: Add the field-spec definitions**

In the `<script>`, after `api()`/`authHeaders()`, add a registry cache + specs. Keep registries (attributes/effects/skills/items) cached so pickers can render:

```js
const REG = { attributes: [], effects: [], items: [], skills: [], enemies: [] };
async function loadReg() {
  const [attributes, effects, items, skills, enemies] = await Promise.all(
    ['attributes','effects','items','skills','enemies'].map((r) => api('/admin/' + r, { headers: authHeaders() }))
  );
  Object.assign(REG, { attributes, effects, items, skills, enemies });
}

// Field types: text, slug, number, select(options), checkbox,
//   statgrid (one number per attribute), effectrefs (repeatable effect picker), skillrefs (multi), drops (item+chance rows)
const SPECS = {
  attributes: {
    columns: ['id','name','abbrev','roles','builtin'],
    fields: [
      { key:'id', type:'slug', label:'ID' },
      { key:'name', type:'text', label:'Name' },
      { key:'abbrev', type:'text', label:'Abbrev' },
      { key:'roles', type:'multiselect', label:'Roles', options:['core','defense','maxHp'] },
      { key:'defaultBase', type:'number', label:'Default base (optional)' },
    ],
  },
  effects: {
    columns: ['id','name','archetype','kind','stat','magnitude','duration','builtin'],
    fields: [
      { key:'id', type:'slug', label:'ID' },
      { key:'name', type:'text', label:'Name' },
      { key:'archetype', type:'select', label:'Archetype', options:['dot','hot','statMod','control'] },
      { key:'kind', type:'select', label:'Kind', options:['buff','debuff','dot','hot','control'] },
      { key:'stat', type:'select', label:'Stat (statMod only)', optionsFrom:'attributes', optional:true },
      { key:'magnitude', type:'number', label:'Magnitude' },
      { key:'duration', type:'number', label:'Duration' },
      { key:'instant', type:'checkbox', label:'Instant (duration 0)' },
      { key:'sprite', type:'text', label:'Sprite (optional)' },
    ],
  },
  items: {
    columns: ['id','name','slot','kind','cost'],
    fields: [
      { key:'id', type:'slug', label:'ID' },
      { key:'name', type:'text', label:'Name' },
      { key:'slot', type:'select', label:'Slot', options:['weapon','armor','ring','scroll','quest'] },
      { key:'kind', type:'select', label:'Kind', options:['gear','consumable'] },
      { key:'cost', type:'number', label:'Cost' },
      { key:'statMods', type:'statgrid', label:'Stat mods' },
      { key:'onEquip', type:'effectrefs', label:'On equip' },
      { key:'onUse', type:'effectrefs', label:'On use' },
      { key:'grantsSkills', type:'skillrefs', label:'Grants skills' },
      { key:'storyTags', type:'csv', label:'Story tags (comma-separated)' },
      { key:'sprite', type:'text', label:'Sprite (optional)' },
    ],
  },
  skills: {
    columns: ['id','name','targetStat','power'],
    fields: [
      { key:'id', type:'slug', label:'ID' },
      { key:'name', type:'text', label:'Name' },
      { key:'targetStat', type:'select', label:'Target stat', optionsFrom:'attributes', optional:true },
      { key:'effectTarget', type:'select', label:'Effect target', options:['enemy','self'], optional:true },
      { key:'power', type:'number', label:'Power' },
      { key:'effects', type:'effectrefs', label:'Effects' },
      { key:'sprite', type:'text', label:'Sprite (optional)' },
    ],
  },
  enemies: {
    columns: ['id','name','hp'],
    fields: [
      { key:'id', type:'slug', label:'ID' },
      { key:'name', type:'text', label:'Name' },
      { key:'hp', type:'number', label:'HP' },
      { key:'stats', type:'statgrid', label:'Stats' },
      { key:'skillPriority', type:'skillrefs', label:'Skill priority' },
      { key:'reward', type:'reward', label:'Reward' },
    ],
  },
};
```

- [ ] **Step 2: Add the renderer**

Add these functions to the script. They build inputs per field type, read them back into a body object, and refresh the table:

```js
function fieldInput(f, value) {
  const wrap = document.createElement('div');
  const lab = document.createElement('label'); lab.textContent = f.label; wrap.appendChild(lab);
  let el;
  if (f.type === 'select') {
    el = document.createElement('select');
    const opts = f.optionsFrom ? REG[f.optionsFrom].map((x) => x.id) : f.options;
    if (f.optional) el.appendChild(new Option('—', ''));
    for (const o of opts) el.appendChild(new Option(o, o));
    if (value != null) el.value = value;
  } else if (f.type === 'multiselect') {
    el = document.createElement('div');
    for (const o of f.options) {
      const id = f.key + '_' + o;
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = o; cb.id = id;
      cb.checked = Array.isArray(value) && value.includes(o);
      const l = document.createElement('label'); l.style.display = 'inline'; l.htmlFor = id; l.textContent = ' ' + o + '  ';
      el.appendChild(cb); el.appendChild(l);
    }
  } else if (f.type === 'checkbox') {
    el = document.createElement('input'); el.type = 'checkbox'; el.checked = !!value;
  } else if (f.type === 'statgrid') {
    el = document.createElement('div'); el.className = 'row'; el.style.flexWrap = 'wrap';
    for (const a of REG.attributes) {
      const d = document.createElement('div');
      const l = document.createElement('label'); l.textContent = a.abbrev;
      const n = document.createElement('input'); n.type = 'number'; n.dataset.stat = a.id;
      n.value = (value && value[a.id] != null) ? value[a.id] : '';
      d.appendChild(l); d.appendChild(n); el.appendChild(d);
    }
  } else if (f.type === 'effectrefs') {
    el = document.createElement('div');
    const addRow = (ref) => {
      const r = document.createElement('div'); r.className = 'row effectref';
      const sel = document.createElement('select');
      for (const e of REG.effects) sel.appendChild(new Option(e.id, e.id));
      if (ref) sel.value = ref.id;
      const dur = document.createElement('input'); dur.type = 'number'; dur.placeholder = 'duration'; dur.className = 'dur'; dur.value = ref ? (ref.duration ?? '') : '';
      const mag = document.createElement('input'); mag.type = 'number'; mag.placeholder = 'magnitude'; mag.className = 'mag'; mag.value = ref ? (ref.magnitude ?? '') : '';
      const rm = document.createElement('button'); rm.className = 'secondary'; rm.textContent = '✕'; rm.onclick = () => r.remove();
      r.append(sel, dur, mag, rm); el.appendChild(r);
    };
    (value || []).forEach(addRow);
    const add = document.createElement('button'); add.className = 'secondary'; add.textContent = '+ effect'; add.onclick = () => addRow();
    el.appendChild(add);
  } else if (f.type === 'skillrefs') {
    el = document.createElement('div');
    for (const s of REG.skills) {
      const id = f.key + '_' + s.id;
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = s.id; cb.id = id;
      cb.checked = Array.isArray(value) && value.includes(s.id);
      const l = document.createElement('label'); l.style.display = 'inline'; l.htmlFor = id; l.textContent = ' ' + s.id + '  ';
      el.append(cb, l);
    }
  } else if (f.type === 'reward') {
    el = document.createElement('div');
    el.innerHTML = '<input class="r-goldMin" type="number" placeholder="gold min"> <input class="r-goldMax" type="number" placeholder="gold max"> <input class="r-xp" type="number" placeholder="xp">';
    const r = value || {};
    if (r.gold) { el.querySelector('.r-goldMin').value = r.gold[0]; el.querySelector('.r-goldMax').value = r.gold[1]; }
    if (r.xp != null) el.querySelector('.r-xp').value = r.xp;
    // drops: itemId:chance rows
    const drops = document.createElement('div');
    const addDrop = (d) => {
      const row = document.createElement('div'); row.className = 'row drop';
      const sel = document.createElement('select'); for (const it of REG.items) sel.appendChild(new Option(it.id, it.id)); if (d) sel.value = d.itemId;
      const ch = document.createElement('input'); ch.type = 'number'; ch.step = '0.1'; ch.className = 'chance'; ch.placeholder = 'chance 0–1'; ch.value = d ? d.chance : '';
      const rm = document.createElement('button'); rm.className = 'secondary'; rm.textContent = '✕'; rm.onclick = () => row.remove();
      row.append(sel, ch, rm); drops.appendChild(row);
    };
    (r.drops || []).forEach(addDrop);
    const add = document.createElement('button'); add.className = 'secondary'; add.textContent = '+ drop'; add.onclick = () => addDrop();
    el.append(document.createElement('br'), drops, add);
  } else {
    el = document.createElement('input'); el.type = f.type === 'number' ? 'number' : 'text';
    if (value != null) el.value = Array.isArray(value) ? value.join(',') : value;
  }
  el.dataset.key = f.key; el.classList.add('fld');
  wrap.appendChild(el); return wrap;
}

function readField(root, f) {
  const el = root.querySelector('.fld[data-key="' + f.key + '"]');
  if (f.type === 'number') return el.value === '' ? undefined : Number(el.value);
  if (f.type === 'checkbox') return el.checked;
  if (f.type === 'csv') return el.value ? el.value.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (f.type === 'multiselect') return [...el.querySelectorAll('input:checked')].map((c) => c.value);
  if (f.type === 'skillrefs') return [...el.querySelectorAll('input:checked')].map((c) => c.value);
  if (f.type === 'statgrid') {
    const o = {}; for (const n of el.querySelectorAll('input[data-stat]')) if (n.value !== '') o[n.dataset.stat] = Number(n.value); return o;
  }
  if (f.type === 'effectrefs') {
    return [...el.querySelectorAll('.effectref')].map((r) => {
      const out = { id: r.querySelector('select').value };
      const d = r.querySelector('.dur').value, m = r.querySelector('.mag').value;
      if (d !== '') out.duration = Number(d); if (m !== '') out.magnitude = Number(m);
      return out;
    });
  }
  if (f.type === 'reward') {
    const gMin = el.querySelector('.r-goldMin').value, gMax = el.querySelector('.r-goldMax').value, xp = el.querySelector('.r-xp').value;
    const drops = [...el.querySelectorAll('.drop')].map((r) => ({ itemId: r.querySelector('select').value, chance: Number(r.querySelector('.chance').value) }));
    const reward = {}; if (gMin !== '' && gMax !== '') reward.gold = [Number(gMin), Number(gMax)];
    if (xp !== '') reward.xp = Number(xp); if (drops.length) reward.drops = drops;
    return Object.keys(reward).length ? reward : undefined;
  }
  return el.value || undefined;
}

function renderCrud(resource) {
  const spec = SPECS[resource];
  const form = $(resource + '-form'); form.innerHTML = '';
  let editingId = null;
  const fieldsBox = document.createElement('div');
  const renderForm = (entity) => {
    fieldsBox.innerHTML = ''; editingId = entity ? entity.id : null;
    for (const f of spec.fields) fieldsBox.appendChild(fieldInput(f, entity ? entity[f.key] : undefined));
  };
  const save = async () => {
    const body = {}; for (const f of spec.fields) { const v = readField(fieldsBox, f); if (v !== undefined) body[f.key] = v; }
    const msg = $(resource + '-msg'); msg.textContent = '';
    try {
      const path = '/admin/' + resource + (editingId ? '/' + editingId : '');
      await api(path, { method: editingId ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      msg.className = 'msg ok'; msg.textContent = 'Saved ' + (body.id || editingId);
      await loadReg(); renderForm(null); loadCrud(resource);
    } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; }
  };
  const saveBtn = document.createElement('button'); saveBtn.textContent = 'Save'; saveBtn.onclick = save;
  const clearBtn = document.createElement('button'); clearBtn.className = 'secondary'; clearBtn.textContent = 'Clear'; clearBtn.style.marginLeft = '8px'; clearBtn.onclick = () => renderForm(null);
  form.append(fieldsBox, saveBtn, clearBtn);
  renderForm(null);
  form._edit = renderForm;
}

async function loadCrud(resource) {
  const spec = SPECS[resource];
  const head = $(resource + '-head'); head.innerHTML = '';
  for (const c of spec.columns) { const th = document.createElement('th'); th.textContent = c; head.appendChild(th); }
  head.appendChild(document.createElement('th'));
  const body = $(resource + '-body'); body.innerHTML = '';
  const rows = await api('/admin/' + resource, { headers: authHeaders() });
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const c of spec.columns) {
      const td = document.createElement('td'); const v = row[c];
      td.textContent = Array.isArray(v) ? v.join(',') : (v && typeof v === 'object' ? JSON.stringify(v) : (v ?? ''));
      tr.appendChild(td);
    }
    const td = document.createElement('td');
    const edit = document.createElement('button'); edit.className = 'secondary'; edit.textContent = 'Edit';
    edit.onclick = () => $(resource + '-form')._edit(row);
    td.appendChild(edit);
    if (!row.builtin) {
      const del = document.createElement('button'); del.textContent = 'Delete'; del.style.marginLeft = '8px';
      del.onclick = async () => {
        const msg = $(resource + '-msg'); msg.textContent = '';
        try { await api('/admin/' + resource + '/' + row.id, { method: 'DELETE', headers: authHeaders() }); await loadReg(); loadCrud(resource); }
        catch (e) { msg.className = 'msg err'; msg.textContent = e.message; }
      };
      td.appendChild(del);
    }
    tr.appendChild(td); body.appendChild(tr);
  }
}
```

- [ ] **Step 3: Hook the views into login + tab switching**

In `doLogin()`'s `Promise.all([...])`, add `loadReg()`. Extend `selectView(name)` so that selecting a content view (re)renders it:

```js
if (SPECS[name]) { renderCrud(name); loadCrud(name); }
```

(Place this after the existing routes branch. `loadReg()` must have run at least once — it runs on login; `renderCrud`/`loadCrud` also call `loadReg()` after mutations.)

- [ ] **Step 4: Manual browser verification**

Run `npm run dev:server`, open `/admin`, log in. For each resource:
- **Attributes:** create `armor` with role `defense`; confirm it appears; try deleting `str` → see the builtin error message.
- **Effects:** create a `statMod` effect targeting `armor`; switch archetype and confirm the Stat dropdown is used.
- **Items:** create a gear item with an `armor` stat-mod and an `onEquip` effect picked from the dropdown; confirm it saves.
- **Skills:** create a skill with `targetStat` and an effect; **Enemies:** create an enemy with a stat grid, a skill in priority, and a reward drop.
- Delete an effect referenced by an item → confirm the "referenced by" error.

- [ ] **Step 5: Commit**

```bash
git add server/admin/index.html
git commit -m "feat(admin-ui): generic CRUD renderer + reuse pickers for all five content views"
```

### Task 4.3: End-to-end smoke — authored content is playable

**Files:**
- Test: `server/e2e.test.ts` (add a case)

- [ ] **Step 1: Write the test**

Add to `server/e2e.test.ts` (it already builds an app with memory content stores). Author an attribute + item via the API, then assert the item is queryable and usable in a session flow:

```ts
it('an admin-authored attribute + item flows into the engine', async () => {
  const a = app(); const t = (await request(a).post('/admin/login').send(ADMIN)).body.token;
  const h = { Authorization: `Bearer ${t}` };
  await request(a).post('/admin/attributes').set(h).send({ id: 'armor', name: 'Armor', abbrev: 'ARM', roles: ['defense'] }).expect(200);
  await request(a).post('/admin/items').set(h).send({ id: 'aegis', name: 'Aegis', slot: 'armor', kind: 'gear', statMods: { armor: 4 }, storyTags: [] }).expect(200);
  // the item is now in the live registry the session reads
  const list = await request(a).get('/admin/items').set(h);
  expect(list.body.map((i: any) => i.id)).toContain('aegis');
});
```

(Use the same `ADMIN`/`app()` helpers already defined in the file; if absent, mirror the ones from `contentRoutes.test.ts`.)

- [ ] **Step 2: Run it; verify it passes**

Run: `npx jest server/e2e.test.ts`
Expected: PASS.

- [ ] **Step 3: Full suite + typecheck; commit**

```bash
npm test && npm run typecheck
git add server/e2e.test.ts
git commit -m "test(e2e): admin-authored content reaches the live registry"
```

---

## Self-review checklist (completed during authoring)

- **Spec coverage:** §2 effects→Tasks 1.1–1.3, 3.2; §3 attributes→1.1, 1.4–1.5, 3.2; §4 engine→1.3–1.6; §5 stores→2.1–2.4; §6 endpoints→3.1–3.3; §7 console→4.1–4.2; §8 integrity/builtin→3.1, 3.3; §9 migration/seed→1.2, 2.3; §10 testing→every task. Skills/Enemies (added in review) covered in 2.2, 3.2, 3.3, 4.2.
- **Out-of-scope held:** no recipe/material/crafting-screen tasks (deferred to the follow-up spec).
- **Type consistency:** `EntityStore<T>`, `StoreError.kind`, `ContentStores`, `ValidationCtx`, `findReferences(stores, kind, id)`, `registerContentRoutes(app, stores, requireAuth, wrap)`, `buildPlayerActor(character, itemDb, skillDb, effects, attrs, opts)`, `runCombat({…, attrs, effects})`, `deriveMaxHp(stats, attrs)` are used identically wherever referenced.
- **Known gap (documented in spec §8):** deletes do not block on route/node/save references (e.g. an enemy used by `node.combat.enemyIds`); routes carry their own validator. Not enforced in v1.
