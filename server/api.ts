import express, { Request, Response, NextFunction, Express } from 'express';
import { GameSession, GameError } from './session';

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

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

export function createApp(session: GameSession): Express {
  const app = express();
  app.use(express.json());

  app.get('/backgrounds', wrap(() => session.listBackgrounds()));

  app.post('/sessions', wrap((req) => session.newGame(req.body?.backgroundId)));

  app.get('/sessions/:id', wrap((req) => session.getView(req.params.id as string)));

  app.post('/sessions/:id/choice', wrap((req) =>
    session.applyChoice(req.params.id as string, req.body?.choiceId, req.body?.skillPriority),
  ));

  app.post('/sessions/:id/equip', wrap((req) =>
    session.equip(req.params.id as string, req.body?.slot, req.body?.itemId ?? null),
  ));

  // Centralised error handler — maps GameError.status, defaults to 500.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof GameError ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(status).json({ error: message });
  });

  return app;
}
