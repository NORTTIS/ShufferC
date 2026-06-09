# Design: Kill Rewards, Shop, and Item Function

Date: 2026-06-09
Status: Approved (design); pending spec review
Branch: feature/live-event-gen (or a new feature branch)

## Goal

Add three connected game systems to ShufferC:

1. **Kill rewards** — defeating monsters grants gold, XP, item drops, and reputation.
2. **Shop** — node-attached merchants where the player spends gold on items.
3. **Item function** — items can be equipped (with effects/skills), and consumables can be
   used (out of combat and as a pre-combat loadout) and are consumed on use.

These build on the existing modular foundation: pure logic in `shared/`, stores behind ports,
one REST layer, admin endpoints paired with admin-console forms.

## Decisions (locked during brainstorming)

- **Reward content:** gold + item drops (loot table) + XP + reputation, all on a kill.
- **Leveling:** track `xp` and `level` on the save now; **defer** stat growth wiring.
- **Shop access:** node-attached merchant; admin sets stock per node; **buy-only** (no sell-back yet).
- **Inventory shape:** equippable **gear stays `inventory: string[]`**; **consumables get a
  separate `Record<itemId, qty>` bag**.
- **Item use:** finish equip effects (`onEquip` statuses + `grantsSkills`); consumables usable
  out of combat and **pre-combat (loadout)**; **no mid-combat item logic** (combat is auto-resolved);
  items are **consumed on use**.
- **HP persistence:** `currentHp` **carries between fights within a route** (resets to full on entering
  a new route). Heals matter.
- **Reputation on kill:** **configured per-enemy** (each enemy can specify its own rep delta).
- **Integration shape:** reward math is **pure logic in `shared/`** fed by seeded RNG (replayable);
  the session orchestrates and persists.

## Architecture overview

```
Combat ends (winner === 'player')
   │
   ▼
shared/engine/rewards.ts  rollRewards(enemies, rng) ──► { gold, xp, items[], repDelta }
   │  (pure, seeded RNG — deterministic & replayable)
   ▼
server/session.ts  applyRewards(save, rewards)
   ├─ save.gold += gold
   ├─ save.xp  += xp           (level/growth deferred)
   ├─ items → inventory[] (gear) or consumables{} (consumable) by Item.kind
   ├─ reputation += repDelta
   └─ persist via SaveStore
```

Shop and item-use are separate request flows that read/write the same save fields.

## Data model changes

All type changes live in `shared/types.ts`. Bump `SAVE_VERSION` in `shared/constants.ts` and add a
migration in `shared/engine/save.ts` (`deserialize`) that fills new fields with defaults for old saves.

### SaveState (additions)

```typescript
interface SaveState {
  // ...existing...
  gold: number;                 // default 0
  xp: number;                   // default 0
  level: number;                // default 1
  consumables: Record<string, number>;  // itemId -> qty, default {}
  vitals: {
    currentHp: number;          // persists between fights; clamped to maxHp
    pendingBuffs: StatusEffect[]; // applied at next combat start, then cleared
  };
}
```

- `vitals.currentHp` initializes to the player's max HP on new game. Max HP is derived from
  `effectiveStats(character, itemDb)` (same source combat uses today). `currentHp` is clamped to
  `[0, maxHp]` whenever it changes.
- On new game and on `continueRoute` (entering a new route), `currentHp` resets to full. (A separate
  "rest" mechanic is out of scope.)

### Item (additions)

```typescript
interface Item {
  // ...existing...
  kind: 'gear' | 'consumable';  // routes drops/purchases to inventory[] vs consumables{}
  cost?: number;                // base shop price; node merchant may override
}
```

- `kind` is required going forward; fixtures (`ITEM_DB`) are updated. Equippable slots
  (`weapon|armor|ring`) are `gear`; `scroll` items used via `onUse` are `consumable`. `quest`
  items are `gear` (non-consumable, non-purchasable).

### Enemy (additions)

```typescript
interface Enemy {
  // ...existing...
  reward?: {
    gold?: [number, number];                 // inclusive min..max, rolled with seeded RNG
    xp?: number;                             // flat
    drops?: { itemId: string; chance: number }[]; // chance in [0,1]
    reputationDelta?: {                       // configured per-enemy
      hero?: number; villain?: number;
      factions?: Record<string, number>;
    };
  };
}
```

### RouteNode (additions)

```typescript
interface RouteNode {
  // ...existing...
  merchant?: {
    stock: { itemId: string; price?: number }[]; // price overrides Item.cost
  };
}
```

## System 1 — Kill rewards

**New pure module:** `shared/engine/rewards.ts`

```typescript
function rollRewards(
  defeated: Enemy[],
  rng: () => number     // seeded (mulberry32) from save.seed
): { gold: number; xp: number; itemIds: string[]; repDelta: ReputationDelta };
```

- Gold: sum of each enemy's `gold` range rolled with `rng`.
- XP: sum of `xp`.
- Drops: for each `drops` entry, include `itemId` when `rng() < chance`.
- Rep: merge each enemy's `reputationDelta`.
- Pure and deterministic — same seed + same enemies ⇒ same result. Unit-tested.

**Session wiring** (`server/session.ts`): after combat resolves with `winner === 'player'`, derive the
defeated enemies, call `rollRewards`, then `applyRewards(save, rewards)`:

- `save.gold += gold`
- `save.xp += xp`
- For each dropped `itemId`: look up `Item.kind`; gear → push to `inventory[]`, consumable →
  `consumables[itemId] = (consumables[itemId] ?? 0) + 1`.
- Apply `repDelta` to `save.reputation`.
- Persist `currentHp` from the combat outcome into `save.vitals.currentHp` (HP now carries over).

The reward summary is included in the existing `ChoiceView` response so the client can show
"You gained X gold, Y XP, items…".

## System 2 — Shop (node-attached)

### Admin

- **Endpoint:** `POST /admin/routes/:id/nodes/:nodeId/merchant` — body `{ stock: [{ itemId, price? }] }`,
  sets/replaces the node's merchant stock. Returns 204. (Send empty stock to clear.)
- **Admin console form** (`server/admin/index.html`) — REQUIRED by project rule. In the route detail
  view, per node: a control to edit merchant stock (add/remove `{itemId, price}` rows), a save button
  calling the endpoint via `authHeaders()`/`api()`, a visible success/error message, and a refresh of
  the node view. Matches existing `loadX()/doX()` + 401→logout + 503/400 messaging patterns.

### Player

- **`GET /sessions/:id/shop`** → `{ stock: [{ item: Item, price: number }] }` for the current node.
  Returns 400/empty if the current node has no merchant.
- **`POST /sessions/:id/buy`** → body `{ itemId }`. Validates the item is in the current node's stock,
  `save.gold >= price`. Deducts gold, adds item by `kind` (gear → `inventory[]`, consumable →
  `consumables{}`), persists. Returns updated gold + inventory view. Buy-only.
- **`gameApi.getShop(id)` and `gameApi.buy(id, itemId)`** in `client/src/services/api.ts` (throw `ApiError`).
- **Shop screen** (`client/src/screens/`) listing stock, prices, current gold, buy buttons, and
  affordability/feedback states.

## System 3 — Item function

### Equip (finish existing path)

`shared/engine/character.ts` already applies `statMods` from equipped items. Complete the unused hooks:

- `onEquip: StatusEffect[]` → applied when building the player actor for combat (or to `vitals` while
  equipped — applied at actor build time so equip buffs are active in combat).
- `grantsSkills: string[]` → merged into the player's `skillPriority`/`skillBook` when equipped, so
  granted skills are usable in combat.

### Consumable use

- **`POST /sessions/:id/use`** → body `{ itemId }`. Requires `consumables[itemId] > 0`. Applies the
  item's `onUse: StatusEffect[]`:
  - HP-restoring effects adjust `save.vitals.currentHp` (clamped to maxHp).
  - Buff effects are pushed to `save.vitals.pendingBuffs` (carry into the next combat).
  - Decrement `consumables[itemId]` (delete key at 0). Persist. Return updated vitals + consumables.
- **Pre-combat loadout** = calling `use` before choosing the combat node. `pendingBuffs` are read by
  `buildPlayerActor` at combat start (added to the player actor's `statuses`) and then **cleared** from
  the save once combat starts (so they apply exactly once).
- **No mid-combat item logic** — combat stays auto-resolved.
- `gameApi.useItem(id, itemId)` + an inventory-screen "Use" control with consumable quantities.

### Consume semantics

- Consumables: `qty--` in the bag; remove key at 0.
- Gear is not consumed by use; equipping moves the id into `equipped` (existing behavior).

## Error handling

- Reuse `GameError(message, statusCode)`. Cases:
  - Buy: 400 item not in node stock; 400 insufficient gold; 404 node has no merchant.
  - Use: 400 item not owned / qty 0; 400 item not a consumable.
  - Admin merchant set: 400 unknown itemId; 404 node not found; 401 unauthenticated.
- Client surfaces these via existing `ApiError` messaging.

## Testing

Pure-logic unit tests (`shared/`):
- `rollRewards` determinism (same seed ⇒ same gold/drops), drop-chance boundaries (0, 1), rep merge.
- Consume math: decrement and key removal at 0; HP clamp to `[0, maxHp]`.
- `effectiveStats` + `grantsSkills`/`onEquip` reflected in built player actor.

Session/server tests:
- Kill → reward applied (gold/xp/items by kind/rep) and persisted; `currentHp` carried over.
- Buy → gold deducted, item added by kind, validation failures return correct status.
- Use → onUse applied to vitals, qty decremented; `pendingBuffs` carried into combat and cleared after.

Admin console: manual browser check (per project workflow) that the merchant form sets stock and the
player shop reflects it.

## Migration / compatibility

- Bump `SAVE_VERSION`. `deserialize` fills `gold=0, xp=0, level=1, consumables={}, vitals={currentHp:
  maxHp, pendingBuffs:[]}` for pre-existing saves.
- `Item.kind` added to all `ITEM_DB` fixtures. `Enemy.reward` and `RouteNode.merchant` are optional —
  existing routes/enemies work unchanged (no rewards / no shop until configured).

## Out of scope (YAGNI / deferred)

- Stat growth / level-up rewards from XP (tracked only).
- Selling items back to merchants.
- Mid-combat interactive item use.
- Rest/inn HP recovery mechanic.
- Item rarity tiers.
