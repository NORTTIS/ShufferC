import express, { Request, Response, NextFunction, Express } from 'express';
import path from 'path';
import { z } from 'zod';
import { GameSession, GameError } from './session';
import { RouteStore } from './store/RouteStore';
import { ContentSet } from '../shared/types';
import { generateFramework } from './ai/frameworkGen';
import { Auth } from './auth';
import { NovelStore, EmbeddingStore } from './rag/novelStore';
import { EmbeddingProvider } from './rag/embeddingProvider';
import { ingestNovel } from './rag/ingest';
import { retrieveContext } from './rag/retrieve';
import { ContentStores } from './store/contentStores';
import { registerContentRoutes } from './api/contentRoutes';
import { PlayerAuthStore } from './playerAuth/PlayerAuthStore';
import { SaveStore } from './store/SaveStore';
import { ProviderRegistry } from './ai/providerRegistry';
import { Db } from './db/client';
import { serverSettings } from './db/schema';

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

export interface AdminDeps {
  registry: ProviderRegistry;
  db: Db | null;
  routes: RouteStore;
  content: ContentStores;
  auth: Auth;
  novels: NovelStore;
  embeddings: EmbeddingStore;
  embedder: EmbeddingProvider;
}

export interface PlayerDeps {
  auth: PlayerAuthStore;
  saves: SaveStore;
}

interface PlayerRequest extends Request {
  player?: { id: string; email: string };
}

const credentials = z.object({ email: z.email(), password: z.string().min(6) });

function parseCredentials(body: unknown): { email: string; password: string } {
  const parsed = credentials.safeParse(body);
  if (!parsed.success) {
    throw new GameError('Valid email and a password of at least 6 characters are required', 400);
  }
  return { email: parsed.data.email.trim().toLowerCase(), password: parsed.data.password };
}

/** Express middleware factory: requires a valid player Bearer token. */
function requirePlayer(auth: PlayerAuthStore) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return next(new GameError('Unauthorized', 401));
    try {
      (req as PlayerRequest).player = await auth.verifyToken(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Requires that req.params.id is a save owned by the authenticated player. 404 otherwise (don't reveal existence). */
function requireOwner(saves: SaveStore) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const owner = await saves.owner(req.params.id as string);
      if (!owner || owner !== (req as PlayerRequest).player?.id) {
        return next(new GameError(`Session ${req.params.id} not found`, 404));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

function wrap(handler: Handler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = await handler(req, res);
      if (!res.headersSent) res.json(body);
    } catch (err) {
      next(err);
    }
  };
}

/** Express middleware factory: requires a valid `Authorization: Bearer <token>`. */
function requireAuth(auth: Auth) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const tokenValue = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!auth.verify(tokenValue)) return next(new GameError('Unauthorized', 401));
    next();
  };
}

export function createApp(session: GameSession, admin: AdminDeps, player: PlayerDeps): Express {
  const app = express();

  // CORS: the Expo web client runs on a different origin (e.g. :8081) than the
  // API (:3000). Allow cross-origin requests and answer preflight OPTIONS.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    next();
  });
  app.options(/.*/, (_req: Request, res: Response) => res.sendStatus(204));

  app.use(express.json());

  // ── Admin console page (no auth — it IS the login screen) ─────────────
  app.get('/admin', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
  });

  // ── Admin login (no auth) ─────────────────────────────────────────────
  app.post('/admin/login', wrap((req) => {
    const tokenValue = admin.auth.login(req.body?.email, req.body?.password);
    if (!tokenValue) throw new GameError('Invalid credentials', 401);
    return { token: tokenValue };
  }));

  // ── Player auth (no token required) ───────────────────────────────────
  app.post('/auth/register', wrap((req) => {
    const { email, password } = parseCredentials(req.body);
    return player.auth.register(email, password);
  }));

  app.post('/auth/login', wrap((req) => {
    const { email, password } = parseCredentials(req.body);
    return player.auth.login(email, password);
  }));

  app.post('/auth/refresh', wrap((req) => {
    const refreshToken = req.body?.refreshToken;
    if (typeof refreshToken !== 'string' || refreshToken === '') {
      throw new GameError('refreshToken is required', 400);
    }
    return player.auth.refresh(refreshToken);
  }));

  const playerOnly = requirePlayer(player.auth);
  const ownedSession = [playerOnly, requireOwner(player.saves)];

  // ── Player ──────────────────────────────────────────────────────────
  app.get('/backgrounds', wrap(() => session.listBackgrounds()));

  app.post('/sessions', playerOnly, wrap((req) =>
    session.newGame((req as PlayerRequest).player!.id, req.body?.backgroundId, req.body?.routeId),
  ));

  app.get('/saves', playerOnly, wrap((req) =>
    player.saves.listByUser((req as PlayerRequest).player!.id),
  ));

  app.get('/sessions/:id', ownedSession, wrap((req) => session.getView(req.params.id as string)));

  app.post('/sessions/:id/choice', ownedSession, wrap((req) =>
    session.applyChoice(req.params.id as string, req.body?.choiceId, req.body?.skillPriority),
  ));

  app.post('/sessions/:id/continue', ownedSession, wrap((req) =>
    session.continueToNextRoute(req.params.id as string),
  ));

  app.post('/sessions/:id/equip', ownedSession, wrap((req) =>
    session.equip(req.params.id as string, req.body?.slot, req.body?.itemId ?? null),
  ));

  app.get('/sessions/:id/shop', ownedSession, wrap((req) => session.getShop(req.params.id as string)));

  app.post('/sessions/:id/buy', ownedSession, wrap((req) =>
    session.buy(req.params.id as string, req.body?.itemId),
  ));

  app.post('/sessions/:id/use', ownedSession, wrap((req) =>
    session.useItem(req.params.id as string, req.body?.itemId),
  ));

  // ── Admin data endpoints (auth required; unauthenticated → 401) ───────
  app.get('/admin/status', requireAuth(admin.auth), wrap(() => {
    const s = admin.registry.getSettings();
    const fw = admin.registry.getFrameworkProvider();
    const le = admin.registry.getLiveEventProvider();
    return {
      providerAvailable: fw.available && le.available,
      frameworkGenProvider: s.frameworkGenProvider,
      liveEventProvider: s.liveEventProvider,
    };
  }));

  const PatchSettingsSchema = z.object({
    openrouterApiKey: z.string().optional(),
    frameworkGenProvider: z.enum(['gemini', 'openrouter']).optional(),
    frameworkGenModel: z.string().min(1).optional(),
    liveEventProvider: z.enum(['gemini', 'openrouter']).optional(),
    liveEventModel: z.string().min(1).optional(),
  });

  function serializeSettings(registry: ProviderRegistry) {
    const s = registry.getSettings();
    return {
      openrouterApiKey: s.openrouterApiKey ? 'configured' : null,
      frameworkGenProvider: s.frameworkGenProvider,
      frameworkGenModel: s.frameworkGenModel,
      liveEventProvider: s.liveEventProvider,
      liveEventModel: s.liveEventModel,
    };
  }

  app.get('/admin/settings', requireAuth(admin.auth), wrap(() => serializeSettings(admin.registry)));

  app.patch('/admin/settings', requireAuth(admin.auth), wrap(async (req) => {
    const parsed = PatchSettingsSchema.safeParse(req.body);
    if (!parsed.success) throw new GameError('Invalid settings body', 400);
    if (!admin.db) throw new GameError('Settings persistence requires a database', 503);

    const DB_KEY_MAP: Record<string, string> = {
      openrouterApiKey: 'openrouter_api_key',
      frameworkGenProvider: 'framework_gen_provider',
      frameworkGenModel: 'framework_gen_model',
      liveEventProvider: 'live_event_provider',
      liveEventModel: 'live_event_model',
    };

    for (const [field, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      const key = DB_KEY_MAP[field];
      await admin.db.insert(serverSettings).values({ key, value })
        .onConflictDoUpdate({ target: serverSettings.key, set: { value } });
    }

    await admin.registry.reload(admin.db);
    return serializeSettings(admin.registry);
  }));

  app.use('/admin/routes', requireAuth(admin.auth));

  app.use('/admin/novels', requireAuth(admin.auth));

  app.post('/admin/novels', wrap(async (req) => {
    if (!admin.embedder.available) throw new GameError('Embedding provider unavailable', 503);
    const { title, text } = req.body ?? {};
    if (!title || !text) throw new GameError('title and text are required', 400);
    return ingestNovel({ novels: admin.novels, embedder: admin.embedder }, { title, text });
  }));

  app.get('/admin/novels', wrap(() => admin.novels.list()));

  app.get('/admin/novels/:id', wrap(async (req) => {
    const novel = await admin.novels.get(req.params.id as string);
    if (!novel) throw new GameError(`Novel ${req.params.id} not found`, 404);
    return novel;
  }));

  app.delete('/admin/novels/:id', wrap(async (req, res) => {
    await admin.novels.remove(req.params.id as string);
    res.status(204).end();
    return undefined;
  }));

  app.post('/admin/routes/generate', wrap(async (req, res) => {
    if (!admin.registry.getFrameworkProvider().available) throw new GameError('AI provider unavailable', 503);
    const { novelId, query, contextText, title, nodeCount } = req.body ?? {};

    let ctx: string = contextText ?? '';
    if (novelId) {
      if (!admin.embedder.available) throw new GameError('Embedding provider unavailable', 503);
      ctx = await retrieveContext(
        { embedder: admin.embedder, embeddings: admin.embeddings },
        { query: query ?? title, novelId },
      );
    }

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
  }));

  app.get('/admin/routes', wrap(() => admin.routes.list()));

  app.get('/admin/routes/:id', wrap(async (req) => {
    const bundle = await admin.routes.get(req.params.id as string);
    if (!bundle) throw new GameError(`Route ${req.params.id} not found`, 404);
    return bundle;
  }));

  app.post('/admin/routes/:id/publish', wrap(async (req, res) => {
    const id = req.params.id as string;
    const bundle = await admin.routes.get(id);
    if (!bundle) throw new GameError(`Route ${id} not found`, 404);
    await admin.routes.publish(id);
    res.status(204).end();
    return undefined;
  }));

  app.post('/admin/routes/:id/nodes/:nodeId/merchant', wrap(async (req, res) => {
    const id = req.params.id as string;
    const nodeId = req.params.nodeId as string;
    const stock = req.body?.stock;
    if (stock !== null && !Array.isArray(stock)) {
      throw new GameError('stock must be an array or null', 400);
    }
    for (const entry of stock ?? []) {
      if (!(await admin.content.items.get(entry?.itemId))) {
        throw new GameError(`Unknown item ${entry?.itemId}`, 400);
      }
    }
    const bundle = await admin.routes.get(id);
    if (!bundle) throw new GameError(`Route ${id} not found`, 404);
    if (!bundle.nodes[nodeId]) throw new GameError(`Node ${nodeId} not found in route ${id}`, 404);
    await admin.routes.setMerchant(id, nodeId, stock === null ? null : { stock });
    res.status(204).end();
    return undefined;
  }));

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

  // ── Admin content CRUD (attributes/effects/items/skills/enemies) ─────
  registerContentRoutes(app, admin.content, requireAuth(admin.auth), wrap);

  // Centralised error handler — maps GameError.status, defaults to 500.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof GameError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(status).json({ error: message });
  });

  return app;
}
