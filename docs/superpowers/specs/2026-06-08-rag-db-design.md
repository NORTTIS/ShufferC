# Sub-project C (slice 2): RAG + Real DB (Supabase/Drizzle/pgvector) — Design Doc

> Persist game data on **Supabase Postgres** via **Drizzle**, and add a **RAG pipeline**
> (novel upload → chunk → embed → pgvector → retrieve) that grounds framework generation
> in real novel text. End-to-end: an admin uploads a novel, generates a route from it, and
> player progress survives a server restart.
>
> Mục tiêu: thay store in-memory bằng Supabase/Drizzle + dựng pipeline RAG nạp tiểu thuyết.
>
> Ngày: 2026-06-08. Phụ thuộc: A (engine), B (vertical slice), C1 (framework-gen).

---

## 0. Decision log

| # | Vấn đề | Quyết định |
|---|--------|-----------|
| 1 | DB target | **Real Supabase project** (Postgres + `pgvector`). |
| 2 | Scope | **Full slice**: persistence migration **and** RAG pipeline in one spec. |
| 3 | Tables migrated | **routes + saves + novels + embeddings**. `users`/auth stay the current single-admin mock (real users = sub-project D). |
| 4 | Embedding model | **`gemini-embedding-001`**, `outputDimensionality: 1536` (MRL truncation). |
| 5 | Vector column | `vector(1536)`, **HNSW** index, `vector_cosine_ops` (3072 exceeds pgvector's 2000-dim index cap). |
| 6 | Server DB access | **Drizzle + `postgres` (postgres-js)** over the direct connection string. (The `supabase-js` snippet the user has is the **client** path → sub-project D, out of scope here.) |
| 7 | Architecture | **Ports & adapters**: keep `RouteStore`/`SaveStore` interfaces; add Drizzle adapters + new `NovelStore`/`EmbeddingStore` ports; `index.ts` selects pg-vs-memory by `DATABASE_URL`. |
| 8 | Testing | Offline by default — memory adapters + fake embedder. pg adapters get one integration test **guarded on `DATABASE_URL`**. Existing 164 tests stay green. |
| 9 | frameworkGen | **Unchanged.** RAG fills `GenerationParams.contextText`; the generator is untouched. |

---

## 1. Goal

1. Replace the in-memory `RouteStore` and `SaveStore` with **Supabase-backed** adapters so generated routes and player saves persist across restarts.
2. Add a **RAG ingest pipeline**: admin uploads a novel → text is chunked → each chunk embedded with Gemini → chunks + vectors stored in `pgvector`.
3. Add **retrieval** that, given a query, returns the top-k most similar chunks and assembles them into `GenerationParams.contextText`, so `POST /admin/routes/generate` can ground generation in real novel text.
4. Keep the whole thing **testable offline** (memory + fake embedder) and the existing test suite green.

## 2. In scope

- New deps: `drizzle-orm`, `postgres`, `drizzle-kit` (dev). Embeddings via the existing `@google/generative-ai` SDK (`embedContent`).
- `server/db/`: Drizzle client, schema, migrations (incl. `vector` extension + HNSW index).
- Drizzle adapters: `pgRouteStore`, `pgSaveStore`.
- `server/rag/`: pure `chunkText`; `EmbeddingProvider` (Gemini + fake); `NovelStore` + `EmbeddingStore` ports with **both** pg and memory adapters; `ingestNovel`; `retrieveContext`.
- API: `POST/GET/DELETE /admin/novels`; extend `POST /admin/routes/generate` to accept `novelId` + `query`.
- `index.ts` wiring (config-selected) and `config.ts` / `.env.example` additions.
- Tests for all new pure logic + API endpoints; one guarded pg integration test.

## 3. Out of scope (later slices)

- Live event generation (`eventGen`) — separate slice of C.
- Real user accounts / Supabase Auth / per-user save ownership / RLS policies — sub-project D.
- Admin CMS UI for novel management beyond the REST endpoints — sub-project D.
- Migrating the registries (`itemDb`/`skillDb`/`enemyDb`) from fixtures to DB — they stay fixtures (the `Registries` comment already anticipates "DB later"; not needed for this slice).
- Caching live-generated `story_nodes` as rows — routes are stored whole as JSONB.

## 4. Architecture & file layout

```
server/
├── config.ts             # + databaseUrl, + gemini.embedModel
├── db/
│   ├── client.ts          # createDb(url) → drizzle(postgres(url)); throws if url missing
│   ├── schema.ts          # gameRoutes, saveStates, novels, novelChunks (Drizzle)
│   └── migrations/        # drizzle-kit SQL + a migration enabling `vector` + HNSW index
├── store/
│   ├── RouteStore.ts      # (unchanged interface)
│   ├── SaveStore.ts       # (unchanged interface)
│   ├── memoryRouteStore.ts / memoryStore.ts   # (unchanged)
│   ├── pgRouteStore.ts    # createPgRouteStore(db): RouteStore
│   └── pgSaveStore.ts     # createPgSaveStore(db): SaveStore
└── rag/
    ├── chunk.ts            # PURE: chunkText(text, {size, overlap}): string[]
    ├── embeddingProvider.ts# EmbeddingProvider iface + createGeminiEmbedder + createFakeEmbedder
    ├── novelStore.ts       # NovelStore + EmbeddingStore ports; memory + pg adapters
    ├── ingest.ts           # ingestNovel(deps, {title, text}): {novelId, chunkCount}
    └── retrieve.ts         # retrieveContext(deps, {query, novelId?, k?}): string
drizzle.config.ts           # drizzle-kit config (schema path, out dir, dialect, dbCredentials)
```

**Invariant compliance:** env read only in `config.ts`; types shared in `shared/types.ts`; logic (chunk/retrieve/ingest) kept pure and I/O-free where possible (orchestrates ports). Stores keep their existing port interfaces, so `session.ts` / `api.ts` consumers are untouched.

## 5. Database schema (Drizzle → Postgres)

```ts
// server/db/schema.ts (sketch)
export const gameRoutes = pgTable('game_routes', {
  id: text('id').primaryKey(),                         // = bundle.route.id
  title: text('title').notNull(),
  sourceNovelId: text('source_novel_id').notNull(),
  status: text('status').notNull(),                    // 'draft' | 'published'
  bundle: jsonb('bundle').notNull(),                   // full RouteBundle (route + nodes)
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const saveStates = pgTable('save_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  routeId: text('route_id').notNull(),
  save: jsonb('save').notNull(),                       // full SaveState
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const novels = pgTable('novels', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  rawText: text('raw_text').notNull(),
  chunkCount: integer('chunk_count').notNull().default(0),
  status: text('status').notNull().default('embedding'), // 'embedding' | 'ready'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const novelChunks = pgTable('novel_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  novelId: uuid('novel_id').notNull().references(() => novels.id, { onDelete: 'cascade' }),
  idx: integer('idx').notNull(),                       // chunk order within the novel
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),// pgvector via drizzle-orm/pg-core
}, (t) => ({
  embIdx: index('novel_chunks_embedding_hnsw')
    .using('hnsw', t.embedding.op('vector_cosine_ops')),
}));
```

- The `vector` column + HNSW index require `create extension if not exists vector;`. drizzle-kit will **not** emit the extension, so a hand-written migration (or Supabase dashboard step) enables it **before** the index migration runs. Documented in the plan.
- Routes/saves stored **whole as JSONB** — thin adapters, no node/row decomposition (YAGNI for this slice).

## 6. Ports & key interfaces

```ts
// server/rag/embeddingProvider.ts
export interface EmbeddingProvider {
  readonly available: boolean;                         // false when no Gemini key
  embed(texts: string[]): Promise<number[][]>;         // one 1536-vector per input
}
// createGeminiEmbedder(config) — batches embedContent at outputDimensionality 1536
// createFakeEmbedder(fn?)      — deterministic vectors for offline tests

// server/rag/novelStore.ts
export interface NovelSummary { id: string; title: string; chunkCount: number; status: string; }
export interface NovelStore {
  create(title: string, rawText: string): Promise<string>;        // novelId
  setChunks(novelId: string, chunks: { idx: number; content: string; embedding: number[] }[]): Promise<void>;
  markReady(novelId: string): Promise<void>;
  list(): Promise<NovelSummary[]>;
  get(id: string): Promise<NovelSummary | null>;
  remove(id: string): Promise<void>;                              // cascade deletes chunks
}
export interface EmbeddingStore {
  // cosine-nearest chunk contents; pg uses `<=>`, memory computes in JS
  search(queryEmbedding: number[], k: number, novelId?: string): Promise<{ content: string; score: number }[]>;
}
```

```ts
// server/rag/ingest.ts
ingestNovel(
  deps: { novels: NovelStore; embedder: EmbeddingProvider; chunk?: { size: number; overlap: number } },
  input: { title: string; text: string },
): Promise<{ novelId: string; chunkCount: number }>;
// chunkText → embedder.embed(chunks) → novels.create + setChunks → markReady

// server/rag/retrieve.ts
retrieveContext(
  deps: { embedder: EmbeddingProvider; embeddings: EmbeddingStore },
  input: { query: string; novelId?: string; k?: number },        // k default 5
): Promise<string>;
// embedder.embed([query]) → embeddings.search → join top-k contents with separators
```

Chunking default: `size ≈ 1200` chars, `overlap ≈ 200` chars (tunable constants in `chunk.ts`). `chunkText` is pure and splits on size with overlap, not breaking mid-word where avoidable.

## 7. API changes

All under existing admin auth (`requireAuth`).

- `POST /admin/novels` `{ title, text }` → `ingestNovel` → `{ novelId, chunkCount }`. **503** if `embedder.available` is false or no DB.
- `GET /admin/novels` → `NovelSummary[]`.
- `GET /admin/novels/:id` → `NovelSummary` (404 if missing).
- `DELETE /admin/novels/:id` → 204 (cascade-deletes chunks).
- `POST /admin/routes/generate` — extend body to `{ novelId?, query?, contextText?, title, nodeCount? }`:
  - If `novelId` present → `contextText = await retrieveContext({ query: query ?? title, novelId })`.
  - Else → use the provided `contextText` (**back-compat**, current behavior).
  - Then call `generateFramework` exactly as today.

`AdminDeps` gains `novels: NovelStore`, `embeddings: EmbeddingStore`, `embedder: EmbeddingProvider`.

## 8. Wiring & degradation (`server/index.ts`)

```ts
const db = config.databaseUrl ? createDb(config.databaseUrl) : null;
const routes = db ? createPgRouteStore(db) : createMemoryRouteStore([SAMPLE_BUNDLE]);
const saves  = db ? createPgSaveStore(db)  : createMemoryStore();
const { novels, embeddings } = db ? createPgNovelStore(db) : createMemoryNovelStore();
const embedder = config.gemini.apiKey ? createGeminiEmbedder(config) : createFakeEmbedder();
```

- **No `DATABASE_URL`** → memory mode (dev/test). Novel endpoints still work in-memory; vector search uses JS cosine.
- **No Gemini key** → `embedder.available = false` → ingest / novel-grounded generate return **503** (mirrors today's `/generate` 503), instead of crashing.
- `createDb` uses the direct Postgres connection string. If the **transaction pooler** (port 6543) is used, set `prepare: false` on postgres-js. Documented in `.env.example`.

## 9. Error handling

- Missing dependency (DB / embedder) → `GameError(…, 503)`, surfaced by the existing central error handler.
- Embedding API failure → propagate as a 5xx with the provider message (no silent fallback during ingest — admin-in-loop, like framework-gen).
- Dimension mismatch is structurally prevented by the typed `vector(1536)` column + a fixed `outputDimensionality`.
- Empty retrieval (no chunks for a novel) → `retrieveContext` returns `''`; generate then behaves as the no-context path (frameworkGen still validates/ retries).

## 10. Testing strategy

| Target | How | Offline? |
|--------|-----|----------|
| `chunkText` | table tests: overlap, boundaries, short/empty text, no mid-word split | yes |
| `ingestNovel` | `createFakeEmbedder` + memory `NovelStore` → assert chunkCount, stored vectors, status `ready` | yes |
| `retrieveContext` | fake embedder + memory `EmbeddingStore` (JS cosine) → assert top-k order + assembled string | yes |
| New API endpoints | existing `app()` harness + memory stores + fake embedder | yes |
| `pgRouteStore`/`pgSaveStore`/`pgNovelStore` | one integration file, `describe`-skipped unless `process.env.DATABASE_URL` (or `TEST_DATABASE_URL`) | guarded |
| Regression | full `npx jest` — existing 164 stay green (memory default) | yes |

Determinism: fake embedder maps text → fixed vector (e.g., hashed token counts) so cosine ordering is assertable and non-flaky.

## 11. Config / env additions

```
# server (.env, git-ignored; documented in .env.example)
DATABASE_URL=                 # Supabase direct connection string (Settings → Database). SECRET.
GEMINI_EMBED_MODEL=gemini-embedding-001
```

`config.ts` adds `databaseUrl: process.env.DATABASE_URL ?? null` and `gemini.embedModel`. New npm scripts: `db:generate` (drizzle-kit generate), `db:migrate` (apply). The `vector` extension is enabled by the first migration / Supabase dashboard before the index migration.

> **Security:** `DATABASE_URL` and any service-role key are real secrets — only in `.env`, never committed, never pasted into chat. The `sb_publishable_…` anon key is client-only and belongs to sub-project D.

## 12. Risks / notes

- **pgvector index dim cap (2000):** fixed by truncating embeddings to 1536. Quality impact is minor (MRL is designed for this).
- **Supabase pooler quirks:** transaction pooler needs `prepare: false`; direct connection is simplest for a long-lived Node server. Documented.
- **Extension ordering:** `vector` must exist before the HNSW index migration — sequence the migrations.
- **Cost:** embedding a long novel is many `embedContent` calls; batch and surface `chunkCount`. Balance tuning deferred to E.
- **Two code paths (pg + memory):** accepted trade-off for offline testability; both implement the same port so divergence is bounded.

## 13. Acceptance criteria

1. With `DATABASE_URL` unset, `npx jest` passes all suites (existing 164 + new), fully offline.
2. `chunkText` produces overlapping chunks covering the whole text; verified by table tests.
3. `ingestNovel` (fake embedder + memory store) stores N chunks with vectors and marks the novel `ready`; `chunkCount === N`.
4. `retrieveContext` returns the top-k chunks by cosine similarity in correct order and joins them into a single context string.
5. `POST /admin/novels` then `POST /admin/routes/generate {novelId}` yields a draft route whose generation consumed retrieved context (asserted via the fake embedder/provider harness).
6. `pgRouteStore`/`pgSaveStore` round-trip a `RouteBundle`/`SaveState` against a real Postgres when `DATABASE_URL` is set (guarded integration test).
7. Missing DB or embedder degrades to 503 (or memory mode) without crashing the server.

## 14. Next step

Proceed to **writing-plans** → produce a task-by-task implementation plan
(`docs/superpowers/plans/2026-06-08-rag-db.md`), TDD per task, atomic commits.
