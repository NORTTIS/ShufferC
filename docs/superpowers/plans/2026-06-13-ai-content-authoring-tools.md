# AI Content-Authoring Tools (wired into route generation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the AI mint new effects/attributes/items/skills/enemies *during* route generation by calling content-creation tools, staging the new content on the draft and committing it to the registry only when an admin publishes.

**Architecture:** `generateFramework` becomes an agentic loop. A new `AIProvider.generateWithTools` drives native Gemini function calling; the loop logic + tool execution live in `frameworkGen` via a handler closure that validates each create against `globalContent ∪ staged`, accumulates a staging set, and finishes when the model calls `submit_route` (which runs the existing `validateRouteBundle` + `moderate`). Staged content rides on `RouteBundle.stagedContent`; publish flushes it into the content stores and clears it. Reject = delete draft = nothing leaks.

**Tech Stack:** TypeScript, Node + Express, Zod (`z.toJSONSchema`), `@google/generative-ai` (function calling), Jest + supertest, Drizzle (pg adapter). Spec: `docs/superpowers/specs/2026-06-13-ai-content-authoring-tools-design.md`.

**Reference reading before starting:**
- `server/api/contentValidation.ts` — the five `validate*()` functions (authoritative) + `ValidationCtx`.
- `server/ai/frameworkGen.ts` — the current single-shot generator being rewritten.
- `server/ai/gemini.ts` — `sanitizeForGemini` (reused for tool param schemas).
- `server/ai/schema.ts` — `RouteSchema`/`NodeSchema` + the `z.toJSONSchema` pattern.
- `shared/types.ts` — entity shapes (`AttributeDef`, `EffectTemplate`, `Item`, `Skill`, `Enemy`, `RouteBundle`, `Registries`, `GenerationResult`).

---

## File Structure

- **Create** `server/ai/contentSet.ts` — pure helpers: `emptyContentSet`, `mergeContent`, `toValidationCtx`, `toRegistries`.
- **Create** `server/api/publishStaged.ts` — `flushStagedContent(stores, staged)` (store I/O, dependency order, 409 on conflict).
- **Create** `docs/superpowers/specs/2026-06-13-ai-content-authoring-tools-manual-verify.md` — manual Gemini smoke-test steps.
- **Modify** `shared/types.ts` — add `ContentSet`, `RouteBundle.stagedContent?`, change `GenerationResult` to carry `toolCalls`.
- **Modify** `server/ai/provider.ts` — `ToolDef`/`ToolCall`/`ToolHandler` types, `generateWithTools` on the interface, stub it in `createFakeProvider`, add `createFakeToolProvider`.
- **Modify** `server/ai/schema.ts` — per-entity Zod arg schemas + `CONTENT_TOOL_DEFS: ToolDef[]`.
- **Modify** `server/ai/prompt.ts` — add `buildToolPrompt`.
- **Modify** `server/ai/frameworkGen.ts` — the tool-loop rewrite.
- **Modify** `server/ai/gemini.ts` — implement `generateWithTools` (function calling).
- **Modify** `server/api.ts` — generate handler builds a `ContentSet`; publish handler flushes staged content.
- **Modify** `server/admin/index.html` — staged-content banner in the route detail + publish confirmation.
- **Test** beside each module (`*.test.ts`); `server/api.test.ts` updated for the tool provider.

---

## Task 1: Shared types — `ContentSet`, staged bundle field, `toolCalls`

**Files:**
- Modify: `shared/types.ts` (RouteBundle ~207-210; GenerationResult ~240-242)
- Test: `shared/validation.test.ts` (compile-only; no new runtime test needed)

- [ ] **Step 1: Add the `ContentSet` type and `stagedContent` field**

In `shared/types.ts`, immediately after the `RouteBundle` interface, add:

```ts
/** A snapshot of all five content registries. Used as the global content passed into
 *  generation, as the per-generation staging set, and as the publish-time flush payload. */
export interface ContentSet {
  attributes: Record<string, AttributeDef>;
  effects: Record<string, EffectTemplate>;
  items: Record<string, Item>;
  skills: Record<string, Skill>;
  enemies: Record<string, Enemy>;
}
```

Then add the optional field to `RouteBundle`:

```ts
export interface RouteBundle {
  route: GameRoute;
  nodes: Record<string, StoryNode>;
  stagedContent?: ContentSet;   // AI-created content pending commit; flushed + cleared on publish
}
```

- [ ] **Step 2: Change `GenerationResult` to report `toolCalls`**

Replace the existing `GenerationResult` union with:

```ts
/** frameworkGen result — discriminated union. `toolCalls` = number of tool invocations made. */
export type GenerationResult =
  | { ok: true; bundle: RouteBundle; toolCalls: number }
  | { ok: false; errors: ValidationError[]; toolCalls: number };
```

- [ ] **Step 3: Compile to verify the type change surfaces all call sites**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `server/ai/frameworkGen.ts`, `server/ai/frameworkGen.test.ts`, and `server/api.ts` (they still reference `.attempts`/old signature). These are fixed in later tasks. No errors in `shared/`.

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts
git commit -m "feat(types): add ContentSet, RouteBundle.stagedContent, GenerationResult.toolCalls"
```

---

## Task 2: Provider boundary — tool types, `generateWithTools`, fake tool provider

**Files:**
- Modify: `server/ai/provider.ts`
- Test: `server/ai/provider.test.ts`

- [ ] **Step 1: Write the failing test**

Create/append to `server/ai/provider.test.ts`:

```ts
import { createFakeProvider, createFakeToolProvider, ToolCall } from './provider';

describe('createFakeToolProvider', () => {
  it('replays scripted tool calls through the handler in order', async () => {
    const provider = createFakeToolProvider([
      [{ name: 'create_effect', args: { id: 'frost' } }],
      [{ name: 'submit_route', args: { route: {}, nodes: [] } }],
    ]);
    const seen: string[] = [];
    await provider.generateWithTools('p', [], async (c: ToolCall) => { seen.push(c.name); return { ok: true }; });
    expect(seen).toEqual(['create_effect', 'submit_route']);
  });

  it('stops after maxToolCalls', async () => {
    const provider = createFakeToolProvider([
      [{ name: 'a', args: {} }, { name: 'b', args: {} }, { name: 'c', args: {} }],
    ]);
    const seen: string[] = [];
    await provider.generateWithTools('p', [], async (c) => { seen.push(c.name); return {}; }, { maxToolCalls: 2 });
    expect(seen).toEqual(['a', 'b']);
  });

  it('createFakeProvider rejects generateWithTools (use the tool provider)', async () => {
    await expect(createFakeProvider([]).generateWithTools('p', [], async () => ({}))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest server/ai/provider.test.ts`
Expected: FAIL — `createFakeToolProvider` is not exported / `generateWithTools` not on the interface.

- [ ] **Step 3: Implement the types, interface method, and providers**

Rewrite `server/ai/provider.ts`:

```ts
/** Per-call generation options. `model` selects which Gemini tier to use; defaults to 'pro'. */
export interface GenerateOptions { model?: 'pro' | 'flash'; }

/** A tool the model may call. `parameters` is a JSON Schema for the tool's args. */
export interface ToolDef { name: string; description: string; parameters: object; }
/** One tool invocation emitted by the model. */
export interface ToolCall { name: string; args: any; }
/** Executes a single tool call and returns the result that is fed back to the model. */
export type ToolHandler = (call: ToolCall) => Promise<unknown>;

/** Thin LLM boundary. Returns parsed JSON / drives a tool loop; it does NOT validate. */
export interface AIProvider {
  readonly available: boolean;
  generateStructured(prompt: string, jsonSchema: object, opts?: GenerateOptions): Promise<unknown>;
  generateWithTools(
    prompt: string,
    tools: ToolDef[],
    handler: ToolHandler,
    opts?: GenerateOptions & { maxToolCalls?: number },
  ): Promise<void>;
}

/**
 * Deterministic structured-output double. Each call shifts the next canned response off
 * the queue. generateWithTools is intentionally unsupported — use createFakeToolProvider.
 */
export function createFakeProvider(responses: unknown[]): AIProvider {
  const queue = [...responses];
  return {
    available: true,
    async generateStructured(): Promise<unknown> {
      if (queue.length === 0) throw new Error('FakeProvider: response queue exhausted');
      return queue.shift();
    },
    async generateWithTools(): Promise<void> {
      throw new Error('FakeProvider: generateWithTools not scripted — use createFakeToolProvider');
    },
  };
}

/**
 * Deterministic tool-loop double. `turns` is one entry per model turn; each entry is the
 * list of tool calls that turn makes. The handler runs for each call in order, honoring
 * maxToolCalls. Ignores the prompt, tool defs, and the handler's return value.
 */
export function createFakeToolProvider(turns: ToolCall[][]): AIProvider {
  return {
    available: true,
    async generateStructured(): Promise<unknown> {
      throw new Error('createFakeToolProvider: generateStructured not supported');
    },
    async generateWithTools(_prompt, _tools, handler, opts): Promise<void> {
      const max = opts?.maxToolCalls ?? Infinity;
      let count = 0;
      for (const turn of turns) {
        for (const call of turn) {
          if (count >= max) return;
          count++;
          await handler(call);
        }
      }
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest server/ai/provider.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/ai/provider.ts server/ai/provider.test.ts
git commit -m "feat(ai): add generateWithTools to AIProvider + createFakeToolProvider"
```

---

## Task 3: `contentSet` pure helpers

**Files:**
- Create: `server/ai/contentSet.ts`
- Test: `server/ai/contentSet.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/ai/contentSet.test.ts`:

```ts
import { emptyContentSet, mergeContent, toValidationCtx, toRegistries } from './contentSet';
import { ContentSet } from '../../shared/types';

const base = (): ContentSet => ({
  attributes: { str: { id: 'str', name: 'Strength', abbrev: 'STR', roles: ['core'], builtin: true } },
  effects: {}, items: {}, skills: {},
  enemies: { goblin: { id: 'goblin', name: 'Goblin', stats: { str: 3 }, hp: 5, skillPriority: [] } },
});

describe('contentSet helpers', () => {
  it('emptyContentSet has five empty maps', () => {
    expect(emptyContentSet()).toEqual({ attributes: {}, effects: {}, items: {}, skills: {}, enemies: {} });
  });

  it('mergeContent overlays staged onto global without mutating either', () => {
    const g = base();
    const staged = emptyContentSet();
    staged.enemies['wraith'] = { id: 'wraith', name: 'Wraith', stats: { str: 7 }, hp: 9, skillPriority: [] };
    const merged = mergeContent(g, staged);
    expect(Object.keys(merged.enemies).sort()).toEqual(['goblin', 'wraith']);
    expect(Object.keys(g.enemies)).toEqual(['goblin']); // unchanged
  });

  it('toValidationCtx exposes the four ref-checked registries', () => {
    expect(Object.keys(toValidationCtx(base())).sort()).toEqual(['attributes', 'effects', 'items', 'skills']);
  });

  it('toRegistries maps to itemDb/skillDb/enemyDb', () => {
    const r = toRegistries(base());
    expect(r.enemyDb.goblin.name).toBe('Goblin');
    expect(Object.keys(r).sort()).toEqual(['enemyDb', 'itemDb', 'skillDb']);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest server/ai/contentSet.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `server/ai/contentSet.ts`:

```ts
import { ContentSet, Registries } from '../../shared/types';
import { ValidationCtx } from '../api/contentValidation';

export function emptyContentSet(): ContentSet {
  return { attributes: {}, effects: {}, items: {}, skills: {}, enemies: {} };
}

/** Returns a new ContentSet where `overlay` entries win over `base`. Neither input is mutated. */
export function mergeContent(base: ContentSet, overlay: ContentSet): ContentSet {
  return {
    attributes: { ...base.attributes, ...overlay.attributes },
    effects: { ...base.effects, ...overlay.effects },
    items: { ...base.items, ...overlay.items },
    skills: { ...base.skills, ...overlay.skills },
    enemies: { ...base.enemies, ...overlay.enemies },
  };
}

/** The subset the content validators need (attributes/effects/items/skills). */
export function toValidationCtx(s: ContentSet): ValidationCtx {
  return { attributes: s.attributes, effects: s.effects, items: s.items, skills: s.skills };
}

/** The subset validateRouteBundle needs (items/skills/enemies). */
export function toRegistries(s: ContentSet): Registries {
  return { itemDb: s.items, skillDb: s.skills, enemyDb: s.enemies };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest server/ai/contentSet.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/ai/contentSet.ts server/ai/contentSet.test.ts
git commit -m "feat(ai): add contentSet merge/ctx/registries helpers"
```

---

## Task 4: Tool definitions — Zod arg schemas + `CONTENT_TOOL_DEFS`

**Files:**
- Modify: `server/ai/schema.ts`
- Test: `server/ai/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/ai/schema.test.ts`:

```ts
import { CONTENT_TOOL_DEFS } from './schema';

describe('CONTENT_TOOL_DEFS', () => {
  it('exposes the five create tools plus submit_route', () => {
    const names = CONTENT_TOOL_DEFS.map((t) => t.name).sort();
    expect(names).toEqual(['create_attribute', 'create_effect', 'create_enemy', 'create_item', 'create_skill', 'submit_route']);
  });

  it('every tool has a description and an object JSON-schema for parameters', () => {
    for (const t of CONTENT_TOOL_DEFS) {
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.parameters && typeof t.parameters).toBe('object');
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest server/ai/schema.test.ts`
Expected: FAIL — `CONTENT_TOOL_DEFS` not exported.

- [ ] **Step 3: Add the arg schemas + tool defs**

Append to `server/ai/schema.ts` (after the existing exports). `RouteSchema` and `NodeSchema` already exist in this file — reuse them for `submit_route`:

```ts
import { ToolDef } from './provider';

// ── Content-authoring tool argument schemas (shape hints for the model; the
//    authoritative referential checks remain the validate*() functions). ──
const RoleSchema = z.enum(['core', 'defense', 'maxHp']);
const StatusEffectRefSchema = z.object({
  id: z.string(),
  duration: z.number(),
  magnitude: z.number().optional(),
});

const AttributeArgsSchema = z.object({
  id: z.string(), name: z.string(), abbrev: z.string(),
  roles: z.array(RoleSchema).min(1),
  defaultBase: z.number().optional(),
});

const EffectArgsSchema = z.object({
  id: z.string(), name: z.string(),
  archetype: z.enum(['dot', 'hot', 'statMod', 'control']),
  kind: z.enum(['buff', 'debuff', 'dot', 'hot', 'control']),
  stat: z.string().optional(),          // required when archetype === 'statMod'
  magnitude: z.number().optional(),
  duration: z.number().optional(),
  instant: z.boolean().optional(),
});

const ItemArgsSchema = z.object({
  id: z.string(), name: z.string(),
  slot: z.enum(['weapon', 'armor', 'ring', 'scroll', 'quest']),
  kind: z.enum(['gear', 'consumable']),
  cost: z.number().optional(),
  statMods: z.record(z.string(), z.number()).optional(),
  onEquip: z.array(StatusEffectRefSchema).optional(),
  onUse: z.array(StatusEffectRefSchema).optional(),
  grantsSkills: z.array(z.string()).optional(),
  storyTags: z.array(z.string()).optional(),
});

const SkillArgsSchema = z.object({
  id: z.string(), name: z.string(),
  targetStat: z.string().optional(),
  effectTarget: z.enum(['self', 'enemy']).optional(),
  power: z.number().optional(),
  effects: z.array(StatusEffectRefSchema).optional(),
});

const EnemyArgsSchema = z.object({
  id: z.string(), name: z.string(),
  stats: z.record(z.string(), z.number()),
  hp: z.number(),
  skillPriority: z.array(z.string()).optional(),
  reward: z.object({
    gold: z.array(z.number()).optional(),
    xp: z.number().optional(),
    drops: z.array(z.object({ itemId: z.string(), chance: z.number() })).optional(),
  }).optional(),
});

const SubmitRouteArgsSchema = z.object({ route: RouteSchema, nodes: z.array(NodeSchema) });

const J = (s: z.ZodTypeAny): object => z.toJSONSchema(s) as object;

export const CONTENT_TOOL_DEFS: ToolDef[] = [
  { name: 'create_attribute', description: 'Create a reusable character attribute (stat). Args: id, name, abbrev, roles[], defaultBase?.', parameters: J(AttributeArgsSchema) },
  { name: 'create_effect', description: 'Create a status-effect template from a fixed archetype (dot|hot|statMod|control). For statMod, set "stat" to an attribute id.', parameters: J(EffectArgsSchema) },
  { name: 'create_skill', description: 'Create a combat skill. effects[] reference effect ids; targetStat is an attribute id.', parameters: J(SkillArgsSchema) },
  { name: 'create_item', description: 'Create an item (gear|consumable). statMods keys are attribute ids; onEquip/onUse reference effect ids; grantsSkills reference skill ids.', parameters: J(ItemArgsSchema) },
  { name: 'create_enemy', description: 'Create an enemy. stats keys are attribute ids; skillPriority references skill ids; reward.drops reference item ids.', parameters: J(EnemyArgsSchema) },
  { name: 'submit_route', description: 'Submit the finished route. Args: { route, nodes } where nodes is an ARRAY of node objects. Call exactly once when all content exists.', parameters: J(SubmitRouteArgsSchema) },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest server/ai/schema.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add server/ai/schema.ts server/ai/schema.test.ts
git commit -m "feat(ai): add Zod arg schemas + CONTENT_TOOL_DEFS for content tools"
```

---

## Task 5: `buildToolPrompt`

**Files:**
- Modify: `server/ai/prompt.ts`
- Test: `server/ai/prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/ai/prompt.test.ts`:

```ts
import { buildToolPrompt } from './prompt';
import { ContentSet } from '../../shared/types';

const content: ContentSet = {
  attributes: { str: { id: 'str', name: 'Strength', abbrev: 'STR', roles: ['core'], builtin: true } },
  effects: {}, items: {}, skills: {},
  enemies: { goblin: { id: 'goblin', name: 'Goblin', stats: { str: 3 }, hp: 5, skillPriority: [] } },
};

describe('buildToolPrompt', () => {
  it('names the tools, the reuse rule, and lists existing content ids', () => {
    const p = buildToolPrompt({ contextText: 'a dark forest', title: 'Quest', nodeCount: 3 }, content);
    expect(p).toContain('submit_route');
    expect(p).toContain('create_enemy');
    expect(p).toMatch(/prefer reusing/i);
    expect(p).toContain('goblin');           // existing enemy id surfaced
    expect(p).toContain('a dark forest');    // source material included
    expect(p).toContain('3 story nodes');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest server/ai/prompt.test.ts`
Expected: FAIL — `buildToolPrompt` not exported.

- [ ] **Step 3: Implement `buildToolPrompt`**

In `server/ai/prompt.ts`, add the `ContentSet` import to the existing import line and append:

```ts
/** Build the tool-driven framework-generation prompt. The model uses create_* tools to mint
 *  any content the route needs (preferring reuse of the listed existing content), then calls
 *  submit_route exactly once. */
export function buildToolPrompt(params: GenerationParams, content: ContentSet): string {
  const ids = (r: Record<string, unknown>) => Object.keys(r).join(', ') || '(none)';
  const nodeCount = params.nodeCount ?? 4;
  return [
    'You are a game-route author. You have tools to CREATE reusable game content and one tool to SUBMIT the finished route.',
    `Write a playable route titled "${params.title}" with exactly 1 act and ${nodeCount} story nodes, adapted from the source material below.`,
    'Tools: create_attribute, create_effect, create_skill, create_item, create_enemy, submit_route.',
    'Workflow:',
    '1. Decide what content the route needs (enemies to fight, items to find, skills/effects they use).',
    '2. PREFER REUSING existing content listed below. Only create a new entity when nothing existing is a close match.',
    '3. When you must create, create dependencies first in this order: attributes -> effects -> skills -> items -> enemies. Each create_* returns {ok,id} or {ok:false,errors}; on failure, fix the args and call it again.',
    '4. Finally call submit_route EXACTLY ONCE with { route, nodes }, where nodes is an ARRAY of node objects (id, prose, choices, optional combat, source).',
    'Route rules:',
    `- exactly ${nodeCount} nodes with ids n1..n${nodeCount}; list those same ids in acts[0].nodeIds.`,
    '- every choice.nextNodeId must reference an existing node id.',
    '- set every node "source" to "pregen"; set route.status to "draft".',
    '- at least one terminal node (empty choices) must be reachable from n1.',
    '- provide an ending whose "condition" is EXACTLY `currentNodeId === <id>` for a terminal node id.',
    '- any combat.enemyIds and outcome addItems/removeItems must reference an existing OR newly-created id.',
    'Existing content you can reference (reuse before creating):',
    `- attributes: ${ids(content.attributes)}`,
    `- effects: ${ids(content.effects)}`,
    `- skills: ${ids(content.skills)}`,
    `- items: ${ids(content.items)}`,
    `- enemies: ${ids(content.enemies)}`,
    'Source material to adapt into the prose and choices:',
    params.contextText,
  ].join('\n');
}
```

Update the top import:

```ts
import { GenerationParams, Registries, ValidationError, StoryNode, GameRoute, ContentSet } from '../../shared/types';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest server/ai/prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/ai/prompt.ts server/ai/prompt.test.ts
git commit -m "feat(ai): add buildToolPrompt for tool-driven generation"
```

---

## Task 6: Rewrite `frameworkGen` as a tool loop

**Files:**
- Modify: `server/ai/frameworkGen.ts`
- Test: `server/ai/frameworkGen.test.ts` (rewrite)

- [ ] **Step 1: Rewrite the test for the tool loop**

Replace the contents of `server/ai/frameworkGen.test.ts`:

```ts
import { generateFramework } from './frameworkGen';
import { createFakeToolProvider, ToolCall } from './provider';
import { SAMPLE_BUNDLE, ATTRIBUTE_DB, EFFECT_DB, ITEM_DB, SKILL_DB, ENEMY_DB } from '../../shared/fixtures';
import { ContentSet, RouteBundle } from '../../shared/types';

const content: ContentSet = {
  attributes: ATTRIBUTE_DB, effects: EFFECT_DB, items: ITEM_DB, skills: SKILL_DB, enemies: ENEMY_DB,
};
const params = { contextText: 'ctx', title: 'T' };

// submit_route receives nodes as an ARRAY (the model cannot emit a keyed record).
const submitArgs = (b: RouteBundle) => ({ route: structuredClone(b.route), nodes: Object.values(structuredClone(b.nodes)) });
const submit = (b: RouteBundle): ToolCall => ({ name: 'submit_route', args: submitArgs(b) });

describe('generateFramework (tool loop)', () => {
  it('submits a route that references only existing content', async () => {
    const provider = createFakeToolProvider([[submit(SAMPLE_BUNDLE)]]);
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bundle.route.status).toBe('draft');
      expect(res.bundle.route.sourceNovelId).toBe('adhoc');
      expect(res.toolCalls).toBe(1);
    }
  });

  it('creates a new enemy then references it in the submitted route', async () => {
    const b = structuredClone(SAMPLE_BUNDLE);
    b.nodes['n1'].combat = { enemyIds: ['ice_wraith'] };
    const provider = createFakeToolProvider([[
      { name: 'create_enemy', args: { id: 'ice_wraith', name: 'Ice Wraith', stats: { str: 6 }, hp: 12, skillPriority: [] } },
      submit(b),
    ]]);
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.bundle.stagedContent?.enemies['ice_wraith']?.name).toBe('Ice Wraith');
      expect(res.toolCalls).toBe(2);
    }
  });

  it('returns a tool error for an invalid create, then succeeds after correction', async () => {
    const provider = createFakeToolProvider([[
      { name: 'create_effect', args: { id: 'frost', name: 'Frost', archetype: 'BOGUS', kind: 'dot' } }, // invalid archetype
      { name: 'create_effect', args: { id: 'frost', name: 'Frost', archetype: 'dot', kind: 'dot', magnitude: 2, duration: 2 } },
      submit(SAMPLE_BUNDLE),
    ]]);
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bundle.stagedContent?.effects['frost']).toBeDefined();
  });

  it('rejects creating an id that already exists globally', async () => {
    const captured: unknown[] = [];
    const provider = createFakeToolProvider([[
      { name: 'create_attribute', args: { id: 'str', name: 'Strength', abbrev: 'STR', roles: ['core'] } },
    ]]);
    // No submit_route → generation fails; we assert the loop did not crash and reports failure.
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(false);
    void captured;
  });

  it('fails when the model never submits a route', async () => {
    const provider = createFakeToolProvider([[
      { name: 'create_enemy', args: { id: 'wraith', name: 'Wraith', stats: { str: 5 }, hp: 8, skillPriority: [] } },
    ]]);
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.length).toBeGreaterThan(0);
  });

  it('rejects a submitted route whose combat references an unknown enemy', async () => {
    const b = structuredClone(SAMPLE_BUNDLE);
    b.nodes['n1'].combat = { enemyIds: ['does_not_exist'] };
    const provider = createFakeToolProvider([[submit(b)]]);
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(false);
  });

  it('treats moderation-blocked prose as a submit failure', async () => {
    const b = structuredClone(SAMPLE_BUNDLE);
    b.nodes['n1'].prose = 'There is gore everywhere.'; // banned term
    const provider = createFakeToolProvider([[submit(b)]]);
    const res = await generateFramework(provider, params, content);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.message.includes('moderation'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest server/ai/frameworkGen.test.ts`
Expected: FAIL — old signature / `toolCalls` missing.

- [ ] **Step 3: Rewrite `frameworkGen.ts`**

Replace the contents of `server/ai/frameworkGen.ts`:

```ts
import { AIProvider, ToolCall } from './provider';
import { CONTENT_TOOL_DEFS } from './schema';
import { buildToolPrompt } from './prompt';
import { moderate } from './moderate';
import { validateRouteBundle } from '../../shared/validation';
import {
  validateAttribute, validateEffect, validateItem, validateSkill, validateEnemy,
} from '../api/contentValidation';
import { emptyContentSet, mergeContent, toValidationCtx, toRegistries } from './contentSet';
import {
  GenerationParams, ContentSet, GenerationResult, RouteBundle, StoryNode, ValidationError,
} from '../../shared/types';
import { GameError } from '../session';

/**
 * Orchestrates one tool-driven framework generation. The model calls create_* tools to mint
 * content (validated against globalContent ∪ staged) and a terminal submit_route tool. The
 * loop logic lives here; the provider only transports the function-calling exchange.
 */
export async function generateFramework(
  provider: AIProvider,
  params: GenerationParams,
  global: ContentSet,
  opts: { maxToolCalls?: number } = {},
): Promise<GenerationResult> {
  const maxToolCalls = opts.maxToolCalls ?? 30;
  const staged = emptyContentSet();
  let finalBundle: RouteBundle | null = null;
  let lastErrors: ValidationError[] = [];
  let toolCalls = 0;

  const asErrors = (message: string): ValidationError[] => [{ path: '', code: 'BAD_SHAPE', message }];

  // Stage a validated entity, rejecting ids that collide with global or already-staged content.
  const stage = (kind: keyof ContentSet, e: { id: string }) => {
    const g = global[kind] as Record<string, unknown>;
    const s = staged[kind] as Record<string, unknown>;
    if (g[e.id] || s[e.id]) {
      const errors = asErrors(`${e.id} already exists`);
      lastErrors = errors;
      return { ok: false, errors };
    }
    s[e.id] = e;
    return { ok: true, id: e.id };
  };

  const handler = async (call: ToolCall): Promise<unknown> => {
    toolCalls++;
    const merged = mergeContent(global, staged);
    const ctx = toValidationCtx(merged);
    try {
      switch (call.name) {
        case 'create_attribute': return stage('attributes', validateAttribute(call.args));
        case 'create_effect':    return stage('effects', validateEffect(call.args, ctx));
        case 'create_skill':     return stage('skills', validateSkill(call.args, ctx));
        case 'create_item':      return stage('items', validateItem(call.args, ctx));
        case 'create_enemy':     return stage('enemies', validateEnemy(call.args, ctx));
        case 'submit_route': {
          const args = call.args as { route: RouteBundle['route']; nodes: StoryNode[] };
          const nodes: Record<string, StoryNode> = {};
          for (const n of args.nodes ?? []) nodes[n.id] = n;
          const bundle: RouteBundle = { route: args.route, nodes, stagedContent: staged };
          const errs = validateRouteBundle(bundle, toRegistries(merged));
          for (const [nid, node] of Object.entries(nodes)) {
            const m = moderate(node.prose);
            if (!m.ok) errs.push({ path: `nodes.${nid}.prose`, code: 'BAD_SHAPE', message: `moderation: ${m.reason}` });
          }
          if (errs.length) { lastErrors = errs; return { ok: false, errors: errs }; }
          bundle.route.status = 'draft';
          bundle.route.sourceNovelId = params.sourceNovelId ?? 'adhoc';
          finalBundle = bundle;
          return { ok: true };
        }
        default: {
          const errors = asErrors(`unknown tool ${call.name}`);
          lastErrors = errors;
          return { ok: false, errors };
        }
      }
    } catch (e) {
      const errors = asErrors(e instanceof GameError ? e.message : String(e));
      lastErrors = errors;
      return { ok: false, errors };
    }
  };

  await provider.generateWithTools(buildToolPrompt(params, global), CONTENT_TOOL_DEFS, handler, { maxToolCalls });

  if (finalBundle) return { ok: true, bundle: finalBundle, toolCalls };
  return { ok: false, errors: lastErrors.length ? lastErrors : asErrors('no route submitted'), toolCalls };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest server/ai/frameworkGen.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/ai/frameworkGen.ts server/ai/frameworkGen.test.ts
git commit -m "feat(ai): rewrite frameworkGen as a content-tool loop"
```

---

## Task 7: Gemini adapter — implement `generateWithTools`

**Files:**
- Modify: `server/ai/gemini.ts`
- Test: none in Jest (needs network). Verified by `npx tsc --noEmit` + the manual smoke test in Task 12.

- [ ] **Step 1: Implement `generateWithTools` in the provider**

In `server/ai/gemini.ts`, add `ToolDef`/`ToolHandler` to the existing import and add the method to the returned object (after `generateStructured`):

```ts
import { AIProvider, GenerateOptions, ToolDef, ToolHandler } from './provider';
```

Inside the object returned by `createGeminiProvider`, add:

```ts
    async generateWithTools(
      prompt: string,
      tools: ToolDef[],
      handler: ToolHandler,
      opts?: GenerateOptions & { maxToolCalls?: number },
    ): Promise<void> {
      if (!client) throw new Error('Gemini provider unavailable: no API key');
      const modelName = opts?.model === 'flash' ? cfg.flashModel : cfg.proModel;
      const max = opts?.maxToolCalls ?? 30;
      const functionDeclarations = tools.map((t) => ({
        name: t.name,
        description: t.description,
        // Gemini's parameters use the same restricted subset as responseSchema.
        parameters: sanitizeForGemini(t.parameters) as never,
      }));
      const model = client.getGenerativeModel({
        model: modelName,
        tools: [{ functionDeclarations }] as never,
      });
      const chat = model.startChat();
      let result = await chat.sendMessage(prompt);
      let count = 0;
      // Loop: model emits functionCall(s) → run handler → send functionResponse(s) → repeat.
      while (true) {
        const calls = result.response.functionCalls?.() ?? [];
        if (!calls.length) return; // model produced no further calls — generation is done
        const responses: unknown[] = [];
        for (const call of calls) {
          if (count >= max) return;
          count++;
          const out = await handler({ name: call.name, args: call.args });
          responses.push({ functionResponse: { name: call.name, response: { result: out } } });
        }
        result = await chat.sendMessage(responses as never);
      }
    },
```

- [ ] **Step 2: Verify the whole project type-checks**

Run: `npx tsc --noEmit`
Expected: PASS for `server/ai/gemini.ts` (remaining errors, if any, are only in `server/api.ts` until Task 8).

- [ ] **Step 3: Run the existing Gemini unit tests (sanitize logic)**

Run: `npx jest server/ai/gemini.test.ts`
Expected: PASS (unchanged — sanitize tests still green).

- [ ] **Step 4: Commit**

```bash
git add server/ai/gemini.ts
git commit -m "feat(ai): implement Gemini generateWithTools (native function calling)"
```

---

## Task 8: Generate handler — build a `ContentSet`, report `toolCalls`

**Files:**
- Modify: `server/api.ts` (generate handler ~283-298)
- Modify: `server/api.test.ts` (generate tests + the 503 inline mock)
- Test: `server/api.test.ts`

- [ ] **Step 1: Update the generate handler**

In `server/api.ts`, add `ContentSet` to the shared-types import:

```ts
import { Registries, ContentSet } from '../shared/types';
```

Replace the `registries`/`generateFramework`/422 block in the generate handler with:

```ts
    const content: ContentSet = {
      attributes: await admin.content.attributes.all(),
      effects: await admin.content.effects.all(),
      items: await admin.content.items.all(),
      skills: await admin.content.skills.all(),
      enemies: await admin.content.enemies.all(),
    };
    const result = await generateFramework(
      admin.registry.getFrameworkProvider(),
      { contextText: ctx, title, nodeCount, sourceNovelId: novelId },
      content,
    );
    if (!result.ok) {
      res.status(422).json({ errors: result.errors, toolCalls: result.toolCalls });
      return undefined;
    }
    const routeId = await admin.routes.create(result.bundle);
    return { routeId, bundle: result.bundle };
```

(The now-unused `Registries` import can be removed if nothing else in the file uses it — check with the type-check in Step 4.)

- [ ] **Step 2: Update the generate tests to use the tool provider**

In `server/api.test.ts`: import `createFakeToolProvider`, and convert the existing `genBundle()` (gen-shape `{route, nodes:[...]}`) into a `submit_route` tool turn.

Add the import:

```ts
import { createFakeProvider, createFakeToolProvider, AIProvider } from './ai/provider';
```

Replace the generation tests (the `generate → publish → play` happy path and the 422 test) with:

```ts
  it('generate → publish → play a generated route end-to-end', async () => {
    const a = app(createFakeToolProvider([[{ name: 'submit_route', args: genBundle() }]]));
    const t = await token(a);
    const pt = await playerToken(a);
    const auth = { Authorization: `Bearer ${t}` };

    const gen = await request(a).post('/admin/routes/generate').set(auth).send({ contextText: 'ctx', title: 'AI Generated' });
    expect(gen.status).toBe(200);
    expect(gen.body.routeId).toBe('ai-route-1');
    // ...keep the rest of this test's publish + play assertions unchanged...
  });

  it('returns 422 with errors when generation never submits', async () => {
    const a = app(createFakeToolProvider([[]])); // a turn with no tool calls → no submit_route
    const t = await token(a);
    const res = await request(a).post('/admin/routes/generate').set('Authorization', `Bearer ${t}`).send({ contextText: 'ctx', title: 'X' });
    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });
```

Update the 503 test's inline mock to satisfy the expanded interface:

```ts
    const unavailable: AIProvider = {
      available: false,
      async generateStructured() { throw new Error('x'); },
      async generateWithTools() { throw new Error('x'); },
    };
```

> Note: `genBundle()` already returns the gen shape `{ route, nodes: [...] }`, which is exactly `submit_route`'s args. Keep the existing publish/play assertions in the happy-path test as-is.

- [ ] **Step 3: Run the test to confirm it fails, then check the message**

Run: `npx jest server/api.test.ts`
Expected: initially FAIL only if the handler edit is incomplete; once Step 1 is in, the suite should drive the new shape.

- [ ] **Step 4: Type-check + run the suite to verify it passes**

Run: `npx tsc --noEmit && npx jest server/api.test.ts`
Expected: PASS. (If `Registries` is now unused in `server/api.ts`, remove it from the import to clear the TS6133 hint.)

- [ ] **Step 5: Commit**

```bash
git add server/api.ts server/api.test.ts
git commit -m "feat(api): generate handler builds ContentSet; reports toolCalls"
```

---

## Task 9: `flushStagedContent` — commit staged entities on publish

**Files:**
- Create: `server/api/publishStaged.ts`
- Test: `server/api/publishStaged.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/api/publishStaged.test.ts`:

```ts
import { flushStagedContent } from './publishStaged';
import { createMemoryContentStores } from '../store/contentStores';
import { emptyContentSet } from '../ai/contentSet';
import { GameError } from '../session';

describe('flushStagedContent', () => {
  it('writes staged entities into the content stores', async () => {
    const stores = createMemoryContentStores();
    const staged = emptyContentSet();
    staged.effects['frost'] = { id: 'frost', name: 'Frost', archetype: 'dot', kind: 'dot', magnitude: 2, duration: 2, builtin: false };
    staged.enemies['wraith'] = { id: 'wraith', name: 'Wraith', stats: { str: 5 }, hp: 8, skillPriority: [] };
    await flushStagedContent(stores, staged);
    expect(await stores.effects.get('frost')).not.toBeNull();
    expect(await stores.enemies.get('wraith')).not.toBeNull();
  });

  it('throws GameError(409) when a staged id collides with an existing entity', async () => {
    const stores = createMemoryContentStores();
    const existing = await stores.enemies.list();
    const staged = emptyContentSet();
    staged.enemies[existing[0].id] = { ...existing[0] };
    await expect(flushStagedContent(stores, staged)).rejects.toMatchObject({ status: 409 });
  });

  it('is a no-op for an empty staging set', async () => {
    const stores = createMemoryContentStores();
    await expect(flushStagedContent(stores, emptyContentSet())).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest server/api/publishStaged.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `flushStagedContent`**

Create `server/api/publishStaged.ts`:

```ts
import { ContentSet } from '../../shared/types';
import { ContentStores } from '../store/contentStores';
import { EntityStore, StoreError } from '../store/EntityStore';
import { GameError } from '../session';

// Dependency order: attributes first, enemies last (enemies reference items + skills).
const ORDER: (keyof ContentSet)[] = ['attributes', 'effects', 'skills', 'items', 'enemies'];

/** Commit a draft's staged content into the global content stores. Throws GameError(409)
 *  if any staged id already exists. Order matters so references resolve as they land. */
export async function flushStagedContent(stores: ContentStores, staged: ContentSet): Promise<void> {
  for (const kind of ORDER) {
    const store = stores[kind] as EntityStore<{ id: string }>;
    for (const entity of Object.values(staged[kind])) {
      try {
        await store.create(entity);
      } catch (e) {
        if (e instanceof StoreError && e.kind === 'conflict') {
          throw new GameError(`${kind} ${entity.id} already exists`, 409);
        }
        throw e;
      }
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest server/api/publishStaged.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/api/publishStaged.ts server/api/publishStaged.test.ts
git commit -m "feat(api): add flushStagedContent for publish-time commit"
```

---

## Task 10: Wire publish handler to flush + clear staged content

**Files:**
- Modify: `server/api.ts` (publish handler ~309-316)
- Test: `server/api.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/api.test.ts` (inside the admin describe block; reuses the `app`, `token`, `genBundle` helpers):

```ts
  it('publishing a route with staged content commits it to the registry', async () => {
    // Generate a route that also creates a brand-new enemy 'ice_wraith'.
    const bundle = genBundle();
    bundle.nodes[0].combat = { enemyIds: ['ice_wraith'] };
    const a = app(createFakeToolProvider([[
      { name: 'create_enemy', args: { id: 'ice_wraith', name: 'Ice Wraith', stats: { str: 6 }, hp: 12, skillPriority: [] } },
      { name: 'submit_route', args: bundle },
    ]]));
    const t = await token(a);
    const auth = { Authorization: `Bearer ${t}` };

    const gen = await request(a).post('/admin/routes/generate').set(auth).send({ contextText: 'ctx', title: 'Staged' });
    expect(gen.status).toBe(200);
    const routeId = gen.body.routeId;

    // The enemy is staged on the draft, NOT yet in the registry.
    const before = await request(a).get('/admin/enemies').set(auth);
    expect(before.body.some((e: { id: string }) => e.id === 'ice_wraith')).toBe(false);

    const pub = await request(a).post('/admin/routes/' + routeId + '/publish').set(auth);
    expect(pub.status).toBe(204);

    // After publish it is committed and stagedContent is cleared.
    const after = await request(a).get('/admin/enemies').set(auth);
    expect(after.body.some((e: { id: string }) => e.id === 'ice_wraith')).toBe(true);
    const view = await request(a).get('/admin/routes/' + routeId).set(auth);
    expect(view.body.stagedContent).toBeUndefined();
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest server/api.test.ts -t "staged content commits"`
Expected: FAIL — enemy not committed / `stagedContent` still present (publish handler doesn't flush yet).

- [ ] **Step 3: Update the publish handler**

In `server/api.ts`, add the import:

```ts
import { flushStagedContent } from './api/publishStaged';
```

Replace the publish handler body:

```ts
  app.post('/admin/routes/:id/publish', wrap(async (req, res) => {
    const id = req.params.id as string;
    const bundle = await admin.routes.get(id);
    if (!bundle) throw new GameError(`Route ${id} not found`, 404);
    if (bundle.stagedContent) {
      await flushStagedContent(admin.content, bundle.stagedContent);   // throws GameError(409) on id collision
      delete bundle.stagedContent;
      await admin.routes.create(bundle);   // upsert the cleared bundle (still draft) in both adapters
    }
    await admin.routes.publish(id);
    res.status(204).end();
    return undefined;
  }));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest server/api.test.ts`
Expected: PASS (new test + all existing admin tests).

- [ ] **Step 5: Commit**

```bash
git add server/api.ts server/api.test.ts
git commit -m "feat(api): flush + clear staged content on route publish"
```

---

## Task 11: Admin console — staged-content banner + publish confirmation

**Files:**
- Modify: `server/admin/index.html` (`renderNodes` ~666-675; `publishRoute` ~777-780)
- Test: manual (browser at `http://localhost:3000/admin`) — no Jest.

- [ ] **Step 1: Add the staged-content banner in `renderNodes`**

In `server/admin/index.html`, inside `renderNodes(routeId, bundle)`, immediately after `const box = $('nodesOut'); box.innerHTML = '';` and before the `pool` block, insert:

```js
      const staged = bundle.stagedContent;
      if (staged) {
        const kinds = ['attributes', 'effects', 'skills', 'items', 'enemies'];
        const parts = [];
        for (const k of kinds) {
          const ids = Object.keys(staged[k] || {});
          if (ids.length) parts.push(k + ': ' + ids.join(', '));
        }
        if (parts.length) {
          const banner = document.createElement('div');
          banner.className = 'status';
          banner.style.color = 'var(--gold, #c8a24a)';
          banner.style.fontSize = '12px'; banner.style.marginBottom = '8px';
          banner.textContent = 'New content this route will add on publish — ' + parts.join('  |  ');
          box.appendChild(banner);
        }
      }
```

- [ ] **Step 2: Add a publish confirmation that names the staged counts**

Replace `publishRoute(id)`:

```js
    async function publishRoute(id) {
      const bundle = await api('/admin/routes/' + id, { headers: authHeaders() });
      const staged = bundle.stagedContent;
      if (staged) {
        const counts = ['attributes', 'effects', 'skills', 'items', 'enemies']
          .map(function (k) { var n = Object.keys(staged[k] || {}).length; return n ? n + ' ' + k : null; })
          .filter(Boolean);
        if (counts.length && !confirm('Publishing will add ' + counts.join(', ') + ' to the registry. Continue?')) return;
      }
      try {
        await api('/admin/routes/' + id + '/publish', { method: 'POST', headers: authHeaders() });
        await loadRoutes();
      } catch (e) {
        alert('Publish failed: ' + (e && e.message ? e.message : String(e)));
      }
    }
```

- [ ] **Step 3: Manual verification in the browser**

Run the server: `npm run dev` (or the project's server start script). Then:
1. Open `http://localhost:3000/admin`, log in.
2. Generate a route (with a real Gemini key, or rely on the e2e test coverage from Task 10 for the staging behavior).
3. Open the route detail → confirm the gold "New content this route will add on publish" banner lists the staged entities.
4. Click Publish → confirm the dialog names the counts → accept → the route flips to published and the staged entities now appear in the Attributes/Effects/Items/Skills/Enemies tables.
5. Re-open the route → the banner is gone (stagedContent cleared).

Expected: all five steps behave as described; no console errors.

- [ ] **Step 4: Commit**

```bash
git add server/admin/index.html
git commit -m "feat(admin): show staged content on draft routes + confirm on publish"
```

---

## Task 12: Manual-verify doc for Gemini function calling

**Files:**
- Create: `docs/superpowers/specs/2026-06-13-ai-content-authoring-tools-manual-verify.md`

- [ ] **Step 1: Write the manual smoke-test doc**

Create the file with:

```markdown
# Manual Verify — AI Content-Authoring Tools (Gemini function calling)

Jest never touches the network; `generateWithTools` against real Gemini is smoke-tested by hand.

## Prereqs
- `.env` has a valid `GEMINI_API_KEY` (and the Pro model configured).
- Server running: `npm run dev`. Admin console at `http://localhost:3000/admin`.

## Steps
1. Log in to the admin console.
2. Generate a route from a novel/context whose scenes imply NEW creatures or gear not in the
   current registry (e.g. an arctic chapter with frost monsters), title it "Frost Trial".
3. Expected: generation returns 200 with a draft. The route detail shows a gold
   "New content this route will add on publish" banner listing AI-created effects/enemies/items.
4. Inspect the bundle JSON (`viewOut`): `stagedContent` contains the new entities; node `combat`
   blocks reference their ids; existing ids were reused where sensible.
5. Publish → accept the confirmation → verify the new entities now appear in the content tables
   and the banner disappears from the route.
6. Negative: generate again with a context that forces an id already in the registry; if a
   collision occurs at publish, expect a 409 surfaced as "Publish failed: … already exists",
   with the draft left intact.

## Notes
- If generation never calls `submit_route` within `maxToolCalls` (30), the endpoint returns 422
  with collected errors — re-run; transient model behavior.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-06-13-ai-content-authoring-tools-manual-verify.md
git commit -m "docs(ai): manual-verify steps for Gemini content tool calling"
```

---

## Final verification

- [ ] **Run the full suite + type-check**

Run: `npx tsc --noEmit && npx jest`
Expected: all tests pass; no type errors.

- [ ] **Confirm no stray `attempts`/`generateStructured`-only assumptions remain**

Run: `npx jest --silent` and grep the diff for `result.attempts`.
Expected: none outside history; generation now reports `toolCalls`.
