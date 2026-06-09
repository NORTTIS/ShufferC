# Admin Content Authoring — Design (Foundation)

**Date:** 2026-06-09
**Status:** Approved design, pre-implementation
**Sub-project:** 1 of 2 (foundation). Player-facing crafting (recipes, materials, crafting screen) is a separate follow-up spec built on top of this.

## 1. Goal & scope

Give admins a **component-reuse** authoring system for game content: define reusable
**Attributes** and **Effects**, then assemble **Items**, **Skills**, and **Enemies** from
them. Content is persisted in stores, seeded from the current fixtures, and read live by
both the admin console and the player session — so authored content is immediately playable
(same invariant as routes today).

**In scope (5 content types):** Attribute, Effect, Item, Skill, Enemy — each with admin CRUD,
a store, and a matching admin-console form.

**Out of scope (next spec):** player crafting mechanic, recipes (materials → output item),
a `material` item kind, and the player Crafting screen. This design must not block those —
recipes will reference the content authored here by id.

## 2. Why this shape

- Effects today are **code** (`EFFECT_REGISTRY`, per-name `apply/tick/onExpire`). Admins
  can't add a behavior without code. We generalize to a **fixed set of parametric archetypes**
  (interpreters in code) + admin-authored **templates** (data). No arbitrary code execution
  (full DSL rejected as YAGNI/risk).
- Attributes today are a fixed union (`StatKey` = 6 stats). Admins want **new attributes**.
  We make the attribute set data-driven, but each attribute's engine meaning comes from a
  **fixed set of roles** the engine understands (`core` / `defense` / `maxHp`). Admins add
  attributes and assign roles; they cannot invent a new role (that needs code) — same
  "parametric, not scripted" philosophy as effects.
- Stores follow the existing **port + memory/pg adapter** pattern (`RouteStore`, `SaveStore`,
  `NovelStore`, `EmbeddingStore`). Per the user's choice, each content type gets its **own**
  port rather than one combined facade.

## 3. Data model (`shared/types.ts`)

```ts
// ── Attributes (extensible, replaces the fixed StatKey union) ──
export type AttributeRole = 'core' | 'defense' | 'maxHp';
export interface AttributeDef {
  id: string;                 // 'str', 'armor', ...
  name: string;               // 'Strength'
  abbrev: string;             // 'STR'
  roles: AttributeRole[];     // how the engine consumes it
  defaultBase?: number;       // value used when an actor/save lacks this key (default 0)
  builtin: boolean;           // the original 6 → locked from deletion
}

// Stats become a dynamic map keyed by AttributeDef.id.
export type Stats = Record<string, number>;   // was Record<StatKey, number>

// ── Effects (parametric archetypes + admin templates) ──
export type EffectArchetype = 'dot' | 'hot' | 'statMod' | 'control';
export interface EffectTemplate {
  id: string;
  name: string;
  archetype: EffectArchetype;
  kind: EffectKind;           // buff|debuff|dot|hot|control — label/derived, used by hasControl & UI
  stat?: string;              // required when archetype === 'statMod' (an AttributeDef.id)
  magnitude?: number;         // default per-tick / per-apply amount
  duration?: number;          // default remaining turns
  instant?: boolean;          // duration 0 application (e.g. heal potion): apply magnitude once, do not retain
  sprite?: string;
  builtin: boolean;
}
```

- `StatusEffect` keeps its shape (`{ id, kind, duration, magnitude }`); `id` now references an
  `EffectTemplate.id`. Instance `duration`/`magnitude` override the template defaults.
- `Item` keeps its shape; `statMods` keys are now any `AttributeDef.id`; `onEquip`/`onUse`
  reference effect templates by id.
- `StatKey` type is removed (or aliased to `string`) and `STAT_KEYS` becomes data sourced from
  the attribute store. Skill `targetStat`, `Choice.skillCheck.stat`, etc. become `string`.

## 4. Engine changes (pure logic, no I/O)

The engine functions take the relevant registries/resolvers as parameters (they already take
`itemDb`/`skillDb`) — no module-level singletons.

- **`shared/effects/registry.ts`** → replace the per-name map with **4 archetype interpreters**:
  - `dot`: `tick` subtracts `magnitude` hp (clamped). `instant` ⇒ apply once at `apply`.
  - `hot`: `tick` adds `magnitude` hp (clamped). `instant` ⇒ apply once at `apply` (covers
    the heal-potion case that is currently a silent no-op).
  - `statMod`: `apply` adds `magnitude` to `stats[stat]`; `onExpire` reverses it.
  - `control`: marks the actor controlled (no magnitude).
- **`shared/engine/effects.ts`**: `applyEffect`/`tickEffects` take a resolver
  `(id: string) => EffectTemplate | undefined` to look up archetype + `stat`. Unknown id → no-op
  (current behavior).
- **`shared/engine/combat.ts`**: `computeDamage` defense = `floor(Σ target.stats[a] for a with role 'defense' / 2)`
  (was `con / 2`). `targetStat` may be any attribute with the `core` role.
- **`shared/engine/character.ts`**: `deriveMaxHp` = `BASE_HP + Σ(stats[a] for a with role 'maxHp') * HP_PER_CON`.
  `effectiveStats` iterates the attribute registry instead of the hardcoded `STAT_KEYS`; missing
  keys default to `defaultBase ?? 0`.

**Seed preserves current behavior exactly:** str/dex/int/wis/cha → `['core']`; con →
`['core','defense','maxHp']`. Effect seed: `poison`→dot, `regen`/`heal`→hot (`heal` instant),
`attack_buff`→statMod(str,+), `defense_down`→statMod(con,−), `freeze`/`stun`→control.

## 5. Stores (`server/store/`) — one port per type

Five ports, each with a `memory*` and `pg*` adapter, mirroring the existing pattern:

```
AttributeStore  EffectStore  ItemStore  SkillStore  EnemyStore
  list()  get(id)  create(x)  update(id, x)  remove(id)
```

- Memory adapters seed from `shared/fixtures.ts` + the 6 attribute defs + 6 effect templates.
- pg adapters add tables (`attributes`, `effects`, `items`, `skills`, `enemies`) seeded on first
  run when empty.
- Wiring in `server/index.ts`: instantiate all five (pg when `databaseUrl`, else memory).
  `Registries` (consumed by session + frameworkGen + admin) is now backed by the stores and
  gains `attributeDb` and `effectDb` alongside `itemDb`/`skillDb`/`enemyDb`.
- A `referentialIntegrity` helper (`server/store/integrity.ts`) answers "is `<id>` referenced?"
  by querying the relevant stores; used by DELETE handlers.

## 6. Admin endpoints (`server/api.ts`)

All under `requireAuth`. Each resource: `GET /admin/<r>`, `POST /admin/<r>`, `PUT /admin/<r>/:id`,
`DELETE /admin/<r>/:id`, for `<r>` ∈ {`attributes`, `effects`, `items`, `skills`, `enemies`}.

- POST/PUT validate shape + cross-references (unknown attribute/effect/skill/item id → 400).
- DELETE runs `referentialIntegrity`; if referenced → **400** with the referencing ids
  (mirrors the merchant unknown-item guard). `builtin` attribute/effect → **400** on delete.
- The existing merchant guard switches from `registries.itemDb[...]` to an `ItemStore` lookup.

## 7. Admin console (`server/admin/index.html`) — **required per CLAUDE.md**

Five new sidebar views: **Attributes, Effects, Items, Skills, Enemies**. Each follows the
existing `card` + `table` + `loadX()/doX()` + `api()` + `authHeaders()` + 401→logout + visible
success/error message pattern, with the table refreshing after each mutation.

Component reuse shows up as **pickers**:
- **Effect form:** archetype dropdown; attribute dropdown shown only when `archetype === 'statMod'`;
  magnitude/duration/instant/kind/sprite inputs.
- **Item form:** slot/kind/cost/sprite; a stat-mods grid generated from the attribute registry;
  effect pickers (dropdowns over effect templates) for `onEquip`/`onUse`; multi-select for
  `grantsSkills`; storyTags.
- **Skill form:** `targetStat` dropdown (attributes); `effectTarget`; `power`; effects picker
  (templates); sprite.
- **Enemy form:** stats grid generated from the attribute registry; hp; `skillPriority` picker
  (skills); reward block (gold min/max, xp, drops table = item picker + chance, reputationDelta).

## 8. Validation, integrity & safety

- Reference checks before delete (within content stores):
  - Attribute ← `item.statMods` keys / `effect.stat` / `skill.targetStat` / `enemy.stats` keys.
  - Effect ← `item.onEquip|onUse` / `skill.effects`.
  - Skill ← `item.grantsSkills` / `enemy.skillPriority`.
  - Item ← `enemy.reward.drops`.
- **Known gap:** Enemy/Item/Skill references that live in routes/nodes/saves (e.g.
  `node.combat.enemyIds`, `route.itemPool`, `character.inventory`) are **not** blocked here —
  routes have their own validator and saves are per-player. Documented, not enforced in v1.
- Bounds: `magnitude`/`duration` ≥ 0; `statMod` requires a valid `stat`; `control` ignores
  magnitude. Ids unique per store; slug-safe.

## 9. Migration & compatibility

- Fixtures become **seed data** (memory adapters use them directly; pg seeds once when empty).
- Old saves: a missing attribute key resolves to `defaultBase ?? 0`, so adding attributes does
  not break saves. Re-confirm during implementation whether `SAVE_VERSION` needs a bump (expected:
  no).
- `SKILL_DB` inline effect ids (`freeze`, `regen` via meditate) must match seeded effect template
  ids — seed guarantees this.
- All existing tests must stay green: the seed reproduces today's behavior exactly.

## 10. Testing

- Unit (shared): archetype interpreters (dot/hot/statMod/control + `instant`); generalized
  `computeDamage` defense, `deriveMaxHp`, `effectiveStats` over a dynamic registry.
- Unit (server): each store adapter (memory + pg) round-trip; `referentialIntegrity` for every
  reference edge above.
- API: CRUD happy paths, 401 unauthenticated, 400 on unknown-reference create/update, 400 on
  referenced/builtin delete.
- Regression: existing combat/character/session/e2e suites unchanged and green.

## 11. Implementation note

Scope is large (5 resources, engine generalization, 5 stores, ~20 endpoints, 5 views) but
single-purpose. One spec; the implementation plan will likely phase it:
(1) types + engine generalization + seed (keep tests green) →
(2) stores + wiring →
(3) endpoints + integrity →
(4) admin console views.
