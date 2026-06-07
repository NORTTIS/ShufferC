# Sub-project C (slice C1): AI Framework Generation — Design Doc

> Part of **Life in Adventure: AI Chronicles**. Parent design: `2026-06-05-life-in-adventure-ai-chronicles-design.md` §4 (Pipeline AI).
> Goal: academic / learning project — prioritise completeness + clear architecture over cost/scale.
> Date: 2026-06-07.
> Depends on: Sub-project A (engine core) + Sub-project B (vertical slice) — both complete.

---

## 0. Scope & decision log

Sub-project C as specced (§4 of the parent) is **four subsystems**: RAG ingest · framework-gen · live event-gen · `moderate()`. That is too large for one spec/plan, so — exactly as Sub-project B was sliced — C is sliced. **This document covers slice C1 only.**

| # | Decision | Choice |
|---|----------|--------|
| 1 | First C slice | **Framework-gen core, fake-first.** `AIProvider` interface + `FakeProvider` + real `GeminiProvider` + structured output + pure content validator + `frameworkGen` orchestrator + in-memory `RouteStore`. |
| 2 | Slice boundary ("done") | **Full vertical slice:** generate → validate → store → **playable**. A generated+published route is loadable by B's `GameSession` and playable end-to-end through the existing client. |
| 3 | Validation mechanism | **Zod** for the shape layer (single source → Gemini `responseSchema` + parse + TS types) + a **pure referential validator** in `shared/` (dep-free, deterministic). Engine `shared/` stays Zod-free. |
| 4 | Gemini | **Implement real `GeminiProvider` now**, behind config. Server boots fine **without** an API key (provider reports `available:false`; gen endpoints return 503). Unit tests never touch the network. |
| 5 | Generated route richness | **Full playable route:** 1 act, 3–6 nodes, choices wired into a reachable graph, optional `skillCheck` + optional `combat` (registry enemy ids), ≥1 reachable+terminal ending. |
| 6 | `moderate()` | **Include minimal no-op slot now** (no-op + tiny banned-word list), run over generated prose. Real Gemini safety plugs in later. |
| 7 | RAG / context source | **Plain text** passed in the generate request. **No RAG / no vector store / no Supabase in C1** — that is slice C2. |
| 8 | Live event-gen | **Out of scope** (slice C3). Depends on a published framework existing first. |
| 9 | Admin auth | **None yet.** Admin endpoints are unauthenticated; auth (Supabase role) is Sub-project D. Flagged, not built. |

**Invariants carried over (must not violate):** env only in `server/config.ts`; shared types only in `shared/`; one REST layer; pure logic (engine + validator) free of I/O/DB/AI deps; focused files.

---

## 1. Architecture & file map

Layered services. Each unit one job, testable in isolation with `FakeProvider` + fixture registries. Mirrors B's `SaveStore` pattern.

```
shared/
  types.ts            # MODIFY: add RouteBundle, GenerationParams, Registries,
                      #         ValidationError, ValidationCode, GenerationResult
  validation.ts       # NEW: pure validateRouteBundle(bundle, registries) → ValidationError[]
  fixtures.ts         # MODIFY: add SAMPLE_BUNDLE = { route: SAMPLE_ROUTE, nodes: SAMPLE_NODES }
server/
  config.ts           # MODIFY: add gemini { apiKey, proModel, flashModel }
  ai/
    provider.ts       # NEW: AIProvider interface + createFakeProvider(responses[])
    gemini.ts         # NEW: createGeminiProvider(cfg) — real SDK, behind config
    schema.ts         # NEW: Zod RouteBundleSchema + ROUTE_BUNDLE_JSON_SCHEMA
    prompt.ts         # NEW: buildFrameworkPrompt(params, registries, lastErrors?)
    moderate.ts       # NEW: moderate(text) → { ok } | { ok:false, reason }
    frameworkGen.ts   # NEW: generateFramework(provider, params, reg, opts?) → GenerationResult
  store/
    RouteStore.ts     # NEW: RouteStore interface + RouteSummary
    memoryRouteStore.ts # NEW: createMemoryRouteStore(seed?)
  session.ts          # MODIFY: resolve route+nodes per save.routeId from RouteStore
  api.ts              # MODIFY: add admin routes (generate/list/get/publish)
  index.ts            # MODIFY: pick Gemini or Fake provider by config; wire RouteStore
```

**New deps (server `dependencies`):** `@google/generative-ai`, `zod`, `zod-to-json-schema`.

---

## 2. Data shapes (additive to `shared/types.ts`)

No existing type changes — all reuse `GameRoute` / `StoryNode` / `Item` / `Skill` / `Enemy` verbatim.

```ts
// The unit frameworkGen produces and RouteStore holds = route + its nodes together.
export interface RouteBundle {
  route: GameRoute;                    // existing; .status carries draft|published
  nodes: Record<string, StoryNode>;    // existing StoryNode
}

export interface GenerationParams {
  contextText: string;                 // novel excerpt, plain text (no RAG yet)
  title: string;                       // desired route title
  nodeCount?: number;                  // target 3–6, default 4
  sourceNovelId?: string;              // provenance tag, default 'adhoc'
}

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

// Note: a skill-ref code is deliberately omitted — C1 generates no skill
// references (enemies/skills are referenced by registry id only, never authored
// by the model), so there is nothing to trip it. It returns in a later slice if
// generated content ever lists skills directly.

export interface ValidationError { path: string; code: ValidationCode; message: string; }

export type GenerationResult =
  | { ok: true;  bundle: RouteBundle; attempts: number }
  | { ok: false; errors: ValidationError[]; attempts: number; lastRaw?: unknown };
```

Endings keep the existing free-form `condition: string`, but the validator **constrains generated endings** to the engine-supported form `currentNodeId === <id>` (the regex `computeEnding` already uses) → engine unchanged, endings still fire.

---

## 3. Validation rules — `shared/validation.ts`

Pure, dep-free, deterministic. Registries injected (no import of fixtures). Runs **after** Zod shape-parse (structure already well-formed; this is the semantic/referential layer).

```ts
export function validateRouteBundle(b: RouteBundle, reg: Registries): ValidationError[]
```

Returns `[]` when valid. Checks, in order:

1. **Non-empty** — `acts` non-empty, `acts[0].nodeIds` non-empty, ≥1 node in `nodes` → else `EMPTY_ROUTE`.
2. **Node-graph integrity**
   - every id in `acts[].nodeIds` exists as a key in `nodes` → else `DANGLING_NODE_REF`
   - every `choice.nextNodeId` (when present) exists in `nodes` → else `DANGLING_NODE_REF`
3. **Reference safety (core AI guard)**
   - every `node.combat.enemyIds[]` ∈ `reg.enemyDb` → else `UNKNOWN_ENEMY`
   - every `choice.skillCheck.stat` ∈ `STAT_KEYS` → else `BAD_SHAPE`
   - every `outcome.addItems[]` / `outcome.removeItems[]` ∈ `reg.itemDb` → else `UNKNOWN_ITEM_REF`
   - `route.enemyPool[]` ⊂ `reg.enemyDb` → else `UNKNOWN_ENEMY`; `route.itemPool[]` ⊂ `reg.itemDb` → else `UNKNOWN_ITEM_REF`
4. **Reachability** — BFS from `acts[0].nodeIds[0]`, following `choice.nextNodeId`. Any node key not reached → `UNREACHABLE_NODE`.
5. **Endings**
   - `route.endings` non-empty
   - each `condition` matches `/^currentNodeId === (\w+)$/` → else `BAD_ENDING_CONDITION`
   - ≥1 ending's target node is **reachable AND terminal** (empty `choices`) → else `NO_REACHABLE_ENDING`

Rationale: 2+3 enforce "AI never references something that doesn't exist"; 4+5 enforce "the route is actually completable". All pure graph/set logic → one test per code.

**Reuse:** B's session may call this as a cheap integrity gate when loading any route (optional follow-on, not required in C1).

---

## 4. Orchestration — `server/ai/`

### 4.1 Provider (`provider.ts`)
```ts
export interface AIProvider {
  readonly available: boolean;                                   // false when no API key
  generateStructured(prompt: string, jsonSchema: object): Promise<unknown>;  // parsed JSON; does NOT validate
}

export function createFakeProvider(responses: unknown[]): AIProvider;
//  available = true
//  generateStructured() ignores prompt/schema, returns responses.shift()
//  throws if queue empty (a test scripting bug must fail loudly)
```
The provider is deliberately dumb — no parse/validate/retry — so one `FakeProvider` can script `[invalid, valid]` to drive the retry path deterministically.

### 4.2 Schema (`schema.ts`)
Zod is the single source of shape truth:
```ts
export const RouteBundleSchema = z.object({ route: <GameRoute shape>, nodes: z.record(<StoryNode shape>) });
export type ParsedBundle = z.infer<typeof RouteBundleSchema>;     // === RouteBundle structurally
export const ROUTE_BUNDLE_JSON_SCHEMA = zodToJsonSchema(RouteBundleSchema);  // fed to Gemini responseSchema
```

### 4.3 Prompt (`prompt.ts`)
`buildFrameworkPrompt(params, reg, lastErrors?) → string`. System constraints: emit JSON only; ≤ `nodeCount` nodes; use **only** these enemy ids / item ids (enumerated from `reg`); every ending `condition` must be `currentNodeId === <terminalNodeId>`; at least one terminal node. On retry, append `lastErrors` so the model self-corrects. Then the `contextText`.

### 4.4 Moderate (`moderate.ts`)
```ts
export function moderate(text: string): { ok: true } | { ok: false; reason: string };
```
No-op default + tiny banned-word list. Run over every `node.prose`.

### 4.5 Orchestrator (`frameworkGen.ts`)
```ts
export async function generateFramework(
  provider: AIProvider, params: GenerationParams, reg: Registries,
  opts: { maxAttempts?: number } = {},
): Promise<GenerationResult>;     // maxAttempts default 3
```
Loop up to `maxAttempts`:
1. `prompt = buildFrameworkPrompt(params, reg, lastErrors)`
2. `raw = await provider.generateStructured(prompt, ROUTE_BUNDLE_JSON_SCHEMA)`
3. **Zod parse** `raw` → on failure record `BAD_SHAPE` errors, continue loop
4. **`validateRouteBundle`** (shared) → errors → record, continue loop
5. **moderate** each `node.prose` → blocked → push `{ path:'nodes.<id>.prose', code:'BAD_SHAPE', message:'moderation: '+reason }`, continue loop
6. all pass → set `route.status = 'draft'` → `return { ok:true, bundle, attempts }`

After `maxAttempts`: `return { ok:false, errors, attempts, lastRaw }`. Framework-gen is admin-in-loop, so failing is acceptable — **no fallback node** here (fallback belongs to live event-gen, slice C3).

Everything except the provider call is pure → retry/validation logic is tested with zero network.

---

## 5. Store + session wiring

### 5.1 RouteStore (`server/store/`)
```ts
export interface RouteSummary { id: string; title: string; status: 'draft' | 'published'; }
export interface RouteStore {
  create(bundle: RouteBundle): Promise<string>;   // returns route id (uses bundle.route.id)
  get(id: string): Promise<RouteBundle | null>;
  list(): Promise<RouteSummary[]>;
  publish(id: string): Promise<void>;             // flips route.status → 'published'; throws if missing
}
export function createMemoryRouteStore(seed?: RouteBundle[]): RouteStore;
```
`Map` + `structuredClone` on every read/write (same discipline as `memoryStore`).

### 5.2 Session refactor (`server/session.ts`)
Route/nodes become **per-save**, not fixed constants.

`SessionDeps`: **remove** `nodeDb` + `route`; **add** `routes: RouteStore`.
```ts
{ backgrounds, itemDb, skillDb, enemyDb, routes }
```
Add `async function loadBundle(routeId): Promise<RouteBundle>` (`routes.get` → 404 `GameError` if missing).

- **`newGame(backgroundId, routeId = SAMPLE_ROUTE.id)`** — gains `routeId` (defaulted for back-compat). Load bundle → reject if `route.status !== 'published'` (`409`) → `startNodeId = bundle.route.acts[0].nodeIds[0]` → build save with that `routeId`.
- **`getView` / `applyChoice`** — load save → `loadBundle(save.routeId)` → use `bundle.nodes` for node lookup, `bundle.route.endings` for ending. The 3-path `applyChoice` dispatch is otherwise **unchanged**.
- **`computeEnding(save, route)`** — takes the route arg now; regex match unchanged.

`DEFAULT_DEPS` seeds `createMemoryRouteStore([SAMPLE_BUNDLE])`.

### 5.3 Back-compat
- `shared/fixtures.ts`: add `SAMPLE_BUNDLE = { route: SAMPLE_ROUTE, nodes: SAMPLE_NODES }` (`SAMPLE_ROUTE.status` already `'published'`).
- `newGame(bg)` calls (existing B tests + client) still hit the demo route → all B tests stay green.

---

## 6. REST surface + config + Gemini

### 6.1 Config (`server/config.ts`)
```ts
export const config = {
  port: Number(process.env.PORT ?? 3000),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? null,        // null → provider unavailable
    proModel:   process.env.GEMINI_PRO_MODEL   ?? 'gemini-1.5-pro',
    flashModel: process.env.GEMINI_FLASH_MODEL ?? 'gemini-1.5-flash',
  },
};
```

### 6.2 Gemini provider (`server/ai/gemini.ts`)
`createGeminiProvider(cfg): AIProvider` — `available = !!cfg.apiKey`. If unavailable, `generateStructured` throws `GameError('AI provider unavailable', 503)` (never crashes boot). Uses `@google/generative-ai`, Pro model, `responseMimeType:'application/json'` + `responseSchema` = passed JSON schema. **Manual smoke-test only**, never in Jest.

### 6.3 Provider selection (`server/index.ts`)
```ts
const provider = config.gemini.apiKey ? createGeminiProvider(config.gemini) : createFakeProvider([...]);
```
Server boots with or without a key.

### 6.4 Admin REST (`server/api.ts`) — unauthenticated (auth deferred to D)
```
POST /admin/routes/generate     body {contextText, title, nodeCount?}
     → 200 {routeId, bundle}      generation ok → stored as draft
     → 422 {errors, attempts}     generation failed shape/validation after retries
     → 503                        provider unavailable
GET  /admin/routes               → 200 RouteSummary[]
GET  /admin/routes/:id           → 200 RouteBundle | 404
POST /admin/routes/:id/publish   → 204 | 404
```
Handlers thin: `generateFramework(provider, body, registries)` → on `ok` `routes.create(bundle)` → return id+bundle; on `!ok` → 422. The `GenerationResult` discriminant drives the status code. Central error handler maps `GameError.status`.

### 6.5 Player side
Unchanged except `newGame` accepts optional `routeId`. `client/src/services/api.ts` `gameApi.newGame(backgroundId, routeId?)` gains the optional arg; defaults keep the current UI working. **No new client screens in C1** (admin UI = D).

---

## 7. Test strategy

All deterministic, **zero network** (`FakeProvider` everywhere). Real Gemini = manual smoke only.

- **`shared/validation.test.ts`** — valid bundle → `[]`; **one test per `ValidationCode`** (unknown enemy/item ref, dangling `nextNodeId`, unreachable node, bad ending-condition format, no reachable+terminal ending, empty route); ending reachable-but-not-terminal → `NO_REACHABLE_ENDING`.
- **`server/ai/schema.test.ts`** — well-formed JSON parses; malformed → Zod error; `ROUTE_BUNDLE_JSON_SCHEMA` is a non-empty object.
- **`server/ai/moderate.test.ts`** — clean → `ok`; banned word → `ok:false` + reason.
- **`server/ai/frameworkGen.test.ts`** (orchestrator via FakeProvider):
  - `[validBundle]` → `ok:true`, `attempts:1`, `route.status==='draft'`
  - `[invalidRefBundle, validBundle]` → `ok:true`, `attempts:2` (retry, errors fed back)
  - `[badShape, invalidRef, stillBad]` (maxAttempts 3) → `ok:false`, errors populated, `attempts:3`
  - moderation block on prose counts as a failed attempt
- **`server/store/routeStore.test.ts`** — create→get round-trips with clone isolation; `list` summaries; `publish` flips status; `get` unknown → null.
- **`server/session.test.ts`** (extend) — seed a 2nd published bundle → `newGame(bg, otherId)` starts there; `newGame` on a **draft** route → 409; existing 14 B tests stay green (default routeId).
- **`server/api.test.ts`** (extend, supertest) — `POST /admin/routes/generate` (app wired to FakeProvider scripted valid) → 200 + routeId; `GET /admin/routes/:id` returns it; `publish` → 204; `POST /sessions {routeId}` plays it → **full e2e: AI-shaped route → playable**. Always-invalid script → 422 + errors. Provider-unavailable → 503.

**Manual (you, not Jest):** set `GEMINI_API_KEY` → `POST /admin/routes/generate` with real novel text → inspect draft → publish → play in browser client.

Coverage maps to the slice promise: validation tests = "AI can't reference junk"; frameworkGen tests = "retry/fail works"; api e2e = "generated route is actually playable".

---

## 8. Out of scope (later slices/sub-projects)

- **C2:** RAG ingest — chunk + embed + `VectorStore` interface (in-memory now, Supabase `pgvector` later) + retrieval feeding the prompt.
- **C3:** live event-gen (Gemini Flash, in-framework, retry → pre-written fallback node).
- **D:** Admin CMS UI + admin auth (Supabase role) over these endpoints.
- **E:** richer ending conditions, reputation-driven endings, AI epilogue, per-session seed randomisation, sprite/asset polish.
