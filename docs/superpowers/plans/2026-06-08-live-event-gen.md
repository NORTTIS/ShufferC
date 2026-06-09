# Live Event Generation (Sub-project C3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Within a published route, let Gemini Flash enrich admin-marked `source:'live'` nodes (prose + choice text) at play time, grounded in the source novel, with the stub's own text as the fallback.

**Architecture:** Framework-gen still emits complete, validated nodes. The admin marks selected nodes `live` (new endpoint + console toggle). On first visit, the session retrieves novel context (RAG), calls a new `generateEvent` orchestrator, and overlays the result onto the served node, caching it per-save in `save.liveNodes`. Mechanical structure (edges/skillCheck/combat/outcome) is never touched at runtime, so C1's validator guarantees hold. No API key or a failed generation degrades gracefully to the stub text.

**Tech Stack:** TypeScript, Node, Express, Zod, `@google/generative-ai`, Jest + supertest. All tests are deterministic and offline (FakeProvider / FakeEmbedder).

**Spec:** `docs/superpowers/specs/2026-06-08-live-event-gen-design.md`

---

### Task 1: Save shape — `LiveOverlay` + `SaveState.liveNodes` + version bump

**Files:**
- Modify: `shared/types.ts` (SaveState block ~128-138)
- Modify: `shared/constants.ts:12`
- Test: `shared/engine/save.test.ts`

- [ ] **Step 1: Update the round-trip test to the new version + a liveNodes case**

Replace the whole body of `shared/engine/save.test.ts` with:

```ts
import { serialize, deserialize } from './save';
import { SaveState, Stats } from '../types';
import { SAVE_VERSION } from '../constants';

const baseStats: Stats = { str: 7, dex: 9, int: 6, wis: 5, cha: 8, con: 6 };

function save(): SaveState {
  return {
    version: SAVE_VERSION, routeId: 'r1',
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
  it('round-trips a SaveState carrying liveNodes overlays', () => {
    const s: SaveState = { ...save(), liveNodes: { n2: { prose: 'enriched', choiceTexts: ['go', 'stay'] } } };
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it('rejects an unsupported save version', () => {
    const bad = serialize({ ...save(), version: 999 });
    expect(() => deserialize(bad)).toThrow(/version/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest shared/engine/save.test.ts`
Expected: FAIL — `liveNodes` is not a known property on `SaveState` (TS error) and/or version mismatch.

- [ ] **Step 3: Add `LiveOverlay` and `SaveState.liveNodes`**

In `shared/types.ts`, add `liveNodes?` to the `SaveState` interface (after `playedRouteIds`):

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
  liveNodes?: Record<string, LiveOverlay>;   // nodeId → Flash-enriched text (per playthrough)
}

/** Flash-generated text for one live node, overlaid onto its stub at view time. */
export interface LiveOverlay {
  prose: string;
  choiceTexts: string[];   // length === the stub node's choices.length, same order
}
```

- [ ] **Step 4: Bump the save version**

In `shared/constants.ts`, change line 12:

```ts
export const SAVE_VERSION = 2;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest shared/engine/save.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts shared/constants.ts shared/engine/save.test.ts
git commit -m "feat(shared): add LiveOverlay + SaveState.liveNodes, bump SAVE_VERSION to 2"
```

---

### Task 2: Provider model selection (`pro` | `flash`)

**Files:**
- Modify: `server/ai/provider.ts`
- Modify: `server/ai/gemini.ts:61-74`
- Test: `server/ai/provider.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/ai/provider.test.ts` (inside the existing top-level `describe`, or as a new `describe('AIProvider options')`):

```ts
import { createFakeProvider } from './provider';

describe('AIProvider options', () => {
  it('FakeProvider accepts and ignores a model option, still returning the queued response', async () => {
    const p = createFakeProvider([{ ok: 1 }]);
    const out = await p.generateStructured('prompt', {}, { model: 'flash' });
    expect(out).toEqual({ ok: 1 });
  });
});
```

(If `createFakeProvider` is already imported at the top of the file, do not re-import it — drop the duplicate import line.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest server/ai/provider.test.ts`
Expected: FAIL — TS error: `generateStructured` expects 2 arguments, got 3.

- [ ] **Step 3: Add the optional options parameter to the interface**

Replace the contents of `server/ai/provider.ts` with:

```ts
/** Per-call generation options. `model` selects which Gemini tier to use; defaults to 'pro'. */
export interface GenerateOptions { model?: 'pro' | 'flash'; }

/** Thin LLM boundary. Returns parsed JSON; it does NOT validate — callers own validation + retry. */
export interface AIProvider {
  readonly available: boolean;                                              // false when no API key
  generateStructured(prompt: string, jsonSchema: object, opts?: GenerateOptions): Promise<unknown>;
}

/**
 * Deterministic test double. Each call shifts the next canned response off the queue,
 * so a test can script "attempt 1 invalid → attempt 2 valid" to drive the retry path.
 * Ignores the prompt, schema, and options.
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

- [ ] **Step 4: Make Gemini honour the model option**

In `server/ai/gemini.ts`, change the `generateStructured` signature and the model selection. Replace lines 61-71 (the method up to `const result`) with:

```ts
    async generateStructured(prompt: string, jsonSchema: object, opts?: { model?: 'pro' | 'flash' }): Promise<unknown> {
      if (!client) throw new Error('Gemini provider unavailable: no API key');
      const modelName = opts?.model === 'flash' ? cfg.flashModel : cfg.proModel;
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          // Strip JSON-Schema keywords Gemini doesn't accept; cast through unknown
          // because the SDK's responseSchema type is narrower than a generic schema.
          responseSchema: sanitizeForGemini(jsonSchema) as unknown as never,
        },
      });
      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text());
    },
```

Update the JSDoc above `createGeminiProvider` (line ~48-54): change "Uses the Pro model for framework generation" to "Uses the Pro model by default (framework generation); callers pass `{ model: 'flash' }` for live event-gen."

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest server/ai/provider.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/ai/provider.ts server/ai/gemini.ts server/ai/provider.test.ts
git commit -m "feat(ai): AIProvider gains optional model:'pro'|'flash' option"
```

---

### Task 3: Live-overlay Zod schema

**Files:**
- Modify: `server/ai/schema.ts`
- Test: `server/ai/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/ai/schema.test.ts`:

```ts
import { EventOverlaySchema, EVENT_OVERLAY_JSON_SCHEMA } from './schema';

describe('EventOverlaySchema', () => {
  it('parses a well-formed overlay', () => {
    const r = EventOverlaySchema.safeParse({ prose: 'hello', choiceTexts: ['a', 'b'] });
    expect(r.success).toBe(true);
  });
  it('rejects an empty prose string', () => {
    const r = EventOverlaySchema.safeParse({ prose: '', choiceTexts: [] });
    expect(r.success).toBe(false);
  });
  it('rejects an empty choice text', () => {
    const r = EventOverlaySchema.safeParse({ prose: 'x', choiceTexts: [''] });
    expect(r.success).toBe(false);
  });
  it('exposes a non-empty JSON schema', () => {
    expect(typeof EVENT_OVERLAY_JSON_SCHEMA).toBe('object');
    expect(Object.keys(EVENT_OVERLAY_JSON_SCHEMA as object).length).toBeGreaterThan(0);
  });
});
```

(If `schema.test.ts` already imports from `./schema`, merge these imports into the existing import line instead of duplicating it.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest server/ai/schema.test.ts`
Expected: FAIL — `EventOverlaySchema`/`EVENT_OVERLAY_JSON_SCHEMA` not exported.

- [ ] **Step 3: Add the schema**

Append to `server/ai/schema.ts`:

```ts
// ── Live event-gen (slice C3): one node's enriched text ───────────────
export const EventOverlaySchema = z.object({
  prose: z.string().min(1),
  choiceTexts: z.array(z.string().min(1)),
});

export type ParsedEventOverlay = z.infer<typeof EventOverlaySchema>;

/** JSON Schema fed to Gemini's responseSchema for live event-gen. */
export const EVENT_OVERLAY_JSON_SCHEMA = z.toJSONSchema(EventOverlaySchema) as object;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest server/ai/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/ai/schema.ts server/ai/schema.test.ts
git commit -m "feat(ai): add EventOverlaySchema + JSON schema for live event-gen"
```

---

### Task 4: Live event-gen prompt builder

**Files:**
- Modify: `server/ai/prompt.ts`
- Test: `server/ai/prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/ai/prompt.test.ts`:

```ts
import { buildEventPrompt } from './prompt';
import { StoryNode, GameRoute } from '../../shared/types';

const stub: StoryNode = {
  id: 's1', source: 'live', prose: 'A plain doorway.',
  choices: [{ id: 'a', text: 'Enter', nextNodeId: 's2' }, { id: 'b', text: 'Leave', nextNodeId: 's3' }],
};
const route: GameRoute = {
  id: 'r', title: 'Test', sourceNovelId: 'novel-1', acts: [], itemPool: [], enemyPool: [],
  endings: [], status: 'published',
};

describe('buildEventPrompt', () => {
  it('embeds the stub prose, RAG context, path summary, and the exact choice count', () => {
    const p = buildEventPrompt(stub, route, 'NOVEL CONTEXT HERE', 'Reputation hero=3');
    expect(p).toContain('A plain doorway.');
    expect(p).toContain('NOVEL CONTEXT HERE');
    expect(p).toContain('Reputation hero=3');
    expect(p).toContain('exactly 2');           // choiceTexts count constraint
  });
  it('appends prior errors on retry', () => {
    const p = buildEventPrompt(stub, route, '', '', [{ path: 'choiceTexts', code: 'BAD_SHAPE', message: 'wrong count' }]);
    expect(p).toContain('wrong count');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest server/ai/prompt.test.ts`
Expected: FAIL — `buildEventPrompt` not exported.

- [ ] **Step 3: Implement the prompt builder**

In `server/ai/prompt.ts`, update the import on line 1 to add the new types, then append the function. New import line 1:

```ts
import { GenerationParams, Registries, ValidationError, StoryNode, GameRoute } from '../../shared/types';
```

Append at the end of the file:

```ts
/**
 * Build the live event-gen prompt for ONE node. Flash enriches the stub's prose and
 * each choice's display text only — it must NOT add, drop, or re-target choices.
 * The stub's current text is the seed; RAG novel context grounds the rewrite.
 * On retry, prior errors are appended for self-correction.
 */
export function buildEventPrompt(
  stub: StoryNode,
  route: GameRoute,
  ragText: string,
  pathSummary: string,
  lastErrors?: ValidationError[],
): string {
  const n = stub.choices.length;
  const example = JSON.stringify({
    prose: 'A richer, novel-grounded retelling of this beat…',
    choiceTexts: stub.choices.map((c) => `(reworded) ${c.text}`),
  });

  const lines = [
    'You are a game narrator enriching ONE story node at play time. Output ONLY a single JSON object that matches the provided schema. No markdown, no prose outside the JSON.',
    `The route is titled "${route.title}". Keep tone consistent and suitable for ages 13+.`,
    'The JSON has exactly two fields:',
    '- "prose": a vivid retelling of this scene.',
    `- "choiceTexts": an array of EXACTLY ${n} strings, one per existing choice, in the SAME order.`,
    'Rules:',
    '- Enrich WORDING only. Do NOT change what a choice does or where it leads; do NOT add or remove choices.',
    `- "choiceTexts" MUST contain exactly ${n} non-empty entries (one per existing choice).`,
    '- Stay faithful to the source novel context provided below; do not invent contradicting facts.',
    'Current node prose (the beat to enrich):',
    stub.prose,
    'Current choice texts (reword these, same order, same meaning):',
    stub.choices.map((c, i) => `${i + 1}. ${c.text}`).join('\n') || '(no choices)',
    'Player context so far:',
    pathSummary || '(none)',
    'Source novel context (for grounding):',
    ragText || '(none provided)',
    'Shape example (structure only — write your own content):',
    example,
  ];

  if (lastErrors && lastErrors.length) {
    lines.push('Your previous attempt had these problems; fix them:');
    for (const e of lastErrors) lines.push(`- [${e.code}] ${e.path}: ${e.message}`);
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest server/ai/prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/ai/prompt.ts server/ai/prompt.test.ts
git commit -m "feat(ai): add buildEventPrompt for live event-gen"
```

---

### Task 5: `generateEvent` orchestrator

**Files:**
- Create: `server/ai/eventGen.ts`
- Test: `server/ai/eventGen.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/ai/eventGen.test.ts`:

```ts
import { generateEvent } from './eventGen';
import { createFakeProvider, AIProvider } from './provider';
import { StoryNode, GameRoute } from '../../shared/types';

const stub: StoryNode = {
  id: 's1', source: 'live', prose: 'stub prose',
  choices: [{ id: 'a', text: 'stub choice', nextNodeId: 's2' }],
};
const route: GameRoute = {
  id: 'r', title: 'T', sourceNovelId: 'adhoc', acts: [], itemPool: [], enemyPool: [], endings: [], status: 'published',
};
const params = { stub, route, ragText: '', pathSummary: '' };
const goodOverlay = { prose: 'rich prose', choiceTexts: ['rich choice'] };

describe('generateEvent', () => {
  it('returns the overlay on a valid first attempt', async () => {
    const r = await generateEvent(createFakeProvider([goodOverlay]), params);
    expect(r.fallback).toBe(false);
    expect(r.attempts).toBe(1);
    expect(r.overlay).toEqual(goodOverlay);
  });

  it('retries past a bad-shape response then succeeds', async () => {
    const r = await generateEvent(createFakeProvider([{ nope: true }, goodOverlay]), params);
    expect(r.fallback).toBe(false);
    expect(r.attempts).toBe(2);
  });

  it('falls back to stub text when choiceTexts count is always wrong', async () => {
    const wrong = { prose: 'x', choiceTexts: ['a', 'b'] }; // stub has 1 choice
    const r = await generateEvent(createFakeProvider([wrong, wrong]), params);
    expect(r.fallback).toBe(true);
    expect(r.overlay).toEqual({ prose: 'stub prose', choiceTexts: ['stub choice'] });
  });

  it('treats moderation-blocked prose as a failed attempt', async () => {
    // 'gore' is in moderate()'s BANNED_TERMS (see moderate.ts). Both attempts blocked → fallback.
    const blocked = { prose: 'blood and gore everywhere', choiceTexts: ['ok'] };
    const r = await generateEvent(createFakeProvider([blocked, blocked]), params);
    expect(r.fallback).toBe(true);
  });

  it('falls back immediately with no network call when the provider is unavailable', async () => {
    let called = false;
    const dead: AIProvider = { available: false, async generateStructured() { called = true; return {}; } };
    const r = await generateEvent(dead, params);
    expect(r.fallback).toBe(true);
    expect(r.attempts).toBe(0);
    expect(called).toBe(false);
    expect(r.overlay).toEqual({ prose: 'stub prose', choiceTexts: ['stub choice'] });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest server/ai/eventGen.test.ts`
Expected: FAIL — `./eventGen` does not exist.

- [ ] **Step 3: Implement the orchestrator**

Create `server/ai/eventGen.ts`:

```ts
import { AIProvider } from './provider';
import { EventOverlaySchema, EVENT_OVERLAY_JSON_SCHEMA } from './schema';
import { buildEventPrompt } from './prompt';
import { moderate } from './moderate';
import { GameRoute, StoryNode, LiveOverlay, ValidationError } from '../../shared/types';

export interface EventParams {
  stub: StoryNode;       // the source:'live' node to enrich
  route: GameRoute;      // for title/tone
  ragText: string;       // retrieved novel context ('' when no RAG available)
  pathSummary: string;   // recent choiceLog + reputation, formatted by the caller
}

export interface EventResult { overlay: LiveOverlay; fallback: boolean; attempts: number; }

/** The stub's own text, used as the safe fallback when generation fails or no key is set. */
function stubAsOverlay(stub: StoryNode): LiveOverlay {
  return { prose: stub.prose, choiceTexts: stub.choices.map((c) => c.text) };
}

/**
 * Enrich ONE live node via Flash. Loops prompt → provider → Zod parse → exact
 * choice-count check → moderation, feeding errors back, up to maxAttempts. On
 * exhaustion or an unavailable provider, returns the stub text with fallback:true.
 * Everything except the provider call is pure → fully tested with FakeProvider.
 */
export async function generateEvent(
  provider: AIProvider,
  params: EventParams,
  opts: { maxAttempts?: number } = {},
): Promise<EventResult> {
  const { stub } = params;
  if (!provider.available) return { overlay: stubAsOverlay(stub), fallback: true, attempts: 0 };

  const maxAttempts = opts.maxAttempts ?? 2;
  let lastErrors: ValidationError[] = [];
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const prompt = buildEventPrompt(stub, params.route, params.ragText, params.pathSummary, lastErrors.length ? lastErrors : undefined);
    const raw = await provider.generateStructured(prompt, EVENT_OVERLAY_JSON_SCHEMA, { model: 'flash' });

    // Shape layer.
    const parsed = EventOverlaySchema.safeParse(raw);
    if (!parsed.success) {
      lastErrors = parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: 'BAD_SHAPE' as const, message: i.message }));
      continue;
    }

    // Referential layer: one choice text per existing choice, same order.
    if (parsed.data.choiceTexts.length !== stub.choices.length) {
      lastErrors = [{
        path: 'choiceTexts', code: 'BAD_SHAPE',
        message: `expected ${stub.choices.length} choiceTexts, got ${parsed.data.choiceTexts.length}`,
      }];
      continue;
    }

    // Moderation layer.
    const blocked: ValidationError[] = [];
    const mp = moderate(parsed.data.prose);
    if (!mp.ok) blocked.push({ path: 'prose', code: 'BAD_SHAPE', message: `moderation: ${mp.reason}` });
    parsed.data.choiceTexts.forEach((t, i) => {
      const mc = moderate(t);
      if (!mc.ok) blocked.push({ path: `choiceTexts.${i}`, code: 'BAD_SHAPE', message: `moderation: ${mc.reason}` });
    });
    if (blocked.length) { lastErrors = blocked; continue; }

    return { overlay: { prose: parsed.data.prose, choiceTexts: parsed.data.choiceTexts }, fallback: false, attempts };
  }

  return { overlay: stubAsOverlay(stub), fallback: true, attempts };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest server/ai/eventGen.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/ai/eventGen.ts server/ai/eventGen.test.ts
git commit -m "feat(ai): add generateEvent live event-gen orchestrator with stub fallback"
```

---

### Task 6: `RouteStore.setNodeSource`

**Files:**
- Modify: `server/store/RouteStore.ts`
- Modify: `server/store/memoryRouteStore.ts`
- Modify: `server/store/pgRouteStore.ts`
- Test: `server/store/routeStore.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/store/routeStore.test.ts` (inside the existing `describe`, or a new one). It uses the memory store; mirror however the file currently builds a bundle — this example builds one inline:

```ts
import { createMemoryRouteStore } from './memoryRouteStore';
import { RouteBundle } from '../../shared/types';

function bundle(): RouteBundle {
  return {
    route: {
      id: 'rt', title: 'T', sourceNovelId: 'adhoc',
      acts: [{ id: 'a', title: 'A', nodeIds: ['n1'] }],
      itemPool: [], enemyPool: [], endings: [{ id: 'e', title: 'E', condition: 'currentNodeId === n1' }],
      status: 'draft',
    },
    nodes: { n1: { id: 'n1', source: 'pregen', prose: 'p', choices: [] } },
  };
}

describe('RouteStore.setNodeSource', () => {
  it('flips a node source and persists it', async () => {
    const store = createMemoryRouteStore([bundle()]);
    await store.setNodeSource('rt', 'n1', 'live');
    const got = await store.get('rt');
    expect(got!.nodes.n1.source).toBe('live');
    await store.setNodeSource('rt', 'n1', 'pregen');
    expect((await store.get('rt'))!.nodes.n1.source).toBe('pregen');
  });
  it('throws for an unknown route', async () => {
    const store = createMemoryRouteStore([bundle()]);
    await expect(store.setNodeSource('ghost', 'n1', 'live')).rejects.toThrow();
  });
  it('throws for an unknown node', async () => {
    const store = createMemoryRouteStore([bundle()]);
    await expect(store.setNodeSource('rt', 'ghost', 'live')).rejects.toThrow();
  });
});
```

(Merge duplicate imports with whatever the file already imports.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest server/store/routeStore.test.ts`
Expected: FAIL — `setNodeSource` is not a function / not on the interface.

- [ ] **Step 3: Add `setNodeSource` to the interface**

In `server/store/RouteStore.ts`, add the method to the `RouteStore` interface:

```ts
export interface RouteStore {
  create(bundle: RouteBundle): Promise<string>;   // returns the route id (bundle.route.id)
  get(id: string): Promise<RouteBundle | null>;
  list(): Promise<RouteSummary[]>;
  publish(id: string): Promise<void>;             // flips route.status → 'published'; throws if missing
  setNodeSource(routeId: string, nodeId: string, source: 'live' | 'pregen'): Promise<void>; // throws if route/node missing
}
```

- [ ] **Step 4: Implement it in the memory store**

In `server/store/memoryRouteStore.ts`, add this method inside the returned object (after `publish`):

```ts
    async setNodeSource(routeId: string, nodeId: string, source: 'live' | 'pregen'): Promise<void> {
      const found = map.get(routeId);
      if (!found) throw new Error(`route ${routeId} not found`);
      const updated = structuredClone(found);
      if (!updated.nodes[nodeId]) throw new Error(`node ${nodeId} not found in route ${routeId}`);
      updated.nodes[nodeId].source = source;
      map.set(routeId, updated);
    },
```

- [ ] **Step 5: Implement it in the pg store**

In `server/store/pgRouteStore.ts`, add this method inside the returned object (after `publish`):

```ts
    async setNodeSource(routeId: string, nodeId: string, source: 'live' | 'pregen'): Promise<void> {
      const rows = await db.select().from(gameRoutes).where(eq(gameRoutes.id, routeId));
      if (!rows[0]) throw new Error(`route ${routeId} not found`);
      const bundle = rows[0].bundle as RouteBundle;
      if (!bundle.nodes[nodeId]) throw new Error(`node ${nodeId} not found in route ${routeId}`);
      bundle.nodes[nodeId].source = source;
      await db.update(gameRoutes).set({ bundle }).where(eq(gameRoutes.id, routeId));
    },
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest server/store/routeStore.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/store/RouteStore.ts server/store/memoryRouteStore.ts server/store/pgRouteStore.ts server/store/routeStore.test.ts
git commit -m "feat(store): RouteStore.setNodeSource for toggling node live/pregen"
```

---

### Task 7: Session enrichment of live nodes

**Files:**
- Modify: `server/session.ts`
- Test: `server/session.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/session.test.ts`:

```ts
import { createFakeProvider, AIProvider } from './ai/provider';

function liveBundle(): RouteBundle {
  return {
    route: {
      id: 'live-route', title: 'Live', sourceNovelId: 'adhoc',
      acts: [{ id: 'a1', title: 'A', nodeIds: ['s1', 's2'] }],
      itemPool: [], enemyPool: [], endings: [{ id: 'e', title: 'E', condition: 'currentNodeId === s2' }],
      status: 'published',
    },
    nodes: {
      s1: { id: 's1', source: 'live', prose: 'stub prose', choices: [{ id: 'go', text: 'stub choice', nextNodeId: 's2' }] },
      s2: { id: 's2', source: 'pregen', prose: 'the end', choices: [] },
    },
  };
}

function liveSession(provider: AIProvider) {
  return createGameSession(createMemoryStore(), {
    backgrounds: BACKGROUNDS, itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB,
    routes: createMemoryRouteStore([liveBundle()]), provider,
  });
}

describe('GameSession live event-gen', () => {
  it('enriches a live node, overlays prose + choice text, and caches it', async () => {
    const overlay = { prose: 'rich prose', choiceTexts: ['rich choice'] };
    const s = liveSession(createFakeProvider([overlay])); // queue has exactly ONE response
    const res = await s.newGame('rogue', 'live-route');
    expect(res.node.prose).toBe('rich prose');
    expect(res.node.choices[0].text).toBe('rich choice');
    expect(res.save.liveNodes!['s1']).toEqual(overlay);

    // Second view must serve the cache WITHOUT a second provider call. If it called
    // again, FakeProvider's queue (now empty) would throw — so this also asserts no re-call.
    const again = await s.getView(res.sessionId);
    expect(again.node.prose).toBe('rich prose');
  });

  it('falls back to stub text and does not cache when generation fails', async () => {
    const s = liveSession(createFakeProvider([{}, {}])); // both attempts bad shape (maxAttempts 2)
    const res = await s.newGame('rogue', 'live-route');
    expect(res.node.prose).toBe('stub prose');
    expect(res.node.choices[0].text).toBe('stub choice');
    expect(res.save.liveNodes).toBeUndefined();
  });

  it('serves stub text when no provider is configured', async () => {
    const s = createGameSession(createMemoryStore(), {
      backgrounds: BACKGROUNDS, itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB,
      routes: createMemoryRouteStore([liveBundle()]),
    });
    const res = await s.newGame('rogue', 'live-route');
    expect(res.node.prose).toBe('stub prose');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest server/session.test.ts`
Expected: FAIL — live node still serves `'stub prose'` in the first test (no enrichment yet); `provider` not a known dep.

- [ ] **Step 3: Add deps, imports, and helpers**

In `server/session.ts`:

(a) Extend the imports. Add `LiveOverlay` to the `shared/types` import (line 1-3) and add these import lines near the other store/ai imports:

```ts
import { AIProvider } from './ai/provider';
import { EmbeddingProvider } from './rag/embeddingProvider';
import { EmbeddingStore } from './rag/novelStore';
import { retrieveContext } from './rag/retrieve';
import { generateEvent } from './ai/eventGen';
```

(b) Add three optional fields to `SessionDeps`:

```ts
export interface SessionDeps {
  backgrounds: Record<string, Background>;
  itemDb: Record<string, Item>;
  skillDb: Record<string, Skill>;
  enemyDb: Record<string, Enemy>;
  routes: RouteStore;
  random?: () => number;
  provider?: AIProvider;          // absent / unavailable → live nodes serve stub text
  embedder?: EmbeddingProvider;
  embeddings?: EmbeddingStore;
}
```

(c) Inside `createGameSession`, add a `materializeNode` helper and update `view()` to use it. Replace the existing `view` function with:

```ts
  function materializeNode(node: StoryNode, overlay?: LiveOverlay): StoryNode {
    if (!overlay) return node;
    return {
      ...node,
      prose: overlay.prose,
      choices: node.choices.map((c, i) => ({ ...c, text: overlay.choiceTexts[i] ?? c.text })),
    };
  }

  function view(save: SaveState, bundle: RouteBundle): SessionView {
    const raw = bundle.nodes[save.currentNodeId];
    if (!raw) throw new GameError(`Node ${save.currentNodeId} not found`, 500);
    const node = materializeNode(raw, save.liveNodes?.[save.currentNodeId]);
    return {
      save,
      node,
      effectiveStats: effectiveStats(save.character, deps.itemDb),
      ending: computeEnding(save, bundle.route),
    };
  }
```

(d) Add `formatPathSummary` and `enrich` helpers (place after `view`):

```ts
  function formatPathSummary(save: SaveState): string {
    const recent = save.choiceLog.slice(-3).map((c) => `${c.nodeId}:${c.choiceId}`).join(', ') || '(none yet)';
    const rep = save.reputation;
    const factions = Object.entries(rep.factions).map(([k, v]) => `${k}=${v}`).join(', ') || 'none';
    return `Recent choices: ${recent}. Reputation hero=${rep.hero}, villain=${rep.villain}, factions: ${factions}.`;
  }

  // Fill a live node on arrival: generate once, cache in save.liveNodes, persist.
  // Never throws — any failure degrades to the stub text.
  async function enrich(id: string, save: SaveState, bundle: RouteBundle): Promise<void> {
    const nodeId = save.currentNodeId;
    const node = bundle.nodes[nodeId];
    if (!node || node.source !== 'live') return;
    if (save.liveNodes?.[nodeId]) return;
    const provider = deps.provider;
    if (!provider || !provider.available) return;
    try {
      let ragText = '';
      if (deps.embedder?.available && deps.embeddings) {
        ragText = await retrieveContext(
          { embedder: deps.embedder, embeddings: deps.embeddings },
          { query: node.prose, novelId: bundle.route.sourceNovelId },
        );
      }
      const { overlay, fallback } = await generateEvent(provider, {
        stub: node, route: bundle.route, ragText, pathSummary: formatPathSummary(save),
      });
      if (!fallback) {
        save.liveNodes = { ...(save.liveNodes ?? {}), [nodeId]: overlay };
        await store.put(id, save);
      }
    } catch {
      // swallow — serve the stub text
    }
  }
```

- [ ] **Step 4: Call `enrich` before each returned view**

In `server/session.ts`, add `await enrich(...)` in the four progress-advancing methods (NOT the defeat path):

`newGame` — before the return:
```ts
      const sessionId = await store.create(save);
      await enrich(sessionId, save, bundle);
      return { sessionId, ...view(save, bundle) };
```

`getView`:
```ts
    async getView(id) {
      const save = await load(id);
      const bundle = await loadBundle(save.routeId);
      await enrich(id, save, bundle);
      return withNextRoute(view(save, bundle));
    },
```

`continueToNextRoute` — after `await store.put(id, save);`:
```ts
      await store.put(id, save);
      await enrich(id, save, bundle);
      return view(save, bundle);
```

`applyChoice` — add `await enrich(id, res.save, bundle);` immediately after each `await store.put(id, res.save);` in the three persisting paths (skill-check, combat-win, plain advance). Example for the plain path:
```ts
      const res = resolveChoice(save, node, choiceId);
      await store.put(id, res.save);
      await enrich(id, res.save, bundle);
      return withNextRoute(view(res.save, bundle));
```
Do the same in the skill-check path (before its `return withNextRoute({ ...view(res.save, bundle), checkPassed: res.checkPassed, roll: res.roll })`) and the combat-win path (after `await store.put(id, res.save);`, before `return withNextRoute({ ...view(res.save, bundle), combat })`). **Leave the defeat branch untouched** — it does not persist progress.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest server/session.test.ts`
Expected: PASS — new live-gen tests pass and all pre-existing session tests stay green (default deps have no provider → enrich no-ops).

- [ ] **Step 6: Commit**

```bash
git add server/session.ts server/session.test.ts
git commit -m "feat(server): session enriches live nodes via generateEvent, caches per-save"
```

---

### Task 8: REST endpoint to mark a node live + wire session provider in tests

**Files:**
- Modify: `server/api.ts` (after the publish route, ~line 162)
- Modify: `server/api.test.ts` (the `app()` helper + new tests)
- Test: `server/api.test.ts`

- [ ] **Step 1: Wire the test `app()` helper to pass provider/embedder/embeddings into the session**

In `server/api.test.ts`, replace the `app()` helper (lines ~15-30) with one that builds the RAG stores first and passes the provider + embedder + embeddings into the session too:

```ts
function app(
  provider: AIProvider = createFakeProvider([]),
  embedder: EmbeddingProvider = createFakeEmbedder(),
) {
  const routes = createMemoryRouteStore([structuredClone(SAMPLE_BUNDLE)]);
  const { novels, embeddings } = createMemoryNovelStore();
  const session = createGameSession(createMemoryStore(), {
    backgrounds: BACKGROUNDS, itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB,
    routes, provider, embedder, embeddings,
  });
  return createApp(session, {
    provider, routes,
    registries: { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB },
    auth: createAuth(ADMIN),
    novels, embeddings, embedder,
  });
}
```

- [ ] **Step 2: Write the failing tests**

Append to `server/api.test.ts` a new `describe` (the existing `token()` / `ADMIN` helpers are in scope):

```ts
describe('POST /admin/routes/:id/nodes/:nodeId/source', () => {
  it('flips a node source and is reflected in the route', async () => {
    const a = app();
    const t = await token(a);
    const auth = { Authorization: `Bearer ${t}` };
    const res = await request(a).post('/admin/routes/demo-route/nodes/n3/source').set(auth).send({ source: 'live' });
    expect(res.status).toBe(204);
    const got = await request(a).get('/admin/routes/demo-route').set(auth);
    expect(got.body.nodes.n3.source).toBe('live');
  });

  it('rejects a bad source value with 400', async () => {
    const a = app();
    const t = await token(a);
    const res = await request(a).post('/admin/routes/demo-route/nodes/n3/source').set('Authorization', `Bearer ${t}`).send({ source: 'nope' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown node', async () => {
    const a = app();
    const t = await token(a);
    const res = await request(a).post('/admin/routes/demo-route/nodes/ghost/source').set('Authorization', `Bearer ${t}`).send({ source: 'live' });
    expect(res.status).toBe(404);
  });

  it('requires auth', async () => {
    const res = await request(app()).post('/admin/routes/demo-route/nodes/n3/source').send({ source: 'live' });
    expect(res.status).toBe(401);
  });

  it('end-to-end: mark a node live → player sees Flash-enriched prose', async () => {
    // demo-route n3 is terminal (0 choices) → overlay has 0 choiceTexts.
    const a = app(createFakeProvider([{ prose: 'a generated ending', choiceTexts: [] }]));
    const t = await token(a);
    const auth = { Authorization: `Bearer ${t}` };
    await request(a).post('/admin/routes/demo-route/nodes/n3/source').set(auth).send({ source: 'live' });

    const created = await request(a).post('/sessions').send({ backgroundId: 'rogue' });
    const id = created.body.sessionId;
    const choice = await request(a).post(`/sessions/${id}/choice`).send({ choiceId: 'sneak' }); // n1 → n3
    expect(choice.status).toBe(200);
    expect(choice.body.save.currentNodeId).toBe('n3');
    expect(choice.body.node.prose).toBe('a generated ending');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest server/api.test.ts`
Expected: FAIL — the route returns 404 (not defined) for the source endpoint; e2e prose is the stub text.

- [ ] **Step 4: Add the endpoint**

In `server/api.ts`, add this route immediately after the publish handler (after line ~162, before the centralised error handler). It sits under `app.use('/admin/routes', requireAuth(...))`, so it is already auth-guarded:

```ts
  app.post('/admin/routes/:id/nodes/:nodeId/source', wrap(async (req, res) => {
    const id = req.params.id as string;
    const nodeId = req.params.nodeId as string;
    const source = req.body?.source;
    if (source !== 'live' && source !== 'pregen') {
      throw new GameError('source must be "live" or "pregen"', 400);
    }
    const bundle = await admin.routes.get(id);
    if (!bundle) throw new GameError(`Route ${id} not found`, 404);
    if (!bundle.nodes[nodeId]) throw new GameError(`Node ${nodeId} not found in route ${id}`, 404);
    await admin.routes.setNodeSource(id, nodeId, source);
    res.status(204).end();
    return undefined;
  }));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest server/api.test.ts`
Expected: PASS (all 5 new tests + existing suite green).

- [ ] **Step 6: Commit**

```bash
git add server/api.ts server/api.test.ts
git commit -m "feat(api): POST /admin/routes/:id/nodes/:nodeId/source + wire session provider in tests"
```

---

### Task 9: Admin console — per-node live/pregen toggle

**Files:**
- Modify: `server/admin/index.html`

This satisfies the project rule "admin endpoint ⇒ admin console form." No Jest (static HTML); verified manually in Step 4.

- [ ] **Step 1: Add the DOM containers**

In `server/admin/index.html`, inside the "Routes" card, replace line 94 (`<pre id="viewOut" class="hidden"></pre>`) with:

```html
        <pre id="viewOut" class="hidden"></pre>
        <div id="nodeMsg" class="msg"></div>
        <div id="nodesOut" class="hidden"></div>
```

- [ ] **Step 2: Render node toggles in `viewRoute` and add `setNodeSource`**

In `server/admin/index.html`, replace the `viewRoute` function (lines ~180-184) with:

```js
    async function viewRoute(id) {
      const bundle = await api('/admin/routes/' + id, { headers: authHeaders() });
      const out = $('viewOut'); out.classList.remove('hidden');
      out.textContent = JSON.stringify(bundle, null, 2);
      renderNodes(id, bundle);
    }

    function renderNodes(routeId, bundle) {
      const box = $('nodesOut'); box.classList.remove('hidden'); box.innerHTML = '';
      const h = document.createElement('h3');
      h.style.fontSize = '13px'; h.textContent = 'Nodes — toggle live AI generation';
      box.appendChild(h);
      for (const nid of Object.keys(bundle.nodes)) {
        const node = bundle.nodes[nid];
        const row = document.createElement('div'); row.style.margin = '6px 0';
        const label = document.createElement('span');
        label.textContent = nid + '  [' + node.source + ']  ';
        row.appendChild(label);
        const next = node.source === 'live' ? 'pregen' : 'live';
        const btn = document.createElement('button');
        btn.className = 'secondary'; btn.textContent = 'Mark ' + next;
        btn.onclick = () => setNodeSource(routeId, nid, next);
        row.appendChild(btn);
        box.appendChild(row);
      }
    }

    async function setNodeSource(routeId, nodeId, source) {
      const msg = $('nodeMsg'); msg.className = 'msg'; msg.textContent = '';
      try {
        await api('/admin/routes/' + routeId + '/nodes/' + nodeId + '/source', {
          method: 'POST', headers: authHeaders(), body: JSON.stringify({ source }),
        });
        msg.className = 'msg ok'; msg.textContent = nodeId + ' → ' + source;
        await viewRoute(routeId); // refresh node list + JSON
      } catch (e) {
        msg.className = 'msg err';
        msg.textContent = e.status === 404 ? 'Route or node not found.' : ('Error: ' + e.message);
      }
    }
```

- [ ] **Step 3: Typecheck the server (no behaviour change to TS, but confirm nothing else broke)**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 4: Manual smoke (you, not Jest)**

Start the server (`npm run dev:server`), open `http://localhost:3000/admin`, log in, generate or pick a draft route, click **View JSON**, confirm a node list with **Mark live / Mark pregen** buttons appears, click one, confirm the success message and that the node's `[source]` flips on refresh.

- [ ] **Step 5: Commit**

```bash
git add server/admin/index.html
git commit -m "feat(admin): per-node live/pregen toggle in route detail view"
```

---

### Task 10: Wire the player session to the real provider + final verification

**Files:**
- Modify: `server/index.ts:32-34`

- [ ] **Step 1: Pass provider/embedder/embeddings into the production session**

In `server/index.ts`, replace the `createGameSession` call (lines 32-34) with:

```ts
const session = createGameSession(saves, {
  backgrounds: BACKGROUNDS, itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB, routes,
  provider, embedder, embeddings,
});
```

(`provider`, `embedder`, and `embeddings` are all already constructed above this line.)

- [ ] **Step 2: Typecheck the whole server + shared**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: Typecheck the client (no client changes, but confirm shared types still satisfy it)**

Run: `cd client && npx tsc --noEmit && cd ..`
Expected: EXIT 0.

- [ ] **Step 4: Run the full test suite**

Run: `npx jest`
Expected: PASS — all suites green (187 prior + the new eventGen/schema/prompt/routeStore/session/api tests).

- [ ] **Step 5: Commit**

```bash
git add server/index.ts
git commit -m "feat(server): wire player session to provider + RAG for live event-gen"
```

- [ ] **Step 6: Manual end-to-end smoke (you, not Jest) — requires GEMINI_API_KEY**

With a real key in `.env`: upload a novel, generate + (in the console) mark one or two nodes `live`, publish, then play in the browser client. Confirm the live nodes show richer, novel-grounded prose and that choices behave exactly as the stub defined (same destinations). Remove the key and replay: confirm the game still runs, serving stub text on those nodes.

---

## Self-Review

**Spec coverage:**
- §2 LiveOverlay + SaveState.liveNodes + version bump → Task 1.
- §7 provider model option → Task 2; §3.1 EventOverlaySchema → Task 3; §3.2 buildEventPrompt → Task 4; §4 generateEvent (retry, count check, moderation, unavailable, fallback) → Task 5.
- §6.1 RouteStore.setNodeSource (memory + pg) → Task 6; §6.2 POST endpoint → Task 8; §6.3 admin console toggle → Task 9.
- §5 session materialize + enrich + wiring → Task 7; §7 production wiring → Task 10.
- §8 test strategy → covered across Tasks 1-8 (deterministic, FakeProvider); manual smokes in Tasks 9-10.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The moderation test uses the real banned term `'gore'` from `server/ai/moderate.ts`.

**Type consistency:** `LiveOverlay { prose, choiceTexts }` used identically in types, schema parse result, eventGen, session, and tests. `generateEvent(provider, params, opts?)` → `{ overlay, fallback, attempts }` consistent between Task 5 impl and Task 7 caller. `setNodeSource(routeId, nodeId, source)` identical across interface, both stores, the API handler, and tests. Endpoint path `/admin/routes/:id/nodes/:nodeId/source` identical in api.ts, api.test.ts, and admin/index.html.
