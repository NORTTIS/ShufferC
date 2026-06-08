import { RouteBundle } from '../../shared/types';

export interface RouteSummary { id: string; title: string; status: 'draft' | 'published'; }

export interface RouteStore {
  create(bundle: RouteBundle): Promise<string>;   // returns the route id (bundle.route.id)
  get(id: string): Promise<RouteBundle | null>;
  list(): Promise<RouteSummary[]>;
  publish(id: string): Promise<void>;             // flips route.status → 'published'; throws if missing
}
