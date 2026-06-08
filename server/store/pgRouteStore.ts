import { eq } from 'drizzle-orm';
import { RouteBundle } from '../../shared/types';
import { RouteStore, RouteSummary } from './RouteStore';
import { Db } from '../db/client';
import { gameRoutes } from '../db/schema';

export function createPgRouteStore(db: Db): RouteStore {
  return {
    async create(bundle: RouteBundle): Promise<string> {
      await db.insert(gameRoutes).values({
        id: bundle.route.id,
        title: bundle.route.title,
        sourceNovelId: bundle.route.sourceNovelId,
        status: bundle.route.status,
        bundle,
      }).onConflictDoUpdate({
        target: gameRoutes.id,
        set: { title: bundle.route.title, status: bundle.route.status, bundle },
      });
      return bundle.route.id;
    },
    async get(id: string): Promise<RouteBundle | null> {
      const rows = await db.select().from(gameRoutes).where(eq(gameRoutes.id, id));
      return rows[0] ? (rows[0].bundle as RouteBundle) : null;
    },
    async list(): Promise<RouteSummary[]> {
      const rows = await db.select({ id: gameRoutes.id, title: gameRoutes.title, status: gameRoutes.status }).from(gameRoutes);
      return rows.map((r): RouteSummary => ({ id: r.id, title: r.title, status: r.status as 'draft' | 'published' }));
    },
    async publish(id: string): Promise<void> {
      const rows = await db.select().from(gameRoutes).where(eq(gameRoutes.id, id));
      if (!rows[0]) throw new Error(`route ${id} not found`);
      const bundle = rows[0].bundle as RouteBundle;
      bundle.route.status = 'published';
      await db.update(gameRoutes).set({ status: 'published', bundle }).where(eq(gameRoutes.id, id));
    },
    async setNodeSource(routeId: string, nodeId: string, source: 'live' | 'pregen'): Promise<void> {
      const rows = await db.select().from(gameRoutes).where(eq(gameRoutes.id, routeId));
      if (!rows[0]) throw new Error(`route ${routeId} not found`);
      const bundle = rows[0].bundle as RouteBundle;
      if (!bundle.nodes[nodeId]) throw new Error(`node ${nodeId} not found in route ${routeId}`);
      bundle.nodes[nodeId].source = source;
      await db.update(gameRoutes).set({ bundle }).where(eq(gameRoutes.id, routeId));
    },
  };
}
