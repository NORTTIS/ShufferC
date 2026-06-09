import { RouteBundle } from '../../shared/types';
import { RouteStore, RouteSummary } from './RouteStore';

export function createMemoryRouteStore(seed: RouteBundle[] = []): RouteStore {
  const map = new Map<string, RouteBundle>();
  for (const b of seed) map.set(b.route.id, structuredClone(b));

  return {
    async create(bundle: RouteBundle): Promise<string> {
      map.set(bundle.route.id, structuredClone(bundle));
      return bundle.route.id;
    },
    async get(id: string): Promise<RouteBundle | null> {
      const found = map.get(id);
      return found ? structuredClone(found) : null;
    },
    async list(): Promise<RouteSummary[]> {
      return [...map.values()].map((b): RouteSummary => ({
        id: b.route.id,
        title: b.route.title,
        status: b.route.status,
      }));
    },
    async publish(id: string): Promise<void> {
      const found = map.get(id);
      if (!found) throw new Error(`route ${id} not found`);
      const updated = structuredClone(found);
      updated.route.status = 'published';
      map.set(id, updated);
    },
    async setNodeSource(routeId: string, nodeId: string, source: 'live' | 'pregen'): Promise<void> {
      const found = map.get(routeId);
      if (!found) throw new Error(`route ${routeId} not found`);
      const updated = structuredClone(found);
      if (!updated.nodes[nodeId]) throw new Error(`node ${nodeId} not found in route ${routeId}`);
      updated.nodes[nodeId].source = source;
      map.set(routeId, updated);
    },
    async setMerchant(routeId, nodeId, merchant): Promise<void> {
      const found = map.get(routeId);
      if (!found) throw new Error(`route ${routeId} not found`);
      const updated = structuredClone(found);
      if (!updated.nodes[nodeId]) throw new Error(`node ${nodeId} not found in route ${routeId}`);
      if (merchant) updated.nodes[nodeId].merchant = merchant;
      else delete updated.nodes[nodeId].merchant;
      map.set(routeId, updated);
    },
  };
}
