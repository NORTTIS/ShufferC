import { createApp } from './api';
import { createGameSession } from './session';
import { createMemoryStore } from './store/memoryStore';
import { createMemoryRouteStore } from './store/memoryRouteStore';
import { createPgRouteStore } from './store/pgRouteStore';
import { createPgSaveStore } from './store/pgSaveStore';
import { createMemoryContentStores, createPgContentStores, seedContentStores } from './store/contentStores';
import { createProviderRegistry } from './ai/providerRegistry';
import { GenerateOptions, ToolDef, ToolHandler } from './ai/provider';
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

const registry = createProviderRegistry(config.gemini);

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

  if (db) {
    try { await registry.reload(db); }
    catch (e) { console.warn('Could not load provider settings (using defaults):', e instanceof Error ? e.message : String(e)); }
  }

  const liveEventProxy = {
    get available() { return registry.getLiveEventProvider().available; },
    generateStructured: (
      prompt: string,
      jsonSchema: object,
      opts?: GenerateOptions,
    ) => registry.getLiveEventProvider().generateStructured(prompt, jsonSchema, opts),
    generateWithTools: (
      prompt: string,
      tools: ToolDef[],
      handler: ToolHandler,
      opts?: GenerateOptions & { maxToolCalls?: number },
    ) => registry.getLiveEventProvider().generateWithTools(prompt, tools, handler, opts),
  };

  const session = createGameSession(saves, {
    backgrounds: BACKGROUNDS, content, routes,
    provider: liveEventProxy, embedder, embeddings,
  });

  const app = createApp(session, {
    registry,
    db,
    routes,
    content,
    auth: createAuth(config.admin),
    novels,
    embeddings,
    embedder,
  }, { auth: playerAuth, saves });

  app.listen(config.port, () => {
    console.log(`ShufferC server listening on http://localhost:${config.port}`);
    console.log(`Admin console: http://localhost:${config.port}/admin`);
    const fwProvider = registry.getFrameworkProvider();
    const leProvider = registry.getLiveEventProvider();
    console.log(`Framework gen: ${fwProvider.available ? 'available' : 'off'} · Live events: ${leProvider.available ? 'available' : 'off'} · embedder available: ${embedder.available} · db: ${db ? 'postgres' : 'memory'} · player auth: ${config.supabase.url ? 'supabase' : 'memory'}`);
  });
})();
