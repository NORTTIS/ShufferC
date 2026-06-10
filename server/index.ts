import { createApp } from './api';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';
import { createMemoryRouteStore } from './store/memoryRouteStore';
import { createPgRouteStore } from './store/pgRouteStore';
import { createPgSaveStore } from './store/pgSaveStore';
import { createMemoryContentStores } from './store/contentStores';
import { createFakeProvider } from './ai/provider';
import { createGeminiProvider } from './ai/gemini';
import { createGeminiEmbedder } from './rag/embeddingProvider';
import { createMemoryNovelStore } from './rag/novelStore';
import { createPgNovelStore } from './rag/pgNovelStore';
import { createDb } from './db/client';
import { createAuth } from './auth';
import { BACKGROUNDS } from '../shared/backgrounds';
import { ITEM_DB, SKILL_DB, ENEMY_DB, SAMPLE_BUNDLE } from '../shared/fixtures';
import { config } from './config';

const db = config.databaseUrl ? createDb(config.databaseUrl) : null;

// Routes are shared between the player session (reads) and admin endpoints (writes),
// so a freshly published route is immediately playable.
const routes = db ? createPgRouteStore(db) : createMemoryRouteStore([SAMPLE_BUNDLE]);
const saves = db ? createPgSaveStore(db) : createMemoryStore();
const { novels, embeddings } = db ? createPgNovelStore(db) : createMemoryNovelStore();

const provider = config.gemini.apiKey
  ? createGeminiProvider(config.gemini)
  : createFakeProvider([]); // no key → AI generation endpoints report 503

const embedder = createGeminiEmbedder(config.gemini); // available:false without a key → RAG endpoints report 503

const session = createGameSession(saves, {
  backgrounds: BACKGROUNDS, content: createMemoryContentStores(), routes,
  provider, embedder, embeddings,
});

const app = createApp(session, {
  provider,
  routes,
  registries: { itemDb: ITEM_DB, skillDb: SKILL_DB, enemyDb: ENEMY_DB },
  auth: createAuth(config.admin),
  novels,
  embeddings,
  embedder,
});

app.listen(config.port, () => {
  console.log(`ShufferC server listening on http://localhost:${config.port}`);
  console.log(`Admin console: http://localhost:${config.port}/admin`);
  console.log(`AI provider available: ${provider.available} · embedder available: ${embedder.available} · db: ${db ? 'postgres' : 'memory'}`);
});
