# Sub-project C (slice C3): Live Event Generation — Design Doc

> Part of **ShufferC: AI Chronicles**. Parent design: `2026-06-05-life-in-adventure-ai-chronicles-design.md` §4 (Pipeline AI). Prior slices: C1 framework-gen (`2026-06-07-sub-project-c-framework-gen-design.md`), C2 RAG (`2026-06-08-rag-db-design.md`) — both complete.
> Goal: academic / learning project — prioritise completeness + clear architecture over cost/scale.
> Date: 2026-06-08.
> Depends on: A (engine), B (vertical slice), C1 (framework-gen), C2 (RAG) — all complete.

---

## 0. Scope & decision log

This is the **last C slice**. C1 generates a complete, validated, published route graph (pre-gen). C3 adds the *live* half of the §3 "Hybrid (C)" decision: within a published framework, **Gemini Flash enriches selected nodes at play time**, grounded in the source novel.

| # | Decision | Choice |
|---|----------|--------|
| 1 | Trigger model | **Stub nodes + enrichment.** Framework-gen still emits complete, validated nodes. Nodes the admin marks `source:'live'` get Flash-enriched on first visit. |
| 2 | What Flash authors | **Prose + choice display text only.** Mechanical structure (`nextNodeId` edges, `skillCheck`, `combat`, `outcome`) is fixed at framework time and never touched at runtime. |
| 3 | Cache | **Per-save overlay** `save.liveNodes`. Each playthrough gets its own enriched text; consistent within a save (no regeneration on revisit). |
| 4 | Fallback | **The stub's own pre-written text.** On retry-exhaustion or unavailable provider, serve the stub verbatim. No separate fallback node, no `brief` field. |
| 5 | Who marks a node live | **Admin toggles per node** on a draft route, via a new endpoint + console form (admin-in-loop; deterministic; satisfies the admin-endpoint⇒UI rule). |
| 6 | Prompt context | **Stub mộc text + recent path (choiceLog tail + reputation) + RAG novel chunks** (`retrieveContext` from C2, queried by the stub's prose). |
| 7 | Model | **Flash** for live-gen (vs Pro for framework). `AIProvider.generateStructured` gains an optional `{ model: 'pro' \| 'flash' }`, default `'pro'` (back-compat). |

**Invariants carried over (must not violate):** env only in `server/config.ts`; shared types only in `shared/`; one REST layer; pure logic (engine + validator + eventGen's non-IO parts) free of DB/network; admin endpoint ⇒ admin console form; focused files.

**Why this trigger model.** Keeps C1's validator guarantees 100% intact — every node is still complete and reachability/ending/registry-ref-checked at framework time, so the graph cannot break at runtime. The `source:'live'` field already exists on `StoryNode`. The stub doubles as seed (Flash's input) and safety net (fallback), collapsing three concerns into one.

---

## 1. Architecture & file map

```
shared/
  types.ts            # MODIFY: add LiveOverlay; add SaveState.liveNodes?
  constants.ts        # MODIFY: bump SAVE_VERSION
  fixtures.ts         # MODIFY: mark one SAMPLE_BUNDLE node source:'live' (test seam)
server/
  ai/
    provider.ts       # MODIFY: AIProvider.generateStructured gains opts?: { model }
                      #         FakeProvider ignores it (back-compat)
    gemini.ts         # MODIFY: pick proModel/flashModel from opts.model (default pro)
    schema.ts         # MODIFY: add EventOverlaySchema + EVENT_OVERLAY_JSON_SCHEMA
    prompt.ts         # MODIFY: add buildEventPrompt(...)
    eventGen.ts       # NEW: generateEvent(provider, params, opts?) → { overlay, fallback }
  store/
    RouteStore.ts     # MODIFY: add setNodeSource(routeId, nodeId, source)
    memoryRouteStore.ts # MODIFY: implement setNodeSource
    pgRouteStore.ts   # MODIFY: implement setNodeSource
  session.ts          # MODIFY: enrich live nodes; materialize overlay into served node
  api.ts              # MODIFY: PATCH /admin/routes/:id/nodes/:nodeId/source
  index.ts            # MODIFY: inject provider + embedder + embeddings into SessionDeps
  admin/index.html    # MODIFY: per-node live/pregen toggle in route-detail view
```

No new dependencies. Reuses `@google/generative-ai`, `zod`, the C2 RAG ports (`EmbeddingProvider`, `EmbeddingStore`, `retrieveContext`).

---

## 2. Data shapes (`shared/types.ts`)

`StoryNode` is **unchanged** — `source: 'pregen' | 'live'` already exists.

```ts
// The text Flash produces for one live node, overlaid onto the stub at view time.
export interface LiveOverlay {
  prose: string;
  choiceTexts: string[];   // length MUST equal the stub node's choices.length, same order
}

// SaveState gains:
export interface SaveState {
  // ...existing fields...
  liveNodes?: Record<string, LiveOverlay>;   // nodeId → enriched text (per playthrough)
}
```

`SAVE_VERSION` bumps (`1 → 2`). The save round-trip test updates to the new version; `liveNodes` is optional so older saves deserialize fine (absent ⇒ all nodes serve stub text).

---

## 3. Live overlay schema & prompt — `server/ai/`

### 3.1 Schema (`schema.ts`)
```ts
export const EventOverlaySchema = z.object({
  prose: z.string().min(1),
  choiceTexts: z.array(z.string().min(1)),
});
export const EVENT_OVERLAY_JSON_SCHEMA = /* zod→json, fed to Gemini responseSchema */;
```
Zod is the single shape source (same discipline as `GenBundleSchema`). The *exact-length* check (`choiceTexts.length === stub.choices.length`) is a **referential** rule enforced in `eventGen`, not in Zod (it depends on the stub).

### 3.2 Prompt (`prompt.ts`)
```ts
buildEventPrompt(stub: StoryNode, route: GameRoute, ragText: string,
                 pathSummary: string, lastErrors?: ValidationError[]): string
```
System constraints: emit JSON `{prose, choiceTexts}` only; `choiceTexts` MUST contain **exactly N entries** (N = `stub.choices.length`), one per existing choice in order; **enrich wording only — do not change a choice's meaning or what it leads to**; stay grounded in the provided novel context; keep a 13+ tone. Then: the stub's current prose + each choice's current text (the "beat" seed), `pathSummary`, the RAG `ragText`, and on retry the `lastErrors`.

---

## 4. Orchestrator — `server/ai/eventGen.ts`

```ts
export interface EventParams {
  stub: StoryNode;
  route: GameRoute;
  ragText: string;       // retrieved by the caller (session); '' when no RAG available
  pathSummary: string;   // recent choiceLog tail + reputation, formatted by caller
}
export interface EventResult { overlay: LiveOverlay; fallback: boolean; attempts: number; }

export async function generateEvent(
  provider: AIProvider, params: EventParams, opts: { maxAttempts?: number } = {},
): Promise<EventResult>;   // maxAttempts default 2
```

`stubAsOverlay(stub) = { prose: stub.prose, choiceTexts: stub.choices.map(c => c.text) }`.

If `!provider.available` → return `{ overlay: stubAsOverlay, fallback: true, attempts: 0 }` immediately (no network).

Otherwise loop up to `maxAttempts`:
1. `prompt = buildEventPrompt(stub, route, ragText, pathSummary, lastErrors)`
2. `raw = await provider.generateStructured(prompt, EVENT_OVERLAY_JSON_SCHEMA, { model: 'flash' })`
3. **Zod parse** → on failure record `BAD_SHAPE`, continue
4. **Referential**: `choiceTexts.length === stub.choices.length` and every entry non-empty → else record `BAD_SHAPE`, continue
5. **Moderate** `prose` and each `choiceText` → blocked → record, continue
6. all pass → `return { overlay, fallback: false, attempts }`

After `maxAttempts`: `return { overlay: stubAsOverlay, fallback: true, attempts }`.

Everything except the provider call is pure → fully tested with `FakeProvider`, zero network.

---

## 5. Session wiring — `server/session.ts`

`SessionDeps` gains three **optional** fields:
```ts
provider?: AIProvider;
embedder?: EmbeddingProvider;
embeddings?: EmbeddingStore;
```
Absent (or `provider.available === false`) ⇒ live nodes serve their stub text; the player flow never breaks and never 503s.

**Materialize** — apply an overlay onto a node without mutating the bundle:
```ts
function materializeNode(node: StoryNode, overlay?: LiveOverlay): StoryNode
// overlay present → { ...node, prose: overlay.prose,
//   choices: node.choices.map((c,i) => ({ ...c, text: overlay.choiceTexts[i] ?? c.text })) }
// edges, skillCheck, combat, outcome are preserved verbatim
```
`view()` calls `materializeNode(bundle.nodes[id], save.liveNodes?.[id])`.

**Enrich** — fill a live node on arrival:
```ts
async function enrich(save: SaveState, bundle: RouteBundle): Promise<void>
```
- Guard: node exists, `node.source === 'live'`, `!save.liveNodes?.[id]`, `deps.provider?.available`.
- `ragText`: if `embedder` + `embeddings` present → `retrieveContext({ embedder, embeddings }, { novelId: bundle.route.sourceNovelId, query: node.prose })` joined to text; else `''`.
- `pathSummary`: format the last few `choiceLog` entries + `reputation`.
- `const { overlay, fallback } = await generateEvent(deps.provider, { stub: node, route: bundle.route, ragText, pathSummary })`.
- If `!fallback` → `save.liveNodes = { ...save.liveNodes, [id]: overlay }` and **persist** (`store.put`). Fallback ⇒ do **not** write (a later visit retries when the model is healthy).

`getView`, `applyChoice`, `newGame`, `continueToNextRoute` call `await enrich(save, bundle)` before constructing the returned view. Defeat path (combat loss, no progress persisted) skips enrich.

`enrich` failure must never crash play: any thrown error is caught and treated as fallback (serve stub).

---

## 6. Admin: mark nodes live

### 6.1 RouteStore (`store/`)
```ts
setNodeSource(routeId: string, nodeId: string, source: 'live' | 'pregen'): Promise<void>;
// throws GameError(404) if route or node missing
```
Memory adapter mutates the cloned bundle; pg adapter updates the stored route JSON. (Routes are stored as a bundle/JSON blob today — the node lives inside it.)

### 6.2 REST (`api.ts`) — unauthenticated for now (admin auth handled separately in D)
```
PATCH /admin/routes/:id/nodes/:nodeId/source
      body { source: 'live' | 'pregen' }
      → 204            updated
      → 400            bad source value
      → 404            route or node not found
```
Thin handler → `routes.setNodeSource(...)`. Intended for **draft** routes (set before publish); not blocked on published, but the console surfaces it in the draft-review flow.

### 6.3 Admin console (`admin/index.html`) — required by the admin-endpoint⇒UI rule
In the existing route-detail view, render each node with its id + current `source` and a **toggle button** ("Mark live" / "Mark pregen") that calls the endpoint via `api()`/`authHeaders()`, shows a success/error message, and refreshes the node list. Matches the existing card / `loadX()`/`doX()` / 401→logout / 503-400 messaging style.

---

## 7. Config & provider selection

`config.gemini.flashModel` and `embedModel` already exist (C1/C2). No config change.

`server/index.ts`: the existing `provider`, `embedder`, and `embeddingStore` (already built for framework-gen + RAG) are passed into `SessionDeps` so the player session can enrich. With no API key, `provider.available === false` ⇒ live nodes serve stub text; the server still boots.

`AIProvider.generateStructured(prompt, schema, opts?)` — `opts.model` defaults to `'pro'`, so `frameworkGen` (which omits it) is unchanged; `eventGen` passes `{ model: 'flash' }`. `GeminiProvider` maps `'flash' → cfg.flashModel`, else `cfg.proModel`. `FakeProvider` ignores `opts`.

---

## 8. Test strategy

All deterministic, **zero network** (`FakeProvider`). Real Gemini = manual smoke only.

- **`server/ai/eventGen.test.ts`**
  - `[validOverlay]` (matching choiceTexts length) → `fallback:false`, `attempts:1`
  - `[badShape, validOverlay]` → retry → `fallback:false`, `attempts:2`
  - wrong `choiceTexts` length every attempt (maxAttempts 2) → `fallback:true`, overlay equals stub text
  - moderation-blocked prose → counts as failed attempt → fallback
  - provider `available:false` → `fallback:true`, `attempts:0`, no provider call
- **`server/ai/schema.test.ts`** (extend) — EventOverlay parses well-formed JSON; malformed → Zod error; `EVENT_OVERLAY_JSON_SCHEMA` non-empty.
- **`server/store/routeStore.test.ts`** (extend) — `setNodeSource` flips a node's `source`; unknown route/node → 404.
- **`server/session.test.ts`** (extend) — with a scripted FakeProvider: visiting a `source:'live'` node returns overlaid prose + choice texts and writes `save.liveNodes`; a second visit serves the cache **without** a further provider call; provider-unavailable / fallback → stub text served, `liveNodes` not written; existing tests stay green (no live nodes ⇒ identical behaviour).
- **`server/api.test.ts`** (extend, supertest) — `PATCH …/nodes/:id/source` → 204, then `GET /admin/routes/:id` shows the flipped source; bad value → 400; unknown node → 404; full e2e: mark a node live → `POST /sessions` (FakeProvider scripted) → play through → enriched node served.

**Manual (you, not Jest):** `GEMINI_API_KEY` set → generate + publish a route → mark a node live in the console → play in the browser, confirm enriched, novel-grounded prose; kill the key → confirm graceful stub fallback.

Coverage maps to the slice promise: eventGen tests = "retry → fallback works, never breaks play"; session tests = "live node enriches once, caches, degrades safely"; api e2e = "admin marks live → player sees Flash-generated, novel-grounded content".

---

## 9. Out of scope (later)

- Flash authoring **new** choices/edges (decision #2 rejects this — topology stays framework-time).
- Procedural / interstitial node generation (unbounded runtime graph).
- AI epilogue, reputation-driven + richer ending conditions, per-session seed randomisation, sprite/asset polish — **all Sub-project E**.
- Admin auth over the new endpoint — Sub-project D's concern (endpoint is unauthenticated like the other `/admin/routes/*` routes today).
