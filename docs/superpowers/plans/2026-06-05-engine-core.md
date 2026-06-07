# Engine Core (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure-TypeScript game engine in `shared/` (data contract + effect registry + deterministic dice/combat/effects/character/story/save) with full unit tests, runnable with hardcoded fixtures and no AI/DB/UI dependency.

**Architecture:** A standalone TypeScript package at the repo root. All game types live in `shared/types.ts`; balance constants in `shared/constants.ts`; status behaviors in `shared/effects/registry.ts`; engine logic (pure functions) in `shared/engine/*`. All randomness flows through a seeded RNG so results are deterministic and testable.

**Tech Stack:** TypeScript 5, Jest + ts-jest, Node 18+ (uses `structuredClone`).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json`, `tsconfig.json`, `jest.config.js`, `.gitignore` | Toolchain |
| `shared/types.ts` | Single source of truth for all game types |
| `shared/constants.ts` | Stat list, equip slots, dice/HP/save constants |
| `shared/effects/registry.ts` | `EFFECT_REGISTRY` — pure status behaviors |
| `shared/engine/dice.ts` | Seeded RNG, `rollD20`, `faceToMultiplier` |
| `shared/engine/effects.ts` | apply / tick / control-check on a `CombatActor` |
| `shared/engine/character.ts` | effective stats, derived HP, build combat actors |
| `shared/engine/combat.ts` | Turn-based auto-battler with skill priority |
| `shared/engine/story.ts` | Resolve a narrative choice (skill check + outcome) |
| `shared/engine/save.ts` | Serialize / deserialize `SaveState` |
| `shared/fixtures.ts` | Hardcoded sample character/items/skills/enemies/route |
| `shared/**/*.test.ts` | Co-located unit tests |

---

### Task 1: Scaffold the TypeScript + Jest workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`
- Create: `.gitignore`
- Create: `shared/smoke.test.ts`

- [ ] **Step 1: Initialize git**

Run:
```bash
git init
```
Expected: `Initialized empty Git repository`.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "shufferc-engine",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "jest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["jest", "node"]
  },
  "include": ["shared"]
}
```

- [ ] **Step 4: Create `jest.config.js`**

```js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/shared'],
  testMatch: ['**/*.test.ts'],
};
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
coverage/
.env
*.log
```

- [ ] **Step 6: Create a smoke test `shared/smoke.test.ts`**

```ts
describe('toolchain', () => {
  it('runs jest + ts-jest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Install dependencies**

Run:
```bash
npm install
```
Expected: dependencies install, `node_modules/` created, no errors.

- [ ] **Step 8: Run the smoke test**

Run:
```bash
npm test
```
Expected: PASS — 1 test passed.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json jest.config.js .gitignore shared/smoke.test.ts
git commit -m "chore: scaffold typescript + jest engine workspace"
```

---

### Task 2: Core types

**Files:**
- Create: `shared/types.ts`
- Delete: `shared/smoke.test.ts`
- Test: `shared/types.test.ts`

- [ ] **Step 1: Write the failing test `shared/types.test.ts`**

```ts
import { Stats, StatusEffect, CombatActor, SaveState } from './types';

describe('types', () => {
  it('lets us build a Stats object with all six keys', () => {
    const s: Stats = { str: 10, dex: 10, int: 10, wis: 10, cha: 10, con: 10 };
    expect(Object.keys(s)).toHaveLength(6);
  });

  it('lets us build a StatusEffect', () => {
    const e: StatusEffect = { id: 'poison', kind: 'dot', duration: 3, magnitude: 2 };
    expect(e.id).toBe('poison');
  });

  it('lets us build a CombatActor and SaveState shell', () => {
    const stats: Stats = { str: 5, dex: 5, int: 5, wis: 5, cha: 5, con: 5 };
    const actor: CombatActor = {
      id: 'player', name: 'Hero', stats, hp: 25, maxHp: 25,
      statuses: [], skillPriority: [], skillBook: {},
    };
    const save: SaveState = {
      version: 1, routeId: 'r1',
      character: { background: 'rogue', baseStats: stats, inventory: [], equipped: {}, skillPriority: [] },
      reputation: { hero: 0, villain: 0, factions: {} },
      flags: {}, choiceLog: [], currentNodeId: 'n1', seed: 42,
    };
    expect(actor.maxHp).toBe(25);
    expect(save.seed).toBe(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/types.test.ts`
Expected: FAIL — `Cannot find module './types'`.

- [ ] **Step 3: Create `shared/types.ts`**

```ts
export type StatKey = 'str' | 'dex' | 'int' | 'wis' | 'cha' | 'con';
export type Stats = Record<StatKey, number>;
export type EffectKind = 'buff' | 'debuff' | 'dot' | 'hot' | 'control';
export type EquipSlot = 'weapon' | 'armor' | 'ring' | 'scroll' | 'quest';

export interface StatusEffect {
  id: string;          // key into EFFECT_REGISTRY: "freeze" | "poison" | ...
  kind: EffectKind;    // set/normalized from the registry when applied
  duration: number;    // remaining turns; 0 = instantaneous (not retained)
  magnitude?: number;  // damage/heal/stat amount per the behavior
}

export interface EffectBehavior {
  kind: EffectKind;
  apply?(target: CombatActor, e: StatusEffect): void;
  tick?(target: CombatActor, e: StatusEffect): void;
  onExpire?(target: CombatActor, e: StatusEffect): void;
}

export interface Skill {
  id: string;
  name: string;
  targetStat?: StatKey;              // stat used for effectiveness; default 'str'
  effectTarget?: 'self' | 'enemy';   // where effects[] land; default 'enemy'
  power?: number;                    // base damage coefficient; default 1
  effects?: StatusEffect[];          // references effects by id; applied on use
  sprite?: string;
}

export interface Item {
  id: string;
  name: string;
  slot: EquipSlot;
  statMods?: Partial<Stats>;
  onEquip?: StatusEffect[];
  onUse?: StatusEffect[];
  grantsSkills?: string[];
  sprite?: string;
  storyTags: string[];
}

export interface Enemy {
  id: string;
  name: string;
  stats: Stats;
  hp: number;
  skillPriority: string[];
  sprite?: string;
}

export interface CombatActor {
  id: string;
  name: string;
  stats: Stats;                      // effective stats (after equip)
  hp: number;
  maxHp: number;
  statuses: StatusEffect[];
  skillPriority: string[];
  skillBook: Record<string, Skill>;
}

export interface CombatEvent {
  round: number;
  actorId: string;
  type: 'skill' | 'skip' | 'pass' | 'death';
  skillId?: string;
  targetId?: string;
  roll?: number;
  multiplier?: number;
  damage?: number;
  note?: string;
}

export interface CombatResult {
  winner: 'player' | 'enemies' | 'draw';
  rounds: number;
  log: CombatEvent[];
}

export interface ChoiceOutcome {
  statDelta?: Partial<Stats>;
  reputationDelta?: { hero?: number; villain?: number; factions?: Record<string, number> };
  addItems?: string[];
  removeItems?: string[];
  setFlags?: Record<string, boolean>;
}

export interface Choice {
  id: string;
  text: string;
  skillCheck?: { stat: StatKey; dc: number };
  outcome?: ChoiceOutcome;
  nextNodeId?: string;
}

export interface StoryNode {
  id: string;
  prose: string;
  choices: Choice[];
  combat?: { enemyIds: string[] };
  source: 'pregen' | 'live';
}

export interface Ending { id: string; title: string; condition: string; }
export interface Act { id: string; title: string; nodeIds: string[]; }

export interface GameRoute {
  id: string;
  title: string;
  sourceNovelId: string;
  acts: Act[];
  itemPool: string[];
  enemyPool: string[];
  endings: Ending[];
  status: 'draft' | 'published';
}

export interface CharacterState {
  background: string;
  baseStats: Stats;
  inventory: string[];                       // item ids owned
  equipped: Partial<Record<EquipSlot, string>>;
  skillPriority: string[];
}

export interface Reputation { hero: number; villain: number; factions: Record<string, number>; }

export interface SaveState {
  version: number;
  routeId: string;
  character: CharacterState;
  reputation: Reputation;
  flags: Record<string, boolean>;
  choiceLog: { nodeId: string; choiceId: string }[];
  currentNodeId: string;
  seed: number;
}
```

- [ ] **Step 4: Delete the smoke test**

Run:
```bash
git rm shared/smoke.test.ts
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest shared/types.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts shared/types.test.ts
git commit -m "feat: add core game types (single source of truth)"
```

---

### Task 3: Constants

**Files:**
- Create: `shared/constants.ts`
- Test: `shared/constants.test.ts`

- [ ] **Step 1: Write the failing test `shared/constants.test.ts`**

```ts
import { STAT_KEYS, EQUIP_SLOTS, DICE_MIN_MULT, DICE_MAX_MULT, BASE_HP, HP_PER_CON, SAVE_VERSION } from './constants';

describe('constants', () => {
  it('has all six stat keys', () => {
    expect(STAT_KEYS).toEqual(['str', 'dex', 'int', 'wis', 'cha', 'con']);
  });
  it('has five equip slots', () => {
    expect(EQUIP_SLOTS).toEqual(['weapon', 'armor', 'ring', 'scroll', 'quest']);
  });
  it('defines dice multiplier bounds', () => {
    expect(DICE_MIN_MULT).toBeCloseTo(0.1);
    expect(DICE_MAX_MULT).toBeCloseTo(2.0);
  });
  it('defines HP + save constants', () => {
    expect(BASE_HP).toBe(20);
    expect(HP_PER_CON).toBe(5);
    expect(SAVE_VERSION).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/constants.test.ts`
Expected: FAIL — `Cannot find module './constants'`.

- [ ] **Step 3: Create `shared/constants.ts`**

```ts
import { StatKey, EquipSlot } from './types';

export const STAT_KEYS: StatKey[] = ['str', 'dex', 'int', 'wis', 'cha', 'con'];
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'armor', 'ring', 'scroll', 'quest'];

export const DICE_MIN_MULT = 0.1;
export const DICE_MAX_MULT = 2.0;

export const BASE_HP = 20;
export const HP_PER_CON = 5;

export const SAVE_VERSION = 1;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest shared/constants.test.ts`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add shared/constants.ts shared/constants.test.ts
git commit -m "feat: add balance + dice + save constants"
```

---

### Task 4: Dice (seeded RNG, rollD20, faceToMultiplier)

**Files:**
- Create: `shared/engine/dice.ts`
- Test: `shared/engine/dice.test.ts`

- [ ] **Step 1: Write the failing test `shared/engine/dice.test.ts`**

```ts
import { mulberry32, rollD20, faceToMultiplier } from './dice';

describe('faceToMultiplier', () => {
  it('maps face 1 to 0.10 and face 20 to 2.00', () => {
    expect(faceToMultiplier(1)).toBeCloseTo(0.1, 5);
    expect(faceToMultiplier(20)).toBeCloseTo(2.0, 5);
  });
  it('maps face 10 to ~1.0 (mid)', () => {
    expect(faceToMultiplier(10)).toBeCloseTo(1.0, 5);
  });
  it('is monotonically increasing across all faces', () => {
    for (let f = 2; f <= 20; f++) {
      expect(faceToMultiplier(f)).toBeGreaterThan(faceToMultiplier(f - 1));
    }
  });
  it('clamps out-of-range faces', () => {
    expect(faceToMultiplier(0)).toBeCloseTo(0.1, 5);
    expect(faceToMultiplier(99)).toBeCloseTo(2.0, 5);
  });
});

describe('seeded RNG + rollD20', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const rollsA = [rollD20(a), rollD20(a), rollD20(a)];
    const rollsB = [rollD20(b), rollD20(b), rollD20(b)];
    expect(rollsA).toEqual(rollsB);
  });
  it('always returns a face within 1..20', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const r = rollD20(rng);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(20);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/engine/dice.test.ts`
Expected: FAIL — `Cannot find module './dice'`.

- [ ] **Step 3: Create `shared/engine/dice.ts`**

```ts
import { DICE_MIN_MULT, DICE_MAX_MULT } from '../constants';

export type RNG = () => number; // returns a float in [0, 1)

export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollD20(rng: RNG): number {
  return Math.floor(rng() * 20) + 1; // 1..20
}

export function faceToMultiplier(face: number): number {
  const clamped = Math.max(1, Math.min(20, face));
  return DICE_MIN_MULT + ((clamped - 1) / 19) * (DICE_MAX_MULT - DICE_MIN_MULT);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest shared/engine/dice.test.ts`
Expected: PASS — all tests passed.

- [ ] **Step 5: Commit**

```bash
git add shared/engine/dice.ts shared/engine/dice.test.ts
git commit -m "feat: add seeded RNG, rollD20, faceToMultiplier"
```

---

### Task 5: Effect registry

**Files:**
- Create: `shared/effects/registry.ts`
- Test: `shared/effects/registry.test.ts`

- [ ] **Step 1: Write the failing test `shared/effects/registry.test.ts`**

```ts
import { EFFECT_REGISTRY } from './registry';
import { CombatActor, StatusEffect } from '../types';

function actor(): CombatActor {
  return {
    id: 'a', name: 'A',
    stats: { str: 10, dex: 10, int: 10, wis: 10, cha: 10, con: 10 },
    hp: 20, maxHp: 30, statuses: [], skillPriority: [], skillBook: {},
  };
}

describe('EFFECT_REGISTRY', () => {
  it('defines the six baseline effects with correct kinds', () => {
    expect(EFFECT_REGISTRY.freeze.kind).toBe('control');
    expect(EFFECT_REGISTRY.stun.kind).toBe('control');
    expect(EFFECT_REGISTRY.poison.kind).toBe('dot');
    expect(EFFECT_REGISTRY.regen.kind).toBe('hot');
    expect(EFFECT_REGISTRY.attack_buff.kind).toBe('buff');
    expect(EFFECT_REGISTRY.defense_down.kind).toBe('debuff');
  });

  it('poison.tick subtracts magnitude and clamps at 0', () => {
    const a = actor(); a.hp = 3;
    const e: StatusEffect = { id: 'poison', kind: 'dot', duration: 2, magnitude: 5 };
    EFFECT_REGISTRY.poison.tick!(a, e);
    expect(a.hp).toBe(0);
  });

  it('regen.tick adds magnitude and clamps at maxHp', () => {
    const a = actor(); a.hp = 28;
    const e: StatusEffect = { id: 'regen', kind: 'hot', duration: 2, magnitude: 5 };
    EFFECT_REGISTRY.regen.tick!(a, e);
    expect(a.hp).toBe(30);
  });

  it('attack_buff raises str on apply and restores on expire', () => {
    const a = actor();
    const e: StatusEffect = { id: 'attack_buff', kind: 'buff', duration: 2, magnitude: 4 };
    EFFECT_REGISTRY.attack_buff.apply!(a, e);
    expect(a.stats.str).toBe(14);
    EFFECT_REGISTRY.attack_buff.onExpire!(a, e);
    expect(a.stats.str).toBe(10);
  });

  it('defense_down lowers con on apply and restores on expire', () => {
    const a = actor();
    const e: StatusEffect = { id: 'defense_down', kind: 'debuff', duration: 2, magnitude: 3 };
    EFFECT_REGISTRY.defense_down.apply!(a, e);
    expect(a.stats.con).toBe(7);
    EFFECT_REGISTRY.defense_down.onExpire!(a, e);
    expect(a.stats.con).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/effects/registry.test.ts`
Expected: FAIL — `Cannot find module './registry'`.

- [ ] **Step 3: Create `shared/effects/registry.ts`**

```ts
import { CombatActor, EffectBehavior, StatusEffect } from '../types';

function clampHp(a: CombatActor): void {
  a.hp = Math.max(0, Math.min(a.maxHp, a.hp));
}

export const EFFECT_REGISTRY: Record<string, EffectBehavior> = {
  freeze: { kind: 'control' },
  stun: { kind: 'control' },
  poison: {
    kind: 'dot',
    tick(target: CombatActor, e: StatusEffect) { target.hp -= e.magnitude ?? 1; clampHp(target); },
  },
  regen: {
    kind: 'hot',
    tick(target: CombatActor, e: StatusEffect) { target.hp += e.magnitude ?? 1; clampHp(target); },
  },
  attack_buff: {
    kind: 'buff',
    apply(target: CombatActor, e: StatusEffect) { target.stats.str += e.magnitude ?? 1; },
    onExpire(target: CombatActor, e: StatusEffect) { target.stats.str -= e.magnitude ?? 1; },
  },
  defense_down: {
    kind: 'debuff',
    apply(target: CombatActor, e: StatusEffect) { target.stats.con -= e.magnitude ?? 1; },
    onExpire(target: CombatActor, e: StatusEffect) { target.stats.con += e.magnitude ?? 1; },
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest shared/effects/registry.test.ts`
Expected: PASS — all tests passed.

- [ ] **Step 5: Commit**

```bash
git add shared/effects/registry.ts shared/effects/registry.test.ts
git commit -m "feat: add effect registry (freeze/stun/poison/regen/buff/debuff)"
```

---

### Task 6: Effects engine (apply / tick / control)

**Files:**
- Create: `shared/engine/effects.ts`
- Test: `shared/engine/effects.test.ts`

- [ ] **Step 1: Write the failing test `shared/engine/effects.test.ts`**

```ts
import { applyEffect, tickEffects, hasControl } from './effects';
import { CombatActor, StatusEffect } from '../types';

function actor(): CombatActor {
  return {
    id: 'a', name: 'A',
    stats: { str: 10, dex: 10, int: 10, wis: 10, cha: 10, con: 10 },
    hp: 20, maxHp: 30, statuses: [], skillPriority: [], skillBook: {},
  };
}

describe('applyEffect', () => {
  it('normalizes kind from the registry and retains effects with duration > 0', () => {
    const a = actor();
    applyEffect(a, { id: 'poison', kind: 'buff', duration: 3, magnitude: 2 }); // wrong kind on purpose
    expect(a.statuses).toHaveLength(1);
    expect(a.statuses[0].kind).toBe('dot'); // corrected from registry
  });

  it('does not retain instantaneous (duration 0) effects but still runs apply', () => {
    const a = actor();
    applyEffect(a, { id: 'attack_buff', kind: 'buff', duration: 0, magnitude: 4 });
    expect(a.stats.str).toBe(14);     // apply ran
    expect(a.statuses).toHaveLength(0); // not retained
  });

  it('ignores unknown effect ids', () => {
    const a = actor();
    applyEffect(a, { id: 'nope', kind: 'buff', duration: 3 });
    expect(a.statuses).toHaveLength(0);
  });
});

describe('hasControl', () => {
  it('is true when a control status is active', () => {
    const a = actor();
    applyEffect(a, { id: 'freeze', kind: 'control', duration: 2 });
    expect(hasControl(a)).toBe(true);
  });
  it('is false with no control status', () => {
    expect(hasControl(actor())).toBe(false);
  });
});

describe('tickEffects', () => {
  it('ticks poison each round, counts down duration, and expires', () => {
    const a = actor();
    applyEffect(a, { id: 'poison', kind: 'dot', duration: 2, magnitude: 3 });
    tickEffects(a); // round 1: -3, duration 2->1
    expect(a.hp).toBe(17);
    expect(a.statuses).toHaveLength(1);
    tickEffects(a); // round 2: -3, duration 1->0, expires
    expect(a.hp).toBe(14);
    expect(a.statuses).toHaveLength(0);
  });

  it('restores a buff on expiry via onExpire', () => {
    const a = actor();
    applyEffect(a, { id: 'attack_buff', kind: 'buff', duration: 1, magnitude: 4 });
    expect(a.stats.str).toBe(14);
    tickEffects(a); // duration 1->0, onExpire restores
    expect(a.stats.str).toBe(10);
    expect(a.statuses).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/engine/effects.test.ts`
Expected: FAIL — `Cannot find module './effects'`.

- [ ] **Step 3: Create `shared/engine/effects.ts`**

```ts
import { CombatActor, StatusEffect } from '../types';
import { EFFECT_REGISTRY } from '../effects/registry';

export function applyEffect(target: CombatActor, effect: StatusEffect): void {
  const behavior = EFFECT_REGISTRY[effect.id];
  if (!behavior) return;
  const copy: StatusEffect = { ...effect, kind: behavior.kind }; // normalize kind from registry
  behavior.apply?.(target, copy);
  if (copy.duration > 0) target.statuses.push(copy);
}

export function hasControl(actor: CombatActor): boolean {
  return actor.statuses.some((s) => s.kind === 'control' && s.duration > 0);
}

export function tickEffects(actor: CombatActor): void {
  const remaining: StatusEffect[] = [];
  for (const s of actor.statuses) {
    const behavior = EFFECT_REGISTRY[s.id];
    behavior?.tick?.(actor, s);
    s.duration -= 1;
    if (s.duration <= 0) {
      behavior?.onExpire?.(actor, s);
    } else {
      remaining.push(s);
    }
  }
  actor.statuses = remaining;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest shared/engine/effects.test.ts`
Expected: PASS — all tests passed.

- [ ] **Step 5: Commit**

```bash
git add shared/engine/effects.ts shared/engine/effects.test.ts
git commit -m "feat: add effects engine (apply/tick/control)"
```

---

### Task 7: Character (effective stats, derived HP, actor builders)

**Files:**
- Create: `shared/engine/character.ts`
- Test: `shared/engine/character.test.ts`

- [ ] **Step 1: Write the failing test `shared/engine/character.test.ts`**

```ts
import { effectiveStats, deriveMaxHp, buildPlayerActor, buildEnemyActor } from './character';
import { CharacterState, Item, Skill, Enemy, Stats } from '../types';

const baseStats: Stats = { str: 8, dex: 6, int: 5, wis: 5, cha: 5, con: 4 };

const itemDb: Record<string, Item> = {
  sword: { id: 'sword', name: 'Sword', slot: 'weapon', statMods: { str: 3 }, storyTags: [] },
  ringOfRegen: {
    id: 'ringOfRegen', name: 'Ring of Regen', slot: 'ring', statMods: { con: 2 },
    onEquip: [{ id: 'regen', kind: 'hot', duration: 99, magnitude: 2 }], storyTags: [],
  },
};

const skillDb: Record<string, Skill> = {
  slash: { id: 'slash', name: 'Slash', targetStat: 'str', power: 1 },
};

describe('effectiveStats', () => {
  it('sums statMods from equipped items', () => {
    const c: CharacterState = {
      background: 'fighter', baseStats, inventory: ['sword', 'ringOfRegen'],
      equipped: { weapon: 'sword', ring: 'ringOfRegen' }, skillPriority: ['slash'],
    };
    const s = effectiveStats(c, itemDb);
    expect(s.str).toBe(11); // 8 + 3
    expect(s.con).toBe(6);  // 4 + 2
  });

  it('equals base stats when nothing is equipped', () => {
    const c: CharacterState = { background: 'fighter', baseStats, inventory: [], equipped: {}, skillPriority: [] };
    expect(effectiveStats(c, itemDb)).toEqual(baseStats);
  });
});

describe('deriveMaxHp', () => {
  it('is BASE_HP + con * HP_PER_CON', () => {
    expect(deriveMaxHp({ ...baseStats, con: 6 })).toBe(20 + 6 * 5); // 50
  });
});

describe('buildPlayerActor', () => {
  it('builds an actor with effective stats, full hp, and onEquip effects applied', () => {
    const c: CharacterState = {
      background: 'fighter', baseStats, inventory: ['sword', 'ringOfRegen'],
      equipped: { weapon: 'sword', ring: 'ringOfRegen' }, skillPriority: ['slash'],
    };
    const actor = buildPlayerActor(c, itemDb, skillDb);
    expect(actor.stats.str).toBe(11);
    expect(actor.maxHp).toBe(20 + 6 * 5); // con 6
    expect(actor.hp).toBe(actor.maxHp);
    expect(actor.skillBook.slash).toBeDefined();
    expect(actor.statuses.some((s) => s.id === 'regen')).toBe(true); // onEquip applied
  });
});

describe('buildEnemyActor', () => {
  it('builds an enemy actor from its definition', () => {
    const enemy: Enemy = {
      id: 'goblin', name: 'Goblin',
      stats: { str: 6, dex: 6, int: 2, wis: 2, cha: 2, con: 3 },
      hp: 18, skillPriority: ['slash'],
    };
    const actor = buildEnemyActor(enemy, skillDb);
    expect(actor.id).toBe('goblin');
    expect(actor.hp).toBe(18);
    expect(actor.maxHp).toBe(18);
    expect(actor.skillBook.slash).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/engine/character.test.ts`
Expected: FAIL — `Cannot find module './character'`.

- [ ] **Step 3: Create `shared/engine/character.ts`**

```ts
import { CharacterState, CombatActor, Enemy, Item, Skill, Stats } from '../types';
import { STAT_KEYS, BASE_HP, HP_PER_CON } from '../constants';
import { applyEffect } from './effects';

export function effectiveStats(character: CharacterState, itemDb: Record<string, Item>): Stats {
  const result: Stats = { ...character.baseStats };
  for (const itemId of Object.values(character.equipped)) {
    if (!itemId) continue;
    const item = itemDb[itemId];
    if (!item?.statMods) continue;
    for (const key of STAT_KEYS) {
      const mod = item.statMods[key];
      if (mod) result[key] += mod;
    }
  }
  return result;
}

export function deriveMaxHp(stats: Stats): number {
  return BASE_HP + stats.con * HP_PER_CON;
}

function collectSkillBook(ids: string[], skillDb: Record<string, Skill>): Record<string, Skill> {
  const book: Record<string, Skill> = {};
  for (const id of ids) {
    if (skillDb[id]) book[id] = skillDb[id];
  }
  return book;
}

export function buildPlayerActor(
  character: CharacterState,
  itemDb: Record<string, Item>,
  skillDb: Record<string, Skill>,
): CombatActor {
  const stats = effectiveStats(character, itemDb);
  const maxHp = deriveMaxHp(stats);
  const actor: CombatActor = {
    id: 'player',
    name: 'Hero',
    stats,
    hp: maxHp,
    maxHp,
    statuses: [],
    skillPriority: [...character.skillPriority],
    skillBook: collectSkillBook(character.skillPriority, skillDb),
  };
  for (const itemId of Object.values(character.equipped)) {
    if (!itemId) continue;
    const item = itemDb[itemId];
    for (const eff of item?.onEquip ?? []) applyEffect(actor, eff);
  }
  return actor;
}

export function buildEnemyActor(enemy: Enemy, skillDb: Record<string, Skill>): CombatActor {
  return {
    id: enemy.id,
    name: enemy.name,
    stats: { ...enemy.stats },
    hp: enemy.hp,
    maxHp: enemy.hp,
    statuses: [],
    skillPriority: [...enemy.skillPriority],
    skillBook: collectSkillBook(enemy.skillPriority, skillDb),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest shared/engine/character.test.ts`
Expected: PASS — all tests passed.

- [ ] **Step 5: Commit**

```bash
git add shared/engine/character.ts shared/engine/character.test.ts
git commit -m "feat: add character stats, derived HP, and combat actor builders"
```

---

### Task 8: Combat (turn-based auto-battler with skill priority)

**Files:**
- Create: `shared/engine/combat.ts`
- Test: `shared/engine/combat.test.ts`

- [ ] **Step 1: Write the failing test `shared/engine/combat.test.ts`**

```ts
import { runCombat } from './combat';
import { CombatActor, Skill } from '../types';

const slash: Skill = { id: 'slash', name: 'Slash', targetStat: 'str', power: 1, effectTarget: 'enemy' };
const freezeBolt: Skill = {
  id: 'freezeBolt', name: 'Freeze Bolt', targetStat: 'int', power: 1, effectTarget: 'enemy',
  effects: [{ id: 'freeze', kind: 'control', duration: 1 }],
};

function mkActor(id: string, str: number, hp: number, skills: Skill[], priority: string[]): CombatActor {
  const skillBook: Record<string, Skill> = {};
  for (const s of skills) skillBook[s.id] = s;
  return {
    id, name: id,
    stats: { str, dex: 5, int: str, wis: 5, cha: 5, con: 0 },
    hp, maxHp: hp, statuses: [], skillPriority: priority, skillBook,
  };
}

describe('runCombat', () => {
  it('is deterministic for the same seed', () => {
    const r1 = runCombat({ player: mkActor('player', 12, 30, [slash], ['slash']), enemies: [mkActor('goblin', 6, 18, [slash], ['slash'])], seed: 99 });
    const r2 = runCombat({ player: mkActor('player', 12, 30, [slash], ['slash']), enemies: [mkActor('goblin', 6, 18, [slash], ['slash'])], seed: 99 });
    expect(r1.winner).toBe(r2.winner);
    expect(r1.rounds).toBe(r2.rounds);
    expect(r1.log).toEqual(r2.log);
  });

  it('player wins against a much weaker enemy', () => {
    const result = runCombat({ player: mkActor('player', 20, 60, [slash], ['slash']), enemies: [mkActor('goblin', 2, 6, [slash], ['slash'])], seed: 1 });
    expect(result.winner).toBe('player');
  });

  it('player loses against a much stronger enemy', () => {
    const result = runCombat({ player: mkActor('player', 2, 6, [slash], ['slash']), enemies: [mkActor('dragon', 25, 80, [slash], ['slash'])], seed: 1 });
    expect(result.winner).toBe('enemies');
  });

  it('a controlled enemy skips its turn (skip event present)', () => {
    const player = mkActor('player', 12, 40, [freezeBolt, slash], ['freezeBolt', 'slash']);
    const enemy = mkActor('goblin', 6, 40, [slash], ['slash']);
    const result = runCombat({ player, enemies: [enemy], seed: 3 });
    const goblinSkipped = result.log.some((e) => e.actorId === 'goblin' && e.type === 'skip');
    expect(goblinSkipped).toBe(true);
  });

  it('uses the first usable skill by priority', () => {
    const player = mkActor('player', 12, 40, [freezeBolt, slash], ['freezeBolt', 'slash']);
    const enemy = mkActor('goblin', 6, 40, [slash], ['slash']);
    const result = runCombat({ player, enemies: [enemy], seed: 5 });
    const firstPlayerSkill = result.log.find((e) => e.actorId === 'player' && e.type === 'skill');
    expect(firstPlayerSkill?.skillId).toBe('freezeBolt');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/engine/combat.test.ts`
Expected: FAIL — `Cannot find module './combat'`.

- [ ] **Step 3: Create `shared/engine/combat.ts`**

```ts
import { CombatActor, CombatEvent, CombatResult, Skill, StatKey } from '../types';
import { RNG, mulberry32, rollD20, faceToMultiplier } from './dice';
import { applyEffect, tickEffects, hasControl } from './effects';

const MAX_ROUNDS = 50;

export interface CombatInput {
  player: CombatActor;
  enemies: CombatActor[];
  seed: number;
}

function pickSkill(actor: CombatActor): Skill | null {
  for (const id of actor.skillPriority) {
    const skill = actor.skillBook[id];
    if (skill) return skill;
  }
  return null;
}

function computeDamage(actor: CombatActor, skill: Skill, target: CombatActor, mult: number): number {
  const stat: StatKey = skill.targetStat ?? 'str';
  const base = actor.stats[stat] * (skill.power ?? 1);
  const defense = Math.floor(target.stats.con / 2);
  return Math.max(1, Math.round(base * mult) - defense);
}

export function runCombat(input: CombatInput): CombatResult {
  const rng: RNG = mulberry32(input.seed);
  const log: CombatEvent[] = [];
  const { player, enemies } = input;
  let round = 0;

  const alive = (a: CombatActor) => a.hp > 0;
  const enemiesAlive = () => enemies.some(alive);

  while (player.hp > 0 && enemiesAlive() && round < MAX_ROUNDS) {
    round += 1;
    const order: CombatActor[] = [player, ...enemies];
    for (const actor of order) {
      if (actor.hp <= 0) continue;
      if (player.hp <= 0 || !enemiesAlive()) break;

      if (hasControl(actor)) {
        log.push({ round, actorId: actor.id, type: 'skip', note: 'controlled' });
        tickEffects(actor); // tick (incl. duration countdown) even while controlled, so control wears off
        continue;
      }
      tickEffects(actor); // poison/regen + duration countdown at start of turn
      if (actor.hp <= 0) {
        log.push({ round, actorId: actor.id, type: 'death', note: 'died from effect' });
        continue;
      }

      const skill = pickSkill(actor);
      if (!skill) {
        log.push({ round, actorId: actor.id, type: 'pass' });
        continue;
      }

      const isPlayer = actor.id === player.id;
      const enemyTarget = isPlayer ? enemies.find(alive)! : player;
      const effectTarget = skill.effectTarget ?? 'enemy';
      const recipient = effectTarget === 'self' ? actor : enemyTarget;

      const roll = rollD20(rng);
      const mult = faceToMultiplier(roll);

      let damage = 0;
      if (effectTarget === 'enemy') {
        damage = computeDamage(actor, skill, enemyTarget, mult);
        enemyTarget.hp = Math.max(0, enemyTarget.hp - damage);
      }
      for (const eff of skill.effects ?? []) applyEffect(recipient, eff);

      log.push({ round, actorId: actor.id, type: 'skill', skillId: skill.id, targetId: recipient.id, roll, multiplier: mult, damage });

      if (effectTarget === 'enemy' && enemyTarget.hp <= 0) {
        log.push({ round, actorId: enemyTarget.id, type: 'death' });
      }
    }
  }

  const winner: CombatResult['winner'] =
    player.hp > 0 && !enemiesAlive() ? 'player' : player.hp <= 0 ? 'enemies' : 'draw';

  return { winner, rounds: round, log };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest shared/engine/combat.test.ts`
Expected: PASS — all tests passed.

- [ ] **Step 5: Commit**

```bash
git add shared/engine/combat.ts shared/engine/combat.test.ts
git commit -m "feat: add turn-based auto-battler with skill priority + d20 multiplier"
```

---

### Task 9: Story progression (resolve a choice: skill check + outcome)

**Files:**
- Create: `shared/engine/story.ts`
- Test: `shared/engine/story.test.ts`

- [ ] **Step 1: Write the failing test `shared/engine/story.test.ts`**

```ts
import { resolveChoice } from './story';
import { SaveState, StoryNode, Stats } from '../types';
import { mulberry32 } from './dice';

const baseStats: Stats = { str: 10, dex: 10, int: 10, wis: 10, cha: 10, con: 10 };

function save(): SaveState {
  return {
    version: 1, routeId: 'r1',
    character: { background: 'rogue', baseStats: { ...baseStats }, inventory: ['torch'], equipped: {}, skillPriority: [] },
    reputation: { hero: 0, villain: 0, factions: {} },
    flags: {}, choiceLog: [], currentNodeId: 'n1', seed: 42,
  };
}

const node: StoryNode = {
  id: 'n1', source: 'pregen', prose: 'A locked door blocks the way.',
  choices: [
    {
      id: 'persuade', text: 'Persuade the guard',
      skillCheck: { stat: 'cha', dc: 8 },
      outcome: { reputationDelta: { hero: 1, factions: { guards: 2 } }, setFlags: { doorOpen: true } },
      nextNodeId: 'n2',
    },
    {
      id: 'steal', text: 'Steal the key',
      outcome: { statDelta: { dex: 1 }, addItems: ['key'], removeItems: ['torch'], reputationDelta: { villain: 1 } },
      nextNodeId: 'n3',
    },
  ],
};

describe('resolveChoice', () => {
  it('does not mutate the input save', () => {
    const s = save();
    resolveChoice(s, node, 'steal');
    expect(s.character.inventory).toEqual(['torch']);
    expect(s.choiceLog).toHaveLength(0);
  });

  it('applies outcome: stat/inventory/reputation/flags and advances node', () => {
    const { save: next } = resolveChoice(save(), node, 'steal');
    expect(next.character.baseStats.dex).toBe(11);
    expect(next.character.inventory).toEqual(['key']);
    expect(next.reputation.villain).toBe(1);
    expect(next.currentNodeId).toBe('n3');
    expect(next.choiceLog).toEqual([{ nodeId: 'n1', choiceId: 'steal' }]);
  });

  it('applies faction + hero reputation and flags', () => {
    const { save: next } = resolveChoice(save(), node, 'persuade', mulberry32(1));
    expect(next.reputation.hero).toBe(1);
    expect(next.reputation.factions.guards).toBe(2);
    expect(next.flags.doorOpen).toBe(true);
  });

  it('runs a skill check using the d20 multiplier when present', () => {
    const res = resolveChoice(save(), node, 'persuade', mulberry32(1));
    expect(typeof res.roll).toBe('number');
    expect(typeof res.checkPassed).toBe('boolean');
  });

  it('throws on an unknown choice id', () => {
    expect(() => resolveChoice(save(), node, 'nope')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest shared/engine/story.test.ts`
Expected: FAIL — `Cannot find module './story'`.

- [ ] **Step 3: Create `shared/engine/story.ts`**

```ts
import { SaveState, StoryNode } from '../types';
import { RNG, mulberry32, rollD20, faceToMultiplier } from './dice';
import { STAT_KEYS } from '../constants';

export interface ChoiceResolution {
  save: SaveState;
  checkPassed?: boolean;
  roll?: number;
}

export function resolveChoice(
  save: SaveState,
  node: StoryNode,
  choiceId: string,
  rng?: RNG,
): ChoiceResolution {
  const choice = node.choices.find((c) => c.id === choiceId);
  if (!choice) throw new Error(`Choice ${choiceId} not in node ${node.id}`);

  const next: SaveState = structuredClone(save);
  let checkPassed: boolean | undefined;
  let roll: number | undefined;

  if (choice.skillCheck) {
    const r = rng ?? mulberry32(next.seed);
    roll = rollD20(r);
    const statValue = next.character.baseStats[choice.skillCheck.stat];
    const score = statValue * faceToMultiplier(roll);
    checkPassed = score >= choice.skillCheck.dc;
  }

  const outcome = choice.outcome;
  if (outcome) {
    if (outcome.statDelta) {
      for (const k of STAT_KEYS) {
        const d = outcome.statDelta[k];
        if (d) next.character.baseStats[k] += d;
      }
    }
    if (outcome.reputationDelta) {
      const rd = outcome.reputationDelta;
      if (rd.hero) next.reputation.hero += rd.hero;
      if (rd.villain) next.reputation.villain += rd.villain;
      if (rd.factions) {
        for (const [f, v] of Object.entries(rd.factions)) {
          next.reputation.factions[f] = (next.reputation.factions[f] ?? 0) + v;
        }
      }
    }
    if (outcome.addItems) next.character.inventory.push(...outcome.addItems);
    if (outcome.removeItems) {
      next.character.inventory = next.character.inventory.filter((i) => !outcome.removeItems!.includes(i));
    }
    if (outcome.setFlags) {
      for (const [f, v] of Object.entries(outcome.setFlags)) next.flags[f] = v;
    }
  }

  next.choiceLog.push({ nodeId: node.id, choiceId });
  if (choice.nextNodeId) next.currentNodeId = choice.nextNodeId;

  return { save: next, checkPassed, roll };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest shared/engine/story.test.ts`
Expected: PASS — all tests passed.

- [ ] **Step 5: Commit**

```bash
git add shared/engine/story.ts shared/engine/story.test.ts
git commit -m "feat: add narrative choice resolution (skill check + outcome)"
```

---

### Task 10: Save serialization + fixtures + end-to-end engine test

**Files:**
- Create: `shared/engine/save.ts`
- Create: `shared/fixtures.ts`
- Test: `shared/engine/save.test.ts`
- Test: `shared/engine/integration.test.ts`

- [ ] **Step 1: Write the failing test `shared/engine/save.test.ts`**

```ts
import { serialize, deserialize } from './save';
import { SaveState, Stats } from '../types';

const baseStats: Stats = { str: 7, dex: 9, int: 6, wis: 5, cha: 8, con: 6 };

function save(): SaveState {
  return {
    version: 1, routeId: 'r1',
    character: { background: 'rogue', baseStats, inventory: ['key'], equipped: { weapon: 'dagger' }, skillPriority: ['slash'] },
    reputation: { hero: 2, villain: 1, factions: { guards: 3 } },
    flags: { doorOpen: true }, choiceLog: [{ nodeId: 'n1', choiceId: 'steal' }], currentNodeId: 'n3', seed: 42,
  };
}

describe('save serialization', () => {
  it('round-trips a SaveState unchanged', () => {
    const s = save();
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it('rejects an unsupported save version', () => {
    const bad = serialize({ ...save(), version: 999 });
    expect(() => deserialize(bad)).toThrow(/version/i);
  });
});
```

- [ ] **Step 2: Run save test to verify it fails**

Run: `npx jest shared/engine/save.test.ts`
Expected: FAIL — `Cannot find module './save'`.

- [ ] **Step 3: Create `shared/engine/save.ts`**

```ts
import { SaveState } from '../types';
import { SAVE_VERSION } from '../constants';

export function serialize(save: SaveState): string {
  return JSON.stringify(save);
}

export function deserialize(json: string): SaveState {
  const data = JSON.parse(json) as SaveState;
  if (data.version !== SAVE_VERSION) {
    throw new Error(`Unsupported save version ${data.version}, expected ${SAVE_VERSION}`);
  }
  return data;
}
```

- [ ] **Step 4: Run save test to verify it passes**

Run: `npx jest shared/engine/save.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Create `shared/fixtures.ts`**

```ts
import { Item, Skill, Enemy, CharacterState, StoryNode, GameRoute } from './types';

export const SKILL_DB: Record<string, Skill> = {
  slash: { id: 'slash', name: 'Slash', targetStat: 'str', power: 1, effectTarget: 'enemy', sprite: 'skill.slash' },
  freezeBolt: {
    id: 'freezeBolt', name: 'Freeze Bolt', targetStat: 'int', power: 1, effectTarget: 'enemy',
    effects: [{ id: 'freeze', kind: 'control', duration: 1 }], sprite: 'skill.freeze',
  },
  meditate: {
    id: 'meditate', name: 'Meditate', effectTarget: 'self', power: 0,
    effects: [{ id: 'regen', kind: 'hot', duration: 3, magnitude: 3 }], sprite: 'skill.regen',
  },
};

export const ITEM_DB: Record<string, Item> = {
  dagger: { id: 'dagger', name: 'Dagger', slot: 'weapon', statMods: { str: 2 }, storyTags: ['rogue'], sprite: 'item.dagger' },
  ringOfRegen: {
    id: 'ringOfRegen', name: 'Ring of Regen', slot: 'ring', statMods: { con: 2 },
    onEquip: [{ id: 'regen', kind: 'hot', duration: 99, magnitude: 1 }], storyTags: ['mystic'], sprite: 'item.ring',
  },
  torch: { id: 'torch', name: 'Torch', slot: 'quest', storyTags: ['dungeon'], sprite: 'item.torch' },
};

export const ENEMY_DB: Record<string, Enemy> = {
  goblin: { id: 'goblin', name: 'Goblin', stats: { str: 6, dex: 6, int: 2, wis: 2, cha: 2, con: 3 }, hp: 18, skillPriority: ['slash'], sprite: 'enemy.goblin' },
};

export const SAMPLE_CHARACTER: CharacterState = {
  background: 'rogue',
  baseStats: { str: 9, dex: 8, int: 7, wis: 5, cha: 6, con: 6 },
  inventory: ['dagger', 'ringOfRegen', 'torch'],
  equipped: { weapon: 'dagger', ring: 'ringOfRegen' },
  skillPriority: ['freezeBolt', 'slash'],
};

export const SAMPLE_NODES: Record<string, StoryNode> = {
  n1: {
    id: 'n1', source: 'pregen', prose: 'You reach a guarded gate.',
    choices: [
      { id: 'fight', text: 'Fight the goblin', combat: undefined, nextNodeId: 'n2' },
      { id: 'sneak', text: 'Sneak past', skillCheck: { stat: 'dex', dc: 8 }, outcome: { reputationDelta: { hero: 1 } }, nextNodeId: 'n3' },
    ],
    combat: { enemyIds: ['goblin'] },
  },
  n2: { id: 'n2', source: 'pregen', prose: 'The goblin lies defeated.', choices: [{ id: 'end', text: 'Continue', nextNodeId: 'n3' }] },
  n3: { id: 'n3', source: 'pregen', prose: 'You enter the keep. The end of the demo route.', choices: [] },
};

export const SAMPLE_ROUTE: GameRoute = {
  id: 'demo-route', title: 'The Guarded Keep', sourceNovelId: 'hardcoded',
  acts: [{ id: 'act1', title: 'The Gate', nodeIds: ['n1', 'n2', 'n3'] }],
  itemPool: ['dagger', 'ringOfRegen', 'torch'], enemyPool: ['goblin'],
  endings: [{ id: 'reach-keep', title: 'Reached the Keep', condition: 'currentNodeId === n3' }],
  status: 'published',
};
```

- [ ] **Step 6: Write the failing test `shared/engine/integration.test.ts`**

```ts
import { buildPlayerActor, buildEnemyActor } from './character';
import { runCombat } from './combat';
import { resolveChoice } from './story';
import { serialize, deserialize } from './save';
import { mulberry32 } from './dice';
import { SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_CHARACTER, SAMPLE_NODES, SAMPLE_ROUTE } from '../fixtures';
import { SaveState } from '../types';

describe('engine integration (hardcoded route)', () => {
  it('runs a combat from fixtures and produces a winner + non-empty log', () => {
    const player = buildPlayerActor(SAMPLE_CHARACTER, ITEM_DB, SKILL_DB);
    const goblin = buildEnemyActor(ENEMY_DB.goblin, SKILL_DB);
    const result = runCombat({ player, enemies: [goblin], seed: 11 });
    expect(['player', 'enemies', 'draw']).toContain(result.winner);
    expect(result.log.length).toBeGreaterThan(0);
  });

  it('walks the demo route via choices and reaches the final node', () => {
    let state: SaveState = {
      version: 1, routeId: SAMPLE_ROUTE.id,
      character: { ...SAMPLE_CHARACTER, baseStats: { ...SAMPLE_CHARACTER.baseStats } },
      reputation: { hero: 0, villain: 0, factions: {} },
      flags: {}, choiceLog: [], currentNodeId: 'n1', seed: 7,
    };
    const rng = mulberry32(state.seed);
    state = resolveChoice(state, SAMPLE_NODES['n1'], 'sneak', rng).save;
    expect(state.currentNodeId).toBe('n3');
    expect(state.choiceLog).toHaveLength(1);

    // save round-trips after progression
    expect(deserialize(serialize(state))).toEqual(state);
  });
});
```

- [ ] **Step 7: Run integration test to verify it fails**

Run: `npx jest shared/engine/integration.test.ts`
Expected: FAIL — `Cannot find module '../fixtures'`.

- [ ] **Step 8: Run integration test to verify it passes**

(The fixtures file from Step 5 satisfies the import.)
Run: `npx jest shared/engine/integration.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 9: Run the full suite + typecheck**

Run:
```bash
npm test
npm run typecheck
```
Expected: ALL test files pass; `tsc --noEmit` reports no errors.

- [ ] **Step 10: Commit**

```bash
git add shared/engine/save.ts shared/engine/save.test.ts shared/fixtures.ts shared/engine/integration.test.ts
git commit -m "feat: add save serialization, fixtures, and end-to-end engine test"
```

---

## Self-Review

**Spec coverage (against Sub-project A spec, sections A.1–A.6):**
- `shared/types.ts` → Task 2. ✅
- `shared/constants.ts` (STAT_KEYS, EQUIP_SLOTS, dice bounds, HP, save version) → Task 3. ✅
- `shared/effects/registry.ts` (≥6 effects: freeze, stun, poison, regen, attack_buff, defense_down) → Task 5. ✅
- `dice.ts` (seeded RNG, rollD20, faceToMultiplier) → Task 4. ✅
- `effects.ts` (apply/tick/control + duration lifecycle) → Task 6. ✅
- `character.ts` (effectiveStats, deriveMaxHp, actor builders, onEquip) → Task 7. ✅
- `combat.ts` (auto-battler + skill priority + d20 multiplier + control skip + status tick) → Task 8. ✅
- `story.ts` (choice resolution + skill check) → Task 9. ✅ *(narrative progression engine implied by spec A.2 "duyệt node truyện" + ChoiceOutcome)*
- `save.ts` (serialize/deserialize, versioned) → Task 10. ✅
- Fixtures + integration test → Task 10. ✅
- Acceptance criteria A.4 #1–#8 → covered by tests in Tasks 4, 8, 5/6, 6, 8, 7, 10, 8/10 respectively. ✅
- Test strategy A.5 (Jest, seeded RNG, table-driven multiplier, deterministic log) → Tasks 4 + 8. ✅

**Placeholder scan:** No TBD/TODO; every code step contains full code. ✅

**Type consistency:** `CombatActor`, `StatusEffect`, `Skill`, `Item`, `Enemy`, `CharacterState`, `SaveState`, `ChoiceOutcome`, `CombatResult`, `EffectBehavior` defined once in Task 2 and used verbatim downstream. `applyEffect`/`tickEffects`/`hasControl` (Task 6), `effectiveStats`/`deriveMaxHp`/`buildPlayerActor`/`buildEnemyActor` (Task 7), `runCombat`/`CombatInput` (Task 8), `resolveChoice`/`ChoiceResolution` (Task 9), `serialize`/`deserialize` (Task 10) — names consistent across tasks and tests. ✅

**Note on acceptance criterion A.4 #1:** spec wrote `=== 0.10 / === 2.00`; the plan uses `toBeCloseTo(..., 5)` to avoid floating-point flakiness while asserting the same values. Behaviorally equivalent.
