import { createApp } from './api';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';
import { createMemoryRouteStore } from './store/memoryRouteStore';
import { createPgRouteStore } from './store/pgRouteStore';
import { createPgSaveStore } from './store/pgSaveStore';
import { createMemoryContentStores, createPgContentStores, seedContentStores } from './store/contentStores';
import { createFakeProvider } from './ai/provider';
import { createGeminiProvider } from './ai/gemini';
import { createGeminiEmbedder } from './rag/embeddingProvider';
import { createMemoryNovelStore } from './rag/novelStore';
import { createPgNovelStore } from './rag/pgNovelStore';
import { createDb } from './db/client';
import { createAuth } from './auth';
import { createMemoryPlayerAuth } from './playerAuth/memoryPlayerAuth';
import { createSupabasePlayerAuth } from './playerAuth/supabasePlayerAuth';
import { BACKGROUNDS } from '../shared/backgrounds';
import { SAMPLE_BUNDLE } from '../shared/fixtures';
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

const playerAuth = config.supabase.url && config.supabase.anonKey
  ? createSupabasePlayerAuth({
      url: config.supabase.url,
      anonKey: config.supabase.anonKey,
      jwtSecret: config.supabase.jwtSecret,
    })
  : createMemoryPlayerAuth(); // no Supabase env → in-memory accounts (dev only, lost on restart)

(async () => {
  const content = db ? createPgContentStores(db) : createMemoryContentStores();
  if (db) await seedContentStores(content);

  const session = createGameSession(saves, {
    backgrounds: BACKGROUNDS, content, routes,
    provider, embedder, embeddings,
  });

  const app = createApp(session, {
    provider,
    routes,
    content,
    auth: createAuth(config.admin),
    novels,
    embeddings,
    embedder,
  }, { auth: playerAuth });

  app.listen(config.port, () => {
    console.log(`ShufferC server listening on http://localhost:${config.port}`);
    console.log(`Admin console: http://localhost:${config.port}/admin`);
    console.log(`AI provider available: ${provider.available} · embedder available: ${embedder.available} · db: ${db ? 'postgres' : 'memory'} · player auth: ${config.supabase.url ? 'supabase' : 'memory'}`);
  });
})();
