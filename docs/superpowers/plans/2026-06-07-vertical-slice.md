# Sub-project B (Vertical Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play one hardcoded route end-to-end through an RN+Expo client talking to a Node REST server that runs the pure `shared/` engine, with save state behind a swappable `SaveStore` (in-memory now, Supabase later).

**Architecture:** Server-authoritative. The server holds `SaveState` in a `SaveStore`, runs the engine (`runCombat`/`resolveChoice`), and exposes 5 REST endpoints. A `GameSession` service glues the engine into a playable flow (skill-check choices, combat-from-choice, equip). The RN client is thin: it renders nodes, arranges skill priority, and replays the combat log the server returns. All randomness flows through `save.seed`, so client replay matches the server exactly.

**Tech Stack:** TypeScript 5, Node 18+ (uses `crypto.randomUUID`), Express, Jest + ts-jest, supertest (server tests), Expo + React Native (client). The engine from Sub-project A is reused unchanged.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | Add `express`; dev `supertest`, `@types/express`, `@types/supertest` |
| `tsconfig.json` | Extend `include` to cover `server` |
| `jest.config.js` | Extend `roots` to `shared` + `server` + `client/src` |
| `shared/backgrounds.ts` | Preset character backgrounds (rogue/fighter/mage) |
| `server/config.ts` | Single place reading server env (PORT) |
| `server/store/SaveStore.ts` | `SaveStore` interface |
| `server/store/memoryStore.ts` | In-memory `SaveStore` impl |
| `server/session.ts` | `GameSession` service + `GameError` + view types |
| `server/api.ts` | `createApp` — Express routes (5 endpoints) |
| `server/index.ts` | HTTP bootstrap (listen) |
| `client/package.json`, `client/tsconfig.json`, `client/app.json`, `client/babel.config.js` | Expo toolchain |
| `client/src/config.ts` | Single place reading client env (API base URL) |
| `client/src/services/api.ts` | `gameApi` + `ApiError` (one REST layer) |
| `client/src/assets.ts` | `ASSETS` registry (sprite key → placeholder) |
| `client/src/hooks/useGameSession.ts` | Client game state machine |
| `client/src/screens/*` | CharCreate / Story / Combat / Inventory |
| `client/App.tsx` | Screen routing glue |
| `**/*.test.ts` | Co-located unit/integration tests |

---

### Task 1: Server toolchain (deps, tsconfig, jest roots)

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `jest.config.js`

- [ ] **Step 1: Add server dependencies**

Run:
```bash
npm install express
npm install -D supertest @types/express @types/supertest
```
Expected: packages added to `package.json`, no errors.

- [ ] **Step 2: Extend `tsconfig.json` include to cover `server`**

Replace the `include` line so it reads:
```json
  "include": ["shared", "server"]
```
(Leave `compilerOptions` unchanged. The client has its own tsconfig and is not part of this typecheck.)

- [ ] **Step 3: Extend `jest.config.js` roots**

Replace the file with:
```js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/shared', '<rootDir>/server', '<rootDir>/client/src'],
  testMatch: ['**/*.test.ts'],
};
```

- [ ] **Step 4: Verify existing suite still passes**

Run: `npm test`
Expected: PASS — all Sub-project A tests still green (44 tests).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json jest.config.js
git commit -m "chore: add server toolchain (express, supertest) + extend jest/tsc roots"
```

---

### Task 2: Preset backgrounds (`shared/backgrounds.ts`)

**Files:**
- Create: `shared/backgrounds.ts`
- Test: `shared/backgrounds.test.ts`

- [ ] **Step 1: Write the failing test `shared/backgrounds.test.ts`**

```ts
import { BACKGROUNDS } from './backgrounds';
import { ITEM_DB, SKILL_DB } from './fixtures';
import { STAT_KEYS } from './constants';

describe('BACKGROUNDS', () => {
  it('defines the three presets', () => {
    expect(Object.keys(BACKGROUNDS).sort()).toEqual(['fighter', 'mage', 'rogue']);
  });

  it('every preset has all six stat keys', () => {
    for (const bg of Object.values(BACKGROUNDS)) {
      for (const k of STAT_KEYS) {
        expect(typeof bg.baseStats[k]).toBe('number');
      }
    }
  });

  it('every referenced item id exists in ITEM_DB', () => {
    for (const bg of Object.values(BACKGROUNDS)) {
      for (const id of bg.inventory) expect(ITEM_DB[id]).toBeDefined();
      for (const id of Object.values(bg.equipped)) {
        if (id) expect(ITEM_DB[id]).toBeDefined();
      }
    }
  });

  it('every referenced skill id exists in SKILL_DB', () => {
    for (const bg of Object.values(BACKGROUNDS)) {
      for (const id of bg.skillPriority) expect(SKILL_DB[id]).toBeDefined();
    }
  });

  it('equipped items occupy their declared slot', () => {
    for (const bg of Object.values(BACKGROUNDS)) {
      for (const [slot, id] of Object.entries(bg.equipped)) {
        if (id) expect(ITEM_DB[id].slot).toBe(slot);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/backgrounds.test.ts`
Expected: FAIL — `Cannot find module './backgrounds'`.

- [ ] **Step 3: Create `shared/backgrounds.ts`**

```ts
import { Stats, EquipSlot } from './types';

export interface Background {
  id: string;
  name: string;
  blurb: string;
  baseStats: Stats;
  inventory: string[];
  equipped: Partial<Record<EquipSlot, string>>;
  skillPriority: string[];
}

export const BACKGROUNDS: Record<string, Background> = {
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    blurb: 'Quick and cunning. Strikes first, talks second.',
    baseStats: { str: 7, dex: 10, int: 7, wis: 5, cha: 8, con: 5 },
    inventory: ['dagger', 'torch'],
    equipped: { weapon: 'dagger' },
    skillPriority: ['slash'],
  },
  fighter: {
    id: 'fighter',
    name: 'Fighter',
    blurb: 'Tough and direct. Wins by outlasting.',
    baseStats: { str: 10, dex: 6, int: 5, wis: 6, cha: 6, con: 9 },
    inventory: ['dagger', 'ringOfRegen'],
    equipped: { weapon: 'dagger', ring: 'ringOfRegen' },
    skillPriority: ['slash'],
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    blurb: 'Frail but freezes foes before they strike.',
    baseStats: { str: 5, dex: 6, int: 10, wis: 9, cha: 7, con: 5 },
    inventory: ['dagger', 'ringOfRegen', 'torch'],
    equipped: { ring: 'ringOfRegen' },
    skillPriority: ['freezeBolt', 'slash'],
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest shared/backgrounds.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add shared/backgrounds.ts shared/backgrounds.test.ts
git commit -m "feat: add preset character backgrounds (rogue/fighter/mage)"
```

---

### Task 3: SaveStore interface + in-memory impl

**Files:**
- Create: `server/store/SaveStore.ts`
- Create: `server/store/memoryStore.ts`
- Test: `server/store/memoryStore.test.ts`

- [ ] **Step 1: Write the failing test `server/store/memoryStore.test.ts`**

```ts
import { createMemoryStore } from './memoryStore';
import { SaveState, Stats } from '../../shared/types';

const baseStats: Stats = { str: 7, dex: 9, int: 6, wis: 5, cha: 8, con: 6 };

function save(): SaveState {
  return {
    version: 1, routeId: 'r1',
    character: { background: 'rogue', baseStats, inventory: [], equipped: {}, skillPriority: [] },
    reputation: { hero: 0, villain: 0, factions: {} },
    flags: {}, choiceLog: [], currentNodeId: 'n1', seed: 7,
  };
}

describe('memoryStore', () => {
  it('create returns a non-empty id and get round-trips the save', async () => {
    const store = createMemoryStore();
    const id = await store.create(save());
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(await store.get(id)).toEqual(save());
  });

  it('get returns null for an unknown id', async () => {
    const store = createMemoryStore();
    expect(await store.get('missing')).toBeNull();
  });

  it('put overwrites an existing save', async () => {
    const store = createMemoryStore();
    const id = await store.create(save());
    const updated = { ...save(), currentNodeId: 'n3' };
    await store.put(id, updated);
    expect((await store.get(id))!.currentNodeId).toBe('n3');
  });

  it('stores an independent copy (no aliasing of caller objects)', async () => {
    const store = createMemoryStore();
    const s = save();
    const id = await store.create(s);
    s.currentNodeId = 'MUTATED';
    expect((await store.get(id))!.currentNodeId).toBe('n1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/store/memoryStore.test.ts`
Expected: FAIL — `Cannot find module './memoryStore'`.

- [ ] **Step 3: Create `server/store/SaveStore.ts`**

```ts
import { SaveState } from '../../shared/types';

export interface SaveStore {
  create(save: SaveState): Promise<string>;
  get(id: string): Promise<SaveState | null>;
  put(id: string, save: SaveState): Promise<void>;
}
```

- [ ] **Step 4: Create `server/store/memoryStore.ts`**

```ts
import { randomUUID } from 'crypto';
import { SaveState } from '../../shared/types';
import { SaveStore } from './SaveStore';

export function createMemoryStore(): SaveStore {
  const map = new Map<string, SaveState>();
  return {
    async create(save: SaveState): Promise<string> {
      const id = randomUUID();
      map.set(id, structuredClone(save));
      return id;
    },
    async get(id: string): Promise<SaveState | null> {
      const found = map.get(id);
      return found ? structuredClone(found) : null;
    },
    async put(id: string, save: SaveState): Promise<void> {
      map.set(id, structuredClone(save));
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest server/store/memoryStore.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 6: Commit**

```bash
git add server/store/SaveStore.ts server/store/memoryStore.ts server/store/memoryStore.test.ts
git commit -m "feat: add SaveStore interface + in-memory implementation"
```

---

### Task 4: GameSession — newGame, view, equip

**Files:**
- Create: `server/session.ts`
- Test: `server/session.test.ts`

- [ ] **Step 1: Write the failing test `server/session.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/session.test.ts`
Expected: FAIL — `Cannot find module './session'`.

- [ ] **Step 3: Create `server/session.ts`**

```ts
import {
  SaveState, StoryNode, Stats, Item, Skill, Enemy, EquipSlot, CombatResult, GameRoute,
} from '../shared/types';
import { SAVE_VERSION, EQUIP_SLOTS } from '../shared/constants';
import { Background, BACKGROUNDS } from '../shared/backgrounds';
import {
  SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_NODES, SAMPLE_ROUTE,
} from '../shared/fixtures';
import { effectiveStats, buildPlayerActor, buildEnemyActor } from '../shared/engine/character';
import { runCombat } from '../shared/engine/combat';
import { resolveChoice } from '../shared/engine/story';
import { mulberry32 } from '../shared/engine/dice';
import { SaveStore } from './store/SaveStore';

const START_SEED = 7;

export class GameError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'GameError';
  }
}

export interface SessionDeps {
  backgrounds: Record<string, Background>;
  nodeDb: Record<string, StoryNode>;
  itemDb: Record<string, Item>;
  skillDb: Record<string, Skill>;
  enemyDb: Record<string, Enemy>;
  route: GameRoute;
}

const DEFAULT_DEPS: SessionDeps = {
  backgrounds: BACKGROUNDS,
  nodeDb: SAMPLE_NODES,
  itemDb: ITEM_DB,
  skillDb: SKILL_DB,
  enemyDb: ENEMY_DB,
  route: SAMPLE_ROUTE,
};

export interface SessionView {
  save: SaveState;
  node: StoryNode;
  effectiveStats: Stats;
  ending?: string;
}

export interface ChoiceView extends SessionView {
  checkPassed?: boolean;
  roll?: number;
  combat?: CombatResult;
}

export interface GameSession {
  listBackgrounds(): Background[];
  newGame(backgroundId: string): Promise<SessionView & { sessionId: string }>;
  getView(id: string): Promise<SessionView>;
  applyChoice(id: string, choiceId: string, skillPriority?: string[]): Promise<ChoiceView>;
  equip(id: string, slot: string, itemId: string | null): Promise<{ save: SaveState; effectiveStats: Stats }>;
}

export function createGameSession(store: SaveStore, deps: SessionDeps = DEFAULT_DEPS): GameSession {
  function computeEnding(save: SaveState): string | undefined {
    for (const e of deps.route.endings) {
      const m = e.condition.match(/currentNodeId === (\w+)/);
      if (m && save.currentNodeId === m[1]) return e.id;
    }
    return undefined;
  }

  function view(save: SaveState): SessionView {
    const node = deps.nodeDb[save.currentNodeId];
    if (!node) throw new GameError(`Node ${save.currentNodeId} not found`, 500);
    return { save, node, effectiveStats: effectiveStats(save.character, deps.itemDb), ending: computeEnding(save) };
  }

  async function load(id: string): Promise<SaveState> {
    const save = await store.get(id);
    if (!save) throw new GameError(`Session ${id} not found`, 404);
    return save;
  }

  return {
    listBackgrounds(): Background[] {
      return Object.values(deps.backgrounds);
    },

    async newGame(backgroundId: string) {
      const bg = deps.backgrounds[backgroundId];
      if (!bg) throw new GameError(`Unknown background ${backgroundId}`, 400);
      const startNodeId = deps.route.acts[0].nodeIds[0];
      const save: SaveState = {
        version: SAVE_VERSION,
        routeId: deps.route.id,
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
      };
      const sessionId = await store.create(save);
      return { sessionId, ...view(save) };
    },

    async getView(id: string) {
      return view(await load(id));
    },

    async applyChoice(id, choiceId, skillPriority) {
      const save = await load(id);
      const node = deps.nodeDb[save.currentNodeId];
      if (!node) throw new GameError(`Node ${save.currentNodeId} not found`, 500);
      const choice = node.choices.find((c) => c.id === choiceId);
      if (!choice) throw new GameError(`Choice ${choiceId} not in node ${node.id}`, 400);

      // Path 1: skill-check choice (e.g. "sneak")
      if (choice.skillCheck) {
        const res = resolveChoice(save, node, choiceId, mulberry32(save.seed));
        await store.put(id, res.save);
        return { ...view(res.save), checkPassed: res.checkPassed, roll: res.roll };
      }

      // Path 2: combat choice ("fight") — node has combat and choice has no skill check
      if (node.combat) {
        if (!skillPriority || skillPriority.length === 0) {
          throw new GameError('skillPriority required for a combat choice', 400);
        }
        const player = buildPlayerActor(
          { ...save.character, skillPriority },
          deps.itemDb,
          deps.skillDb,
        );
        const enemies = node.combat.enemyIds.map((eid) => {
          const enemy = deps.enemyDb[eid];
          if (!enemy) throw new GameError(`Enemy ${eid} not found`, 500);
          return buildEnemyActor(enemy, deps.skillDb);
        });
        const combat = runCombat({ player, enemies, seed: save.seed });

        if (combat.winner === 'player') {
          const res = resolveChoice(save, node, choiceId); // apply outcome + advance (no skillCheck)
          res.save.character.skillPriority = [...skillPriority]; // persist the pre-battle ordering
          await store.put(id, res.save);
          return { ...view(res.save), combat };
        }
        // Defeat: do not advance or persist progress
        return { ...view(save), combat, ending: 'defeat' };
      }

      // Path 3: plain advance (no check, no combat)
      const res = resolveChoice(save, node, choiceId);
      await store.put(id, res.save);
      return view(res.save);
    },

    async equip(id, slot, itemId) {
      const save = await load(id);
      if (!EQUIP_SLOTS.includes(slot as EquipSlot)) {
        throw new GameError(`Invalid slot ${slot}`, 400);
      }
      if (itemId === null) {
        delete save.character.equipped[slot as EquipSlot];
      } else {
        if (!save.character.inventory.includes(itemId)) {
          throw new GameError(`Item ${itemId} not in inventory`, 400);
        }
        const item = deps.itemDb[itemId];
        if (!item) throw new GameError(`Item ${itemId} not found`, 400);
        if (item.slot !== slot) {
          throw new GameError(`Item ${itemId} cannot occupy slot ${slot}`, 400);
        }
        save.character.equipped[slot as EquipSlot] = itemId;
      }
      await store.put(id, save);
      return { save, effectiveStats: effectiveStats(save.character, deps.itemDb) };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest server/session.test.ts`
Expected: PASS — newGame/getView/equip/listBackgrounds tests passed (the `applyChoice` tests are added in Task 5).

- [ ] **Step 5: Commit**

```bash
git add server/session.ts server/session.test.ts
git commit -m "feat: add GameSession service (newGame/view/equip + combat-from-choice glue)"
```

---

### Task 5: GameSession — applyChoice (sneak / fight / plain)

**Files:**
- Modify: `server/session.test.ts` (add `applyChoice` tests)

> The implementation already exists in Task 3. This task adds the behavioral tests that exercise the three choice paths against the demo route fixtures (`n1` has a goblin combat + a `fight` choice with no skill check + a `sneak` choice with a `dex` skill check).

- [ ] **Step 1: Append `applyChoice` tests to `server/session.test.ts`**

```ts
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
```

- [ ] **Step 2: Run the full session suite to verify it passes**

Run: `npx jest server/session.test.ts`
Expected: PASS — all session tests (Task 4 + Task 5) passed.

> If the `fighter` + `['slash']` combat does not end in a player win at seed 7, adjust the test to use the `mage` background with `['freezeBolt','slash']` (freeze locks the goblin) — but verify by running first; do not assume.

- [ ] **Step 3: Commit**

```bash
git add server/session.test.ts
git commit -m "test: cover GameSession choice paths (sneak/fight/plain + determinism)"
```

---

### Task 6: REST layer (`config.ts`, `api.ts`, `index.ts`)

**Files:**
- Create: `server/config.ts`
- Create: `server/api.ts`
- Create: `server/index.ts`
- Test: `server/api.test.ts`

- [ ] **Step 1: Write the failing test `server/api.test.ts`**

```ts
import request from 'supertest';
import { createApp } from './api';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';

function app() {
  return createApp(createGameSession(createMemoryStore()));
}

describe('REST API', () => {
  it('GET /backgrounds returns the presets', async () => {
    const res = await request(app()).get('/backgrounds');
    expect(res.status).toBe(200);
    expect(res.body.map((b: { id: string }) => b.id).sort()).toEqual(['fighter', 'mage', 'rogue']);
  });

  it('POST /sessions creates a session and returns the start node', async () => {
    const res = await request(app()).post('/sessions').send({ backgroundId: 'rogue' });
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.node.id).toBe('n1');
    expect(res.body.effectiveStats.str).toBe(9);
  });

  it('POST /sessions with bad background returns 400', async () => {
    const res = await request(app()).post('/sessions').send({ backgroundId: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/background/i);
  });

  it('GET /sessions/:id returns 404 for an unknown id', async () => {
    const res = await request(app()).get('/sessions/missing');
    expect(res.status).toBe(404);
  });

  it('POST /sessions/:id/choice (sneak) advances the node', async () => {
    const a = app();
    const created = await request(a).post('/sessions').send({ backgroundId: 'rogue' });
    const id = created.body.sessionId;
    const res = await request(a).post(`/sessions/${id}/choice`).send({ choiceId: 'sneak' });
    expect(res.status).toBe(200);
    expect(res.body.save.currentNodeId).toBe('n3');
  });

  it('POST /sessions/:id/choice (fight) without skillPriority returns 400', async () => {
    const a = app();
    const created = await request(a).post('/sessions').send({ backgroundId: 'fighter' });
    const id = created.body.sessionId;
    const res = await request(a).post(`/sessions/${id}/choice`).send({ choiceId: 'fight' });
    expect(res.status).toBe(400);
  });

  it('POST /sessions/:id/equip recomputes effective stats', async () => {
    const a = app();
    const created = await request(a).post('/sessions').send({ backgroundId: 'rogue' });
    const id = created.body.sessionId;
    const res = await request(a).post(`/sessions/${id}/equip`).send({ slot: 'weapon', itemId: null });
    expect(res.status).toBe(200);
    expect(res.body.effectiveStats.str).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest server/api.test.ts`
Expected: FAIL — `Cannot find module './api'`.

- [ ] **Step 3: Create `server/config.ts`**

```ts
export const config = {
  port: Number(process.env.PORT ?? 3000),
};
```

- [ ] **Step 4: Create `server/api.ts`**

```ts
import express, { Request, Response, NextFunction, Express } from 'express';
import { GameSession, GameError } from './session';

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

function wrap(handler: Handler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = await handler(req, res);
      if (!res.headersSent) res.json(body);
    } catch (err) {
      next(err);
    }
  };
}

export function createApp(session: GameSession): Express {
  const app = express();
  app.use(express.json());

  app.get('/backgrounds', wrap(() => session.listBackgrounds()));

  app.post('/sessions', wrap((req) => session.newGame(req.body?.backgroundId)));

  app.get('/sessions/:id', wrap((req) => session.getView(req.params.id)));

  app.post('/sessions/:id/choice', wrap((req) =>
    session.applyChoice(req.params.id, req.body?.choiceId, req.body?.skillPriority),
  ));

  app.post('/sessions/:id/equip', wrap((req) =>
    session.equip(req.params.id, req.body?.slot, req.body?.itemId ?? null),
  ));

  // Centralised error handler — maps GameError.status, defaults to 500.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof GameError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(status).json({ error: message });
  });

  return app;
}
```

- [ ] **Step 5: Create `server/index.ts`**

```ts
import { createApp } from './api';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';
import { config } from './config';

const app = createApp(createGameSession(createMemoryStore()));
app.listen(config.port, () => {
  console.log(`ShufferC server listening on http://localhost:${config.port}`);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest server/api.test.ts`
Expected: PASS — all REST tests passed.

- [ ] **Step 7: Add a `dev:server` script to `package.json`**

In the `scripts` block add:
```json
    "dev:server": "ts-node server/index.ts"
```
Then install ts-node:
```bash
npm install -D ts-node
```

- [ ] **Step 8: Commit**

```bash
git add server/config.ts server/api.ts server/index.ts server/api.test.ts package.json package-lock.json
git commit -m "feat: add REST API (backgrounds/sessions/choice/equip) over GameSession"
```

---

### Task 7: End-to-end server walkthrough test

**Files:**
- Test: `server/e2e.test.ts`

- [ ] **Step 1: Write the test `server/e2e.test.ts`**

```ts
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
```

- [ ] **Step 2: Run the test**

Run: `npx jest server/e2e.test.ts`
Expected: PASS — 2 tests passed.

> If `fighter` + `['slash']` loses at seed 7, switch this test to `mage` with `['freezeBolt','slash']` after confirming by running. Keep the same assertions.

- [ ] **Step 3: Run the full suite + typecheck**

Run:
```bash
npm test
npm run typecheck
```
Expected: all suites pass; `tsc --noEmit` reports no errors.

- [ ] **Step 4: Commit**

```bash
git add server/e2e.test.ts
git commit -m "test: add end-to-end server walkthrough (sneak + fight routes)"
```

---

### Task 8: Client Expo scaffold

**Files:**
- Create: `client/package.json`
- Create: `client/app.json`
- Create: `client/babel.config.js`
- Create: `client/tsconfig.json`
- Create: `client/index.ts`
- Create: `client/App.tsx` (placeholder, replaced in Task 13)

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "shufferc-client",
  "version": "0.1.0",
  "private": true,
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "web": "expo start --web",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "expo": "~51.0.0",
    "expo-status-bar": "~1.12.1",
    "react": "18.2.0",
    "react-native": "0.74.5"
  },
  "devDependencies": {
    "@types/react": "~18.2.79",
    "typescript": "~5.4.5"
  }
}
```

- [ ] **Step 2: Create `client/app.json`**

```json
{
  "expo": {
    "name": "ShufferC",
    "slug": "shufferc",
    "version": "0.1.0",
    "orientation": "portrait",
    "platforms": ["ios", "android", "web"],
    "newArchEnabled": false
  }
}
```

- [ ] **Step 3: Create `client/babel.config.js`**

```js
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
```

- [ ] **Step 4: Create `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-native",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ESNext", "DOM"],
    "types": ["react", "node"],
    "noEmit": true
  },
  "include": ["src", "App.tsx", "index.ts", "../shared/types.ts"]
}
```

- [ ] **Step 5: Create `client/index.ts`**

```ts
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
```

- [ ] **Step 6: Create placeholder `client/App.tsx`**

```tsx
import React from 'react';
import { Text, View } from 'react-native';

export default function App() {
  return (
    <View>
      <Text>ShufferC</Text>
    </View>
  );
}
```

- [ ] **Step 7: Install client dependencies**

Run:
```bash
cd client
npm install
cd ..
```
Expected: `client/node_modules` created, no errors.

- [ ] **Step 8: Commit**

```bash
git add client/package.json client/app.json client/babel.config.js client/tsconfig.json client/index.ts client/App.tsx
git commit -m "chore: scaffold Expo + React Native client"
```

---

### Task 9: Client config + API service

**Files:**
- Create: `client/src/config.ts`
- Create: `client/src/services/api.ts`
- Test: `client/src/services/api.test.ts`

- [ ] **Step 1: Write the failing test `client/src/services/api.test.ts`**

```ts
import { gameApi, ApiError } from './api';

describe('gameApi', () => {
  const origFetch = global.fetch;
  afterEach(() => { global.fetch = origFetch; });

  function mockFetch(status: number, body: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
  }

  it('returns parsed JSON on success', async () => {
    mockFetch(200, [{ id: 'rogue' }]);
    const res = await gameApi.listBackgrounds();
    expect(res).toEqual([{ id: 'rogue' }]);
  });

  it('throws ApiError carrying the status on failure', async () => {
    mockFetch(400, { error: 'bad background' });
    await expect(gameApi.newGame('nope')).rejects.toMatchObject({
      status: 400,
      message: 'bad background',
    });
    await expect(gameApi.newGame('nope')).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest client/src/services/api.test.ts`
Expected: FAIL — `Cannot find module './api'`.

- [ ] **Step 3: Create `client/src/config.ts`**

```ts
export const config = {
  apiBase: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
};
```

- [ ] **Step 4: Create `client/src/services/api.ts`**

```ts
import type {
  SaveState, StoryNode, Stats, CombatResult,
} from '../../../shared/types';
import type { Background } from '../../../shared/backgrounds';
import { config } from '../config';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface SessionView {
  save: SaveState;
  node: StoryNode;
  effectiveStats: Stats;
  ending?: string;
}
export interface ChoiceView extends SessionView {
  checkPassed?: boolean;
  roll?: number;
  combat?: CombatResult;
}
export interface NewGameView extends SessionView {
  sessionId: string;
}
export interface EquipView {
  save: SaveState;
  effectiveStats: Stats;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.apiBase}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((body as { error?: string }).error ?? `HTTP ${res.status}`, res.status);
  }
  return body as T;
}

export const gameApi = {
  listBackgrounds: () => call<Background[]>('/backgrounds'),
  newGame: (backgroundId: string) =>
    call<NewGameView>('/sessions', { method: 'POST', body: JSON.stringify({ backgroundId }) }),
  getView: (id: string) => call<SessionView>(`/sessions/${id}`),
  choose: (id: string, choiceId: string, skillPriority?: string[]) =>
    call<ChoiceView>(`/sessions/${id}/choice`, {
      method: 'POST',
      body: JSON.stringify({ choiceId, skillPriority }),
    }),
  equip: (id: string, slot: string, itemId: string | null) =>
    call<EquipView>(`/sessions/${id}/equip`, {
      method: 'POST',
      body: JSON.stringify({ slot, itemId }),
    }),
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest client/src/services/api.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 6: Commit**

```bash
git add client/src/config.ts client/src/services/api.ts client/src/services/api.test.ts
git commit -m "feat: add client config + gameApi REST layer with ApiError"
```

---

### Task 10: Assets registry + game session hook

**Files:**
- Create: `client/src/assets.ts`
- Create: `client/src/hooks/useGameSession.ts`

> The hook and assets registry are exercised through the screens (Tasks 11-13) and the manual run in Task 13. They contain no engine logic — the server is authoritative — so they are not unit-tested here (matches the spec's "client tests light/manual").

- [ ] **Step 1: Create `client/src/assets.ts`**

```ts
// Sprite/icon registry. Slice B uses emoji/colour placeholders keyed the same
// way the engine refers to sprites ("enemy.goblin", "skill.slash", ...).
// Real art is wired in a later sub-project; consumers must go through ASSETS.
export const ASSETS: Record<string, string> = {
  'enemy.goblin': '👺',
  'skill.slash': '🗡️',
  'skill.freeze': '❄️',
  'skill.regen': '✨',
  'item.dagger': '🔪',
  'item.ring': '💍',
  'item.torch': '🔦',
};

export function sprite(key: string | undefined): string {
  if (!key) return '❔';
  return ASSETS[key] ?? '❔';
}
```

- [ ] **Step 2: Create `client/src/hooks/useGameSession.ts`**

```ts
import { useCallback, useState } from 'react';
import { gameApi, ApiError } from '../services/api';
import type { SessionView, ChoiceView } from '../services/api';

export type Screen = 'charcreate' | 'story' | 'combat' | 'inventory' | 'ending';

export interface GameState {
  screen: Screen;
  sessionId: string | null;
  view: SessionView | null;
  lastChoice: ChoiceView | null; // holds combat log / check result after a choice
  pendingFightChoiceId: string | null; // choice that routed us into the combat screen
  error: string | null;
  busy: boolean;
}

const INITIAL: GameState = {
  screen: 'charcreate',
  sessionId: null,
  view: null,
  lastChoice: null,
  pendingFightChoiceId: null,
  error: null,
  busy: false,
};

export function useGameSession() {
  const [state, setState] = useState<GameState>(INITIAL);

  const run = useCallback(async (fn: () => Promise<Partial<GameState>>) => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const patch = await fn();
      setState((s) => ({ ...s, busy: false, ...patch }));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Network error';
      setState((s) => ({ ...s, busy: false, error: message }));
    }
  }, []);

  const start = useCallback((backgroundId: string) => run(async () => {
    const res = await gameApi.newGame(backgroundId);
    return { sessionId: res.sessionId, view: res, screen: 'story' as Screen };
  }), [run]);

  const screenAfter = (v: SessionView): Screen =>
    v.ending ? 'ending' : v.node.choices.length === 0 ? 'ending' : 'story';

  // Called for skill-check / plain choices (Story screen).
  const choose = useCallback((choiceId: string) => run(async () => {
    const id = state.sessionId!;
    const res = await gameApi.choose(id, choiceId);
    return { view: res, lastChoice: res, screen: screenAfter(res) };
  }), [run, state.sessionId]);

  // Called when the player selects a fight choice — route to Combat to arrange priority.
  const enterCombat = useCallback((choiceId: string) => {
    setState((s) => ({ ...s, pendingFightChoiceId: choiceId, screen: 'combat' }));
  }, []);

  // Called by the Combat screen after the player confirms skill priority.
  const fight = useCallback((skillPriority: string[]) => run(async () => {
    const id = state.sessionId!;
    const choiceId = state.pendingFightChoiceId!;
    const res = await gameApi.choose(id, choiceId, skillPriority);
    const screen: Screen = res.ending === 'defeat' ? 'ending' : screenAfter(res);
    return { view: res, lastChoice: res, pendingFightChoiceId: null, screen };
  }), [run, state.sessionId, state.pendingFightChoiceId]);

  const equip = useCallback((slot: string, itemId: string | null) => run(async () => {
    const id = state.sessionId!;
    const res = await gameApi.equip(id, slot, itemId);
    // merge updated save/effectiveStats back into the current view
    const view = state.view ? { ...state.view, save: res.save, effectiveStats: res.effectiveStats } : null;
    return { view };
  }), [run, state.sessionId, state.view]);

  const goTo = useCallback((screen: Screen) => {
    setState((s) => ({ ...s, screen }));
  }, []);

  return { state, start, choose, enterCombat, fight, equip, goTo };
}
```

- [ ] **Step 3: Typecheck the client**

Run:
```bash
cd client
npx tsc --noEmit
cd ..
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/assets.ts client/src/hooks/useGameSession.ts
git commit -m "feat: add client assets registry + useGameSession state hook"
```

---

### Task 11: CharCreate + Story screens

**Files:**
- Create: `client/src/screens/CharCreate.tsx`
- Create: `client/src/screens/Story.tsx`

- [ ] **Step 1: Create `client/src/screens/CharCreate.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { gameApi } from '../services/api';
import type { Background } from '../../../shared/backgrounds';

export function CharCreate({ onPick, busy }: { onPick: (id: string) => void; busy: boolean }) {
  const [backgrounds, setBackgrounds] = useState<Background[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gameApi.listBackgrounds().then(setBackgrounds).catch((e) => setError(String(e.message)));
  }, []);

  if (error) return <Text style={styles.error}>Failed to load: {error}</Text>;
  if (!backgrounds) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Choose your background</Text>
      {backgrounds.map((bg) => (
        <Pressable key={bg.id} style={styles.card} disabled={busy} onPress={() => onPick(bg.id)}>
          <Text style={styles.name}>{bg.name}</Text>
          <Text style={styles.blurb}>{bg.blurb}</Text>
          <Text style={styles.stats}>
            STR {bg.baseStats.str} · DEX {bg.baseStats.dex} · INT {bg.baseStats.int} · CON {bg.baseStats.con}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  card: { borderWidth: 1, borderColor: '#888', borderRadius: 8, padding: 12 },
  name: { fontSize: 18, fontWeight: '600' },
  blurb: { color: '#444', marginVertical: 4 },
  stats: { fontVariant: ['tabular-nums'], color: '#222' },
  error: { color: 'red', padding: 16 },
});
```

- [ ] **Step 2: Create `client/src/screens/Story.tsx`**

```tsx
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { SessionView, ChoiceView } from '../services/api';

export function Story({
  view, lastChoice, busy, onChoose, onFight, onInventory,
}: {
  view: SessionView;
  lastChoice: ChoiceView | null;
  busy: boolean;
  onChoose: (choiceId: string) => void;   // skill-check / plain choices
  onFight: (choiceId: string) => void;    // fight choices (route to combat)
  onInventory: () => void;
}) {
  const nodeHasCombat = !!view.node.combat;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.prose}>{view.node.prose}</Text>

      {lastChoice?.roll != null && (
        <Text style={styles.check}>
          Skill check: rolled {lastChoice.roll} → {lastChoice.checkPassed ? 'PASS' : 'FAIL'}
        </Text>
      )}

      {view.node.choices.map((c) => {
        const isFight = nodeHasCombat && !c.skillCheck;
        return (
          <Pressable
            key={c.id}
            style={styles.choice}
            disabled={busy}
            onPress={() => (isFight ? onFight(c.id) : onChoose(c.id))}
          >
            <Text style={styles.choiceText}>
              {c.text}{c.skillCheck ? ` (${c.skillCheck.stat.toUpperCase()} check)` : ''}{isFight ? ' ⚔️' : ''}
            </Text>
          </Pressable>
        );
      })}

      <Pressable style={styles.inv} onPress={onInventory} disabled={busy}>
        <Text style={styles.invText}>Inventory / Equipment</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  prose: { fontSize: 16, lineHeight: 24 },
  check: { fontStyle: 'italic', color: '#555' },
  choice: { borderWidth: 1, borderColor: '#446', borderRadius: 8, padding: 12, backgroundColor: '#eef' },
  choiceText: { fontSize: 16 },
  inv: { padding: 10, marginTop: 16 },
  invText: { textAlign: 'center', color: '#446', textDecorationLine: 'underline' },
});
```

- [ ] **Step 3: Typecheck the client**

Run:
```bash
cd client
npx tsc --noEmit
cd ..
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/screens/CharCreate.tsx client/src/screens/Story.tsx
git commit -m "feat: add CharCreate and Story screens"
```

---

### Task 12: Combat + Inventory screens

**Files:**
- Create: `client/src/screens/Combat.tsx`
- Create: `client/src/screens/Inventory.tsx`

- [ ] **Step 1: Create `client/src/screens/Combat.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { SessionView, ChoiceView } from '../services/api';
import { sprite } from '../assets';

export function Combat({
  view, lastChoice, busy, onFight,
}: {
  view: SessionView;
  lastChoice: ChoiceView | null;
  busy: boolean;
  onFight: (skillPriority: string[]) => void;
}) {
  // Pre-battle: arrange skill priority (start from the saved order).
  const [priority, setPriority] = useState<string[]>(view.save.character.skillPriority);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= priority.length) return;
    const next = [...priority];
    [next[i], next[j]] = [next[j], next[i]];
    setPriority(next);
  };

  // Replay the combat log step by step once we have a result.
  const log = lastChoice?.combat?.log ?? [];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (log.length === 0) { setShown(0); return; }
    setShown(0);
    const timer = setInterval(() => {
      setShown((n) => {
        if (n >= log.length) { clearInterval(timer); return n; }
        return n + 1;
      });
    }, 600);
    return () => clearInterval(timer);
  }, [lastChoice]);

  if (log.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Arrange skill priority</Text>
        {priority.map((id, i) => (
          <View key={id} style={styles.row}>
            <Text style={styles.skill}>{i + 1}. {id}</Text>
            <Pressable disabled={busy} onPress={() => move(i, -1)}><Text style={styles.arrow}>▲</Text></Pressable>
            <Pressable disabled={busy} onPress={() => move(i, 1)}><Text style={styles.arrow}>▼</Text></Pressable>
          </View>
        ))}
        <Pressable style={styles.engage} disabled={busy} onPress={() => onFight(priority)}>
          <Text style={styles.engageText}>Engage ⚔️</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Battle ({lastChoice?.combat?.winner})</Text>
      {log.slice(0, shown).map((e, i) => (
        <Text key={i} style={styles.event}>
          R{e.round} {e.actorId} {e.type}
          {e.skillId ? ` ${sprite('skill.' + e.skillId)} ${e.skillId}` : ''}
          {e.damage ? ` → ${e.damage} dmg` : ''}
          {e.note ? ` (${e.note})` : ''}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skill: { fontSize: 16, flex: 1 },
  arrow: { fontSize: 18, paddingHorizontal: 8 },
  engage: { backgroundColor: '#a33', borderRadius: 8, padding: 14, marginTop: 16 },
  engageText: { color: 'white', textAlign: 'center', fontSize: 16, fontWeight: '700' },
  event: { fontVariant: ['tabular-nums'], fontSize: 14 },
});
```

- [ ] **Step 2: Create `client/src/screens/Inventory.tsx`**

```tsx
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { SessionView } from '../services/api';
import { sprite } from '../assets';

export function Inventory({
  view, busy, onEquip, onBack,
}: {
  view: SessionView;
  busy: boolean;
  onEquip: (slot: string, itemId: string | null) => void;
  onBack: () => void;
}) {
  const equipped = view.save.character.equipped;
  const stats = view.effectiveStats;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Equipment</Text>
      <Text style={styles.stats}>
        STR {stats.str} · DEX {stats.dex} · INT {stats.int} · WIS {stats.wis} · CHA {stats.cha} · CON {stats.con}
      </Text>

      <Text style={styles.section}>Equipped</Text>
      {Object.entries(equipped).map(([slot, id]) => (
        <View key={slot} style={styles.row}>
          <Text style={styles.item}>{slot}: {sprite('item.' + (id ?? ''))} {id}</Text>
          <Pressable disabled={busy} onPress={() => onEquip(slot, null)}>
            <Text style={styles.unequip}>unequip</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.section}>Inventory</Text>
      {view.save.character.inventory.map((id) => (
        <Text key={id} style={styles.item}>{id}</Text>
      ))}

      <Pressable style={styles.back} onPress={onBack} disabled={busy}>
        <Text style={styles.backText}>Back to story</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  stats: { fontVariant: ['tabular-nums'], color: '#222', marginBottom: 8 },
  section: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  item: { fontSize: 15 },
  unequip: { color: '#a33', textDecorationLine: 'underline' },
  back: { padding: 12, marginTop: 20 },
  backText: { textAlign: 'center', color: '#446', textDecorationLine: 'underline' },
});
```

> Note: the Inventory slice supports unequip only (and the buttons call `onEquip(slot, null)`). Re-equipping from inventory is intentionally minimal for the vertical slice; the `equip` endpoint already supports it and can be wired to a fuller UI in sub-project E.

- [ ] **Step 3: Typecheck the client**

Run:
```bash
cd client
npx tsc --noEmit
cd ..
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/screens/Combat.tsx client/src/screens/Inventory.tsx
git commit -m "feat: add Combat (priority + log replay) and Inventory screens"
```

---

### Task 13: App routing glue + manual run

**Files:**
- Modify: `client/App.tsx`

- [ ] **Step 1: Replace `client/App.tsx` with the routing glue**

```tsx
import React from 'react';
import { SafeAreaView, View, Text, Pressable, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useGameSession } from './src/hooks/useGameSession';
import { CharCreate } from './src/screens/CharCreate';
import { Story } from './src/screens/Story';
import { Combat } from './src/screens/Combat';
import { Inventory } from './src/screens/Inventory';

export default function App() {
  const { state, start, choose, enterCombat, fight, equip, goTo } = useGameSession();

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="auto" />
      {state.error && <Text style={styles.error}>{state.error}</Text>}

      {state.screen === 'charcreate' && (
        <CharCreate onPick={start} busy={state.busy} />
      )}

      {state.screen === 'story' && state.view && (
        <Story
          view={state.view}
          lastChoice={state.lastChoice}
          busy={state.busy}
          onChoose={choose}
          onFight={enterCombat}
          onInventory={() => goTo('inventory')}
        />
      )}

      {state.screen === 'combat' && state.view && (
        <Combat view={state.view} lastChoice={state.lastChoice} busy={state.busy} onFight={fight} />
      )}

      {state.screen === 'inventory' && state.view && (
        <Inventory view={state.view} busy={state.busy} onEquip={equip} onBack={() => goTo('story')} />
      )}

      {state.screen === 'ending' && state.view && (
        <View style={styles.ending}>
          <Text style={styles.endTitle}>
            {state.lastChoice?.ending === 'defeat' ? 'You have fallen.' : 'The End'}
          </Text>
          <Text style={styles.endProse}>{state.view.node.prose}</Text>
          {state.view.ending && <Text style={styles.endTag}>Ending: {state.view.ending}</Text>}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 24 },
  error: { color: 'red', textAlign: 'center', padding: 8 },
  ending: { padding: 24, gap: 12 },
  endTitle: { fontSize: 24, fontWeight: '700' },
  endProse: { fontSize: 16, lineHeight: 24 },
  endTag: { fontStyle: 'italic', color: '#555' },
});
```

- [ ] **Step 2: Typecheck the client**

Run:
```bash
cd client
npx tsc --noEmit
cd ..
```
Expected: no errors.

- [ ] **Step 3: Manual end-to-end run (two terminals)**

Terminal 1 — start the server:
```bash
npm run dev:server
```
Expected: `ShufferC server listening on http://localhost:3000`.

Terminal 2 — start the client on web:
```bash
cd client
npm run web
```
Expected: Expo opens a browser tab. Then verify the flow by hand:
1. CharCreate shows 3 backgrounds → pick **Fighter**.
2. Story shows the gate prose with "Fight the goblin ⚔️" and "Sneak past (DEX check)".
3. Tap **Fight** → Combat screen → reorder priority → **Engage** → combat log replays event by event → returns to Story at the cleared node (`n2`).
4. Open **Inventory** → unequip the ring → STR/CON line updates → **Back to story**.
5. Continue to the final node → Ending screen ("The End", ending tag `reach-keep`).
6. Restart, pick **Rogue**, choose **Sneak** → see the skill-check result → reach the ending directly.

> If the client cannot reach the server from a device/emulator, set `EXPO_PUBLIC_API_URL` to your machine's LAN IP before `npm run web` (web on the same machine uses the localhost default).

- [ ] **Step 4: Run the full automated suite + both typechecks**

Run:
```bash
npm test
npm run typecheck
cd client && npx tsc --noEmit && cd ..
```
Expected: all Jest suites pass; both `tsc --noEmit` runs report no errors.

- [ ] **Step 5: Commit**

```bash
git add client/App.tsx
git commit -m "feat: wire client screen routing for the full vertical slice"
```

---

## Self-Review

**Spec coverage (against `2026-06-07-sub-project-b-vertical-slice-design.md`):**
- §0 #1 defer Supabase → `SaveStore` + `memoryStore` (Task 3). ✅
- §0 #2 scope core + inventory → 4 screens (Tasks 11-13). ✅
- §0 #3 server authoritative → engine runs in `session.ts` (Tasks 4-5), client thin (Tasks 9-13). ✅
- §0 #4 preset backgrounds → `shared/backgrounds.ts` (Task 2). ✅
- §0 #5 combat-from-choice rule → `applyChoice` Path 2 (Task 4 impl, Task 5 tests). ✅
- §2 structure (server/client dirs, invariants) → Tasks 1, 6, 8-13. ✅
- §3 REST contract (5 endpoints + error codes) → Task 6. ✅
- §4 orchestration (newGame/applyChoice/equip/view, 3 paths, ending) → Tasks 4-5. ✅
- §5 SaveStore async interface + memory impl → Task 3. ✅
- §6 backgrounds shape + validation → Task 2. ✅
- §7 client (gameApi, hook, 4 screens, assets, replay) → Tasks 9-13. ✅
- §8 test strategy (backgrounds, session core, api shape/status, client api, E2E) → Tasks 2,4,5,6,7,9. ✅
- §1.3 acceptance #1-#8 → Tasks 4/6, 13, 5/7, 5, 4/6, 5, 6, 7 respectively. ✅

**Placeholder scan:** No TBD/TODO. Every code step contains full code. The Task 13 manual-run step is verification, not implementation. ✅

**Type consistency:** `SaveStore` (create/get/put) used identically in Tasks 3-6. `GameSession`/`SessionView`/`ChoiceView` defined in Task 4 and consumed verbatim in Tasks 5-6; mirrored client-side as `SessionView`/`ChoiceView` in `services/api.ts` (Task 9) and consumed by the hook/screens (Tasks 10-13). `GameError(message, status)` thrown in Task 4, mapped in Task 6, mirrored as `ApiError(message, status)` in Task 9. `createGameSession`, `createMemoryStore`, `createApp`, `gameApi`, `useGameSession` names consistent across tasks. Engine functions (`buildPlayerActor`, `buildEnemyActor`, `runCombat`, `resolveChoice`, `effectiveStats`, `serialize`, `deserialize`, `mulberry32`) used with their Sub-project A signatures. ✅

**Determinism note:** `newGame` uses a fixed `START_SEED = 7`; combat and skill checks derive their RNG from `save.seed`, so the server is reproducible and client replay matches (acceptance #6). The combat-outcome assertions in Tasks 5 & 7 carry an explicit "verify by running; switch to `mage`/`freezeBolt` if the seeded result differs" note rather than assuming the win.
