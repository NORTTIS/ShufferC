import { Express, Request, Response, NextFunction } from 'express';
import { GameError } from '../session';
import { ContentStores } from '../store/contentStores';
import { EntityStore, StoreError } from '../store/EntityStore';
import { findReferences, RefKind } from '../store/integrity';
import { ValidationCtx, validateAttribute, validateEffect, validateItem, validateSkill, validateEnemy } from './contentValidation';

type Wrap = (h: (req: Request, res: Response) => Promise<unknown> | unknown) => any;

async function buildCtx(stores: ContentStores): Promise<ValidationCtx> {
  const [attributes, effects, items, skills] = await Promise.all([
    stores.attributes.all(), stores.effects.all(), stores.items.all(), stores.skills.all(),
  ]);
  return { attributes, effects, items, skills };
}

interface ResourceCfg<T extends { id: string }> {
  path: string;                                   // 'attributes'
  store(s: ContentStores): EntityStore<T>;
  validate(body: any, c: ValidationCtx): T;
  refKind?: RefKind;                              // if deletes must be integrity-checked
  isBuiltin?(entity: T): boolean;                 // block delete of builtins
}

const RESOURCES: ResourceCfg<any>[] = [
  { path: 'attributes', store: (s) => s.attributes, validate: (b) => validateAttribute(b), refKind: 'attribute', isBuiltin: (e) => e.builtin },
  { path: 'effects',    store: (s) => s.effects,    validate: (b, c) => validateEffect(b, c), refKind: 'effect', isBuiltin: (e) => e.builtin },
  { path: 'items',      store: (s) => s.items,      validate: (b, c) => validateItem(b, c),  refKind: 'item' },
  { path: 'skills',     store: (s) => s.skills,     validate: (b, c) => validateSkill(b, c), refKind: 'skill' },
  { path: 'enemies',    store: (s) => s.enemies,    validate: (b, c) => validateEnemy(b, c) }, // enemies are not referenced by content
];

export function registerContentRoutes(
  app: Express,
  stores: ContentStores,
  requireAuth: (req: Request, res: Response, next: NextFunction) => void,
  wrap: Wrap,
): void {
  for (const cfg of RESOURCES) {
    const base = `/admin/${cfg.path}`;
    app.use(base, requireAuth);

    app.get(base, wrap(() => cfg.store(stores).list()));

    app.post(base, wrap(async (req: Request) => {
      const entity = cfg.validate(req.body ?? {}, await buildCtx(stores));
      try { return await cfg.store(stores).create(entity); }
      catch (e) { if (e instanceof StoreError && e.kind === 'conflict') throw new GameError(e.message, 409); throw e; }
    }));

    app.put(`${base}/:id`, wrap(async (req: Request) => {
      const id = req.params.id as string;
      // Explicit get-before-update: pg adapter's update is a silent no-op on
      // missing ids (no StoreError), so checking here makes both adapters 404.
      const existing = await cfg.store(stores).get(id);
      if (!existing) throw new GameError(`${id} not found`, 404);
      const entity = cfg.validate({ ...(req.body ?? {}), id }, await buildCtx(stores));
      if (cfg.isBuiltin?.(existing)) (entity as { builtin?: boolean }).builtin = true;
      try { return await cfg.store(stores).update(id, entity); }
      catch (e) { if (e instanceof StoreError && e.kind === 'notFound') throw new GameError(e.message, 404); throw e; }
    }));

    app.delete(`${base}/:id`, wrap(async (req: Request, res: Response) => {
      const id = req.params.id as string;
      const existing = await cfg.store(stores).get(id);
      if (!existing) throw new GameError(`${id} not found`, 404);
      if (cfg.isBuiltin?.(existing)) throw new GameError(`${id} is builtin and cannot be deleted`, 400);
      if (cfg.refKind) {
        const refs = await findReferences(stores, cfg.refKind, id);
        if (refs.length) throw new GameError(`${id} is referenced by: ${refs.join(', ')}`, 400);
      }
      await cfg.store(stores).remove(id);
      res.status(204).end();
      return undefined;
    }));
  }
}
