import { randomUUID } from 'crypto';
import { SaveState } from '../../shared/types';
import { SaveStore, SaveSummary } from './SaveStore';

interface Entry { save: SaveState; userId: string; updatedAt: string; }

export function createMemoryStore(): SaveStore {
  const map = new Map<string, Entry>();
  return {
    async create(save: SaveState, userId: string): Promise<string> {
      const id = randomUUID();
      map.set(id, { save: structuredClone(save), userId, updatedAt: new Date().toISOString() });
      return id;
    },
    async get(id: string): Promise<SaveState | null> {
      const found = map.get(id);
      return found ? structuredClone(found.save) : null;
    },
    async put(id: string, save: SaveState): Promise<void> {
      const found = map.get(id);
      map.set(id, {
        save: structuredClone(save),
        userId: found?.userId ?? '',
        updatedAt: new Date().toISOString(),
      });
    },
    async owner(id: string): Promise<string | null> {
      return map.get(id)?.userId ?? null;
    },
    async listByUser(userId: string): Promise<SaveSummary[]> {
      const out: SaveSummary[] = [];
      for (const [id, e] of map) {
        if (e.userId === userId) out.push({ id, routeId: e.save.routeId, updatedAt: e.updatedAt });
      }
      return out.sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
    },
  };
}
