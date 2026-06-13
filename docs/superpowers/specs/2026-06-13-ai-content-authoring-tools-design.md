# AI Content-Authoring Tools (wired into route generation) — Design

**Date:** 2026-06-13
**Status:** Approved design, pre-implementation
**Builds on:** `2026-06-07-sub-project-c-framework-gen-design.md` (framework gen) and
`2026-06-09-admin-content-authoring-design.md` (the 5 content types + validators + stores).

## 1. Goal & scope

Today `generateFramework` is a **single-shot structured-output** call: the AI emits a whole
route bundle in one JSON object and may only **reference content that already exists** in the
registry (effects, items, skills, enemies). It cannot mint new content. An admin who wants a
"frostbite" effect or an "ice wraith" enemy must hand-author it in the console first, then
re-generate.

This spec turns the five content-creation features into **AI tool calls** the model invokes
**during route generation**. The generator becomes an agentic loop: the AI calls
`create_effect` / `create_attribute` / `create_item` / `create_skill` / `create_enemy` as
needed (each validated, each giving pass/fail feedback so the model self-corrects), then calls
a terminal `submit_route` tool to emit the route bundle that references both pre-existing and
freshly-minted content.

**In scope:**
- A new `generateWithTools` capability on the `AIProvider` port (native Gemini function calling)
  + a `FakeProvider` implementation that scripts tool-call sequences for deterministic tests.
- Six tools (5 create + 1 terminal `submit_route`), each reusing the **existing validators**.
- A **staging registry**: AI-created entities are staged on the draft bundle and only committed
  to the global content stores **when the admin publishes**. Reject = nothing leaks.
- A `frameworkGen` rewrite around the tool loop.
- Publish-time flush of staged content into the stores; admin-console draft view surfacing the
  staged content.

**Out of scope (explicitly cut — YAGNI):**
- A standalone "content authoring agent" (admin free-text prompt → content pack). Tools are
  **generation-only** for now. The tool layer is built so a standalone trigger could reuse it later.
- A hard dedup guard. Reuse is **soft guidance** (prompt + the registry listing already in the
  prompt). Admin prunes near-duplicates during draft review.
- `update_*` / `delete_*` tools. The AI creates fresh content; it cannot mutate or delete
  existing **global** entities.

## 2. Why this shape

- **Wired into generation, not standalone:** the user's need is "let the AI build the content a
  route requires while it writes the route", removing the manual pre-author step. A standalone
  authoring agent is a different feature and is deferred.
- **Native function calling, not simulated:** the user wants real tool calls. We add a transport
  method to the existing `AIProvider` port (the one architecture-invariant spot for the LLM
  boundary), keeping all generation **logic** in `frameworkGen`. `FakeProvider` keeps Jest
  network-free by replaying scripted tool calls through the same handler.
- **Staged, commit-on-publish:** route gen produces a **draft** pending admin approval. If the AI
  mints content that goes straight into the global registry and the admin rejects the route, the
  registry orphans. Staging makes generation **transactional**: the draft carries its pending
  content; publish commits it; reject discards it. Validators read `registry ∪ staged` so the AI
  can reference its own creations mid-loop.
- **Reuse existing validators:** the 5 `validate*()` functions in `contentValidation.ts` are the
  authoritative referential checks. Tools are a thin wrapper around them — no second validation path.

## 3. Provider boundary — `generateWithTools`

Extend the `AIProvider` port (`server/ai/provider.ts`):

```ts
export interface ToolDef {
  name: string;
  description: string;
  parameters: object;        // JSON Schema for the tool args
}
export interface ToolCall { name: string; args: unknown; }

export interface AIProvider {
  readonly available: boolean;
  generateStructured(prompt: string, jsonSchema: object, opts?: GenerateOptions): Promise<unknown>;
  generateWithTools(
    prompt: string,
    tools: ToolDef[],
    handler: (call: ToolCall) => Promise<unknown>,   // runs one tool, returns result fed back to the model
    opts?: GenerateOptions & { maxToolCalls?: number },
  ): Promise<void>;
}
```

- **Gemini adapter** owns the multi-turn transport only: send prompt + function declarations →
  receive `functionCall` part(s) → `await handler(call)` for each → append the returned value as a
  `functionResponse` part → repeat. The loop ends when the model returns no further function call
  **or** `maxToolCalls` is reached. The adapter never inspects tool semantics.
- **`generateWithTools` returns `void`.** The finished bundle is captured by the handler's closure
  in `frameworkGen` (§5), keeping the provider a dumb transport.
- **`FakeProvider.generateWithTools`** is constructed with a scripted sequence of tool calls
  (`ToolCall[][]`, one inner array per model turn). It invokes `handler` for each scripted call in
  order, ignoring the real model — letting tests script "invalid create → corrected create →
  submit_route". `available: true`.
- A provider with no API key reports `available:false`; `POST /admin/routes/generate` returns 503
  (unchanged behavior).

## 4. The tool set

Six tools. Five mirror the existing validators; one is terminal.

| Tool | Args (shape) | Handler behavior |
|---|---|---|
| `create_attribute` | `AttributeDef` (no `builtin`) | `validateAttribute` vs ctx → stage → `{ok,id}` / `{ok:false,errors}` |
| `create_effect` | `EffectTemplate` (no `builtin`) | `validateEffect(b, ctx)` → stage → … |
| `create_item` | `Item` | `validateItem(b, ctx)` → stage → … |
| `create_skill` | `Skill` | `validateSkill(b, ctx)` → stage → … |
| `create_enemy` | `Enemy` | `validateEnemy(b, ctx)` → stage → … |
| `submit_route` | `{ route, nodes }` | build bundle → `validateRouteBundle` + `moderate` prose → on clean: capture bundle, end loop, `{ok:true}`; else `{ok:false,errors}` |

- Each tool's `parameters` JSON Schema is derived from **Zod schemas** via `z.toJSONSchema`
  (the same mechanism already producing `GEN_BUNDLE_JSON_SCHEMA`). New per-entity Zod schemas are
  added to `server/ai/schema.ts`; they express **shape only** — the authoritative referential
  checks remain the `validate*()` functions, which see `registry ∪ staged`.
- A `create_*` that fails validation returns `{ok:false, errors}` (never throws to the model); the
  model self-corrects on its next turn. Success stages the entity and returns its `id`.
- `submit_route` is the **only** success exit. It runs `validateRouteBundle` (dangling-ref check,
  BFS reachability, ≥1 terminal ending — unchanged) and `moderate()` on every node's prose against
  `registry ∪ staged`.

## 5. Staging registry & validation context

```ts
interface StagingRegistry {
  attributes: Record<string, AttributeDef>;
  effects:    Record<string, EffectTemplate>;
  items:      Record<string, Item>;
  skills:     Record<string, Skill>;
  enemies:    Record<string, Enemy>;
}
```

- A fresh `StagingRegistry` is created per generation, held in the handler closure.
- The generation `ValidationCtx` and `Registries` are built as **`global snapshot ∪ staging`**, so
  both `validate*()` and `validateRouteBundle` see freshly-minted entities. Staged ids shadow/extend
  the global snapshot; a `create_*` whose id collides with an existing **global** id returns
  `{ok:false, errors:['id already exists']}`.
- The staging contents are persisted on the draft as **`bundle.stagedContent: StagingRegistry`**
  (the route is already stored as JSONB). All existing route consumers ignore this field.

`RouteBundle` gains one optional field:

```ts
export interface RouteBundle {
  route: GameRoute;
  nodes: Record<string, StoryNode>;
  stagedContent?: StagingRegistry;   // present on AI-generated drafts; cleared on publish
}
```

## 6. `frameworkGen` rewrite

```
generateFramework(provider, params, reg, opts):
  staging = empty StagingRegistry
  finalBundle = null

  ctx()      = buildCtx(global snapshot ∪ staging)          // refreshed each call
  registries = () => mergeRegistries(reg, staging)

  handler(call):
    switch call.name:
      create_attribute: e = validateAttribute(call.args);            staging.attributes[e.id]=e; return {ok,id}
      create_effect:    e = validateEffect(call.args, ctx());        staging.effects[e.id]=e;    return {ok,id}
      create_item:      e = validateItem(call.args, ctx());          staging.items[e.id]=e;      return {ok,id}
      create_skill:     e = validateSkill(call.args, ctx());         staging.skills[e.id]=e;     return {ok,id}
      create_enemy:     e = validateEnemy(call.args, ctx());         staging.enemies[e.id]=e;    return {ok,id}
      submit_route:
        bundle = { route, nodes(keyed), stagedContent: staging }
        errs = validateRouteBundle(bundle, registries())
        modErrs = moderate each node.prose
        if errs+modErrs empty: finalBundle = bundle; return {ok:true}
        else: return {ok:false, errors: errs+modErrs}
    // any validate*() GameError is caught and returned as {ok:false, errors:[message]} — never thrown to transport

  await provider.generateWithTools(buildToolPrompt(params, reg), TOOLS, handler, {maxToolCalls})

  if finalBundle:
    finalBundle.route.status = 'draft'
    finalBundle.route.sourceNovelId = params.sourceNovelId ?? 'adhoc'
    return { ok:true, bundle: finalBundle, toolCalls }
  else:
    return { ok:false, errors: lastErrors, toolCalls }
```

- The old `maxAttempts` retry-with-error-feedback loop is replaced by **per-call validation
  feedback** inside the function-calling exchange. `maxToolCalls` (default **30**) bounds the loop.
- `buildToolPrompt` extends `buildFrameworkPrompt`: it still includes the existing registry listing
  (so the model can reuse) and adds **soft reuse guidance** — "prefer referencing an existing entity
  with a close match; only create a new one when nothing fits."
- The prompt instructs: create dependencies first (attributes → effects → skills/items → enemies),
  then call `submit_route` exactly once.

## 7. Publish flush / reject discard

- **Publish** (`POST /admin/routes/:id/publish`): before flipping `status:'published'`, flush
  `bundle.stagedContent` into the content stores in **dependency order**
  (attributes → effects → skills → items → enemies), then clear `stagedContent` from the bundle and
  persist. On the pg adapter this is wrapped in a **transaction**; the memory adapter is synchronous.
  An id that now collides with a global entity → **409** surfaced to the admin (publish aborts, draft
  unchanged). A draft with no `stagedContent` publishes exactly as today.
- **Reject / delete draft:** delete the route as today. Staged content never entered the global
  registry, so there is nothing to clean up.

## 8. Admin console (mandatory per the `/admin/*` ↔ form rule)

**No new endpoint** — reuses `POST /admin/routes/generate`, `GET /admin/routes/:id`,
`POST /admin/routes/:id/publish`. Changes are display-only, in the existing dark dashboard style:

- The **route draft view** (`GET /admin/routes/:id` JSON render) gains a **"New content this route
  will add on publish"** section listing staged attributes / effects / items / skills / enemies by
  id + name, grouped by type.
- The **publish control** shows a confirmation naming the count (e.g. "Publishing will add 2 effects
  and 1 enemy to the registry"). Existing success/error/401/409 messaging conventions apply (409 on
  id collision).

## 9. Testing

- **Handler unit tests:** valid create → entity staged + `{ok,id}`; invalid create (bad archetype,
  dangling stat ref) → `{ok:false,errors}` and **not** staged; `submit_route` with a dangling enemy
  ref → `{ok:false}`; `submit_route` referencing a **staged** enemy from an earlier turn → `{ok:true}`.
- **`FakeProvider` scripts:** (a) happy path — create attribute→effect→enemy→`submit_route`;
  (b) self-correct — invalid effect → corrected effect → submit; (c) budget exhaustion — never
  calls `submit_route` → `{ok:false}` after `maxToolCalls`.
- **Publish-flush tests:** staged entities land in the stores in dependency order and the bundle's
  `stagedContent` is cleared; **reject/delete** leaves the stores untouched; id-collision → 409.
- **Zero network in Jest** preserved — all AI paths go through `FakeProvider`. Real Gemini function
  calling is smoke-tested manually (add a manual-verify note alongside the existing ones).

## 10. Safety bounds

- `maxToolCalls` default **30**; reaching it without a successful `submit_route` returns
  `{ok:false, errors}` (no partial commit — staging is discarded with the failed generation).
- `submit_route` is the only success exit; the loop cannot "finish" without a validated bundle.
- All validator `GameError`s are caught in the handler and returned as tool results, never thrown
  into the transport layer (which would abort the whole generation).

## 11. Files touched (anticipated)

- `server/ai/provider.ts` — `ToolDef`/`ToolCall` types, `generateWithTools` on the interface,
  `FakeProvider` scripted implementation.
- `server/ai/gemini.ts` — Gemini function-calling adapter for `generateWithTools`.
- `server/ai/schema.ts` — per-entity Zod schemas + derived JSON Schemas for tool params; tool defs.
- `server/ai/prompt.ts` — `buildToolPrompt` (registry listing + reuse guidance + ordering rules).
- `server/ai/frameworkGen.ts` — the tool-loop rewrite (§6).
- `server/api/contentValidation.ts` — `ValidationCtx` already fits; merge helper for `registry ∪ staged`.
- `shared/types.ts` — `RouteBundle.stagedContent?: StagingRegistry`.
- Publish path (route store / admin routes) — staged-content flush + 409 on collision.
- `server/admin/index.html` — draft staged-content section + publish confirmation.
- Tests beside each touched module.
