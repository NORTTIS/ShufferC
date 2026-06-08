import { pgTable, text, jsonb, uuid, integer, timestamp, vector, index } from 'drizzle-orm/pg-core';

export const gameRoutes = pgTable('game_routes', {
  id: text('id').primaryKey(),                 // = bundle.route.id
  title: text('title').notNull(),
  sourceNovelId: text('source_novel_id').notNull(),
  status: text('status').notNull(),            // 'draft' | 'published'
  bundle: jsonb('bundle').notNull(),           // full RouteBundle (route + nodes)
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const saveStates = pgTable('save_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  routeId: text('route_id').notNull(),
  save: jsonb('save').notNull(),               // full SaveState
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const novels = pgTable('novels', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  rawText: text('raw_text').notNull(),
  chunkCount: integer('chunk_count').notNull().default(0),
  status: text('status').notNull().default('embedding'),  // 'embedding' | 'ready'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const novelChunks = pgTable('novel_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  novelId: uuid('novel_id').notNull().references(() => novels.id, { onDelete: 'cascade' }),
  idx: integer('idx').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
}, (t) => ({
  embeddingIdx: index('novel_chunks_embedding_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
}));
