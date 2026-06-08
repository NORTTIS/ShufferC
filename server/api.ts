import express, { Request, Response, NextFunction, Express } from 'express';
import path from 'path';
import { GameSession, GameError } from './session';
import { AIProvider } from './ai/provider';
import { RouteStore } from './store/RouteStore';
import { Registries } from '../shared/types';
import { generateFramework } from './ai/frameworkGen';
import { Auth } from './auth';

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

export interface AdminDeps {
  provider: AIProvider;
  routes: RouteStore;
  registries: Registries;
  auth: Auth;
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
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
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

  app.post('/sessions/:id/equip', wrap((req) =>
    session.equip(req.params.id as string, req.body?.slot, req.body?.itemId ?? null),
  ));

  // ── Admin data endpoints (auth required; unauthenticated → 401) ───────
  app.get('/admin/status', requireAuth(admin.auth), wrap(() => ({ providerAvailable: admin.provider.available })));

  app.use('/admin/routes', requireAuth(admin.auth));

  app.post('/admin/routes/generate', wrap(async (req, res) => {
    if (!admin.provider.available) throw new GameError('AI provider unavailable', 503);
    const { contextText, title, nodeCount } = req.body ?? {};
    const result = await generateFramework(admin.provider, { contextText, title, nodeCount }, admin.registries);
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

  // Centralised error handler — maps GameError.status, defaults to 500.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof GameError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(status).json({ error: message });
  });

  return app;
}
