import { RouteBundle, StoryNode } from '../../shared/types';

export interface RouteSummary { id: string; title: string; status: 'draft' | 'published'; }

export interface RouteStore {
  create(bundle: RouteBundle): Promise<string>;   // returns the route id (bundle.route.id)
  get(id: string): Promise<RouteBundle | null>;
  list(): Promise<RouteSummary[]>;
  publish(id: string): Promise<void>;             // flips route.status → 'published'; throws if missing
  setNodeSource(routeId: string, nodeId: string, source: 'live' | 'pregen'): Promise<void>; // throws if route/node missing
  setMerchant(routeId: string, nodeId: string, merchant: StoryNode['merchant'] | null): Promise<void>; // null clears
}
