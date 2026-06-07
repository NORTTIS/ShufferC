# Sub-project C (slice C1): AI Framework Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate, validate, store, and play AI-authored game routes — `frameworkGen` produces a schema-valid, registry-safe `GameRoute`, an admin publishes it, and the existing client plays it end-to-end.

**Architecture:** A thin `AIProvider` interface with a deterministic `FakeProvider` (tests) and a config-gated real `GeminiProvider`. Zod defines the output shape (one source → Gemini `responseSchema` + parse), a **pure** referential validator in `shared/` guarantees every id/graph/ending is safe and playable, and a `frameworkGen` orchestrator loops prompt→provider→parse→validate→moderate→retry. Generated routes live in an in-memory `RouteStore`; `GameSession` is refactored to load a route per `save.routeId` instead of a hardcoded constant.

**Tech Stack:** TypeScript 5, Jest + ts-jest, Express 5, supertest, Zod, zod-to-json-schema, @google/generative-ai (Node).

**Reference spec:** `docs/superpowers/specs/2026-06-07-sub-project-c-framework-gen-design.md`

**Conventions (from the existing codebase — follow exactly):**
- Stores use `Map` + `structuredClone` on every read/write (see `server/store/memoryStore.ts`).
- `GameError(message, status)` carries an HTTP status; the central error handler in `api.ts` maps it.
- Env vars only in `server/config.ts` (invariant #1). Shared types only in `shared/types.ts` (invariant #2).
- Pure engine/validator logic in `shared/` must not import AI/DB/Express (invariant #4).
- Tests run from repo root with `npx jest <path>` (config: `jest.config.js`, roots `shared`/`server`/`client/src`, `*.test.ts`).
- Typecheck the server/shared with `npm run typecheck` (root `tsconfig.json`, includes `shared` + `server`).
- Commit trailer (every commit): `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 1: Install dependencies + extend server config

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `server/config.ts`

- [ ] **Step 1: Install runtime deps**

Run:
```bash
npm install zod zod-to-json-schema @google/generative-ai
```
Expected: `package.json` `dependencies` gains `zod`, `zod-to-json-schema`, `@google/generative-ai`; install succeeds.

- [ ] **Step 2: Extend `server/config.ts`**

Replace the entire file with:
```ts
export const config = {
  port: Number(process.env.PORT ?? 3000),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? null,        // null → provider unavailable
    proModel: process.env.GEMINI_PRO_MODEL ?? 'gemini-1.5-pro',
    flashModel: process.env.GEMINI_FLASH_MODEL ?? 'gemini-1.5-flash',
  },
};
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors (config is unused by anything new yet; existing `server/index.ts` still reads `config.port`).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json server/config.ts
git commit -m "chore: add zod + gemini deps and AI config"
```

---

## Task 2: Add C1 types + SAMPLE_BUNDLE fixture

**Files:**
- Modify: `shared/types.ts` (append new types)
- Modify: `shared/fixtures.ts` (append `SAMPLE_BUNDLE`)

These are type/fixture-only changes; verification is a successful typecheck (no behavior yet).

- [ ] **Step 1: Append new types to `shared/types.ts`**

Add at the end of the file (after the existing `SaveState` interface):
```ts
// ── Sub-project C (framework generation) ──────────────────────────────

/** A route plus all of its nodes — the unit frameworkGen produces and RouteStore holds. */
export interface RouteBundle {
  route: GameRoute;                     // existing type; .status carries draft|published
  nodes: Record<string, StoryNode>;     // existing StoryNode
}

/** Input to framework generation. */
export interface GenerationParams {
  contextText: string;                  // novel excerpt, plain text (no RAG yet)
  title: string;                        // desired route title
  nodeCount?: number;                   // target 3–6, default 4
  sourceNovelId?: string;               // provenance tag, default 'adhoc'
}

/** Registries injected into the prompt + validator (fixtures now, DB later). */
export interface Registries {
  itemDb: Record<string, Item>;
  skillDb: Record<string, Skill>;
  enemyDb: Record<string, Enemy>;
}

export type ValidationCode =
  | 'EMPTY_ROUTE'
  | 'DANGLING_NODE_REF'
  | 'UNKNOWN_ENEMY'
  | 'UNKNOWN_ITEM_REF'
  | 'BAD_SHAPE'
  | 'UNREACHABLE_NODE'
  | 'BAD_ENDING_CONDITION'
  | 'NO_REACHABLE_ENDING';

export interface ValidationError { path: string; code: ValidationCode; message: string; }

/** frameworkGen result — discriminated union. */
export type GenerationResult =
  | { ok: true; bundle: RouteBundle; attempts: number }
  | { ok: false; errors: ValidationError[]; attempts: number; lastRaw?: unknown };
```

- [ ] **Step 2: Append `SAMPLE_BUNDLE` to `shared/fixtures.ts`**

The file already exports `SAMPLE_NODES` and `SAMPLE_ROUTE`. Add the `RouteBundle` import to the existing top import and append the bundle.

Change the first import line from:
```ts
import { Item, Skill, Enemy, CharacterState, StoryNode, GameRoute } from './types';
```
to:
```ts
import { Item, Skill, Enemy, CharacterState, StoryNode, GameRoute, RouteBundle } from './types';
```
Then append at the end of the file:
```ts
export const SAMPLE_BUNDLE: RouteBundle = { route: SAMPLE_ROUTE, nodes: SAMPLE_NODES };
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts shared/fixtures.ts
git commit -m "feat: add RouteBundle/generation types and SAMPLE_BUNDLE fixture"
```

---

## Task 3: Pure referential validator (`shared/validation.ts`)

**Files:**
- Create: `shared/validation.ts`
- Test: `shared/validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `shared/validation.test.ts`:
```ts
import { validateRouteBundle } from './validation';
import { SAMPLE_BUNDLE, ITEM_DB, SKILL_DB, ENEMY_DB } from './fixtures';
import { RouteBundle, Registries } from './types';

const reg: Registries = { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB };
const clone = (): RouteBundle => structuredClone(SAMPLE_BUNDLE);

describe('validateRouteBundle', () => {
  it('returns [] for the valid sample bundle', () => {
    expect(validateRouteBundle(clone(), reg)).toEqual([]);
  });

  it('EMPTY_ROUTE when there are no nodes', () => {
    const b = clone();
    b.nodes = {};
    b.route.acts[0].nodeIds = [];
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('EMPTY_ROUTE');
  });

  it('DANGLING_NODE_REF when a choice points to a missing node', () => {
    const b = clone();
    b.nodes['n1'].choices[0].nextNodeId = 'ghost';
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('DANGLING_NODE_REF');
  });

  it('UNKNOWN_ENEMY when combat references an enemy not in the registry', () => {
    const b = clone();
    b.nodes['n1'].combat = { enemyIds: ['dragon'] };
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('UNKNOWN_ENEMY');
  });

  it('UNKNOWN_ITEM_REF when an outcome grants an unknown item', () => {
    const b = clone();
    b.nodes['n1'].choices[1].outcome = { addItems: ['excalibur'] };
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('UNKNOWN_ITEM_REF');
  });

  it('BAD_SHAPE when a skillCheck uses a non-stat', () => {
    const b = clone();
    // deliberately invalid stat — cast through unknown to bypass the compile-time type
    b.nodes['n1'].choices[1].skillCheck = { stat: 'luck' as unknown as 'dex', dc: 8 };
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('BAD_SHAPE');
  });

  it('UNREACHABLE_NODE when a node cannot be reached from the start', () => {
    const b = clone();
    b.nodes['island'] = { id: 'island', source: 'pregen', prose: 'Marooned.', choices: [] };
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('UNREACHABLE_NODE');
  });

  it('BAD_ENDING_CONDITION when the condition is not the supported form', () => {
    const b = clone();
    b.route.endings[0].condition = 'player.wins';
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('BAD_ENDING_CONDITION');
  });

  it('NO_REACHABLE_ENDING when the only ending targets a non-terminal node', () => {
    const b = clone();
    // n1 has choices (non-terminal); point the ending at it
    b.route.endings = [{ id: 'x', title: 'x', condition: 'currentNodeId === n1' }];
    const codes = validateRouteBundle(b, reg).map((e) => e.code);
    expect(codes).toContain('NO_REACHABLE_ENDING');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest shared/validation.test.ts`
Expected: FAIL — `Cannot find module './validation'`.

- [ ] **Step 3: Implement `shared/validation.ts`**

Create `shared/validation.ts`:
```ts
import { RouteBundle, Registries, ValidationError } from './types';
import { STAT_KEYS } from './constants';

/**
 * Semantic/referential validation of a route bundle. Runs AFTER Zod shape-parse,
 * so structure is assumed well-formed; this layer guarantees the bundle only
 * references things that exist and is actually completable. Pure + deterministic.
 */
export function validateRouteBundle(b: RouteBundle, reg: Registries): ValidationError[] {
  const errors: ValidationError[] = [];
  const { route, nodes } = b;
  const nodeKeys = Object.keys(nodes);

  // 1. Non-empty — if the route is empty, nothing else is meaningful.
  if (route.acts.length === 0 || (route.acts[0]?.nodeIds.length ?? 0) === 0 || nodeKeys.length === 0) {
    errors.push({ path: 'route', code: 'EMPTY_ROUTE', message: 'route has no acts or nodes' });
    return errors;
  }

  // 2. Node-graph integrity.
  for (const act of route.acts) {
    for (const id of act.nodeIds) {
      if (!nodes[id]) {
        errors.push({ path: `acts.${act.id}`, code: 'DANGLING_NODE_REF', message: `act references missing node ${id}` });
      }
    }
  }
  for (const [nid, node] of Object.entries(nodes)) {
    for (const c of node.choices) {
      if (c.nextNodeId !== undefined && !nodes[c.nextNodeId]) {
        errors.push({ path: `nodes.${nid}.choices.${c.id}`, code: 'DANGLING_NODE_REF', message: `choice points to missing node ${c.nextNodeId}` });
      }
    }
  }

  // 3. Reference safety — the core AI guard.
  for (const [nid, node] of Object.entries(nodes)) {
    if (node.combat) {
      for (const eid of node.combat.enemyIds) {
        if (!reg.enemyDb[eid]) {
          errors.push({ path: `nodes.${nid}.combat`, code: 'UNKNOWN_ENEMY', message: `unknown enemy ${eid}` });
        }
      }
    }
    for (const c of node.choices) {
      if (c.skillCheck && !STAT_KEYS.includes(c.skillCheck.stat)) {
        errors.push({ path: `nodes.${nid}.choices.${c.id}`, code: 'BAD_SHAPE', message: `bad stat ${c.skillCheck.stat}` });
      }
      const o = c.outcome;
      if (o) {
        for (const it of o.addItems ?? []) {
          if (!reg.itemDb[it]) errors.push({ path: `nodes.${nid}.choices.${c.id}.outcome.addItems`, code: 'UNKNOWN_ITEM_REF', message: `unknown item ${it}` });
        }
        for (const it of o.removeItems ?? []) {
          if (!reg.itemDb[it]) errors.push({ path: `nodes.${nid}.choices.${c.id}.outcome.removeItems`, code: 'UNKNOWN_ITEM_REF', message: `unknown item ${it}` });
        }
      }
    }
  }
  for (const eid of route.enemyPool) {
    if (!reg.enemyDb[eid]) errors.push({ path: 'route.enemyPool', code: 'UNKNOWN_ENEMY', message: `unknown enemy ${eid}` });
  }
  for (const it of route.itemPool) {
    if (!reg.itemDb[it]) errors.push({ path: 'route.itemPool', code: 'UNKNOWN_ITEM_REF', message: `unknown item ${it}` });
  }

  // 4. Reachability — BFS from the start node, following choice.nextNodeId
  //    (a winning combat advances via the fight choice's nextNodeId, so this covers combat too).
  const start = route.acts[0].nodeIds[0];
  const reached = new Set<string>();
  const queue: string[] = [start];
  while (queue.length) {
    const cur = queue.shift() as string;
    if (reached.has(cur)) continue;
    reached.add(cur);
    const node = nodes[cur];
    if (!node) continue;
    for (const c of node.choices) {
      if (c.nextNodeId && !reached.has(c.nextNodeId)) queue.push(c.nextNodeId);
    }
  }
  for (const nid of nodeKeys) {
    if (!reached.has(nid)) errors.push({ path: `nodes.${nid}`, code: 'UNREACHABLE_NODE', message: `node ${nid} not reachable from start` });
  }

  // 5. Endings — at least one reachable, terminal ending in the supported condition form.
  if (route.endings.length === 0) {
    errors.push({ path: 'route.endings', code: 'NO_REACHABLE_ENDING', message: 'no endings defined' });
  } else {
    let anyReachableTerminal = false;
    for (const e of route.endings) {
      const m = e.condition.match(/^currentNodeId === (\w+)$/);
      if (!m) {
        errors.push({ path: `route.endings.${e.id}`, code: 'BAD_ENDING_CONDITION', message: `unsupported condition "${e.condition}"` });
        continue;
      }
      const target = m[1];
      const node = nodes[target];
      if (node && reached.has(target) && node.choices.length === 0) anyReachableTerminal = true;
    }
    if (!anyReachableTerminal) {
      errors.push({ path: 'route.endings', code: 'NO_REACHABLE_ENDING', message: 'no ending targets a reachable terminal node' });
    }
  }

  return errors;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest shared/validation.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/validation.ts shared/validation.test.ts
git commit -m "feat: add pure referential route validator"
```

---

## Task 4: Zod schema + JSON schema export (`server/ai/schema.ts`)

**Files:**
- Create: `server/ai/schema.ts`
- Test: `server/ai/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/ai/schema.test.ts`:
```ts
import { RouteBundleSchema, ROUTE_BUNDLE_JSON_SCHEMA } from './schema';
import { SAMPLE_BUNDLE } from '../../shared/fixtures';

describe('RouteBundleSchema', () => {
  it('parses the valid sample bundle', () => {
    const res = RouteBundleSchema.safeParse(structuredClone(SAMPLE_BUNDLE));
    expect(res.success).toBe(true);
  });

  it('rejects a bundle missing route.title', () => {
    const b = structuredClone(SAMPLE_BUNDLE) as Record<string, any>;
    delete b.route.title;
    expect(RouteBundleSchema.safeParse(b).success).toBe(false);
  });

  it('rejects a node with a wrong field type', () => {
    const b = structuredClone(SAMPLE_BUNDLE) as Record<string, any>;
    b.nodes.n1.prose = 123; // should be string
    expect(RouteBundleSchema.safeParse(b).success).toBe(false);
  });

  it('exports a non-empty JSON schema object for Gemini', () => {
    expect(typeof ROUTE_BUNDLE_JSON_SCHEMA).toBe('object');
    expect(Object.keys(ROUTE_BUNDLE_JSON_SCHEMA).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest server/ai/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Implement `server/ai/schema.ts`**

Create `server/ai/schema.ts`:
```ts
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const StatKeySchema = z.enum(['str', 'dex', 'int', 'wis', 'cha', 'con']);

const OutcomeSchema = z
  .object({
    statDelta: z.record(StatKeySchema, z.number()).optional(),
    reputationDelta: z
      .object({
        hero: z.number().optional(),
        villain: z.number().optional(),
        factions: z.record(z.string(), z.number()).optional(),
      })
      .optional(),
    addItems: z.array(z.string()).optional(),
    removeItems: z.array(z.string()).optional(),
    setFlags: z.record(z.string(), z.boolean()).optional(),
  });

const ChoiceSchema = z.object({
  id: z.string(),
  text: z.string(),
  skillCheck: z.object({ stat: StatKeySchema, dc: z.number() }).optional(),
  outcome: OutcomeSchema.optional(),
  nextNodeId: z.string().optional(),
});

const NodeSchema = z.object({
  id: z.string(),
  prose: z.string(),
  choices: z.array(ChoiceSchema),
  combat: z.object({ enemyIds: z.array(z.string()) }).optional(),
  source: z.enum(['pregen', 'live']),
});

const RouteSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceNovelId: z.string(),
  acts: z.array(z.object({ id: z.string(), title: z.string(), nodeIds: z.array(z.string()) })),
  itemPool: z.array(z.string()),
  enemyPool: z.array(z.string()),
  endings: z.array(z.object({ id: z.string(), title: z.string(), condition: z.string() })),
  status: z.enum(['draft', 'published']),
});

export const RouteBundleSchema = z.object({
  route: RouteSchema,
  nodes: z.record(z.string(), NodeSchema),
});

export type ParsedBundle = z.infer<typeof RouteBundleSchema>;

/** JSON Schema fed to Gemini's responseSchema so the model emits matching JSON. */
export const ROUTE_BUNDLE_JSON_SCHEMA = zodToJsonSchema(RouteBundleSchema, 'RouteBundle') as object;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest server/ai/schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/ai/schema.ts server/ai/schema.test.ts
git commit -m "feat: add zod route schema + gemini json schema export"
```

---

## Task 5: Provider interface + FakeProvider (`server/ai/provider.ts`)

**Files:**
- Create: `server/ai/provider.ts`
- Test: `server/ai/provider.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/ai/provider.test.ts`:
```ts
import { createFakeProvider } from './provider';

describe('createFakeProvider', () => {
  it('is available and returns scripted responses in order', async () => {
    const p = createFakeProvider([{ a: 1 }, { b: 2 }]);
    expect(p.available).toBe(true);
    expect(await p.generateStructured('ignored', {})).toEqual({ a: 1 });
    expect(await p.generateStructured('ignored', {})).toEqual({ b: 2 });
  });

  it('throws when the queue is exhausted (loud test-script failure)', async () => {
    const p = createFakeProvider([]);
    await expect(p.generateStructured('x', {})).rejects.toThrow(/exhausted/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest server/ai/provider.test.ts`
Expected: FAIL — `Cannot find module './provider'`.

- [ ] **Step 3: Implement `server/ai/provider.ts`**

Create `server/ai/provider.ts`:
```ts
/** Thin LLM boundary. Returns parsed JSON; it does NOT validate — frameworkGen owns validation + retry. */
export interface AIProvider {
  readonly available: boolean;                                              // false when no API key
  generateStructured(prompt: string, jsonSchema: object): Promise<unknown>;
}

/**
 * Deterministic test double. Each call shifts the next canned response off the queue,
 * so a test can script "attempt 1 invalid → attempt 2 valid" to drive the retry path.
 */
export function createFakeProvider(responses: unknown[]): AIProvider {
  const queue = [...responses];
  return {
    available: true,
    async generateStructured(): Promise<unknown> {
      if (queue.length === 0) throw new Error('FakeProvider: response queue exhausted');
      return queue.shift();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest server/ai/provider.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/ai/provider.ts server/ai/provider.test.ts
git commit -m "feat: add AIProvider interface + scripted FakeProvider"
```

---

## Task 6: Moderation slot (`server/ai/moderate.ts`)

**Files:**
- Create: `server/ai/moderate.ts`
- Test: `server/ai/moderate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/ai/moderate.test.ts`:
```ts
import { moderate } from './moderate';

describe('moderate', () => {
  it('passes clean text', () => {
    expect(moderate('A calm meadow at dawn.')).toEqual({ ok: true });
  });

  it('blocks text containing a banned term and reports the reason', () => {
    const res = moderate('The scene is full of gore and viscera.');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/gore/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest server/ai/moderate.test.ts`
Expected: FAIL — `Cannot find module './moderate'`.

- [ ] **Step 3: Implement `server/ai/moderate.ts`**

Create `server/ai/moderate.ts`:
```ts
/**
 * Safety seam (spec decision #6). Default near-no-op with a tiny banned-word list.
 * A later slice plugs Gemini safety settings in behind this same signature.
 */
const BANNED_TERMS = ['gore'];

export function moderate(text: string): { ok: true } | { ok: false; reason: string } {
  const lower = text.toLowerCase();
  for (const term of BANNED_TERMS) {
    if (lower.includes(term)) return { ok: false, reason: `banned term: ${term}` };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest server/ai/moderate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/ai/moderate.ts server/ai/moderate.test.ts
git commit -m "feat: add moderate() safety slot"
```

---

## Task 7: Prompt builder (`server/ai/prompt.ts`)

**Files:**
- Create: `server/ai/prompt.ts`
- Test: `server/ai/prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/ai/prompt.test.ts`:
```ts
import { buildFrameworkPrompt } from './prompt';
import { ITEM_DB, SKILL_DB, ENEMY_DB } from '../../shared/fixtures';
import { Registries } from '../../shared/types';

const reg: Registries = { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB };

describe('buildFrameworkPrompt', () => {
  it('embeds the title, registry ids, context, and the pregen instruction', () => {
    const p = buildFrameworkPrompt(
      { contextText: 'A knight guards a bridge.', title: 'The Bridge', nodeCount: 3 },
      reg,
    );
    expect(p).toContain('The Bridge');
    expect(p).toContain('goblin');   // enemy id from registry
    expect(p).toContain('dagger');   // item id from registry
    expect(p).toContain('A knight guards a bridge.');
    expect(p).toContain('pregen');
  });

  it('appends prior errors on retry so the model can self-correct', () => {
    const p = buildFrameworkPrompt(
      { contextText: 'ctx', title: 'T' },
      reg,
      [{ path: 'nodes.n1.combat', code: 'UNKNOWN_ENEMY', message: 'unknown enemy dragon' }],
    );
    expect(p).toContain('UNKNOWN_ENEMY');
    expect(p).toContain('unknown enemy dragon');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest server/ai/prompt.test.ts`
Expected: FAIL — `Cannot find module './prompt'`.

- [ ] **Step 3: Implement `server/ai/prompt.ts`**

Create `server/ai/prompt.ts`:
```ts
import { GenerationParams, Registries, ValidationError } from '../../shared/types';

/** Build the framework-generation prompt. On retry, prior errors are appended for self-correction. */
export function buildFrameworkPrompt(
  params: GenerationParams,
  reg: Registries,
  lastErrors?: ValidationError[],
): string {
  const enemyIds = Object.keys(reg.enemyDb);
  const itemIds = Object.keys(reg.itemDb);
  const nodeCount = params.nodeCount ?? 4;

  const lines = [
    'You are a game-route author. Output ONLY a JSON object that matches the provided schema. No prose outside the JSON.',
    `Produce a playable route titled "${params.title}" with 1 act and ${nodeCount} story nodes.`,
    'Rules:',
    `- Use ONLY these enemy ids in any node combat: ${enemyIds.join(', ') || '(none)'}.`,
    `- Use ONLY these item ids in any outcome addItems/removeItems and in route.itemPool: ${itemIds.join(', ') || '(none)'}.`,
    '- Every node has a unique id; each choice.nextNodeId must reference a node id you define.',
    '- Set every node "source" to "pregen".',
    '- The route must be completable: at least one terminal node (empty choices array) reachable from the first node.',
    '- Provide at least one ending whose "condition" is exactly `currentNodeId === <terminalNodeId>`.',
    '- Set route.status to "draft".',
    'Source material to adapt:',
    params.contextText,
  ];

  if (lastErrors && lastErrors.length) {
    lines.push('Your previous attempt had these problems; fix them:');
    for (const e of lastErrors) lines.push(`- [${e.code}] ${e.path}: ${e.message}`);
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest server/ai/prompt.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/ai/prompt.ts server/ai/prompt.test.ts
git commit -m "feat: add framework-gen prompt builder"
```

---

## Task 8: Generation orchestrator (`server/ai/frameworkGen.ts`)

**Files:**
- Create: `server/ai/frameworkGen.ts`
- Test: `server/ai/frameworkGen.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/ai/frameworkGen.test.ts`:
```ts
import { generateFramework } from './frameworkGen';
import { createFakeProvider } from './provider';
import { SAMPLE_BUNDLE, ITEM_DB, SKILL_DB, ENEMY_DB } from '../../shared/fixtures';
import { Registries, RouteBundle } from '../../shared/types';

const reg: Registries = { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB };
const params = { contextText: 'ctx', title: 'T' };

const validRaw = (): RouteBundle => structuredClone(SAMPLE_BUNDLE);
const invalidRefRaw = (): RouteBundle => {
  const b = structuredClone(SAMPLE_BUNDLE);
  b.nodes['n1'].combat = { enemyIds: ['dragon'] }; // UNKNOWN_ENEMY → ref error
  return b;
};

describe('generateFramework', () => {
  it('succeeds on the first attempt and marks the route draft', async () => {
    const provider = createFakeProvider([validRaw()]);
    const res = await generateFramework(provider, params, reg);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.attempts).toBe(1);
      expect(res.bundle.route.status).toBe('draft');
    }
  });

  it('retries after a referential error then succeeds, feeding errors back', async () => {
    const provider = createFakeProvider([invalidRefRaw(), validRaw()]);
    const res = await generateFramework(provider, params, reg);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.attempts).toBe(2);
  });

  it('fails after maxAttempts with collected errors', async () => {
    const provider = createFakeProvider([{}, invalidRefRaw(), invalidRefRaw()]);
    const res = await generateFramework(provider, params, reg, { maxAttempts: 3 });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.attempts).toBe(3);
      expect(res.errors.length).toBeGreaterThan(0);
    }
  });

  it('treats moderation-blocked prose as a failed attempt', async () => {
    const bad = structuredClone(SAMPLE_BUNDLE);
    bad.nodes['n1'].prose = 'There is gore everywhere.'; // banned term
    const provider = createFakeProvider([bad]);
    const res = await generateFramework(provider, params, reg, { maxAttempts: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.message.includes('moderation'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest server/ai/frameworkGen.test.ts`
Expected: FAIL — `Cannot find module './frameworkGen'`.

- [ ] **Step 3: Implement `server/ai/frameworkGen.ts`**

Create `server/ai/frameworkGen.ts`:
```ts
import { AIProvider } from './provider';
import { RouteBundleSchema, ROUTE_BUNDLE_JSON_SCHEMA } from './schema';
import { buildFrameworkPrompt } from './prompt';
import { moderate } from './moderate';
import { validateRouteBundle } from '../../shared/validation';
import { GenerationParams, Registries, GenerationResult, RouteBundle, ValidationError } from '../../shared/types';

/**
 * Orchestrates one framework generation. Loops prompt → provider → Zod parse →
 * referential validate → moderate, feeding errors back into the next prompt, up
 * to maxAttempts. Admin-in-loop, so failing is acceptable — no fallback node here.
 */
export async function generateFramework(
  provider: AIProvider,
  params: GenerationParams,
  reg: Registries,
  opts: { maxAttempts?: number } = {},
): Promise<GenerationResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastErrors: ValidationError[] = [];
  let lastRaw: unknown;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const prompt = buildFrameworkPrompt(params, reg, lastErrors.length ? lastErrors : undefined);
    const raw = await provider.generateStructured(prompt, ROUTE_BUNDLE_JSON_SCHEMA);
    lastRaw = raw;

    // Shape layer.
    const parsed = RouteBundleSchema.safeParse(raw);
    if (!parsed.success) {
      lastErrors = parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        code: 'BAD_SHAPE' as const,
        message: i.message,
      }));
      continue;
    }

    const bundle = parsed.data as RouteBundle;

    // Referential layer.
    const refErrors = validateRouteBundle(bundle, reg);
    if (refErrors.length) {
      lastErrors = refErrors;
      continue;
    }

    // Moderation layer.
    const modErrors: ValidationError[] = [];
    for (const [nid, node] of Object.entries(bundle.nodes)) {
      const m = moderate(node.prose);
      if (!m.ok) modErrors.push({ path: `nodes.${nid}.prose`, code: 'BAD_SHAPE', message: `moderation: ${m.reason}` });
    }
    if (modErrors.length) {
      lastErrors = modErrors;
      continue;
    }

    bundle.route.status = 'draft';
    return { ok: true, bundle, attempts };
  }

  return { ok: false, errors: lastErrors, attempts, lastRaw };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest server/ai/frameworkGen.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/ai/frameworkGen.ts server/ai/frameworkGen.test.ts
git commit -m "feat: add frameworkGen orchestrator with retry + moderation"
```

---

## Task 9: RouteStore + in-memory implementation

**Files:**
- Create: `server/store/RouteStore.ts`
- Create: `server/store/memoryRouteStore.ts`
- Test: `server/store/routeStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/store/routeStore.test.ts`:
```ts
import { createMemoryRouteStore } from './memoryRouteStore';
import { SAMPLE_BUNDLE } from '../../shared/fixtures';
import { RouteBundle } from '../../shared/types';

const draftBundle = (): RouteBundle => {
  const b = structuredClone(SAMPLE_BUNDLE);
  b.route.id = 'r1';
  b.route.status = 'draft';
  return b;
};

describe('memoryRouteStore', () => {
  it('create then get round-trips a clone (mutating the result does not affect the store)', async () => {
    const store = createMemoryRouteStore();
    const id = await store.create(draftBundle());
    expect(id).toBe('r1');
    const got = await store.get('r1');
    expect(got?.route.title).toBe(SAMPLE_BUNDLE.route.title);
    got!.route.title = 'mutated';
    const again = await store.get('r1');
    expect(again?.route.title).not.toBe('mutated');
  });

  it('get returns null for an unknown id', async () => {
    const store = createMemoryRouteStore();
    expect(await store.get('nope')).toBeNull();
  });

  it('list returns summaries; publish flips status to published', async () => {
    const store = createMemoryRouteStore([draftBundle()]);
    expect(await store.list()).toEqual([{ id: 'r1', title: SAMPLE_BUNDLE.route.title, status: 'draft' }]);
    await store.publish('r1');
    expect((await store.get('r1'))?.route.status).toBe('published');
  });

  it('publish throws for an unknown id', async () => {
    const store = createMemoryRouteStore();
    await expect(store.publish('ghost')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest server/store/routeStore.test.ts`
Expected: FAIL — `Cannot find module './memoryRouteStore'`.

- [ ] **Step 3: Implement the store**

Create `server/store/RouteStore.ts`:
```ts
import { RouteBundle } from '../../shared/types';

export interface RouteSummary { id: string; title: string; status: 'draft' | 'published'; }

export interface RouteStore {
  create(bundle: RouteBundle): Promise<string>;   // returns the route id (bundle.route.id)
  get(id: string): Promise<RouteBundle | null>;
  list(): Promise<RouteSummary[]>;
  publish(id: string): Promise<void>;             // flips route.status → 'published'; throws if missing
}
```

Create `server/store/memoryRouteStore.ts`:
```ts
import { RouteBundle } from '../../shared/types';
import { RouteStore, RouteSummary } from './RouteStore';

export function createMemoryRouteStore(seed: RouteBundle[] = []): RouteStore {
  const map = new Map<string, RouteBundle>();
  for (const b of seed) map.set(b.route.id, structuredClone(b));

  return {
    async create(bundle: RouteBundle): Promise<string> {
      map.set(bundle.route.id, structuredClone(bundle));
      return bundle.route.id;
    },
    async get(id: string): Promise<RouteBundle | null> {
      const found = map.get(id);
      return found ? structuredClone(found) : null;
    },
    async list(): Promise<RouteSummary[]> {
      return [...map.values()].map((b): RouteSummary => ({
        id: b.route.id,
        title: b.route.title,
        status: b.route.status,
      }));
    },
    async publish(id: string): Promise<void> {
      const found = map.get(id);
      if (!found) throw new Error(`route ${id} not found`);
      found.route.status = 'published';
      map.set(id, found);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest server/store/routeStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/store/RouteStore.ts server/store/memoryRouteStore.ts server/store/routeStore.test.ts
git commit -m "feat: add RouteStore + in-memory implementation"
```

---

## Task 10: Real Gemini provider (`server/ai/gemini.ts`)

**Files:**
- Create: `server/ai/gemini.ts`
- Test: `server/ai/gemini.test.ts`

Note: no network in tests — only the `available` flag and the unavailable-path guard are tested. The real call is smoke-tested manually.

- [ ] **Step 1: Write the failing tests**

Create `server/ai/gemini.test.ts`:
```ts
import { createGeminiProvider } from './gemini';

describe('createGeminiProvider', () => {
  it('is unavailable and rejects when no API key is configured', async () => {
    const p = createGeminiProvider({ apiKey: null, proModel: 'gemini-1.5-pro', flashModel: 'gemini-1.5-flash' });
    expect(p.available).toBe(false);
    await expect(p.generateStructured('hi', {})).rejects.toThrow(/unavailable/i);
  });

  it('reports available when an API key is present', () => {
    const p = createGeminiProvider({ apiKey: 'test-key', proModel: 'gemini-1.5-pro', flashModel: 'gemini-1.5-flash' });
    expect(p.available).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest server/ai/gemini.test.ts`
Expected: FAIL — `Cannot find module './gemini'`.

- [ ] **Step 3: Implement `server/ai/gemini.ts`**

Create `server/ai/gemini.ts`:
```ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider } from './provider';

export interface GeminiConfig {
  apiKey: string | null;
  proModel: string;
  flashModel: string;
}

/**
 * Real Gemini provider. Uses the Pro model for framework generation with JSON
 * response mode + the passed responseSchema. When no API key is configured the
 * provider reports `available:false` and never touches the network (so the server
 * boots and tests run without a key). Smoke-tested manually, never in Jest.
 */
export function createGeminiProvider(cfg: GeminiConfig): AIProvider {
  const available = !!cfg.apiKey;
  const client = available ? new GoogleGenerativeAI(cfg.apiKey as string) : null;

  return {
    available,
    async generateStructured(prompt: string, jsonSchema: object): Promise<unknown> {
      if (!client) throw new Error('Gemini provider unavailable: no API key');
      const model = client.getGenerativeModel({
        model: cfg.proModel,
        generationConfig: {
          responseMimeType: 'application/json',
          // The SDK's responseSchema type is narrower than a generic JSON schema; cast through unknown.
          responseSchema: jsonSchema as unknown as Record<string, unknown>,
        },
      });
      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text());
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest server/ai/gemini.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors (confirms the SDK types resolve).

- [ ] **Step 6: Commit**

```bash
git add server/ai/gemini.ts server/ai/gemini.test.ts
git commit -m "feat: add real GeminiProvider (config-gated, no-key safe)"
```

---

## Task 11: Refactor session to load routes from RouteStore

**Files:**
- Modify: `server/session.ts` (route/nodes per save instead of fixed constants)
- Modify: `server/session.test.ts` (add route-selection + draft tests; fix defeat-path deps)

- [ ] **Step 1: Write the failing tests**

Edit `server/session.test.ts`. First, update the top imports — replace lines 1–4:
```ts
import { createGameSession, GameError } from './session';
import { createMemoryStore } from './store/memoryStore';
import { BACKGROUNDS } from '../shared/backgrounds';
import { SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_NODES, SAMPLE_ROUTE } from '../shared/fixtures';
```
with:
```ts
import { createGameSession, GameError } from './session';
import { createMemoryStore } from './store/memoryStore';
import { createMemoryRouteStore } from './store/memoryRouteStore';
import { BACKGROUNDS } from '../shared/backgrounds';
import { SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_BUNDLE, SAMPLE_ROUTE } from '../shared/fixtures';
import { RouteBundle } from '../shared/types';
```

Replace the existing defeat-path `deps` object (currently `server/session.test.ts:127-137`) with the new `SessionDeps` shape:
```ts
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
```

Then add a new describe block at the end of the file:
```ts
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest server/session.test.ts`
Expected: FAIL — compile/type errors (`SessionDeps` still has `nodeDb`/`route`; `newGame` takes one arg) and the new 409/route-selection assertions fail.

- [ ] **Step 3: Rewrite `server/session.ts`**

Replace the entire file with:
```ts
import {
  SaveState, StoryNode, Stats, Item, Skill, Enemy, EquipSlot, CombatResult, GameRoute, RouteBundle,
} from '../shared/types';
import { SAVE_VERSION, EQUIP_SLOTS } from '../shared/constants';
import { Background, BACKGROUNDS } from '../shared/backgrounds';
import { SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_ROUTE, SAMPLE_BUNDLE } from '../shared/fixtures';
import { effectiveStats, buildPlayerActor, buildEnemyActor } from '../shared/engine/character';
import { runCombat } from '../shared/engine/combat';
import { resolveChoice } from '../shared/engine/story';
import { mulberry32 } from '../shared/engine/dice';
import { SaveStore } from './store/SaveStore';
import { RouteStore } from './store/RouteStore';
import { createMemoryRouteStore } from './store/memoryRouteStore';

// Fixed starting seed: the vertical slice is intentionally deterministic so the
// client can replay the combat log and match the server exactly (acceptance #6).
// A later sub-project will randomise the seed per session.
const START_SEED = 7;

export class GameError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'GameError';
  }
}

export interface SessionDeps {
  backgrounds: Record<string, Background>;
  itemDb: Record<string, Item>;
  skillDb: Record<string, Skill>;
  enemyDb: Record<string, Enemy>;
  routes: RouteStore;
}

const DEFAULT_DEPS: SessionDeps = {
  backgrounds: BACKGROUNDS,
  itemDb: ITEM_DB,
  skillDb: SKILL_DB,
  enemyDb: ENEMY_DB,
  routes: createMemoryRouteStore([SAMPLE_BUNDLE]),
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
  newGame(backgroundId: string, routeId?: string): Promise<SessionView & { sessionId: string }>;
  getView(id: string): Promise<SessionView>;
  applyChoice(id: string, choiceId: string, skillPriority?: string[]): Promise<ChoiceView>;
  equip(id: string, slot: string, itemId: string | null): Promise<{ save: SaveState; effectiveStats: Stats }>;
}

export function createGameSession(store: SaveStore, deps: SessionDeps = DEFAULT_DEPS): GameSession {
  // Slice simplification (spec §4.3): endings are matched by a simple
  // `currentNodeId === <id>` condition string. Richer ending conditions are
  // sub-project E. A non-matching/different condition format yields no ending.
  function computeEnding(save: SaveState, route: GameRoute): string | undefined {
    for (const e of route.endings) {
      const m = e.condition.match(/currentNodeId === (\w+)/);
      if (m && save.currentNodeId === m[1]) return e.id;
    }
    return undefined;
  }

  async function loadBundle(routeId: string): Promise<RouteBundle> {
    const bundle = await deps.routes.get(routeId);
    if (!bundle) throw new GameError(`Route ${routeId} not found`, 404);
    return bundle;
  }

  function view(save: SaveState, bundle: RouteBundle): SessionView {
    const node = bundle.nodes[save.currentNodeId];
    if (!node) throw new GameError(`Node ${save.currentNodeId} not found`, 500);
    return {
      save,
      node,
      effectiveStats: effectiveStats(save.character, deps.itemDb),
      ending: computeEnding(save, bundle.route),
    };
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

    async newGame(backgroundId: string, routeId: string = SAMPLE_ROUTE.id) {
      const bg = deps.backgrounds[backgroundId];
      if (!bg) throw new GameError(`Unknown background ${backgroundId}`, 400);
      const bundle = await loadBundle(routeId);
      if (bundle.route.status !== 'published') {
        throw new GameError(`Route ${routeId} is not published`, 409);
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
      };
      const sessionId = await store.create(save);
      return { sessionId, ...view(save, bundle) };
    },

    async getView(id: string) {
      const save = await load(id);
      const bundle = await loadBundle(save.routeId);
      return view(save, bundle);
    },

    async applyChoice(id, choiceId, skillPriority) {
      const save = await load(id);
      const bundle = await loadBundle(save.routeId);
      const node = bundle.nodes[save.currentNodeId];
      if (!node) throw new GameError(`Node ${save.currentNodeId} not found`, 500);
      const choice = node.choices.find((c) => c.id === choiceId);
      if (!choice) throw new GameError(`Choice ${choiceId} not in node ${node.id}`, 400);

      // Path 1: skill-check choice (e.g. "sneak")
      if (choice.skillCheck) {
        const res = resolveChoice(save, node, choiceId, mulberry32(save.seed));
        await store.put(id, res.save);
        return { ...view(res.save, bundle), checkPassed: res.checkPassed, roll: res.roll };
      }

      // Path 2: combat choice ("fight") — node has combat and choice has no skill check
      if (node.combat) {
        if (!skillPriority || skillPriority.length === 0) {
          throw new GameError('skillPriority required for a combat choice', 400);
        }
        const player = buildPlayerActor({ ...save.character, skillPriority }, deps.itemDb, deps.skillDb);
        const enemies = node.combat.enemyIds.map((eid) => {
          const enemy = deps.enemyDb[eid];
          if (!enemy) throw new GameError(`Enemy ${eid} not found`, 500);
          return buildEnemyActor(enemy, deps.skillDb);
        });
        const combat = runCombat({ player, enemies, seed: save.seed });

        if (combat.winner === 'player') {
          const res = resolveChoice(save, node, choiceId); // apply outcome + advance
          res.save.character.skillPriority = [...skillPriority]; // persist pre-battle ordering
          await store.put(id, res.save);
          return { ...view(res.save, bundle), combat };
        }
        // Defeat: do not advance or persist progress
        return { ...view(save, bundle), combat, ending: 'defeat' };
      }

      // Path 3: plain advance (no check, no combat)
      const res = resolveChoice(save, node, choiceId);
      await store.put(id, res.save);
      return view(res.save, bundle);
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
      const stored = structuredClone(save);
      return { save: stored, effectiveStats: effectiveStats(stored.character, deps.itemDb) };
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest server/session.test.ts`
Expected: PASS — all prior session tests plus the 3 new route-selection tests.

- [ ] **Step 5: Commit**

```bash
git add server/session.ts server/session.test.ts
git commit -m "feat: load routes from RouteStore per save.routeId"
```

---

## Task 12: Admin REST endpoints + end-to-end play

**Files:**
- Modify: `server/api.ts` (admin routes + `routeId` on `POST /sessions`)
- Modify: `server/api.test.ts` (admin deps in helper + admin/e2e tests)

- [ ] **Step 1: Write the failing tests**

Rewrite `server/api.test.ts` header (replace lines 1–8) with a helper that wires shared admin deps:
```ts
import request from 'supertest';
import { createApp } from './api';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';
import { createMemoryRouteStore } from './store/memoryRouteStore';
import { createFakeProvider, AIProvider } from './ai/provider';
import { BACKGROUNDS } from '../shared/backgrounds';
import { SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_BUNDLE } from '../shared/fixtures';

function app(provider: AIProvider = createFakeProvider([])) {
  const routes = createMemoryRouteStore([structuredClone(SAMPLE_BUNDLE)]);
  const session = createGameSession(createMemoryStore(), {
    backgrounds: BACKGROUNDS, itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB, routes,
  });
  return createApp(session, { provider, routes, registries: { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB } });
}
```
(The existing player-side tests below this helper keep calling `app()` unchanged.)

Append the admin/e2e describe block at the end of the file:
```ts
describe('Admin REST + AI route e2e', () => {
  function genBundle() {
    const b = structuredClone(SAMPLE_BUNDLE);
    b.route.id = 'ai-route-1';
    b.route.title = 'AI Generated';
    b.route.status = 'draft';
    return b;
  }

  it('generate → publish → play a generated route end-to-end', async () => {
    const a = app(createFakeProvider([genBundle()]));

    const gen = await request(a).post('/admin/routes/generate').send({ contextText: 'ctx', title: 'AI Generated' });
    expect(gen.status).toBe(200);
    expect(gen.body.routeId).toBe('ai-route-1');

    const list = await request(a).get('/admin/routes');
    expect(list.body.map((r: { id: string }) => r.id)).toContain('ai-route-1');

    const pub = await request(a).post('/admin/routes/ai-route-1/publish');
    expect(pub.status).toBe(204);

    const play = await request(a).post('/sessions').send({ backgroundId: 'rogue', routeId: 'ai-route-1' });
    expect(play.status).toBe(200);
    expect(play.body.save.routeId).toBe('ai-route-1');
    expect(play.body.node.id).toBe('n1');
  });

  it('returns 422 with errors when generation never validates', async () => {
    const a = app(createFakeProvider([{}, {}, {}]));
    const res = await request(a).post('/admin/routes/generate').send({ contextText: 'ctx', title: 'X' });
    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.attempts).toBe(3);
  });

  it('returns 503 when the provider is unavailable', async () => {
    const unavailable: AIProvider = { available: false, async generateStructured() { throw new Error('x'); } };
    const a = app(unavailable);
    const res = await request(a).post('/admin/routes/generate').send({ contextText: 'ctx', title: 'X' });
    expect(res.status).toBe(503);
  });

  it('publish of an unknown route returns 404', async () => {
    const res = await request(app()).post('/admin/routes/ghost/publish');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest server/api.test.ts`
Expected: FAIL — `createApp` takes a second `admin` arg that does not exist yet; admin routes 404.

- [ ] **Step 3: Rewrite `server/api.ts`**

Replace the entire file with:
```ts
import express, { Request, Response, NextFunction, Express } from 'express';
import { GameSession, GameError } from './session';
import { AIProvider } from './ai/provider';
import { RouteStore } from './store/RouteStore';
import { Registries } from '../shared/types';
import { generateFramework } from './ai/frameworkGen';

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

export interface AdminDeps {
  provider: AIProvider;
  routes: RouteStore;
  registries: Registries;
}

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

export function createApp(session: GameSession, admin: AdminDeps): Express {
  const app = express();

  // CORS: the Expo web client runs on a different origin (e.g. :8081) than the
  // API (:3000). Allow cross-origin requests and answer preflight OPTIONS.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });
  app.options(/.*/, (_req: Request, res: Response) => res.sendStatus(204));

  app.use(express.json());

  // ── Player ──────────────────────────────────────────────────────────
  app.get('/backgrounds', wrap(() => session.listBackgrounds()));

  app.post('/sessions', wrap((req) => session.newGame(req.body?.backgroundId, req.body?.routeId)));

  app.get('/sessions/:id', wrap((req) => session.getView(req.params.id as string)));

  app.post('/sessions/:id/choice', wrap((req) =>
    session.applyChoice(req.params.id as string, req.body?.choiceId, req.body?.skillPriority),
  ));

  app.post('/sessions/:id/equip', wrap((req) =>
    session.equip(req.params.id as string, req.body?.slot, req.body?.itemId ?? null),
  ));

  // ── Admin (unauthenticated for now; auth = sub-project D) ─────────────
  app.post('/admin/routes/generate', wrap(async (req, res) => {
    if (!admin.provider.available) throw new GameError('AI provider unavailable', 503);
    const { contextText, title, nodeCount } = req.body ?? {};
    const result = await generateFramework(admin.provider, { contextText, title, nodeCount }, admin.registries);
    if (!result.ok) {
      res.status(422).json({ errors: result.errors, attempts: result.attempts });
      return undefined;
    }
    const routeId = await admin.routes.create(result.bundle);
    return { routeId, bundle: result.bundle };
  }));

  app.get('/admin/routes', wrap(() => admin.routes.list()));

  app.get('/admin/routes/:id', wrap(async (req) => {
    const bundle = await admin.routes.get(req.params.id as string);
    if (!bundle) throw new GameError(`Route ${req.params.id} not found`, 404);
    return bundle;
  }));

  app.post('/admin/routes/:id/publish', wrap(async (req, res) => {
    const id = req.params.id as string;
    const bundle = await admin.routes.get(id);
    if (!bundle) throw new GameError(`Route ${id} not found`, 404);
    await admin.routes.publish(id);
    res.status(204).end();
    return undefined;
  }));

  // Centralised error handler — maps GameError.status, defaults to 500.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof GameError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(status).json({ error: message });
  });

  return app;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest server/api.test.ts`
Expected: PASS — existing player tests + 4 new admin/e2e tests.

- [ ] **Step 5: Commit**

```bash
git add server/api.ts server/api.test.ts
git commit -m "feat: add admin route generate/list/get/publish + AI route e2e"
```

---

## Task 13: Wire the bootstrap + client routeId support

**Files:**
- Modify: `server/index.ts` (shared RouteStore + provider selection + admin deps)
- Modify: `client/src/services/api.ts` (`newGame` accepts optional `routeId`)

- [ ] **Step 1: Rewrite `server/index.ts`**

Replace the entire file with:
```ts
import { createApp } from './api';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';
import { createMemoryRouteStore } from './store/memoryRouteStore';
import { createFakeProvider } from './ai/provider';
import { createGeminiProvider } from './ai/gemini';
import { BACKGROUNDS } from '../shared/backgrounds';
import { SKILL_DB, ITEM_DB, ENEMY_DB, SAMPLE_BUNDLE } from '../shared/fixtures';
import { config } from './config';

// One RouteStore instance is shared between the player session (reads routes) and
// the admin endpoints (write routes), so a freshly generated+published route is
// immediately playable.
const routes = createMemoryRouteStore([SAMPLE_BUNDLE]);

const provider = config.gemini.apiKey
  ? createGeminiProvider(config.gemini)
  : createFakeProvider([]); // no key → AI generation endpoints report 503

const session = createGameSession(createMemoryStore(), {
  backgrounds: BACKGROUNDS, itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB, routes,
});

const app = createApp(session, {
  provider,
  routes,
  registries: { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB },
});

app.listen(config.port, () => {
  console.log(`ShufferC server listening on http://localhost:${config.port}`);
  console.log(`AI provider available: ${provider.available}`);
});
```

- [ ] **Step 2: Update the client API `newGame`**

In `client/src/services/api.ts`, replace the `newGame` entry (currently `client/src/services/api.ts:47-48`):
```ts
  newGame: (backgroundId: string) =>
    call<NewGameView>('/sessions', { method: 'POST', body: JSON.stringify({ backgroundId }) }),
```
with:
```ts
  newGame: (backgroundId: string, routeId?: string) =>
    call<NewGameView>('/sessions', { method: 'POST', body: JSON.stringify({ backgroundId, routeId }) }),
```

- [ ] **Step 3: Verify typechecks**

Run: `npm run typecheck`
Expected: server + shared typecheck clean.

Run: `cd client; npx tsc --noEmit; cd ..`
Expected: client typecheck clean (the extra optional arg is backward-compatible; existing callers pass one arg).

- [ ] **Step 4: Run the full suite**

Run: `npx jest`
Expected: all suites pass (existing B suites + the new C1 suites).

- [ ] **Step 5: Commit**

```bash
git add server/index.ts client/src/services/api.ts
git commit -m "feat: wire AI provider + shared RouteStore bootstrap; client routeId arg"
```

---

## Manual smoke test (you, after the plan completes — not automated)

Real Gemini is never exercised in Jest. To verify the real provider end-to-end:

1. Set a key: in PowerShell, `$env:GEMINI_API_KEY = "<your key>"`.
2. Terminal 1: `npm run dev:server` → console should print `AI provider available: true`.
3. Generate a draft from real text:
   ```bash
   curl -X POST http://localhost:3000/admin/routes/generate -H "Content-Type: application/json" -d "{\"contextText\":\"<a few paragraphs of novel text>\",\"title\":\"Test Route\"}"
   ```
   Expect `200` with `{ routeId, bundle }` (or `422 { errors }` — inspect and retry).
4. Publish: `curl -X POST http://localhost:3000/admin/routes/<routeId>/publish` → `204`.
5. Terminal 2: `cd client; npm run web`. In the client, start a game (the default demo route still works); to play the generated route, `gameApi.newGame('rogue', '<routeId>')`.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Decision #1 (framework-gen core, fake-first) → Tasks 5, 8, 10.
- #2 (generate→validate→store→playable) → Tasks 8, 9, 11, 12 (e2e test).
- #3 (Zod shape + pure validator) → Tasks 4 (Zod) + 3 (`shared/validation.ts`).
- #4 (real Gemini, no-key safe) → Task 10 + Task 13 provider selection.
- #5 (full playable route richness) → enforced by validator (Task 3) + prompt rules (Task 7).
- #6 (moderate slot) → Task 6, invoked in Task 8.
- #7 (no RAG; plain text context) → `GenerationParams.contextText` (Task 2), no vector store anywhere.
- #9 (no admin auth) → Task 12 endpoints unauthenticated, commented.
- Data shapes (spec §2) → Task 2. Validation rules (spec §3) → Task 3. Orchestration (spec §4) → Tasks 5–8. Store/session (spec §5) → Tasks 9, 11. REST/config/Gemini (spec §6) → Tasks 10, 12, 13. Tests (spec §7) → tests in every task.

**Type consistency:** `RouteBundle`/`Registries`/`GenerationParams`/`GenerationResult`/`ValidationError`/`ValidationCode` defined once in Task 2 and imported everywhere. `AIProvider` defined in Task 5, imported by Tasks 8, 10, 12. `RouteStore`/`RouteSummary` defined in Task 9, used in Tasks 11, 12, 13. `createApp(session, admin)` signature introduced in Task 12 and matched by Task 13's bootstrap. `generateFramework(provider, params, reg, opts)` signature consistent between Task 8 and its callers (Task 12). `SessionDeps` new shape (Task 11) matches the helper in Task 12 and bootstrap in Task 13.

**Placeholder scan:** no TBD/TODO; every code step contains complete code; every test step contains real assertions; every run step states the expected result.
