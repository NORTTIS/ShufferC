import express, { Request, Response, NextFunction, Express } from 'express';
import path from 'path';
import { GameSession, GameError } from './session';
import { AIProvider } from './ai/provider';
import { RouteStore } from './store/RouteStore';
import { Registries } from '../shared/types';
import { generateFramework } from './ai/frameworkGen';
import { Auth } from './auth';
import { NovelStore, EmbeddingStore } from './rag/novelStore';
import { EmbeddingProvider } from './rag/embeddingProvider';
import { ingestNovel } from './rag/ingest';
import { retrieveContext } from './rag/retrieve';
import { ContentStores } from './store/contentStores';
import { registerContentRoutes } from './api/contentRoutes';

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

export interface AdminDeps {
  provider: AIProvider;
  routes: RouteStore;
  content: ContentStores;
  auth: Auth;
  novels: NovelStore;
  embeddings: EmbeddingStore;
  embedder: EmbeddingProvider;
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

export function createApp(session: GameSession, admin: AdminDeps): Express {
  const app = express();

  // CORS: the Expo web client runs on a different origin (e.g. :8081) than the
  // API (:3000). Allow cross-origin requests and answer preflight OPTIONS.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
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

  // ── Player ──────────────────────────────────────────────────────────
  app.get('/backgrounds', wrap(() => session.listBackgrounds()));

  app.post('/sessions', wrap((req) => session.newGame(req.body?.backgroundId, req.body?.routeId)));

  app.get('/sessions/:id', wrap((req) => session.getView(req.params.id as string)));

  app.post('/sessions/:id/choice', wrap((req) =>
    session.applyChoice(req.params.id as string, req.body?.choiceId, req.body?.skillPriority),
  ));

  app.post('/sessions/:id/continue', wrap((req) =>
    session.continueToNextRoute(req.params.id as string),
  ));

  app.post('/sessions/:id/equip', wrap((req) =>
    session.equip(req.params.id as string, req.body?.slot, req.body?.itemId ?? null),
  ));

  app.get('/sessions/:id/shop', wrap((req) => session.getShop(req.params.id as string)));

  app.post('/sessions/:id/buy', wrap((req) =>
    session.buy(req.params.id as string, req.body?.itemId),
  ));

  app.post('/sessions/:id/use', wrap((req) =>
    session.useItem(req.params.id as string, req.body?.itemId),
  ));

  // ── Admin data endpoints (auth required; unauthenticated → 401) ───────
  app.get('/admin/status', requireAuth(admin.auth), wrap(() => ({ providerAvailable: admin.provider.available })));

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
    if (!admin.provider.available) throw new GameError('AI provider unavailable', 503);
    const { novelId, query, contextText, title, nodeCount } = req.body ?? {};

    let ctx: string = contextText ?? '';
    if (novelId) {
      if (!admin.embedder.available) throw new GameError('Embedding provider unavailable', 503);
      ctx = await retrieveContext(
        { embedder: admin.embedder, embeddings: admin.embeddings },
        { query: query ?? title, novelId },
      );
    }

    const registries: Registries = {
      itemDb: await admin.content.items.all(),
      skillDb: await admin.content.skills.all(),
      enemyDb: await admin.content.enemies.all(),
    };
    const result = await generateFramework(
      admin.provider,
      { contextText: ctx, title, nodeCount, sourceNovelId: novelId },
      registries,
    );
    if (!result.ok) {
      res.status(422).json({ errors: result.errors, attempts: result.attempts });
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
